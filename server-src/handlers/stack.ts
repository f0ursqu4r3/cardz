import type {
  StackCreate,
  StackMove,
  StackLock,
  StackUnlock,
  StackAddCard,
  StackRemoveCard,
  StackMerge,
  StackShuffle,
  StackFlip,
  StackSetFaces,
  StackReorder,
} from '../../shared/types'
import type { Room } from '../room'
import type { ClientData, GenericWebSocket } from '../utils/broadcast'
import { send, broadcastToRoom } from '../utils/broadcast'

function getClientData(ws: GenericWebSocket): ClientData {
  return ws.data ?? ws.getUserData?.() ?? { id: '', roomCode: null, name: '' }
}

export function handleStackCreate(
  ws: GenericWebSocket,
  msg: StackCreate,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  // Check all cards are free (not locked by others, not in hands)
  for (const cardId of msg.cardIds) {
    const card = gameState.getCard(cardId)
    if (!card) {
      send(ws, {
        type: 'error',
        originalAction: 'stack:create',
        code: 'NOT_FOUND',
        message: `Card ${cardId} not found`,
      })
      return
    }

    if (card.ownerId !== null) {
      send(ws, {
        type: 'error',
        originalAction: 'stack:create',
        code: 'NOT_IN_HAND',
        message: 'Cannot stack cards that are in a hand',
      })
      return
    }

    const lockedBy = locks.isCardLocked(cardId)
    if (lockedBy && lockedBy !== clientData.id) {
      send(ws, {
        type: 'error',
        originalAction: 'stack:create',
        code: 'CARD_LOCKED',
        message: 'One or more cards are locked',
      })
      return
    }
  }

  // Create the stack
  const result = gameState.createStack(msg.cardIds, msg.anchorX, msg.anchorY)

  // Broadcast creation
  broadcastToRoom(clients, room.code, {
    type: 'stack:created',
    stack: result.stack,
    cardUpdates: result.cardUpdates,
    playerId: clientData.id,
  })
}

export function handleStackMove(
  ws: GenericWebSocket,
  msg: StackMove,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  // Check lock
  const lockedBy = locks.isStackLocked(msg.stackId)
  if (lockedBy && lockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:move',
      code: 'STACK_LOCKED',
      message: 'Stack is locked by another player',
    })
    return
  }

  const result = gameState.moveStack(msg.stackId, msg.anchorX, msg.anchorY, msg.detachFromZone)
  if (!result) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:move',
      code: 'NOT_FOUND',
      message: 'Stack not found',
    })
    return
  }

  // Broadcast move
  broadcastToRoom(clients, room.code, {
    type: 'stack:moved',
    stackId: msg.stackId,
    anchorX: msg.anchorX,
    anchorY: msg.anchorY,
    cardUpdates: result.cardUpdates,
    zoneDetached: result.zoneDetached,
    playerId: clientData.id,
  })
}

export function handleStackLock(
  ws: GenericWebSocket,
  msg: StackLock,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  const stack = gameState.getStack(msg.stackId)
  if (!stack) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:lock',
      code: 'NOT_FOUND',
      message: 'Stack not found',
    })
    return
  }

  if (!locks.lockStack(msg.stackId, clientData.id)) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:lock',
      code: 'STACK_LOCKED',
      message: 'Stack is locked by another player',
    })
    return
  }

  gameState.setStackLock(msg.stackId, clientData.id)

  broadcastToRoom(clients, room.code, {
    type: 'stack:locked',
    stackId: msg.stackId,
    playerId: clientData.id,
  })
}

export function handleStackUnlock(
  ws: GenericWebSocket,
  msg: StackUnlock,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  if (!locks.unlockStack(msg.stackId, clientData.id)) {
    return
  }

  gameState.setStackLock(msg.stackId, null)

  broadcastToRoom(clients, room.code, {
    type: 'stack:unlocked',
    stackId: msg.stackId,
  })
}

export function handleStackAddCard(
  ws: GenericWebSocket,
  msg: StackAddCard,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  // Check stack lock
  const stackLockedBy = locks.isStackLocked(msg.stackId)
  if (stackLockedBy && stackLockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:add_card',
      code: 'STACK_LOCKED',
      message: 'Stack is locked by another player',
    })
    return
  }

  // Check card lock
  const cardLockedBy = locks.isCardLocked(msg.cardId)
  if (cardLockedBy && cardLockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:add_card',
      code: 'CARD_LOCKED',
      message: 'Card is locked by another player',
    })
    return
  }

  const card = gameState.getCard(msg.cardId)
  if (!card) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:add_card',
      code: 'NOT_FOUND',
      message: 'Card not found',
    })
    return
  }

  if (card.ownerId !== null) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:add_card',
      code: 'NOT_IN_HAND',
      message: 'Card is in a hand',
    })
    return
  }

  // Determine the stack's orientation from existing cards
  const stack = gameState.getStack(msg.stackId)
  if (!stack) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:add_card',
      code: 'NOT_FOUND',
      message: 'Stack not found',
    })
    return
  }

  // For non-zone stacks, preserve the card's current faceUp state (allow mixed)
  // Zone stacks will set faceUp based on zone settings in gameState.addCardToStack
  const result = gameState.addCardToStack(msg.stackId, msg.cardId, undefined)
  if (!result) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:add_card',
      code: 'NOT_FOUND',
      message: 'Stack not found',
    })
    return
  }

  broadcastToRoom(clients, room.code, {
    type: 'stack:card_added',
    stackId: msg.stackId,
    cardId: msg.cardId,
    cardState: result,
    playerId: clientData.id,
  })
}

