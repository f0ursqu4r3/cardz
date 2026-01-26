import type { TokenCreate, TokenUpdate, TokenDelete, TokenLock, TokenUnlock } from '../../shared/types'
import type { Room } from '../room'
import type { GenericWebSocket } from '../utils/broadcast'
import { send, broadcastToRoom, getClientData } from '../utils/broadcast'
import { sanitizeZoneLabel } from '../utils/sanitize'

export function handleTokenCreate(
  ws: GenericWebSocket,
  msg: TokenCreate,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState } = room

  // Sanitize user-provided label to prevent XSS
  const sanitizedLabel = msg.label ? sanitizeZoneLabel(msg.label) : undefined

  const token = gameState.createToken(msg.x, msg.y, msg.kind, {
    shape: msg.shape,
    color: msg.color,
    label: sanitizedLabel,
    sprite: msg.sprite,
    size: msg.size,
  })

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'token:created',
    token,
    playerId: clientData.id,
  }, clientData.id)

  // Also send to the creator
  send(ws, {
    type: 'token:created',
    token,
    playerId: clientData.id,
  })
}

export function handleTokenUpdate(
  ws: GenericWebSocket,
  msg: TokenUpdate,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState, locks } = room

  const token = gameState.getToken(msg.tokenId)
  if (!token) {
    send(ws, {
      type: 'error',
      originalAction: 'token:update',
      code: 'NOT_FOUND',
      message: 'Token not found',
      requestId: msg.requestId,
    })
    return
  }

  // Check lock for position updates
  if (msg.updates.x !== undefined || msg.updates.y !== undefined) {
    const lockedBy = locks.isTokenLocked(msg.tokenId)
    if (lockedBy && lockedBy !== clientData.id) {
      send(ws, {
        type: 'error',
        originalAction: 'token:update',
        code: 'CARD_LOCKED', // Reusing error code
        message: 'Token is locked by another player',
        requestId: msg.requestId,
      })
      return
    }
  }

  // Sanitize label if present in updates
  const sanitizedUpdates = { ...msg.updates }
  if (sanitizedUpdates.label !== undefined) {
    sanitizedUpdates.label = sanitizeZoneLabel(sanitizedUpdates.label)
  }

  const result = gameState.updateToken(msg.tokenId, sanitizedUpdates)
  if (!result) return

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'token:updated',
    tokenId: msg.tokenId,
    token: result,
    playerId: clientData.id,
  }, clientData.id)

  // Also send to the updater
  send(ws, {
    type: 'token:updated',
    tokenId: msg.tokenId,
    token: result,
    playerId: clientData.id,
  })
}

export function handleTokenDelete(
  ws: GenericWebSocket,
  msg: TokenDelete,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState, locks } = room

  const token = gameState.getToken(msg.tokenId)
  if (!token) {
    send(ws, {
      type: 'error',
      originalAction: 'token:delete',
      code: 'NOT_FOUND',
      message: 'Token not found',
      requestId: msg.requestId,
    })
    return
  }

  // Check lock
  const lockedBy = locks.isTokenLocked(msg.tokenId)
  if (lockedBy && lockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'token:delete',
      code: 'CARD_LOCKED',
      message: 'Token is locked by another player',
      requestId: msg.requestId,
    })
    return
  }

  const success = gameState.deleteToken(msg.tokenId)
  if (!success) return

  // Release any lock
  locks.unlockToken(msg.tokenId, clientData.id)

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'token:deleted',
    tokenId: msg.tokenId,
    playerId: clientData.id,
  }, clientData.id)

  // Also send to the deleter
  send(ws, {
    type: 'token:deleted',
    tokenId: msg.tokenId,
    playerId: clientData.id,
  })
}

export function handleTokenLock(
  ws: GenericWebSocket,
  msg: TokenLock,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState, locks } = room

  const token = gameState.getToken(msg.tokenId)
  if (!token) {
    send(ws, {
      type: 'error',
      originalAction: 'token:lock',
      code: 'NOT_FOUND',
      message: 'Token not found',
      requestId: msg.requestId,
    })
    return
  }

  if (!locks.lockToken(msg.tokenId, clientData.id)) {
    send(ws, {
      type: 'error',
      originalAction: 'token:lock',
      code: 'CARD_LOCKED',
      message: 'Token is locked by another player',
      requestId: msg.requestId,
    })
    return
  }

  gameState.setTokenLock(msg.tokenId, clientData.id)

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'token:locked',
    tokenId: msg.tokenId,
    playerId: clientData.id,
  }, clientData.id)

  // Also send to the locker
  send(ws, {
    type: 'token:locked',
    tokenId: msg.tokenId,
    playerId: clientData.id,
  })
}

export function handleTokenUnlock(
  ws: GenericWebSocket,
  msg: TokenUnlock,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState, locks } = room

  const token = gameState.getToken(msg.tokenId)
  if (!token) {
    send(ws, {
      type: 'error',
      originalAction: 'token:unlock',
      code: 'NOT_FOUND',
      message: 'Token not found',
      requestId: msg.requestId,
    })
    return
  }

  // Only allow unlock if player owns the lock (or lock expired)
  const lockedBy = locks.isTokenLocked(msg.tokenId)
  if (lockedBy && lockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'token:unlock',
      code: 'CARD_LOCKED',
      message: 'Token is locked by another player',
      requestId: msg.requestId,
    })
    return
  }

  locks.unlockToken(msg.tokenId, clientData.id)
  gameState.setTokenLock(msg.tokenId, null)

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'token:unlocked',
    tokenId: msg.tokenId,
  }, clientData.id)

  // Also send to the unlocker
  send(ws, {
    type: 'token:unlocked',
    tokenId: msg.tokenId,
  })
}
