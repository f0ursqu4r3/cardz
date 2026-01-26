import type { TimerCreate, TimerStart, TimerPause, TimerReset, TimerUpdate, TimerDelete, TimerLock, TimerUnlock } from '../../shared/types'
import type { Room } from '../room'
import type { GenericWebSocket } from '../utils/broadcast'
import { send, broadcastToRoom, getClientData } from '../utils/broadcast'
import { logTimerStarted, logTimerStopped } from '../activity'

export function handleTimerCreate(
  ws: GenericWebSocket,
  msg: TimerCreate,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState } = room

  const timer = gameState.createTimer(msg.x, msg.y, msg.mode, {
    durationMs: msg.durationMs,
    label: msg.label,
  })

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'timer:created',
    timer,
    playerId: clientData.playerId ?? clientData.id,
  }, clientData.id)

  // Also send to the creator
  send(ws, {
    type: 'timer:created',
    timer,
    playerId: clientData.playerId ?? clientData.id,
  })
}

export function handleTimerStart(
  ws: GenericWebSocket,
  msg: TimerStart,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState } = room

  const timer = gameState.getTimer(msg.timerId)
  if (!timer) {
    send(ws, {
      type: 'error',
      originalAction: 'timer:start',
      code: 'NOT_FOUND',
      message: 'Timer not found',
      requestId: msg.requestId,
    })
    return
  }

  const result = gameState.startTimer(msg.timerId)
  if (!result) {
    send(ws, {
      type: 'error',
      originalAction: 'timer:start',
      code: 'INVALID_ACTION',
      message: 'Timer cannot be started',
      requestId: msg.requestId,
    })
    return
  }

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'timer:started',
    timerId: msg.timerId,
    startedAt: result.startedAt,
    playerId: clientData.playerId ?? clientData.id,
  }, clientData.id)

  // Also send to the starter
  send(ws, {
    type: 'timer:started',
    timerId: msg.timerId,
    startedAt: result.startedAt,
    playerId: clientData.playerId ?? clientData.id,
  })

  // Log activity
  logTimerStarted(clients, room.code, clientData.playerId ?? clientData.id, clientData.name, timer.label ?? 'Timer')
}

export function handleTimerPause(
  ws: GenericWebSocket,
  msg: TimerPause,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState } = room

  const timer = gameState.getTimer(msg.timerId)
  if (!timer) {
    send(ws, {
      type: 'error',
      originalAction: 'timer:pause',
      code: 'NOT_FOUND',
      message: 'Timer not found',
      requestId: msg.requestId,
    })
    return
  }

  const result = gameState.pauseTimer(msg.timerId)
  if (!result) {
    send(ws, {
      type: 'error',
      originalAction: 'timer:pause',
      code: 'INVALID_ACTION',
      message: 'Timer cannot be paused',
      requestId: msg.requestId,
    })
    return
  }

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'timer:paused',
    timerId: msg.timerId,
    elapsedMs: result.elapsedMs,
    playerId: clientData.playerId ?? clientData.id,
  }, clientData.id)

  // Also send to the pauser
  send(ws, {
    type: 'timer:paused',
    timerId: msg.timerId,
    elapsedMs: result.elapsedMs,
    playerId: clientData.playerId ?? clientData.id,
  })

  // Log activity (timer stopped/paused)
  logTimerStopped(clients, room.code, clientData.playerId ?? clientData.id, clientData.name, timer.label ?? 'Timer')
}

export function handleTimerReset(
  ws: GenericWebSocket,
  msg: TimerReset,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState } = room

  const timer = gameState.getTimer(msg.timerId)
  if (!timer) {
    send(ws, {
      type: 'error',
      originalAction: 'timer:reset',
      code: 'NOT_FOUND',
      message: 'Timer not found',
      requestId: msg.requestId,
    })
    return
  }

  const success = gameState.resetTimer(msg.timerId)
  if (!success) return

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'timer:reset',
    timerId: msg.timerId,
    playerId: clientData.playerId ?? clientData.id,
  }, clientData.id)

  // Also send to the resetter
  send(ws, {
    type: 'timer:reset',
    timerId: msg.timerId,
    playerId: clientData.playerId ?? clientData.id,
  })
}