export function handleStackRemoveCard(
  ws: GenericWebSocket,
  msg: StackRemoveCard,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  const card = gameState.getCard(msg.cardId)
  if (!card || card.stackId === null) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:remove_card',
      code: 'NOT_FOUND',
      message: 'Card not found or not in a stack',
    })
    return
  }

  // Check stack lock
  const stackLockedBy = locks.isStackLocked(card.stackId)
  if (stackLockedBy && stackLockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:remove_card',
      code: 'STACK_LOCKED',
      message: 'Stack is locked by another player',
    })
    return
  }

  const result = gameState.removeCardFromStack(msg.cardId)
  if (!result) return

  broadcastToRoom(clients, room.code, {
    type: 'stack:card_removed',
    stackId: result.stackId,
    cardId: msg.cardId,
    stackDeleted: result.stackDeleted,
    playerId: clientData.id,
  })
}

export function handleStackMerge(
  ws: GenericWebSocket,
  msg: StackMerge,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  // Check both stacks for locks
  for (const stackId of [msg.sourceStackId, msg.targetStackId]) {
    const lockedBy = locks.isStackLocked(stackId)
    if (lockedBy && lockedBy !== clientData.id) {
      send(ws, {
        type: 'error',
        originalAction: 'stack:merge',
        code: 'STACK_LOCKED',
        message: 'One or more stacks are locked',
      })
      return
    }
  }

  const result = gameState.mergeStacks(msg.sourceStackId, msg.targetStackId)
  if (!result) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:merge',
      code: 'NOT_FOUND',
      message: 'Stack not found',
    })
    return
  }

  // Release source stack lock if any
  locks.unlockStack(msg.sourceStackId, clientData.id)

  broadcastToRoom(clients, room.code, {
    type: 'stack:merged',
    sourceStackId: msg.sourceStackId,
    targetStackId: msg.targetStackId,
    targetStack: result.targetStack,
    cardUpdates: result.cardUpdates,
    playerId: clientData.id,
  })
}

export function handleStackShuffle(
  ws: GenericWebSocket,
  msg: StackShuffle,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  const lockedBy = locks.isStackLocked(msg.stackId)
  if (lockedBy && lockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:shuffle',
      code: 'STACK_LOCKED',
      message: 'Stack is locked by another player',
    })
    return
  }

  const result = gameState.shuffleStack(msg.stackId)
  if (!result) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:shuffle',
      code: 'NOT_FOUND',
      message: 'Stack not found',
    })
    return
  }

  broadcastToRoom(clients, room.code, {
    type: 'stack:shuffled',
    stackId: msg.stackId,
    newOrder: result.newOrder,
    cardUpdates: result.cardUpdates,
    playerId: clientData.id,
  })
}

export function handleStackFlip(
  ws: GenericWebSocket,
  msg: StackFlip,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  const lockedBy = locks.isStackLocked(msg.stackId)
  if (lockedBy && lockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:flip',
      code: 'STACK_LOCKED',
      message: 'Stack is locked by another player',
    })
    return
  }

  const result = gameState.flipStack(msg.stackId)
  if (!result) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:flip',
      code: 'NOT_FOUND',
      message: 'Stack not found',
    })
    return
  }

  broadcastToRoom(clients, room.code, {
    type: 'stack:flipped',
    stackId: msg.stackId,
    cardUpdates: result.cardUpdates,
    playerId: clientData.id,
  })
}

export function handleStackSetFaces(
  ws: GenericWebSocket,
  msg: StackSetFaces,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  const lockedBy = locks.isStackLocked(msg.stackId)
  if (lockedBy && lockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:set_faces',
      code: 'STACK_LOCKED',
      message: 'Stack is locked by another player',
    })
    return
  }

  const result = gameState.setStackFaces(msg.stackId, msg.faceUp)
  if (!result) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:set_faces',
      code: 'NOT_FOUND',
      message: 'Stack not found',
    })
    return
  }

  broadcastToRoom(clients, room.code, {
    type: 'stack:faces_set',
    stackId: msg.stackId,
    faceUp: msg.faceUp,
    cardIds: result.cardIds,
    playerId: clientData.id,
  })
}

export function handleStackReorder(
  ws: GenericWebSocket,
  msg: StackReorder,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  const lockedBy = locks.isStackLocked(msg.stackId)
  if (lockedBy && lockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:reorder',
      code: 'STACK_LOCKED',
      message: 'Stack is locked by another player',
    })
    return
  }

  const result = gameState.reorderStack(msg.stackId, msg.fromIndex, msg.toIndex)
  if (!result) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:reorder',
      code: 'INVALID_ACTION',
      message: 'Invalid reorder operation',
    })
    return
  }

  broadcastToRoom(clients, room.code, {
    type: 'stack:reordered',
    stackId: msg.stackId,
    newOrder: result.newOrder,
    cardUpdates: result.cardUpdates,
    playerId: clientData.id,
  })
}
