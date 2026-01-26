import type { RoomCreate, RoomJoin, RoomListRequest } from '../../shared/types'
import type { RoomManager } from '../room'
import type { ClientData, GenericWebSocket } from '../utils/broadcast'
import { send, broadcastToRoom, getClientData } from '../utils/broadcast'
import { loadChatMessages } from '../persistence'
import { sanitizePlayerName, sanitizeTableName } from '../utils/sanitize'
import { createSessionToken, verifySessionToken } from '../utils/session'
import { trackTableCreated } from '../analytics'
import { logPlayerJoined, logPlayerLeft, logPlayerSpectating, getActivityHistory } from '../activity'

export function handleRoomCreate(
  ws: GenericWebSocket,
  msg: RoomCreate,
  roomManager: RoomManager,
): void {
  const clientData = getClientData(ws)

  // Sanitize user-provided names to prevent XSS
  const playerName = sanitizePlayerName(msg.playerName) || 'Player'
  const tableName = msg.tableName ? sanitizeTableName(msg.tableName) : undefined

  // Leave current room if in one
  if (clientData.roomCode && clientData.playerId) {
    const oldRoom = roomManager.leaveRoom(clientData.playerId, clientData.roomCode)
    if (oldRoom) {
      broadcastToRoom(roomManager.getClients(), oldRoom.code, {
        type: 'room:player_left',
        playerId: clientData.playerId,
      })
    }
  }

  // Create room - returns the room and a new stable player ID
  const { room, playerId } = roomManager.createRoom(
    clientData.id, // socket ID for routing
    playerName,
    msg.sessionId,
    tableName,
    msg.isPublic,
  )
  clientData.roomCode = room.code
  clientData.playerId = playerId // Store stable player ID
  clientData.name = playerName

  // Track table creation for analytics
  trackTableCreated()

  const state = room.gameState.getState()
  console.log(
    `[room:create] ${room.code} (${room.isPublic ? 'public' : 'private'}) - cards: ${state.cards.length}, stacks: ${state.stacks.length}`,
  )

  // Generate HMAC-signed session token with stable playerId for reconnection
  const sessionToken = createSessionToken(playerId, room.code)

  send(ws, {
    type: 'room:created',
    roomCode: room.code,
    playerId, // Send stable player ID to client
    state,
    sessionToken,
  })

  // Send table info (name, visibility, settings)
  send(ws, {
    type: 'table:info',
    name: room.name,
    isPublic: room.isPublic,
    settings: room.settings,
    createdAt: room.createdAt,
    createdBy: room.createdBy,
  })

  // Send chat history (room might have persisted messages from previous session)
  const chatHistory = loadChatMessages(room.code)
  if (chatHistory.length > 0) {
    send(ws, {
      type: 'chat:history',
      messages: chatHistory.map((msg) => ({
        id: msg.id,
        playerId: msg.playerId,
        playerName: msg.playerName,
        playerColor: msg.playerColor,
        message: msg.message,
        timestamp: msg.timestamp,
      })),
    })
  }
}

