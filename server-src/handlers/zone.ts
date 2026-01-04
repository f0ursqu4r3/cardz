import type { ZoneCreate, ZoneUpdate, ZoneDelete, ZoneAddCard } from '../../shared/types'
import type { Room } from '../room'
import type { ClientData, GenericWebSocket } from '../utils/broadcast'
import { send, broadcastToRoom } from '../utils/broadcast'

function getClientData(ws: GenericWebSocket): ClientData {
  return ws.data ?? ws.getUserData?.() ?? { id: '', roomCode: null, name: '' }
}

export function handleZoneCreate(
  ws: GenericWebSocket,
  msg: ZoneCreate,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState } = room

  const zone = gameState.createZone(
    msg.x,
    msg.y,
    msg.width,
    msg.height,
    msg.label,
    msg.faceUp,
    msg.visibility ?? 'public',
    msg.ownerId ?? null,
    msg.layout ?? 'stack',
    msg.cardSettings ?? { cardScale: 1.0, cardSpacing: 0.5 },
  )

  broadcastToRoom(clients, room.code, {
    type: 'zone:created',
    zone,
    playerId: clientData.id,
  })
}

export function handleZoneUpdate(
  ws: GenericWebSocket,
  msg: ZoneUpdate,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState } = room

  const zone = gameState.getZone(msg.zoneId)
  if (!zone) {
    send(ws, {
      type: 'error',
      originalAction: 'zone:update',
      code: 'NOT_FOUND',
      message: 'Zone not found',
    })
    return
  }

  if (zone.locked) {
    send(ws, {
      type: 'error',
      originalAction: 'zone:update',
      code: 'ZONE_LOCKED',
      message: 'Zone is locked',
    })
    return
  }

  const result = gameState.updateZone(msg.zoneId, msg.updates)
  if (!result) return

  broadcastToRoom(clients, room.code, {
    type: 'zone:updated',
    zoneId: msg.zoneId,
    zone: result.zone,
    stackUpdate: result.stackUpdate,
    cardUpdates: result.cardUpdates,
    playerId: clientData.id,
  })
}

export function handleZoneDelete(
  ws: GenericWebSocket,
  msg: ZoneDelete,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState } = room

  const zone = gameState.getZone(msg.zoneId)
  if (!zone) {
    send(ws, {
      type: 'error',
      originalAction: 'zone:delete',
      code: 'NOT_FOUND',
      message: 'Zone not found',
    })
    return
  }

  if (zone.locked) {
    send(ws, {
      type: 'error',
      originalAction: 'zone:delete',
      code: 'ZONE_LOCKED',
      message: 'Zone is locked',
    })
    return
  }

  const result = gameState.deleteZone(msg.zoneId)
  if (!result) return

  broadcastToRoom(clients, room.code, {
    type: 'zone:deleted',
    zoneId: msg.zoneId,
    stackDeleted: result.stackDeleted,
    scatteredCards: result.scatteredCards,
    playerId: clientData.id,
  })
}

export function handleZoneAddCard(
  ws: GenericWebSocket,
  msg: ZoneAddCard,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  const zone = gameState.getZone(msg.zoneId)
  if (!zone) {
    send(ws, {
      type: 'error',
      originalAction: 'zone:add_card',
      code: 'NOT_FOUND',
      message: 'Zone not found',
    })
    return
  }

  const card = gameState.getCard(msg.cardId)
  if (!card) {
    send(ws, {
      type: 'error',
      originalAction: 'zone:add_card',
      code: 'NOT_FOUND',
      message: 'Card not found',
    })
    return
  }

  // Check card lock
  const lockedBy = locks.isCardLocked(msg.cardId)
  if (lockedBy && lockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'zone:add_card',
      code: 'CARD_LOCKED',
      message: 'Card is locked by another player',
    })
    return
  }

  if (card.ownerId !== null) {
    send(ws, {
      type: 'error',
      originalAction: 'zone:add_card',
      code: 'NOT_IN_HAND',
      message: 'Card is in a hand',
    })
    return
  }

  const result = gameState.addCardToZone(msg.zoneId, msg.cardId)
  if (!result) return

  broadcastToRoom(clients, room.code, {
    type: 'zone:card_added',
    zoneId: msg.zoneId,
    stackId: result.stackId,
    stackCreated: result.stackCreated,
    cardState: result.cardState,
    playerId: clientData.id,
  })
}
