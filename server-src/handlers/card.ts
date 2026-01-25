import type { CardMoveIntent, CardLock, CardUnlock, CardFlip } from '../../shared/types'
import type { Room } from '../room'
import type { GenericWebSocket } from '../utils/broadcast'
import { send, broadcastToRoom, getClientData } from '../utils/broadcast'

export function handleCardMove(
  ws: GenericWebSocket,
  msg: CardMoveIntent,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  // Check if card exists first
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

  // Check if card is in someone's hand
  if (card.ownerId !== null) {
    send(ws, {
      type: 'card:move_rejected',
      cardId: msg.cardId,
      reason: 'IN_HAND',
      currentState: { x: card.x, y: card.y },
    })
    return
  }

  // Atomically try to acquire lock (or refresh if we already hold it)
  // This prevents race conditions where two players check and then move simultaneously
  if (!locks.lockCard(msg.cardId, clientData.id)) {
    send(ws, {
      type: 'card:move_rejected',
      cardId: msg.cardId,
      reason: 'LOCKED',
      currentState: { x: card.x, y: card.y },
    })
    return
  }

  // Move the card (we now hold the lock)
  const result = gameState.moveCard(msg.cardId, msg.x, msg.y)
  if (!result) return

  // Broadcast to all players in room
  broadcastToRoom(clients, room.code, {
    type: 'card:moved',
    cardId: msg.cardId,
    x: msg.x,
    y: msg.y,
    z: result.z,
    playerId: clientData.id,
    vx: msg.vx,
    vy: msg.vy,
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
      requestId: msg.requestId,
    })
    return
  }

  if (card.ownerId !== null) {
    // If the card is in our own hand, just acknowledge (handles race condition)
    if (card.ownerId === clientData.id) {
      send(ws, {
        type: 'card:locked',
        cardId: msg.cardId,
        playerId: clientData.id,
      })
      return
    }
    send(ws, {
      type: 'error',
      originalAction: 'card:lock',
      code: 'NOT_IN_HAND',
      message: 'Card is in a hand',
      requestId: msg.requestId,
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
      requestId: msg.requestId,
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

  // Check if card exists
  const card = gameState.getCard(msg.cardId)
  if (!card) {
    send(ws, {
      type: 'error',
      originalAction: 'card:flip',
      code: 'NOT_FOUND',
      message: 'Card not found',
      requestId: msg.requestId,
    })
    return
  }

  // Check if card is in another player's hand
  if (card.ownerId !== null && card.ownerId !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'card:flip',
      code: 'NOT_YOUR_CARD',
      message: 'Card belongs to another player',
      requestId: msg.requestId,
    })
    return
  }

  // Atomically try to acquire lock for the flip operation
  if (!locks.lockCard(msg.cardId, clientData.id)) {
    send(ws, {
      type: 'error',
      originalAction: 'card:flip',
      code: 'CARD_LOCKED',
      message: 'Card is locked by another player',
      requestId: msg.requestId,
    })
    return
  }

  // Flip the card (we now hold the lock)
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
