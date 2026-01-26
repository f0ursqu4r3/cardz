import type { RoomCreate, RoomJoin, RoomListRequest, PlayerKick, PlayerBan } from '../../shared/types'
import type { RoomManager } from '../room'
import type { ClientData, GenericWebSocket } from '../utils/broadcast'
import { send, broadcastToRoom, getClientData } from '../utils/broadcast'
import { loadChatMessages } from '../persistence'
import { sanitizePlayerName, sanitizeTableName } from '../utils/sanitize'
import { createSessionToken, verifySessionToken } from '../utils/session'
import { trackTableCreated } from '../analytics'
import {
  logPlayerJoined,
  logPlayerLeft,
  logPlayerSpectating,
  logPlayerKicked,
  logPlayerBanned,
  getActivityHistory,
} from '../activity'

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
    msg.deviceId, // for kick/ban tracking
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
    msg.deviceId, // for kick/ban tracking
  )

  if ('error' in result) {
    let message: string
    switch (result.error) {
      case 'NOT_FOUND':
        message = 'Room not found'
        break
      case 'FULL':
        message = 'Room is full'
        break
      case 'BANNED':
        message = 'You are banned from this room'
        break
      default:
        message = 'Cannot join room'
    }
    send(ws, {
      type: 'room:error',
      code: result.error,
      message,
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

/**
 * Handle kicking a player from the room (creator only)
 */
export function handlePlayerKick(
  ws: GenericWebSocket,
  msg: PlayerKick,
  roomManager: RoomManager,
): void {
  const clientData = getClientData(ws)

  if (!clientData.roomCode || !clientData.playerId) {
    send(ws, {
      type: 'error',
      originalAction: 'player:kick',
      code: 'INVALID_ACTION',
      message: 'Not in a room',
    })
    return
  }

  // Check if caller is the creator
  if (!roomManager.isCreator(clientData.roomCode, clientData.playerId)) {
    send(ws, {
      type: 'error',
      originalAction: 'player:kick',
      code: 'PERMISSION_DENIED',
      message: 'Only the table creator can kick players',
    })
    return
  }

  // Cannot kick yourself
  if (msg.targetPlayerId === clientData.playerId) {
    send(ws, {
      type: 'error',
      originalAction: 'player:kick',
      code: 'INVALID_ACTION',
      message: 'Cannot kick yourself',
    })
    return
  }

  // Kick the player
  const kickedPlayer = roomManager.kickPlayer(clientData.roomCode, msg.targetPlayerId)
  if (!kickedPlayer) {
    send(ws, {
      type: 'error',
      originalAction: 'player:kick',
      code: 'NOT_FOUND',
      message: 'Player not found',
    })
    return
  }

  // Get the kicked player's socket and send them a kicked message
  const targetWs = roomManager.getSocketByPlayerId(msg.targetPlayerId)
  if (targetWs) {
    send(targetWs, {
      type: 'room:player_kicked',
      playerId: msg.targetPlayerId,
      playerName: kickedPlayer.name,
      kickedBy: clientData.name || 'The host',
    })
    // Close their connection
    targetWs.close(4001, 'You have been kicked from the room')
  }

  // Broadcast to remaining players
  broadcastToRoom(roomManager.getClients(), clientData.roomCode, {
    type: 'room:player_kicked',
    playerId: msg.targetPlayerId,
    playerName: kickedPlayer.name,
    kickedBy: clientData.name || 'The host',
  })

  // Log activity
  logPlayerKicked(
    roomManager.getClients(),
    clientData.roomCode,
    clientData.playerId,
    clientData.name || 'Host',
    kickedPlayer.name,
  )

  console.log(`[room:kick] ${clientData.name} kicked ${kickedPlayer.name} from ${clientData.roomCode}`)
}

/**
 * Handle banning a player from the room (creator only)
 */
export function handlePlayerBan(
  ws: GenericWebSocket,
  msg: PlayerBan,
  roomManager: RoomManager,
): void {
  const clientData = getClientData(ws)

  if (!clientData.roomCode || !clientData.playerId) {
    send(ws, {
      type: 'error',
      originalAction: 'player:ban',
      code: 'INVALID_ACTION',
      message: 'Not in a room',
    })
    return
  }

  // Check if caller is the creator
  if (!roomManager.isCreator(clientData.roomCode, clientData.playerId)) {
    send(ws, {
      type: 'error',
      originalAction: 'player:ban',
      code: 'PERMISSION_DENIED',
      message: 'Only the table creator can ban players',
    })
    return
  }

  // Cannot ban yourself
  if (msg.targetPlayerId === clientData.playerId) {
    send(ws, {
      type: 'error',
      originalAction: 'player:ban',
      code: 'INVALID_ACTION',
      message: 'Cannot ban yourself',
    })
    return
  }

  // Ban the player
  const result = roomManager.banPlayer(clientData.roomCode, msg.targetPlayerId)
  if (!result) {
    send(ws, {
      type: 'error',
      originalAction: 'player:ban',
      code: 'NOT_FOUND',
      message: 'Player not found',
    })
    return
  }

  const { player: bannedPlayer } = result

  // Get the banned player's socket and send them a banned message
  const targetWs = roomManager.getSocketByPlayerId(msg.targetPlayerId)
  if (targetWs) {
    send(targetWs, {
      type: 'room:player_banned',
      playerId: msg.targetPlayerId,
      playerName: bannedPlayer.name,
      bannedBy: clientData.name || 'The host',
    })
    // Close their connection
    targetWs.close(4002, 'You have been banned from the room')
  }

  // Broadcast to remaining players
  broadcastToRoom(roomManager.getClients(), clientData.roomCode, {
    type: 'room:player_banned',
    playerId: msg.targetPlayerId,
    playerName: bannedPlayer.name,
    bannedBy: clientData.name || 'The host',
  })

  // Log activity
  logPlayerBanned(
    roomManager.getClients(),
    clientData.roomCode,
    clientData.playerId,
    clientData.name || 'Host',
    bannedPlayer.name,
  )

  console.log(`[room:ban] ${clientData.name} banned ${bannedPlayer.name} from ${clientData.roomCode}`)
}