export function handleRoomJoin(
  ws: GenericWebSocket,
  msg: RoomJoin,
  roomManager: RoomManager,
): void {
  const clientData = getClientData(ws)

  // Sanitize user-provided name to prevent XSS
  const playerName = sanitizePlayerName(msg.playerName) || 'Player'

  // Leave current room if in one
  if (clientData.roomCode && clientData.playerId) {
    const oldRoom = roomManager.leaveRoom(clientData.playerId, clientData.roomCode)
    if (oldRoom) {
      broadcastToRoom(roomManager.getClients(), oldRoom.code, {
        type: 'room:player_left',
        playerId: clientData.playerId,
      })
    }
  }

  // Verify session token if provided (for reconnection)
  // The sessionId field contains an HMAC-signed token with the stable playerId
  let verifiedPlayerId: string | undefined
  if (msg.sessionId) {
    const tokenPayload = verifySessionToken(msg.sessionId, msg.roomCode)
    if (tokenPayload) {
      verifiedPlayerId = tokenPayload.playerId
      console.log(`[room:join] Valid session token for player ${verifiedPlayerId}`)
    } else {
      console.log(`[room:join] Invalid session token for room ${msg.roomCode}`)
    }
  }

  // Use loadOrCreateRoom to support loading persisted rooms after server restart
  // Pass the verified stable player ID if token was valid
  const result = roomManager.loadOrCreateRoom(
    msg.roomCode,
    clientData.id, // socket ID for routing
    playerName,
    verifiedPlayerId ? msg.sessionId : undefined, // session token
    verifiedPlayerId, // stable player ID from verified token
    msg.asSpectator, // join as spectator
  )

  if ('error' in result) {
    send(ws, {
      type: 'room:error',
      code: result.error,
      message: result.error === 'NOT_FOUND' ? 'Room not found' : 'Room is full',
    })
    return
  }

  const { room, player, isReconnect, playerId } = result
  clientData.roomCode = room.code
  clientData.playerId = playerId // Store stable player ID
  clientData.name = playerName

  // Build cursors array for joining player (exclude their own cursor)
  const cursors: {
    playerId: string
    x: number
    y: number
    state: 'default' | 'grab' | 'grabbing'
  }[] = []
  for (const [pid, cursor] of room.cursors) {
    if (pid !== playerId) {
      cursors.push({ playerId: pid, x: cursor.x, y: cursor.y, state: cursor.state })
    }
  }

  // Generate HMAC-signed session token with stable playerId for reconnection
  const sessionToken = createSessionToken(playerId, room.code)

  // Send full state to joining player
  send(ws, {
    type: 'room:joined',
    roomCode: room.code,
    playerId, // Send stable player ID to client
    players: [...room.players.values()],
    state: room.gameState.getState(),
    cursors,
    sessionToken,
  })

  // Send table info (name, visibility, settings)
  send(ws, {
    type: 'table:info',
    name: room.name,
    isPublic: room.isPublic,
    settings: room.settings,
    createdAt: room.createdAt,
    createdBy: room.createdBy,
  })

  // Send chat history
  const chatHistory = loadChatMessages(room.code)
  if (chatHistory.length > 0) {
    send(ws, {
      type: 'chat:history',
      messages: chatHistory.map((msg) => ({
        id: msg.id,
        playerId: msg.playerId,
        playerName: msg.playerName,
        playerColor: msg.playerColor,
        message: msg.message,
        timestamp: msg.timestamp,
      })),
    })
  }

  // Send activity history
  const activityHistory = getActivityHistory(room.code)
  if (activityHistory.length > 0) {
    send(ws, {
      type: 'activity:history',
      entries: activityHistory,
    })
  }

  // Notify others: use player_reconnected for reconnections, player_joined for new joins
  if (isReconnect) {
    broadcastToRoom(
      roomManager.getClients(),
      room.code,
      {
        type: 'room:player_reconnected',
        player,
      },
      clientData.id, // Exclude by socket ID
    )
  } else {
    broadcastToRoom(
      roomManager.getClients(),
      room.code,
      {
        type: 'room:player_joined',
        player,
      },
      clientData.id, // Exclude by socket ID
    )

    // Log player join activity (spectator or regular)
    if (player.role === 'spectator') {
      logPlayerSpectating(roomManager.getClients(), room.code, playerId, playerName)
    } else {
      logPlayerJoined(roomManager.getClients(), room.code, playerId, playerName)
    }
  }
}

export function handleRoomLeave(ws: GenericWebSocket, roomManager: RoomManager): void {
  const clientData = getClientData(ws)

  if (!clientData.roomCode || !clientData.playerId) return

  const roomCode = clientData.roomCode
  const playerId = clientData.playerId
  const playerName = clientData.name || 'Player'

  const room = roomManager.leaveRoom(playerId, roomCode)

  if (room) {
    broadcastToRoom(roomManager.getClients(), room.code, {
      type: 'room:player_left',
      playerId,
    })

    // Log player left activity
    logPlayerLeft(roomManager.getClients(), roomCode, playerId, playerName)
  }

  clientData.roomCode = null
  clientData.playerId = null
}

/**
 * Handle player disconnect (keep room data for potential reconnection)
 */
export function handleDisconnect(clientData: ClientData, roomManager: RoomManager): void {
  if (!clientData.roomCode || !clientData.playerId) return

  const room = roomManager.disconnectPlayer(clientData.playerId, clientData.roomCode)

  if (room) {
    broadcastToRoom(roomManager.getClients(), room.code, {
      type: 'room:player_left',
      playerId: clientData.playerId,
    })
  }

  roomManager.removeClient(clientData.id)
}

/**
 * Handle request for public room list
 */
export function handleRoomList(
  ws: GenericWebSocket,
  _msg: RoomListRequest,
  roomManager: RoomManager,
): void {
  const rooms = roomManager.getPublicRooms()

  send(ws, {
    type: 'room:list',
    rooms,
  })
}
