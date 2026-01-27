import type { DieCreate, DieRoll, DieUpdate, DieDelete, DieLock, DieUnlock } from '../../shared/types'
import type { Room } from '../room'
import type { GenericWebSocket } from '../utils/broadcast'
import { send, broadcastToRoom, getClientData } from '../utils/broadcast'
import { logDieRolled } from '../activity'

export function handleDieCreate(
  ws: GenericWebSocket,
  msg: DieCreate,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState } = room

  const die = gameState.createDie(msg.x, msg.y, {
    color: msg.color,
    pipColor: msg.pipColor,
  })

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'die:created',
    die,
    playerId: clientData.playerId ?? clientData.id,
  }, clientData.id)

  // Also send to the creator
  send(ws, {
    type: 'die:created',
    die,
    playerId: clientData.playerId ?? clientData.id,
  })
}

export function handleDieRoll(
  ws: GenericWebSocket,
  msg: DieRoll,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState } = room

  const die = gameState.getDie(msg.dieId)
  if (!die) {
    send(ws, {
      type: 'error',
      originalAction: 'die:roll',
      code: 'NOT_FOUND',
      message: 'Die not found',
      requestId: msg.requestId,
    })
    return
  }

  const result = gameState.rollDie(msg.dieId)
  if (!result) return

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'die:rolled',
    dieId: msg.dieId,
    value: result.value,
    playerId: clientData.playerId ?? clientData.id,
  }, clientData.id)

  // Also send to the roller
  send(ws, {
    type: 'die:rolled',
    dieId: msg.dieId,
    value: result.value,
    playerId: clientData.playerId ?? clientData.id,
  })

  // Log activity (sides defaults to 6 for standard dice)
  logDieRolled(clients, room.code, clientData.playerId ?? clientData.id, clientData.name, die.sides ?? 6, result.value)
}

export function handleDieUpdate(
  ws: GenericWebSocket,
  msg: DieUpdate,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState, locks } = room

  const die = gameState.getDie(msg.dieId)
  if (!die) {
    send(ws, {
      type: 'error',
      originalAction: 'die:update',
      code: 'NOT_FOUND',
      message: 'Die not found',
      requestId: msg.requestId,
    })
    return
  }

  // Check lock for position updates
  if (msg.updates.x !== undefined || msg.updates.y !== undefined) {
    const lockedBy = locks.isDieLocked(msg.dieId)
    if (lockedBy && lockedBy !== clientData.id) {
      send(ws, {
        type: 'error',
        originalAction: 'die:update',
        code: 'CARD_LOCKED',
        message: 'Die is locked by another player',
        requestId: msg.requestId,
      })
      return
    }
  }

  const result = gameState.updateDie(msg.dieId, msg.updates)
  if (!result) return

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'die:updated',
    dieId: msg.dieId,
    die: result,
    playerId: clientData.playerId ?? clientData.id,
  }, clientData.id)

  // Also send to the updater
  send(ws, {
    type: 'die:updated',
    dieId: msg.dieId,
    die: result,
    playerId: clientData.playerId ?? clientData.id,
  })
}

export function handleDieDelete(
  ws: GenericWebSocket,
  msg: DieDelete,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState, locks } = room

  const die = gameState.getDie(msg.dieId)
  if (!die) {
    send(ws, {
      type: 'error',
      originalAction: 'die:delete',
      code: 'NOT_FOUND',
      message: 'Die not found',
      requestId: msg.requestId,
    })
    return
  }

  // Check lock
  const lockedBy = locks.isDieLocked(msg.dieId)
  if (lockedBy && lockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'die:delete',
      code: 'CARD_LOCKED',
      message: 'Die is locked by another player',
      requestId: msg.requestId,
    })
    return
  }

  const success = gameState.deleteDie(msg.dieId)
  if (!success) return

  // Release any lock
  locks.unlockDie(msg.dieId, clientData.id)

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'die:deleted',
    dieId: msg.dieId,
    playerId: clientData.playerId ?? clientData.id,
  }, clientData.id)

  // Also send to the deleter
  send(ws, {
    type: 'die:deleted',
    dieId: msg.dieId,
    playerId: clientData.playerId ?? clientData.id,
  })
}

export function handleDieLock(
  ws: GenericWebSocket,
  msg: DieLock,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState, locks } = room

  const die = gameState.getDie(msg.dieId)
  if (!die) {
    send(ws, {
      type: 'error',
      originalAction: 'die:lock',
      code: 'NOT_FOUND',
      message: 'Die not found',
      requestId: msg.requestId,
    })
    return
  }

  if (!locks.lockDie(msg.dieId, clientData.id)) {
    send(ws, {
      type: 'error',
      originalAction: 'die:lock',
      code: 'CARD_LOCKED',
      message: 'Die is locked by another player',
      requestId: msg.requestId,
    })
    return
  }

  gameState.setDieLock(msg.dieId, clientData.id)

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'die:locked',
    dieId: msg.dieId,
    playerId: clientData.playerId ?? clientData.id,
  }, clientData.id)

  // Also send to the locker
  send(ws, {
    type: 'die:locked',
    dieId: msg.dieId,
    playerId: clientData.playerId ?? clientData.id,
  })
}

export function handleDieUnlock(
  ws: GenericWebSocket,
  msg: DieUnlock,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState, locks } = room

  const die = gameState.getDie(msg.dieId)
  if (!die) {
    send(ws, {
      type: 'error',
      originalAction: 'die:unlock',
      code: 'NOT_FOUND',
      message: 'Die not found',
      requestId: msg.requestId,
    })
    return
  }

  // Only allow unlock if player owns the lock (or lock expired)
  const lockedBy = locks.isDieLocked(msg.dieId)
  if (lockedBy && lockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'die:unlock',
      code: 'CARD_LOCKED',
      message: 'Die is locked by another player',
      requestId: msg.requestId,
    })
    return
  }

  locks.unlockDie(msg.dieId, clientData.id)
  gameState.setDieLock(msg.dieId, null)

  // Broadcast to all players in the room (exclude sender)
  broadcastToRoom(clients, room.code, {
    type: 'die:unlocked',
    dieId: msg.dieId,
  }, clientData.id)

  // Also send to the unlocker
  send(ws, {
    type: 'die:unlocked',
    dieId: msg.dieId,
  })
}
