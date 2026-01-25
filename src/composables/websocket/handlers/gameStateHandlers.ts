/**
 * Game state message handlers
 * Handles updates to cards, stacks, zones, and hands from the server
 */

import type { Ref } from 'vue'
import type {
  GameState,
  ServerMessage,
  CardState,
  StackState,
  ZoneState,
} from '../../../../shared/types'

interface GameStateRefs {
  gameState: Ref<GameState | null>
  handCardIds: Ref<number[]>
  handCounts: Ref<Map<string, number>>
}

/**
 * Handle card-related messages
 */
export function handleCardMessage(
  message: ServerMessage,
  refs: GameStateRefs,
): boolean {
  const { gameState } = refs

  switch (message.type) {
    case 'card:moved':
      // NOTE: Position updates (x, y) are handled by TableView.vue's onMessage handler
      // which properly supports physics animation for remote throws.
      // We only update z here to avoid race conditions with the animation system.
      if (gameState.value) {
        const card = gameState.value.cards.find((c) => c.id === message.cardId)
        if (card) {
          card.z = message.z
        }
      }
      return true

    case 'card:locked':
      if (gameState.value) {
        const card = gameState.value.cards.find((c) => c.id === message.cardId)
        if (card) card.lockedBy = message.playerId
      }
      return true

    case 'card:unlocked':
      if (gameState.value) {
        const card = gameState.value.cards.find((c) => c.id === message.cardId)
        if (card) card.lockedBy = null
      }
      return true

    case 'card:flipped':
      if (gameState.value) {
        const card = gameState.value.cards.find((c) => c.id === message.cardId)
        if (card) card.faceUp = message.faceUp
      }
      return true

    default:
      return false
  }
}

/**
 * Handle stack-related messages
 */
export function handleStackMessage(
  message: ServerMessage,
  refs: GameStateRefs,
): boolean {
  const { gameState } = refs

  switch (message.type) {
    case 'stack:created':
      if (gameState.value) {
        gameState.value.stacks.push(message.stack)
        message.cardUpdates.forEach((update) => {
          const card = gameState.value!.cards.find((c) => c.id === update.cardId)
          if (card) {
            card.x = update.x
            card.y = update.y
            card.z = update.z
            card.stackId = message.stack.id
          }
        })
      }
      return true

    case 'stack:moved':
      if (gameState.value) {
        const stack = gameState.value.stacks.find((s) => s.id === message.stackId)
        if (stack) {
          stack.anchorX = message.anchorX
          stack.anchorY = message.anchorY
        }
        // Handle zone detachment
        if (message.zoneDetached) {
          const zone = gameState.value.zones.find((z) => z.id === message.zoneDetached!.zoneId)
          if (zone) {
            zone.stackId = null
          }
          if (stack) {
            stack.zoneId = undefined
            stack.kind = 'free'
          }
        }
        message.cardUpdates.forEach((update) => {
          const card = gameState.value!.cards.find((c) => c.id === update.cardId)
          if (card) {
            card.x = update.x
            card.y = update.y
          }
        })
      }
      return true

    case 'stack:locked':
      if (gameState.value) {
        const stack = gameState.value.stacks.find((s) => s.id === message.stackId)
        if (stack) stack.lockedBy = message.playerId
      }
      return true

    case 'stack:unlocked':
      if (gameState.value) {
        const stack = gameState.value.stacks.find((s) => s.id === message.stackId)
        if (stack) stack.lockedBy = null
      }
      return true

    case 'stack:card_added':
      if (gameState.value) {
        const stack = gameState.value.stacks.find((s) => s.id === message.stackId)
        const card = gameState.value.cards.find((c) => c.id === message.cardId)
        if (stack && card) {
          if (!stack.cardIds.includes(message.cardId)) {
            stack.cardIds.push(message.cardId)
          }
          card.stackId = message.stackId
          card.x = message.cardState.x
          card.y = message.cardState.y
          card.z = message.cardState.z
          card.faceUp = message.cardState.faceUp
        }
      }
      return true

    case 'stack:card_removed':
      if (gameState.value) {
        const stack = gameState.value.stacks.find((s) => s.id === message.stackId)
        const card = gameState.value.cards.find((c) => c.id === message.cardId)
        if (stack) {
          stack.cardIds = stack.cardIds.filter((id) => id !== message.cardId)
        }
        if (card) {
          card.stackId = null
        }
        if (message.stackDeleted) {
          gameState.value.stacks = gameState.value.stacks.filter((s) => s.id !== message.stackId)
        }
      }
      return true

    case 'stack:merged':
      if (gameState.value) {
        // Remove source stack
        gameState.value.stacks = gameState.value.stacks.filter(
          (s) => s.id !== message.sourceStackId,
        )
        // Update target stack
        const targetStack = gameState.value.stacks.find((s) => s.id === message.targetStackId)
        if (targetStack) {
          Object.assign(targetStack, message.targetStack)
        }
        // Update cards
        message.cardUpdates.forEach((update) => {
          const card = gameState.value!.cards.find((c) => c.id === update.cardId)
          if (card) {
            card.x = update.x
            card.y = update.y
            card.z = update.z
            card.stackId = message.targetStackId
          }
        })
      }
      return true

    case 'stack:shuffled':
      if (gameState.value) {
        const stack = gameState.value.stacks.find((s) => s.id === message.stackId)
        if (stack) {
          stack.cardIds = message.newOrder
        }
        message.cardUpdates.forEach((update) => {
          const card = gameState.value!.cards.find((c) => c.id === update.cardId)
          if (card) {
            card.x = update.x
            card.y = update.y
          }
        })
      }
      return true

    case 'stack:reordered':
      if (gameState.value) {
        const stack = gameState.value.stacks.find((s) => s.id === message.stackId)
        if (stack) {
          stack.cardIds = message.newOrder
        }
        message.cardUpdates.forEach((update) => {
          const card = gameState.value!.cards.find((c) => c.id === update.cardId)
          if (card) {
            card.x = update.x
            card.y = update.y
          }
        })
      }
      return true

    case 'stack:flipped':
      if (gameState.value) {
        message.cardUpdates.forEach((update) => {
          const card = gameState.value!.cards.find((c) => c.id === update.cardId)
          if (card) {
            card.faceUp = update.faceUp
          }
        })
      }
      return true

    case 'stack:faces_set':
      if (gameState.value) {
        message.cardIds.forEach((cardId) => {
          const card = gameState.value!.cards.find((c) => c.id === cardId)
          if (card) {
            card.faceUp = message.faceUp
          }
        })
      }
      return true

    default:
      return false
  }
}

