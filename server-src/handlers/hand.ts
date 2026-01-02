import type { HandAdd, HandRemove, HandReorder, HandAddStack } from '../../shared/types'
import type { Room } from '../room'
import type { ClientData, GenericWebSocket } from '../utils/broadcast'
import { send, broadcastToRoom, broadcastSplit } from '../utils/broadcast'

function getClientData(ws: GenericWebSocket): ClientData {
  return ws.data ?? ws.getUserData?.() ?? { id: '', roomCode: null, name: '' }
}

export function handleHandAdd(
  ws: GenericWebSocket,
  msg: HandAdd,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  const card = gameState.getCard(msg.cardId)
  if (!card) {
    send(ws, {
      type: 'error',
      originalAction: 'hand:add',
      code: 'NOT_FOUND',
      message: 'Card not found',
    })
    return
  }

  // Check if already owned
  if (card.ownerId !== null) {
    send(ws, {
      type: 'error',
      originalAction: 'hand:add',
      code: 'NOT_YOUR_CARD',
      message: 'Card is already in a hand',
    })
    return
  }

  // Check card lock
  const lockedBy = locks.isCardLocked(msg.cardId)
  if (lockedBy && lockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'hand:add',
      code: 'CARD_LOCKED',
      message: 'Card is locked by another player',
    })
    return
  }

  // Release card lock if we held it
  locks.unlockCard(msg.cardId, clientData.id)

  const result = gameState.addCardToHand(clientData.id, msg.cardId)
  if (!result) return

  const handCount = gameState.getHandCount(clientData.id)

  // Send full info to owner, limited info to others
  broadcastSplit(
    clients,
    room.code,
    clientData.id,
    {
      type: 'hand:card_added',
      cardId: msg.cardId,
      cardState: result,
    },
    {
      type: 'hand:card_added_other',
      playerId: clientData.id,
      handCount,
    },
  )
}

export function handleHandRemove(
  ws: GenericWebSocket,
  msg: HandRemove,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { gameState } = room

  const card = gameState.getCard(msg.cardId)
  if (!card || card.ownerId !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'hand:remove',
      code: 'NOT_YOUR_CARD',
      message: 'Card is not in your hand',
    })
    return
  }

  const result = gameState.removeCardFromHand(clientData.id, msg.cardId, msg.x, msg.y)
  if (!result) return

  // Card is now visible to everyone
  broadcastToRoom(clients, room.code, {
    type: 'hand:card_removed',
    playerId: clientData.id,
    cardState: result,
  })
}

export function handleHandReorder(ws: GenericWebSocket, msg: HandReorder, room: Room): void {
  const clientData = getClientData(ws)
  const { gameState } = room

  const newOrder = gameState.reorderHand(clientData.id, msg.fromIndex, msg.toIndex)
  if (!newOrder) {
    send(ws, {
      type: 'error',
      originalAction: 'hand:reorder',
      code: 'INVALID_ACTION',
      message: 'Invalid reorder operation',
    })
    return
  }

  // Only send confirmation to the player (others don't see hand order)
  send(ws, {
    type: 'hand:reordered',
    newOrder,
  })
}

export function handleHandAddStack(
  ws: GenericWebSocket,
  msg: HandAddStack,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  const stack = gameState.getStack(msg.stackId)
  if (!stack) {
    send(ws, {
      type: 'error',
      originalAction: 'hand:add_stack',
      code: 'NOT_FOUND',
      message: 'Stack not found',
    })
    return
  }

  // Check stack lock
  const lockedBy = locks.isStackLocked(msg.stackId)
  if (lockedBy && lockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'hand:add_stack',
      code: 'STACK_LOCKED',
      message: 'Stack is locked by another player',
    })
    return
  }

  // Release stack lock
  locks.unlockStack(msg.stackId, clientData.id)

  const result = gameState.addStackToHand(clientData.id, msg.stackId)
  if (!result) return

  const handCount = gameState.getHandCount(clientData.id)

  // Send full info to owner, limited info to others
  broadcastSplit(
    clients,
    room.code,
    clientData.id,
    {
      type: 'hand:stack_added',
      cardIds: result.cardIds,
      newHand: result.newHand,
    },
    {
      type: 'hand:stack_added_other',
      playerId: clientData.id,
      stackDeleted: msg.stackId,
      handCount,
    },
  )
}
