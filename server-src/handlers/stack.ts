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
import type { GenericWebSocket } from '../utils/broadcast'
import { send, broadcastToRoom, broadcastToViewport, getClientData } from '../utils/broadcast'
import { logStackCreated, logStackShuffled, logStackFlipped } from '../activity'

const canManageZone = (room: Room, zoneOwnerId: string | null, playerId: string): boolean => {
  return (
    room.creatorPlayerId === playerId ||
    room.moderatorPlayerIds.has(playerId) ||
    zoneOwnerId === playerId
  )
}

const enforceZoneStackAccess = (
  ws: GenericWebSocket,
  room: Room,
  zone: { locked: boolean; visibility: 'public' | 'owner' | 'hidden'; ownerId: string | null },
  playerId: string,
  originalAction: string,
  requestId?: string,
): boolean => {
  if (zone.locked) {
    send(ws, {
      type: 'error',
      originalAction,
      code: 'ZONE_LOCKED',
      message: 'Zone is locked',
      requestId,
    })
    return false
  }

  if (zone.visibility === 'owner' && !canManageZone(room, zone.ownerId, playerId)) {
    send(ws, {
      type: 'error',
      originalAction,
      code: 'PERMISSION_DENIED',
      message: 'Only the zone owner or table moderators can modify this zone',
      requestId,
    })
    return false
  }

  return true
}

export function handleStackCreate(
  ws: GenericWebSocket,
  msg: StackCreate,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  // First pass: validate all cards exist and are not in hands
  for (const cardId of msg.cardIds) {
    const card = gameState.getCard(cardId)
    if (!card) {
      send(ws, {
        type: 'error',
        originalAction: 'stack:create',
        code: 'NOT_FOUND',
        message: `Card ${cardId} not found`,
        requestId: msg.requestId,
      })
      return
    }

    if (card.ownerId !== null) {
      send(ws, {
        type: 'error',
        originalAction: 'stack:create',
        code: 'NOT_IN_HAND',
        message: 'Cannot stack cards that are in a hand',
        requestId: msg.requestId,
      })
      return
    }
  }

  // Second pass: atomically acquire locks on all cards
  const acquiredLocks: number[] = []
  for (const cardId of msg.cardIds) {
    if (!locks.lockCard(cardId, clientData.id)) {
      // Failed to acquire lock - release any locks we acquired
      for (const lockedCardId of acquiredLocks) {
        locks.unlockCard(lockedCardId, clientData.id)
      }
      send(ws, {
        type: 'error',
        originalAction: 'stack:create',
        code: 'CARD_LOCKED',
        message: 'One or more cards are locked by another player',
        requestId: msg.requestId,
      })
      return
    }
    acquiredLocks.push(cardId)
  }

  // Create the stack (we now hold all the locks)
  const result = gameState.createStack(msg.cardIds, msg.anchorX, msg.anchorY)

  // Release the card locks (stack creation transfers cards to stack)
  for (const cardId of acquiredLocks) {
    locks.unlockCard(cardId, clientData.id)
  }

  // Broadcast creation to players whose viewport contains this position
  broadcastToViewport(
    clients,
    room.code,
    {
      type: 'stack:created',
      stack: result.stack,
      cardUpdates: result.cardUpdates,
      playerId: clientData.playerId ?? clientData.id,
    },
    { x: msg.anchorX, y: msg.anchorY },
  )

  // Log activity
  logStackCreated(clients, room.code, clientData.playerId ?? clientData.id, clientData.name, msg.cardIds.length)
}