/**
 * Handle zone-related messages
 */
export function handleZoneMessage(
  message: ServerMessage,
  refs: GameStateRefs,
): boolean {
  const { gameState } = refs

  switch (message.type) {
    case 'zone:created':
      if (gameState.value) {
        gameState.value.zones.push(message.zone)
      }
      return true

    case 'zone:updated':
      if (gameState.value) {
        const zoneIdx = gameState.value.zones.findIndex((z) => z.id === message.zoneId)
        if (zoneIdx !== -1) {
          gameState.value.zones[zoneIdx] = message.zone
        }
        if (message.stackUpdate) {
          const stack = gameState.value.stacks.find((s) => s.id === message.stackUpdate!.stackId)
          if (stack) {
            stack.anchorX = message.stackUpdate.anchorX
            stack.anchorY = message.stackUpdate.anchorY
          }
        }
        if (message.cardUpdates) {
          message.cardUpdates.forEach((update) => {
            const card = gameState.value!.cards.find((c) => c.id === update.cardId)
            if (card) {
              card.x = update.x
              card.y = update.y
            }
          })
        }
      }
      return true

    case 'zone:deleted':
      if (gameState.value) {
        gameState.value.zones = gameState.value.zones.filter((z) => z.id !== message.zoneId)
        // Convert zone stack to free stack
        if (message.convertedStack) {
          const stack = gameState.value.stacks.find(
            (s) => s.id === message.convertedStack!.stackId,
          )
          if (stack) {
            stack.kind = 'free'
            stack.zoneId = undefined
            stack.anchorX = message.convertedStack.anchorX
            stack.anchorY = message.convertedStack.anchorY
          }
        }
      }
      return true

    case 'zone:card_added':
      if (gameState.value) {
        const zone = gameState.value.zones.find((z) => z.id === message.zoneId)
        if (zone && message.stackCreated) {
          // Stack was created, add it
          gameState.value.stacks.push({
            id: message.stackId,
            cardIds: [message.cardState.cardId],
            anchorX: message.cardState.x,
            anchorY: message.cardState.y,
            kind: 'zone',
            zoneId: message.zoneId,
            lockedBy: null,
          })
          zone.stackId = message.stackId
        } else if (zone) {
          // Add to existing stack
          const stack = gameState.value.stacks.find((s) => s.id === message.stackId)
          if (stack && !stack.cardIds.includes(message.cardState.cardId)) {
            stack.cardIds.push(message.cardState.cardId)
          }
        }
        const card = gameState.value.cards.find((c) => c.id === message.cardState.cardId)
        if (card) {
          card.x = message.cardState.x
          card.y = message.cardState.y
          card.z = message.cardState.z
          card.faceUp = message.cardState.faceUp
          card.stackId = message.stackId
        }
      }
      return true

    default:
      return false
  }
}

/**
 * Handle hand-related messages
 */
export function handleHandMessage(
  message: ServerMessage,
  refs: GameStateRefs,
  currentPlayerId: string | null,
): boolean {
  const { gameState, handCardIds, handCounts } = refs

  switch (message.type) {
    case 'hand:card_added':
      if (gameState.value) {
        const card = gameState.value.cards.find((c) => c.id === message.cardId)
        if (card) {
          Object.assign(card, message.cardState)
        }
        if (!handCardIds.value.includes(message.cardId)) {
          handCardIds.value.push(message.cardId)
        }
      }
      return true

    case 'hand:card_added_other':
      // Another player added a card to their hand - update count
      handCounts.value.set(message.playerId, message.handCount)
      if (gameState.value) {
        const card = gameState.value.cards.find((c) => c.id === message.cardId)
        if (card) {
          card.ownerId = message.playerId
        }
      }
      return true

    case 'hand:card_removed':
      if (gameState.value) {
        const card = gameState.value.cards.find((c) => c.id === message.cardState.id)
        if (card) {
          Object.assign(card, message.cardState)
        }
        // If it's our card being removed (returned from hand)
        if (message.playerId === currentPlayerId) {
          handCardIds.value = handCardIds.value.filter((id) => id !== message.cardState.id)
        }
      }
      return true

    case 'hand:reordered':
      handCardIds.value = message.newOrder
      return true

    case 'hand:stack_added':
      handCardIds.value = message.newHand
      return true

    case 'hand:stack_added_other':
      // Another player added a stack to their hand - update count
      handCounts.value.set(message.playerId, message.handCount)
      if (gameState.value) {
        // Remove the stack since it's now in someone's hand
        gameState.value.stacks = gameState.value.stacks.filter(
          (s) => s.id !== message.stackDeleted,
        )
        // Mark cards as owned so they're hidden from view
        for (const cardId of message.cardIds) {
          const card = gameState.value.cards.find((c) => c.id === cardId)
          if (card) {
            card.ownerId = message.playerId
            card.stackId = null
          }
        }
      }
      return true

    default:
      return false
  }
}
