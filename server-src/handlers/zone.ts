import type {
  ZoneCreate,
  ZoneUpdate,
  ZoneDelete,
  ZoneAddCard,
  ZoneAddCards,
} from '../../shared/types'
import type { Room } from '../room'
import type { GenericWebSocket } from '../utils/broadcast'
import { send, broadcastToViewport, getClientData } from '../utils/broadcast'
import { sanitizeZoneLabel } from '../utils/sanitize'
import { logZoneCreated, logZoneDeleted } from '../activity'

export function handleZoneCreate(
  ws: GenericWebSocket,
  msg: ZoneCreate,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState } = room

  // Sanitize user-provided label to prevent XSS
  const sanitizedLabel = sanitizeZoneLabel(msg.label)

  const zone = gameState.createZone(
    msg.x,
    msg.y,
    msg.width,
    msg.height,
    sanitizedLabel,
    msg.faceUp,
    msg.visibility ?? 'public',
    msg.ownerId ?? null,
    msg.layout ?? 'stack',
    msg.cardSettings ?? { cardScale: 1.0, cardSpacing: 0.5 },
  )

  // Broadcast to players whose viewport overlaps this zone
  broadcastToViewport(
    clients,
    room.code,
    {
      type: 'zone:created',
      zone,
      playerId: clientData.id,
    },
    { x: msg.x, y: msg.y, width: msg.width, height: msg.height },
  )

  // Log activity
  logZoneCreated(clients, room.code, clientData.playerId ?? clientData.id, clientData.name, sanitizedLabel)
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
      requestId: msg.requestId,
    })
    return
  }

  // Allow unlocking a locked zone, but block other updates
  const isOnlyUnlocking = msg.updates.locked === false && Object.keys(msg.updates).length === 1

  if (zone.locked && !isOnlyUnlocking) {
    send(ws, {
      type: 'error',
      originalAction: 'zone:update',
      code: 'ZONE_LOCKED',
      message: 'Zone is locked',
      requestId: msg.requestId,
    })
    return
  }

  // Sanitize label if present in updates to prevent XSS
  const sanitizedUpdates = { ...msg.updates }
  if (sanitizedUpdates.label !== undefined) {
    sanitizedUpdates.label = sanitizeZoneLabel(sanitizedUpdates.label)
  }

  const result = gameState.updateZone(msg.zoneId, sanitizedUpdates)
  if (!result) return

  // Broadcast to players whose viewport overlaps this zone
  broadcastToViewport(
    clients,
    room.code,
    {
      type: 'zone:updated',
      zoneId: msg.zoneId,
      zone: result.zone,
      stackUpdate: result.stackUpdate,
      cardUpdates: result.cardUpdates,
      playerId: clientData.id,
    },
    { x: result.zone.x, y: result.zone.y, width: result.zone.width, height: result.zone.height },
  )
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
      requestId: msg.requestId,
    })
    return
  }

  if (zone.locked) {
    send(ws, {
      type: 'error',
      originalAction: 'zone:delete',
      code: 'ZONE_LOCKED',
      message: 'Zone is locked',
      requestId: msg.requestId,
    })
    return
  }

  // Store zone info before deletion for viewport broadcasting and logging
  const zonePos = { x: zone.x, y: zone.y, width: zone.width, height: zone.height }
  const zoneName = zone.label

  const result = gameState.deleteZone(msg.zoneId)
  if (!result) return

  // Broadcast to players whose viewport overlaps this zone
  broadcastToViewport(
    clients,
    room.code,
    {
      type: 'zone:deleted',
      zoneId: msg.zoneId,
      convertedStack: result.convertedStack,
      playerId: clientData.id,
    },
    zonePos,
  )

  // Log activity
  logZoneDeleted(clients, room.code, clientData.playerId ?? clientData.id, clientData.name, zoneName)
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
      requestId: msg.requestId,
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
      requestId: msg.requestId,
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
      requestId: msg.requestId,
    })
    return
  }

  if (card.ownerId !== null) {
    send(ws, {
      type: 'error',
      originalAction: 'zone:add_card',
      code: 'NOT_IN_HAND',
      message: 'Card is in a hand',
      requestId: msg.requestId,
    })
    return
  }

  const result = gameState.addCardToZone(msg.zoneId, msg.cardId)
  if (!result) return

  // Broadcast to players whose viewport overlaps this zone
  broadcastToViewport(
    clients,
    room.code,
    {
      type: 'zone:card_added',
      zoneId: msg.zoneId,
      stackId: result.stackId,
      stackCreated: result.stackCreated,
      cardState: result.cardState,
      playerId: clientData.id,
    },
    { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
  )
}

export function handleZoneAddCards(
  ws: GenericWebSocket,
  msg: ZoneAddCards,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  const zone = gameState.getZone(msg.zoneId)
  if (!zone) {
    send(ws, {
      type: 'error',
      originalAction: 'zone:add_cards',
      code: 'NOT_FOUND',
      message: 'Zone not found',
      requestId: msg.requestId,
    })
    return
  }

  // Validate all cards exist and are available
  for (const cardId of msg.cardIds) {
    const card = gameState.getCard(cardId)
    if (!card) {
      send(ws, {
        type: 'error',
        originalAction: 'zone:add_cards',
        code: 'NOT_FOUND',
        message: `Card ${cardId} not found`,
        requestId: msg.requestId,
      })
      return
    }

    const lockedBy = locks.isCardLocked(cardId)
    if (lockedBy && lockedBy !== clientData.id) {
      send(ws, {
        type: 'error',
        originalAction: 'zone:add_cards',
        code: 'CARD_LOCKED',
        message: `Card ${cardId} is locked by another player`,
        requestId: msg.requestId,
      })
      return
    }

    if (card.ownerId !== null) {
      send(ws, {
        type: 'error',
        originalAction: 'zone:add_cards',
        code: 'NOT_IN_HAND',
        message: `Card ${cardId} is in a hand`,
        requestId: msg.requestId,
      })
      return
    }
  }

  const result = gameState.addCardsToZone(msg.zoneId, msg.cardIds)
  if (!result) return

  // Broadcast to players whose viewport overlaps this zone
  broadcastToViewport(
    clients,
    room.code,
    {
      type: 'zone:cards_added',
      zoneId: msg.zoneId,
      stackId: result.stackId,
      stackCreated: result.stackCreated,
      cardStates: result.cardStates,
      playerId: clientData.id,
    },
    { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
  )
}
