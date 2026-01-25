import type { RoomCreate, RoomJoin, RoomListRequest } from '../../shared/types'
import type { RoomManager } from '../room'
import type { ClientData, GenericWebSocket } from '../utils/broadcast'
import { send, broadcastToRoom, getClientData } from '../utils/broadcast'
import { loadChatMessages } from '../persistence'
import { sanitizePlayerName, sanitizeTableName } from '../utils/sanitize'
import { createSessionToken, verifySessionToken } from '../utils/session'

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
  if (clientData.roomCode) {
    const oldRoom = roomManager.leaveRoom(clientData.id, clientData.roomCode)
    if (oldRoom) {
      broadcastToRoom(roomManager.getClients(), oldRoom.code, {
        type: 'room:player_left',
        playerId: clientData.id,
      })
    }
  }

  const room = roomManager.createRoom(
    clientData.id,
    playerName,
    msg.sessionId,
    tableName,
    msg.isPublic,
  )
  clientData.roomCode = room.code
  clientData.name = playerName

  const state = room.gameState.getState()
  console.log(
    `[room:create] ${room.code} (${room.isPublic ? 'public' : 'private'}) - cards: ${state.cards.length}, stacks: ${state.stacks.length}`,
  )

  // Generate HMAC-signed session token for secure reconnection
  const sessionToken = createSessionToken(clientData.id, room.code)

  send(ws, {
    type: 'room:created',
    roomCode: room.code,
    playerId: clientData.id,
    state,
    sessionToken,
  })

  // Send table info (name, visibility, settings)
  send(ws, {
    type: 'table:info',
    name: room.name,
    isPublic: room.isPublic,
    settings: room.settings,
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
  if (clientData.roomCode) {
    const oldRoom = roomManager.leaveRoom(clientData.id, clientData.roomCode)
    if (oldRoom) {
      broadcastToRoom(roomManager.getClients(), oldRoom.code, {
        type: 'room:player_left',
        playerId: clientData.id,
      })
    }
  }

  // Verify session token if provided (for reconnection)
  // The sessionId field now contains an HMAC-signed token
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
  // Pass the verified player ID if token was valid, otherwise use new session
  const result = roomManager.loadOrCreateRoom(
    msg.roomCode,
    clientData.id,
    playerName,
    verifiedPlayerId ? msg.sessionId : undefined, // Only use session if token was valid
  )

  if ('error' in result) {
    send(ws, {
      type: 'room:error',
      code: result.error,
      message: result.error === 'NOT_FOUND' ? 'Room not found' : 'Room is full',
    })
    return
  }

  const { room, player, isReconnect } = result
  clientData.roomCode = room.code
  clientData.name = playerName

  // Build cursors array for joining player (exclude their own cursor)
  const cursors: {
    playerId: string
    x: number
    y: number
    state: 'default' | 'grab' | 'grabbing'
  }[] = []
  for (const [pid, cursor] of room.cursors) {
    if (pid !== clientData.id) {
      cursors.push({ playerId: pid, x: cursor.x, y: cursor.y, state: cursor.state })
    }
  }

  // Generate HMAC-signed session token for secure reconnection
  const sessionToken = createSessionToken(clientData.id, room.code)

  // Send full state to joining player
  send(ws, {
    type: 'room:joined',
    roomCode: room.code,
    playerId: clientData.id,
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

  // Always notify others when a player joins (even on reconnect)
  // because when they disconnected, others received player_left
  broadcastToRoom(
    roomManager.getClients(),
    room.code,
    {
      type: 'room:player_joined',
      player,
    },
    clientData.id,
  )
}

export function handleRoomLeave(ws: GenericWebSocket, roomManager: RoomManager): void {
  const clientData = getClientData(ws)

  if (!clientData.roomCode) return

  const room = roomManager.leaveRoom(clientData.id, clientData.roomCode)

  if (room) {
    broadcastToRoom(roomManager.getClients(), room.code, {
      type: 'room:player_left',
      playerId: clientData.id,
    })
  }

  clientData.roomCode = null
}

/**
 * Handle player disconnect (keep room data for potential reconnection)
 */
export function handleDisconnect(clientData: ClientData, roomManager: RoomManager): void {
  if (!clientData.roomCode) return

  const room = roomManager.disconnectPlayer(clientData.id, clientData.roomCode)

  if (room) {
    broadcastToRoom(roomManager.getClients(), room.code, {
      type: 'room:player_left',
      playerId: clientData.id,
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