export function handleTimerUpdate(
  ws: GenericWebSocket,
  msg: TimerUpdate,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState, locks } = room

  const timer = gameState.getTimer(msg.timerId)
  if (!timer) {
    send(ws, {
      type: 'error',
      originalAction: 'timer:update',
      code: 'NOT_FOUND',
      message: 'Timer not found',
      requestId: msg.requestId,
    })
    return
  }

  // Check lock for position updates
  if (msg.updates.x !== undefined || msg.updates.y !== undefined) {
    const lockedBy = locks.isTimerLocked(msg.timerId)
    if (lockedBy && lockedBy !== clientData.id) {
      send(ws, {
        type: 'error',
        originalAction: 'timer:update',
        code: 'CARD_LOCKED',
        message: 'Timer is locked by another player',
        requestId: msg.requestId,
      })
      return
    }
  }

  const result = gameState.updateTimer(msg.timerId, msg.updates)
  if (!result) return

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'timer:updated',
    timerId: msg.timerId,
    timer: result,
    playerId: clientData.playerId ?? clientData.id,
  }, clientData.id)

  // Also send to the updater
  send(ws, {
    type: 'timer:updated',
    timerId: msg.timerId,
    timer: result,
    playerId: clientData.playerId ?? clientData.id,
  })
}

export function handleTimerDelete(
  ws: GenericWebSocket,
  msg: TimerDelete,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState, locks } = room

  const timer = gameState.getTimer(msg.timerId)
  if (!timer) {
    send(ws, {
      type: 'error',
      originalAction: 'timer:delete',
      code: 'NOT_FOUND',
      message: 'Timer not found',
      requestId: msg.requestId,
    })
    return
  }

  // Check lock
  const lockedBy = locks.isTimerLocked(msg.timerId)
  if (lockedBy && lockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'timer:delete',
      code: 'CARD_LOCKED',
      message: 'Timer is locked by another player',
      requestId: msg.requestId,
    })
    return
  }

  const success = gameState.deleteTimer(msg.timerId)
  if (!success) return

  // Release any lock
  locks.unlockTimer(msg.timerId, clientData.id)

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'timer:deleted',
    timerId: msg.timerId,
    playerId: clientData.playerId ?? clientData.id,
  }, clientData.id)

  // Also send to the deleter
  send(ws, {
    type: 'timer:deleted',
    timerId: msg.timerId,
    playerId: clientData.playerId ?? clientData.id,
  })
}

export function handleTimerLock(
  ws: GenericWebSocket,
  msg: TimerLock,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState, locks } = room

  const timer = gameState.getTimer(msg.timerId)
  if (!timer) {
    send(ws, {
      type: 'error',
      originalAction: 'timer:lock',
      code: 'NOT_FOUND',
      message: 'Timer not found',
      requestId: msg.requestId,
    })
    return
  }

  if (!locks.lockTimer(msg.timerId, clientData.id)) {
    send(ws, {
      type: 'error',
      originalAction: 'timer:lock',
      code: 'CARD_LOCKED',
      message: 'Timer is locked by another player',
      requestId: msg.requestId,
    })
    return
  }

  gameState.setTimerLock(msg.timerId, clientData.id)

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'timer:locked',
    timerId: msg.timerId,
    playerId: clientData.playerId ?? clientData.id,
  }, clientData.id)

  // Also send to the locker
  send(ws, {
    type: 'timer:locked',
    timerId: msg.timerId,
    playerId: clientData.playerId ?? clientData.id,
  })
}

export function handleTimerUnlock(
  ws: GenericWebSocket,
  msg: TimerUnlock,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState, locks } = room

  const timer = gameState.getTimer(msg.timerId)
  if (!timer) {
    send(ws, {
      type: 'error',
      originalAction: 'timer:unlock',
      code: 'NOT_FOUND',
      message: 'Timer not found',
      requestId: msg.requestId,
    })
    return
  }

  // Only allow unlock if player owns the lock (or lock expired)
  const lockedBy = locks.isTimerLocked(msg.timerId)
  if (lockedBy && lockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'timer:unlock',
      code: 'CARD_LOCKED',
      message: 'Timer is locked by another player',
      requestId: msg.requestId,
    })
    return
  }

  locks.unlockTimer(msg.timerId, clientData.id)
  gameState.setTimerLock(msg.timerId, null)

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'timer:unlocked',
    timerId: msg.timerId,
  }, clientData.id)

  // Also send to the unlocker
  send(ws, {
    type: 'timer:unlocked',
    timerId: msg.timerId,
  })
}
