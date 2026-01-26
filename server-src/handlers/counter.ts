import type {
  CounterCreate,
  CounterUpdate,
  CounterIncrement,
  CounterDelete,
  CounterLock,
  CounterUnlock,
} from '../../shared/types'
import type { Room } from '../room'
import type { GenericWebSocket } from '../utils/broadcast'
import { send, broadcastToRoom, getClientData } from '../utils/broadcast'
import { sanitizeZoneLabel } from '../utils/sanitize'
import { logCounterChanged } from '../activity'

export function handleCounterCreate(
  ws: GenericWebSocket,
  msg: CounterCreate,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState } = room

  // Sanitize user-provided label to prevent XSS
  const sanitizedLabel = sanitizeZoneLabel(msg.label)

  const counter = gameState.createCounter(msg.x, msg.y, sanitizedLabel, msg.value ?? 0, {
    min: msg.min,
    max: msg.max,
    step: msg.step,
    color: msg.color,
  })

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'counter:created',
    counter,
    playerId: clientData.playerId ?? clientData.id,
  }, clientData.id)

  // Also send to the creator
  send(ws, {
    type: 'counter:created',
    counter,
    playerId: clientData.playerId ?? clientData.id,
  })
}

export function handleCounterUpdate(
  ws: GenericWebSocket,
  msg: CounterUpdate,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState, locks } = room

  const counter = gameState.getCounter(msg.counterId)
  if (!counter) {
    send(ws, {
      type: 'error',
      originalAction: 'counter:update',
      code: 'NOT_FOUND',
      message: 'Counter not found',
      requestId: msg.requestId,
    })
    return
  }

  // Check lock for position updates
  if (msg.updates.x !== undefined || msg.updates.y !== undefined) {
    const lockedBy = locks.isCounterLocked(msg.counterId)
    if (lockedBy && lockedBy !== clientData.id) {
      send(ws, {
        type: 'error',
        originalAction: 'counter:update',
        code: 'CARD_LOCKED', // Reusing error code
        message: 'Counter is locked by another player',
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

  const result = gameState.updateCounter(msg.counterId, sanitizedUpdates)
  if (!result) return

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'counter:updated',
    counterId: msg.counterId,
    counter: result,
    playerId: clientData.playerId ?? clientData.id,
  }, clientData.id)

  // Also send to the updater
  send(ws, {
    type: 'counter:updated',
    counterId: msg.counterId,
    counter: result,
    playerId: clientData.playerId ?? clientData.id,
  })
}

export function handleCounterIncrement(
  ws: GenericWebSocket,
  msg: CounterIncrement,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState } = room

  const counter = gameState.getCounter(msg.counterId)
  if (!counter) {
    send(ws, {
      type: 'error',
      originalAction: 'counter:increment',
      code: 'NOT_FOUND',
      message: 'Counter not found',
      requestId: msg.requestId,
    })
    return
  }

  // Store old value for activity logging
  const oldValue = counter.value
  const counterName = counter.label

  const result = gameState.incrementCounter(msg.counterId, msg.delta)
  if (!result) return

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'counter:incremented',
    counterId: msg.counterId,
    value: result.value,
    playerId: clientData.playerId ?? clientData.id,
  }, clientData.id)

  // Also send to the incrementer
  send(ws, {
    type: 'counter:incremented',
    counterId: msg.counterId,
    value: result.value,
    playerId: clientData.playerId ?? clientData.id,
  })

  // Log activity
  logCounterChanged(clients, room.code, clientData.playerId ?? clientData.id, clientData.name, counterName, oldValue, result.value)
}

export function handleCounterDelete(
  ws: GenericWebSocket,
  msg: CounterDelete,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState, locks } = room

  const counter = gameState.getCounter(msg.counterId)
  if (!counter) {
    send(ws, {
      type: 'error',
      originalAction: 'counter:delete',
      code: 'NOT_FOUND',
      message: 'Counter not found',
      requestId: msg.requestId,
    })
    return
  }

  // Check lock
  const lockedBy = locks.isCounterLocked(msg.counterId)
  if (lockedBy && lockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'counter:delete',
      code: 'CARD_LOCKED',
      message: 'Counter is locked by another player',
      requestId: msg.requestId,
    })
    return
  }

  const success = gameState.deleteCounter(msg.counterId)
  if (!success) return

  // Release any lock
  locks.unlockCounter(msg.counterId, clientData.id)

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'counter:deleted',
    counterId: msg.counterId,
    playerId: clientData.playerId ?? clientData.id,
  }, clientData.id)

  // Also send to the deleter
  send(ws, {
    type: 'counter:deleted',
    counterId: msg.counterId,
    playerId: clientData.playerId ?? clientData.id,
  })
}

export function handleCounterLock(
  ws: GenericWebSocket,
  msg: CounterLock,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState, locks } = room

  const counter = gameState.getCounter(msg.counterId)
  if (!counter) {
    send(ws, {
      type: 'error',
      originalAction: 'counter:lock',
      code: 'NOT_FOUND',
      message: 'Counter not found',
      requestId: msg.requestId,
    })
    return
  }

  if (!locks.lockCounter(msg.counterId, clientData.id)) {
    send(ws, {
      type: 'error',
      originalAction: 'counter:lock',
      code: 'CARD_LOCKED',
      message: 'Counter is locked by another player',
      requestId: msg.requestId,
    })
    return
  }

  gameState.setCounterLock(msg.counterId, clientData.id)

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'counter:locked',
    counterId: msg.counterId,
    playerId: clientData.playerId ?? clientData.id,
  }, clientData.id)

  // Also send to the locker
  send(ws, {
    type: 'counter:locked',
    counterId: msg.counterId,
    playerId: clientData.playerId ?? clientData.id,
  })
}

export function handleCounterUnlock(
  ws: GenericWebSocket,
  msg: CounterUnlock,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState, locks } = room

  const counter = gameState.getCounter(msg.counterId)
  if (!counter) {
    send(ws, {
      type: 'error',
      originalAction: 'counter:unlock',
      code: 'NOT_FOUND',
      message: 'Counter not found',
      requestId: msg.requestId,
    })
    return
  }

  // Only allow unlock if player owns the lock (or lock expired)
  const lockedBy = locks.isCounterLocked(msg.counterId)
  if (lockedBy && lockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'counter:unlock',
      code: 'CARD_LOCKED',
      message: 'Counter is locked by another player',
      requestId: msg.requestId,
    })
    return
  }

  locks.unlockCounter(msg.counterId, clientData.id)
  gameState.setCounterLock(msg.counterId, null)

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'counter:unlocked',
    counterId: msg.counterId,
  }, clientData.id)

  // Also send to the unlocker
  send(ws, {
    type: 'counter:unlocked',
    counterId: msg.counterId,
  })
}