export function handleStackMove(
  ws: GenericWebSocket,
  msg: StackMove,
  room: Room,
  clients: Map<string, GenericWebSocket>,
): void {
  const clientData = getClientData(ws)
  const { locks, gameState } = room

  // Check if stack exists first
  const stack = gameState.getStack(msg.stackId)
  if (!stack) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:move',
      code: 'NOT_FOUND',
      message: 'Stack not found',
      requestId: msg.requestId,
    })
    return
  }

  if (stack.kind === 'zone' && stack.zoneId !== undefined && clientData.playerId) {
    const zone = gameState.getZone(stack.zoneId)
    if (zone && !enforceZoneStackAccess(ws, room, zone, clientData.playerId, 'stack:move', msg.requestId)) {
      return
    }
  }

  // Atomically try to acquire lock (or refresh if we already hold it)
  if (!locks.lockStack(msg.stackId, clientData.id)) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:move',
      code: 'STACK_LOCKED',
      message: 'Stack is locked by another player',
      requestId: msg.requestId,
    })
    return
  }

  // Move the stack (we now hold the lock)
  const result = gameState.moveStack(msg.stackId, msg.anchorX, msg.anchorY, msg.detachFromZone)
  if (!result) {
    return
  }

  // Broadcast move to players whose viewport contains this position
  broadcastToViewport(
    clients,
    room.code,
    {
      type: 'stack:moved',
      stackId: msg.stackId,
      anchorX: msg.anchorX,
      anchorY: msg.anchorY,
      cardUpdates: result.cardUpdates,
      zoneDetached: result.zoneDetached,
      playerId: clientData.playerId ?? clientData.id,
    },
    { x: msg.anchorX, y: msg.anchorY },
  )
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
      requestId: msg.requestId,
    })
    return
  }

  if (stack.kind === 'zone' && stack.zoneId !== undefined && clientData.playerId) {
    const zone = gameState.getZone(stack.zoneId)
    if (zone && !enforceZoneStackAccess(ws, room, zone, clientData.playerId, 'stack:lock', msg.requestId)) {
      return
    }
  }

  if (!locks.lockStack(msg.stackId, clientData.id)) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:lock',
      code: 'STACK_LOCKED',
      message: 'Stack is locked by another player',
      requestId: msg.requestId,
    })
    return
  }

  gameState.setStackLock(msg.stackId, clientData.id)

  broadcastToRoom(clients, room.code, {
    type: 'stack:locked',
    stackId: msg.stackId,
    playerId: clientData.playerId ?? clientData.id,
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

  // Try to release transient lock (may already be expired/released)
  locks.unlockStack(msg.stackId, clientData.id)

  // Check if game state has this player's lock - clear it even if transient lock expired
  const stack = gameState.getStack(msg.stackId)
  if (!stack || stack.lockedBy !== clientData.id) {
    // Stack doesn't exist or wasn't locked by this player - nothing to do
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
      requestId: msg.requestId,
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
      requestId: msg.requestId,
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
      requestId: msg.requestId,
    })
    return
  }

  if (card.ownerId !== null) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:add_card',
      code: 'NOT_IN_HAND',
      message: 'Card is in a hand',
      requestId: msg.requestId,
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
      requestId: msg.requestId,
    })
    return
  }

  if (stack.kind === 'zone' && stack.zoneId !== undefined && clientData.playerId) {
    const zone = gameState.getZone(stack.zoneId)
    if (zone && !enforceZoneStackAccess(ws, room, zone, clientData.playerId, 'stack:add_card', msg.requestId)) {
      return
    }
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
      requestId: msg.requestId,
    })
    return
  }

  // Broadcast to players whose viewport contains this stack
  broadcastToViewport(
    clients,
    room.code,
    {
      type: 'stack:card_added',
      stackId: msg.stackId,
      cardId: msg.cardId,
      cardState: result,
      playerId: clientData.playerId ?? clientData.id,
    },
    { x: stack.anchorX, y: stack.anchorY },
  )
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
      requestId: msg.requestId,
    })
    return
  }

  const stack = gameState.getStack(card.stackId)
  if (stack && stack.kind === 'zone' && stack.zoneId !== undefined && clientData.playerId) {
    const zone = gameState.getZone(stack.zoneId)
    if (zone && !enforceZoneStackAccess(ws, room, zone, clientData.playerId, 'stack:remove_card', msg.requestId)) {
      return
    }
  }

  // Check stack lock
  const stackLockedBy = locks.isStackLocked(card.stackId)
  if (stackLockedBy && stackLockedBy !== clientData.id) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:remove_card',
      code: 'STACK_LOCKED',
      message: 'Stack is locked by another player',
      requestId: msg.requestId,
    })
    return
  }

  // Get stack position before removal for viewport broadcasting
  const stackPos = stack ? { x: stack.anchorX, y: stack.anchorY } : { x: card.x, y: card.y }

  const result = gameState.removeCardFromStack(msg.cardId)
  if (!result) return

  // Broadcast to players whose viewport contains this stack
  broadcastToViewport(
    clients,
    room.code,
    {
      type: 'stack:card_removed',
      stackId: result.stackId,
      cardId: msg.cardId,
      stackDeleted: result.stackDeleted,
      playerId: clientData.playerId ?? clientData.id,
    },
    stackPos,
  )
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
        requestId: msg.requestId,
      })
      return
    }
  }

  const sourceStack = gameState.getStack(msg.sourceStackId)
  const targetStack = gameState.getStack(msg.targetStackId)
  if (!sourceStack || !targetStack) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:merge',
      code: 'NOT_FOUND',
      message: 'Stack not found',
      requestId: msg.requestId,
    })
    return
  }

  if (clientData.playerId) {
    if (sourceStack.kind === 'zone' && sourceStack.zoneId !== undefined) {
      const zone = gameState.getZone(sourceStack.zoneId)
      if (zone && !enforceZoneStackAccess(ws, room, zone, clientData.playerId, 'stack:merge', msg.requestId)) {
        return
      }
    }
    if (targetStack.kind === 'zone' && targetStack.zoneId !== undefined) {
      const zone = gameState.getZone(targetStack.zoneId)
      if (zone && !enforceZoneStackAccess(ws, room, zone, clientData.playerId, 'stack:merge', msg.requestId)) {
        return
      }
    }
  }

  // Get target stack position for viewport broadcasting
  const targetPos = { x: targetStack.anchorX, y: targetStack.anchorY }

  const result = gameState.mergeStacks(msg.sourceStackId, msg.targetStackId)
  if (!result) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:merge',
      code: 'NOT_FOUND',
      message: 'Stack not found',
      requestId: msg.requestId,
    })
    return
  }

  // Release source stack lock if any
  locks.unlockStack(msg.sourceStackId, clientData.id)

  // Broadcast to players whose viewport contains the target stack
  broadcastToViewport(
    clients,
    room.code,
    {
      type: 'stack:merged',
      sourceStackId: msg.sourceStackId,
      targetStackId: msg.targetStackId,
      targetStack: result.targetStack,
      cardUpdates: result.cardUpdates,
      playerId: clientData.playerId ?? clientData.id,
    },
    targetPos,
  )
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
      requestId: msg.requestId,
    })
    return
  }

  // Get stack position for viewport broadcasting
  const stack = gameState.getStack(msg.stackId)
  if (!stack) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:shuffle',
      code: 'NOT_FOUND',
      message: 'Stack not found',
      requestId: msg.requestId,
    })
    return
  }

  if (stack.kind === 'zone' && stack.zoneId !== undefined && clientData.playerId) {
    const zone = gameState.getZone(stack.zoneId)
    if (zone && !enforceZoneStackAccess(ws, room, zone, clientData.playerId, 'stack:shuffle', msg.requestId)) {
      return
    }
  }

  const result = gameState.shuffleStack(msg.stackId)
  if (!result) {
    return
  }

  // Broadcast to players whose viewport contains this stack
  broadcastToViewport(
    clients,
    room.code,
    {
      type: 'stack:shuffled',
      stackId: msg.stackId,
      newOrder: result.newOrder,
      cardUpdates: result.cardUpdates,
      playerId: clientData.playerId ?? clientData.id,
    },
    { x: stack.anchorX, y: stack.anchorY },
  )

  // Log activity
  logStackShuffled(clients, room.code, clientData.playerId ?? clientData.id, clientData.name, result.newOrder.length)
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
      requestId: msg.requestId,
    })
    return
  }

  // Get stack position for viewport broadcasting
  const stack = gameState.getStack(msg.stackId)
  if (!stack) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:flip',
      code: 'NOT_FOUND',
      message: 'Stack not found',
      requestId: msg.requestId,
    })
    return
  }

  if (stack.kind === 'zone' && stack.zoneId !== undefined && clientData.playerId) {
    const zone = gameState.getZone(stack.zoneId)
    if (zone && !enforceZoneStackAccess(ws, room, zone, clientData.playerId, 'stack:flip', msg.requestId)) {
      return
    }
  }

  const result = gameState.flipStack(msg.stackId)
  if (!result) {
    return
  }

  // Broadcast to players whose viewport contains this stack
  broadcastToViewport(
    clients,
    room.code,
    {
      type: 'stack:flipped',
      stackId: msg.stackId,
      cardUpdates: result.cardUpdates,
      playerId: clientData.playerId ?? clientData.id,
    },
    { x: stack.anchorX, y: stack.anchorY },
  )

  // Log activity
  logStackFlipped(clients, room.code, clientData.playerId ?? clientData.id, clientData.name, result.cardUpdates.length)
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
      requestId: msg.requestId,
    })
    return
  }

  // Get stack position for viewport broadcasting
  const stack = gameState.getStack(msg.stackId)
  if (!stack) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:set_faces',
      code: 'NOT_FOUND',
      message: 'Stack not found',
      requestId: msg.requestId,
    })
    return
  }

  if (stack.kind === 'zone' && stack.zoneId !== undefined && clientData.playerId) {
    const zone = gameState.getZone(stack.zoneId)
    if (zone && !enforceZoneStackAccess(ws, room, zone, clientData.playerId, 'stack:set_faces', msg.requestId)) {
      return
    }
  }

  const result = gameState.setStackFaces(msg.stackId, msg.faceUp)
  if (!result) {
    return
  }

  // Broadcast to players whose viewport contains this stack
  broadcastToViewport(
    clients,
    room.code,
    {
      type: 'stack:faces_set',
      stackId: msg.stackId,
      faceUp: msg.faceUp,
      cardIds: result.cardIds,
      playerId: clientData.playerId ?? clientData.id,
    },
    { x: stack.anchorX, y: stack.anchorY },
  )
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
      requestId: msg.requestId,
    })
    return
  }

  // Get stack position for viewport broadcasting
  const stack = gameState.getStack(msg.stackId)
  if (!stack) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:reorder',
      code: 'INVALID_ACTION',
      message: 'Invalid reorder operation',
      requestId: msg.requestId,
    })
    return
  }

  if (stack.kind === 'zone' && stack.zoneId !== undefined && clientData.playerId) {
    const zone = gameState.getZone(stack.zoneId)
    if (zone && !enforceZoneStackAccess(ws, room, zone, clientData.playerId, 'stack:reorder', msg.requestId)) {
      return
    }
  }

  const result = gameState.reorderStack(msg.stackId, msg.fromIndex, msg.toIndex)
  if (!result) {
    send(ws, {
      type: 'error',
      originalAction: 'stack:reorder',
      code: 'INVALID_ACTION',
      message: 'Invalid reorder operation',
      requestId: msg.requestId,
    })
    return
  }

  // Broadcast to players whose viewport contains this stack
  broadcastToViewport(
    clients,
    room.code,
    {
      type: 'stack:reordered',
      stackId: msg.stackId,
      newOrder: result.newOrder,
      cardUpdates: result.cardUpdates,
      playerId: clientData.playerId ?? clientData.id,
    },
    { x: stack.anchorX, y: stack.anchorY },
  )
}
