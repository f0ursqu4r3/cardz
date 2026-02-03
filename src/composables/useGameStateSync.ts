import type { Router } from 'vue-router'
import type { useCardStore } from '@/stores/cards'
import type { useWebSocket } from './useWebSocket'
import type { useRemoteThrow } from './useRemoteThrow'
import type { ServerMessage } from '../../shared/types'
import type { Stack } from '@/types'

/**
 * Configuration for the game state sync composable
 */
export interface GameStateSyncConfig {
  /** Card store instance */
  cardStore: ReturnType<typeof useCardStore>
  /** WebSocket composable instance */
  ws: ReturnType<typeof useWebSocket>
  /** Remote throw composable for physics animations */
  remoteThrow: ReturnType<typeof useRemoteThrow>
  /** Vue router instance */
  router: Router
}

/**
 * Composable that sets up WebSocket message handlers for game state synchronization.
 * Handles all server messages and updates the local card store accordingly.
 */
export function useGameStateSync(config: GameStateSyncConfig) {
  const { cardStore, ws, remoteThrow, router } = config

  // Set up the message handler
  ws.onMessage((message: ServerMessage) => {
    switch (message.type) {
      case 'room:created':
        // Full state sync on room creation - use message.state directly
        // (ws.gameState.value is not yet set when this handler runs)
        cardStore.syncFromServer(message.state, [])
        // Update route to include room code
        router.replace({
          name: 'table',
          params: { code: message.roomCode },
        })
        break

      case 'room:joined': {
        // Full state sync when joining a room
        const ourHand = message.state.hands.find((h) => h.playerId === message.playerId)
        cardStore.syncFromServer(message.state, ourHand?.cardIds ?? [])
        break
      }

      case 'room:error':
        // Room error - redirect to landing
        // Codes: NOT_FOUND, FULL, INVALID_CODE
        console.error('[room] error:', message.code, message.message)
        router.replace({ name: 'landing' })
        break

      case 'card:moved':
        if (message.playerId === ws.playerId.value) {
          // Our own move - only update z-index, not x/y position.
          // We already have the correct local position from dragging;
          // updating from server would cause jumping due to network latency.
          cardStore.updateCardFromServer(message.cardId, { z: message.z })
        } else if (message.vx !== undefined && message.vy !== undefined) {
          // Remote player threw the card - animate with physics prediction
          cardStore.updateCardFromServer(message.cardId, { z: message.z })
          remoteThrow.startThrow(message.cardId, message.x, message.y, message.vx, message.vy)
        } else {
          // Remote player moved card without throw (or final position after throw)
          remoteThrow.cancelThrow(message.cardId)
          cardStore.updateCardFromServer(message.cardId, {
            x: message.x,
            y: message.y,
            z: message.z,
          })
        }
        break

      case 'card:locked':
        // Cancel any remote throw animation when card is grabbed
        remoteThrow.cancelThrow(message.cardId)
        cardStore.updateCardFromServer(message.cardId, { lockedBy: message.playerId })
        break

      case 'card:unlocked':
        cardStore.updateCardFromServer(message.cardId, { lockedBy: null })
        break

      case 'card:flipped':
        // Only animate for remote player flips (we already animated locally)
        if (message.playerId !== ws.playerId.value) {
          cardStore.handleRemoteFlip(message.cardId, message.faceUp)
        }
        break

      case 'stack:created':
        cardStore.addStackFromServer(message.stack)
        message.cardUpdates.forEach((update) => {
          cardStore.updateCardFromServer(update.cardId, {
            x: update.x,
            y: update.y,
            z: update.z,
            stackId: message.stack.id,
          })
        })
        break

      case 'stack:moved':
        // Handle zone detachment for all moves (metadata change)
        if (message.zoneDetached) {
          const zone = cardStore.zones.find((z) => z.id === message.zoneDetached!.zoneId)
          if (zone) {
            zone.stackId = null
          }
          const stack = cardStore.stacks.find((s) => s.id === message.stackId)
          if (stack) {
            stack.zoneId = undefined
            stack.kind = 'free'
          }
        }
        // For our own moves, don't update positions - we already have correct local state
        // Only update positions for remote player moves
        if (message.playerId !== ws.playerId.value) {
          cardStore.updateStackFromServer(message.stackId, {
            anchorX: message.anchorX,
            anchorY: message.anchorY,
          })
          message.cardUpdates.forEach((update) => {
            cardStore.updateCardFromServer(update.cardId, {
              x: update.x,
              y: update.y,
            })
          })
        }
        break

      case 'stack:locked':
        cardStore.updateStackFromServer(message.stackId, { lockedBy: message.playerId })
        break

      case 'stack:unlocked':
        cardStore.updateStackFromServer(message.stackId, { lockedBy: null })
        break

      case 'stack:card_added': {
        // Update the card state
        cardStore.updateCardFromServer(message.cardId, {
          x: message.cardState.x,
          y: message.cardState.y,
          z: message.cardState.z,
          faceUp: message.cardState.faceUp,
          stackId: message.stackId,
        })
        // Also add to stack's cardIds if not already there
        const stack = cardStore.stacks.find((s) => s.id === message.stackId)
        if (stack && !stack.cardIds.includes(message.cardId)) {
          stack.cardIds.push(message.cardId)
        }
        // If this is a zone stack, update positions to apply zone layout
        if (stack) {
          cardStore.updateStackPositions(stack)
        }
        break
      }

      case 'stack:card_removed': {
        // Remove card from stack's cardIds
        const stackForRemoval = cardStore.stacks.find((s) => s.id === message.stackId)
        if (stackForRemoval) {
          stackForRemoval.cardIds = stackForRemoval.cardIds.filter((id) => id !== message.cardId)
        }
        // Update the card state
        cardStore.updateCardFromServer(message.cardId, { stackId: null })
        if (message.stackDeleted) {
          cardStore.removeStack(message.stackId)
        }
        cardStore.updateAllStacks()
        break
      }

      case 'stack:merged':
        cardStore.removeStack(message.sourceStackId)
        cardStore.addStackFromServer(message.targetStack)
        message.cardUpdates.forEach((update) => {
          cardStore.updateCardFromServer(update.cardId, {
            x: update.x,
            y: update.y,
            z: update.z,
            stackId: message.targetStackId,
          })
        })
        break

      case 'stack:shuffled':
        cardStore.updateStackFromServer(message.stackId, { cardIds: message.newOrder })
        message.cardUpdates.forEach((update) => {
          cardStore.updateCardFromServer(update.cardId, {
            x: update.x,
            y: update.y,
          })
        })
        break

      case 'stack:reordered':
        cardStore.updateStackFromServer(message.stackId, { cardIds: message.newOrder })
        message.cardUpdates.forEach((update) => {
          cardStore.updateCardFromServer(update.cardId, {
            x: update.x,
            y: update.y,
          })
        })
        // Recalculate positions with zone layout
        cardStore.updateAllStacks()
        break

      case 'stack:flipped':
        // Only animate for remote player flips
        if (message.playerId !== ws.playerId.value) {
          message.cardUpdates.forEach((update) => {
            cardStore.handleRemoteFlip(update.cardId, update.faceUp)
          })
        }
        break

      case 'stack:faces_set':
        // Only animate for remote player actions
        if (message.playerId !== ws.playerId.value) {
          message.cardIds.forEach((cardId) => {
            cardStore.handleRemoteFlip(cardId, message.faceUp)
          })
        }
        break

      case 'zone:created':
        cardStore.addZoneFromServer(message.zone)
        break

      case 'zone:updated':
        // For our own zone updates, avoid overwriting active drag/resizes unless
        // non-positional fields changed (lock/visibility/layout/etc).
        const isSelf = message.playerId === ws.playerId.value
        let shouldApply = !isSelf

        if (isSelf) {
          const localZone = cardStore.getZoneById(message.zoneId)
          if (!localZone) {
            shouldApply = true
          } else {
            const remote = message.zone
            const cardSettingsChanged =
              (localZone.cardSettings?.cardScale ?? null) !==
                (remote.cardSettings?.cardScale ?? null) ||
              (localZone.cardSettings?.cardSpacing ?? null) !==
                (remote.cardSettings?.cardSpacing ?? null) ||
              (localZone.cardSettings?.randomOffset ?? null) !==
                (remote.cardSettings?.randomOffset ?? null) ||
              (localZone.cardSettings?.randomRotation ?? null) !==
                (remote.cardSettings?.randomRotation ?? null)

            shouldApply =
              localZone.label !== remote.label ||
              localZone.faceUp !== remote.faceUp ||
              localZone.locked !== remote.locked ||
              localZone.visibility !== remote.visibility ||
              localZone.ownerId !== remote.ownerId ||
              localZone.layout !== remote.layout ||
              localZone.stackId !== remote.stackId ||
              cardSettingsChanged
          }
        }

        if (shouldApply) {
          cardStore.updateZoneFromServer(message.zoneId, message.zone)
          if (message.stackUpdate) {
            cardStore.updateStackFromServer(message.stackUpdate.stackId, {
              anchorX: message.stackUpdate.anchorX,
              anchorY: message.stackUpdate.anchorY,
            })
          }
          // Recalculate card positions based on zone's layout
          // (server sends basic stack positions, but client needs to apply zone layout)
          cardStore.updateAllStacks()
        }
        break

      case 'zone:deleted': {
        cardStore.removeZone(message.zoneId)
        // Convert zone stack to free stack
        if (message.convertedStack) {
          const stack = cardStore.stacks.find((s) => s.id === message.convertedStack!.stackId)
          if (stack) {
            stack.kind = 'free'
            stack.zoneId = undefined
            stack.anchorX = message.convertedStack.anchorX
            stack.anchorY = message.convertedStack.anchorY
            cardStore.updateStackPositions(stack)
          }
        }
        break
      }

      case 'zone:card_added': {
        // Update the card state first (sets stackId, faceUp, z)
        cardStore.updateCardFromServer(message.cardState.cardId, {
          z: message.cardState.z,
          faceUp: message.cardState.faceUp,
          stackId: message.stackId,
        })

        // Handle stack creation or update
        if (message.stackCreated) {
          // Create a new stack for this zone
          const zone = cardStore.zones.find((z) => z.id === message.zoneId)
          if (zone) {
            const newStack: Stack = {
              id: message.stackId,
              cardIds: [message.cardState.cardId],
              anchorX: message.cardState.x,
              anchorY: message.cardState.y,
              kind: 'zone',
              zoneId: message.zoneId,
              lockedBy: null,
            }
            cardStore.stacks.push(newStack)
            zone.stackId = message.stackId
            // Update positions for the new stack (applies zone layout)
            cardStore.updateStackPositions(newStack)
          }
        } else {
          // Add to existing stack
          const existingStack = cardStore.stacks.find((s) => s.id === message.stackId)
          if (existingStack) {
            if (!existingStack.cardIds.includes(message.cardState.cardId)) {
              existingStack.cardIds.push(message.cardState.cardId)
            }
            // Always update positions to apply zone layout (even if card was already added locally)
            cardStore.updateStackPositions(existingStack)
          }
        }
        break
      }

      case 'zone:cards_added': {
        // Bulk add cards to zone - handle stack creation or update
        if (message.stackCreated) {
          // Create a new stack for this zone with all cards
          const zone = cardStore.zones.find((z) => z.id === message.zoneId)
          if (zone && message.cardStates.length > 0) {
            const firstCard = message.cardStates[0]!
            const newStack: Stack = {
              id: message.stackId,
              cardIds: message.cardStates.map((cs) => cs.cardId),
              anchorX: firstCard.x,
              anchorY: firstCard.y,
              kind: 'zone',
              zoneId: message.zoneId,
              lockedBy: null,
            }
            cardStore.stacks.push(newStack)
            zone.stackId = message.stackId

            // Update all card states
            for (const cardState of message.cardStates) {
              cardStore.updateCardFromServer(cardState.cardId, {
                z: cardState.z,
                faceUp: cardState.faceUp,
                stackId: message.stackId,
              })
            }

            // Update positions once (applies zone layout)
            cardStore.updateStackPositions(newStack)
          }
        } else {
          // Add to existing stack
          const existingStack = cardStore.stacks.find((s) => s.id === message.stackId)
          if (existingStack) {
            for (const cardState of message.cardStates) {
              if (!existingStack.cardIds.includes(cardState.cardId)) {
                existingStack.cardIds.push(cardState.cardId)
              }
              cardStore.updateCardFromServer(cardState.cardId, {
                z: cardState.z,
                faceUp: cardState.faceUp,
                stackId: message.stackId,
              })
            }
            // Update positions once at the end (applies zone layout)
            cardStore.updateStackPositions(existingStack)
          }
        }
        break
      }

      case 'state:sync':
        // Full state sync from server (e.g., periodic sync or after reconnection)
        cardStore.syncFromServer(message.state, message.yourHand)
        break

      case 'hand:card_added_other':
        // Another player added a card to their hand - hide it from view
        // Using ownerId triggers the inHand update in updateCardFromServer
        cardStore.updateCardFromServer(message.cardId, { ownerId: message.playerId })
        break

      case 'hand:card_removed':
        // A card was removed from a hand - update the card to be visible again
        cardStore.updateCardFromServer(message.cardState.id, {
          x: message.cardState.x,
          y: message.cardState.y,
          z: message.cardState.z,
          faceUp: message.cardState.faceUp,
          ownerId: message.cardState.ownerId,
          stackId: message.cardState.stackId,
        })
        break

      case 'hand:stack_added_other':
        // Another player added a stack to their hand - hide cards and remove stack
        cardStore.removeStack(message.stackDeleted)
        for (const cardId of message.cardIds) {
          cardStore.updateCardFromServer(cardId, { ownerId: message.playerId, stackId: null })
        }
        break

      // Counter messages
      case 'counter:created':
        cardStore.addCounterFromServer(message.counter)
        break

      case 'counter:updated':
        if (message.playerId !== ws.playerId.value) {
          cardStore.updateCounterFromServer(message.counterId, message.counter)
        }
        break

      case 'counter:incremented':
        // Always update value (even for own increments to ensure sync)
        cardStore.updateCounterFromServer(message.counterId, { value: message.value })
        break

      case 'counter:deleted':
        cardStore.removeCounter(message.counterId)
        break

      case 'counter:locked':
        cardStore.updateCounterFromServer(message.counterId, { lockedBy: message.playerId })
        break

      case 'counter:unlocked':
        cardStore.updateCounterFromServer(message.counterId, { lockedBy: null })
        break

      // Token messages
      case 'token:created':
        cardStore.addTokenFromServer(message.token)
        break

      case 'token:updated':
        if (message.playerId !== ws.playerId.value) {
          cardStore.updateTokenFromServer(message.tokenId, message.token)
        }
        break

      case 'token:deleted':
        cardStore.removeToken(message.tokenId)
        break

      case 'token:locked':
        cardStore.updateTokenFromServer(message.tokenId, { lockedBy: message.playerId })
        break

      case 'token:unlocked':
        cardStore.updateTokenFromServer(message.tokenId, { lockedBy: null })
        break

      // Die messages
      case 'die:created':
        cardStore.addDieFromServer(message.die)
        break

      case 'die:rolled':
        // Trigger roll animation, then update value
        cardStore.setDieRolling(message.dieId, true)
        setTimeout(() => {
          cardStore.updateDieFromServer(message.dieId, { value: message.value, isRolling: false })
        }, 500)
        break

      case 'die:updated':
        if (message.playerId !== ws.playerId.value) {
          cardStore.updateDieFromServer(message.dieId, message.die)
        }
        break

      case 'die:deleted':
        cardStore.removeDie(message.dieId)
        break

      case 'die:locked':
        cardStore.updateDieFromServer(message.dieId, { lockedBy: message.playerId })
        break

      case 'die:unlocked':
        cardStore.updateDieFromServer(message.dieId, { lockedBy: null })
        break

      // Timer messages
      case 'timer:created':
        cardStore.addTimerFromServer(message.timer)
        break

      case 'timer:started':
        cardStore.updateTimerFromServer(message.timerId, {
          status: 'running',
          startedAt: message.startedAt,
        })
        break

      case 'timer:paused':
        cardStore.updateTimerFromServer(message.timerId, {
          status: 'paused',
          elapsedMs: message.elapsedMs,
          startedAt: null,
        })
        break

      case 'timer:reset':
        cardStore.updateTimerFromServer(message.timerId, {
          status: 'stopped',
          elapsedMs: 0,
          startedAt: null,
        })
        break

      case 'timer:finished':
        cardStore.updateTimerFromServer(message.timerId, {
          status: 'finished',
          startedAt: null,
        })
        break

      case 'timer:updated':
        if (message.playerId !== ws.playerId.value) {
          cardStore.updateTimerFromServer(message.timerId, message.timer)
        }
        break

      case 'timer:deleted':
        cardStore.removeTimer(message.timerId)
        break

      case 'timer:locked':
        cardStore.updateTimerFromServer(message.timerId, { lockedBy: message.playerId })
        break

      case 'timer:unlocked':
        cardStore.updateTimerFromServer(message.timerId, { lockedBy: null })
        break

      // Selection messages
      case 'selection:updated':
        // Update remote player's selection in card store
        cardStore.updateRemoteSelection(message.playerId, message.playerColor, message.cardIds)
        break

      // Player left - clear their remote selection
      case 'room:player_left':
        cardStore.clearRemoteSelection(message.playerId)
        break
      case 'room:player_disconnected':
        cardStore.clearRemoteSelection(message.playerId)
        break

      case 'table:reset':
        // Table was reset - sync the new state (hands are cleared)
        cardStore.syncFromServer(message.state, [])
        break
    }
  })

  // Return empty object - this composable is primarily for side effects
  return {}
}
