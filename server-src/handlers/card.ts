import type { CardMoveIntent, CardLock, CardUnlock, CardFlip } from '../../shared/types'
import type { Room } from '../room'
import type { ClientData, GenericWebSocket } from '../utils/broadcast'
import { send, broadcastToRoom } from '../utils/broadcast'

function getClientData(ws: GenericWebSocket): ClientData {
  return ws.data ?? ws.getUserData?.() ?? { id: '', roomCode: null, name: '' }
}

export function handleCardMove(ws: GenericWebSocket, msg: CardMoveIntent, room: Room): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  // Check if card is locked by another player
  const lockedBy = locks.isCardLocked(msg.cardId)
  if (lockedBy && lockedBy !== clientData.id) {
    const card = gameState.getCard(msg.cardId)
    send(ws, {
      type: 'card:move_rejected',
      cardId: msg.cardId,
      reason: 'LOCKED',
      currentState: { x: card?.x ?? 0, y: card?.y ?? 0 },
    })
    return
  }

  // Check if card is in someone's hand
  const card = gameState.getCard(msg.cardId)
  if (!card) {
    send(ws, {
      type: 'card:move_rejected',
      cardId: msg.cardId,
      reason: 'NOT_FOUND',
      currentState: { x: 0, y: 0 },
    })
    return
  }

  if (card.ownerId !== null) {
    send(ws, {
      type: 'card:move_rejected',
      cardId: msg.cardId,
      reason: 'IN_HAND',
      currentState: { x: card.x, y: card.y },
    })
    return
  }

  // Move the card
  const result = gameState.moveCard(msg.cardId, msg.x, msg.y)
  if (!result) return

  // Broadcast to all players in room
  broadcastToRoom(room.players.keys() as any, room.code, {
    type: 'card:moved',
    cardId: msg.cardId,
    x: msg.x,
    y: msg.y,
    z: result.z,
    playerId: clientData.id,
  })
}

export function handleCardLock(
  ws: GenericWebSocket,
  msg: CardLock,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  // Check if card exists and is not in hand
  const card = gameState.getCard(msg.cardId)
  if (!card) {
    send(ws, {
      type: 'error',
      originalAction: 'card:lock',
      code: 'NOT_FOUND',
      message: 'Card not found',
    })
    return
  }

  if (card.ownerId !== null) {
    send(ws, {
      type: 'error',
      originalAction: 'card:lock',
      code: 'NOT_IN_HAND',
      message: 'Card is in a hand',
    })
    return
  }

  // Try to acquire lock
  if (!locks.lockCard(msg.cardId, clientData.id)) {
    send(ws, {
      type: 'error',
      originalAction: 'card:lock',
      code: 'CARD_LOCKED',
      message: 'Card is locked by another player',
    })
    return
  }

  // Update game state
  gameState.setCardLock(msg.cardId, clientData.id)

  // Broadcast lock
  broadcastToRoom(clients, room.code, {
    type: 'card:locked',
    cardId: msg.cardId,
    playerId: clientData.id,
  })
}

export function handleCardUnlock(
  ws: GenericWebSocket,
  msg: CardUnlock,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  // Release lock
  if (!locks.unlockCard(msg.cardId, clientData.id)) {
    // Not an error - might have already been released
    return
  }

  gameState.setCardLock(msg.cardId, null)

  // Broadcast unlock
  broadcastToRoom(clients, room.code, {
    type: 'card:unlocked',
    cardId: msg.cardId,
  })
}

export function handleCardFlip(
  ws: GenericWebSocket,
  msg: CardFlip,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  // Check lock
  const lockedBy = locks.isCardLocked(msg.cardId)
  if (lockedBy && lockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'card:flip',
      code: 'CARD_LOCKED',
      message: 'Card is locked by another player',
    })
    return
  }

  // Check if card is in hand
  const card = gameState.getCard(msg.cardId)
  if (!card) {
    send(ws, {
      type: 'error',
      originalAction: 'card:flip',
      code: 'NOT_FOUND',
      message: 'Card not found',
    })
    return
  }

  if (card.ownerId !== null && card.ownerId !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'card:flip',
      code: 'NOT_YOUR_CARD',
      message: 'Card belongs to another player',
    })
    return
  }

  // Flip the card
  const flipped = gameState.flipCard(msg.cardId)
  if (!flipped) return

  // Broadcast flip
  broadcastToRoom(clients, room.code, {
    type: 'card:flipped',
    cardId: msg.cardId,
    faceUp: flipped.faceUp,
    playerId: clientData.id,
  })
}
