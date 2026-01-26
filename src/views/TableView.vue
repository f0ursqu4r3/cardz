<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Card from '@/components/CardComp.vue'
import ZoneComp from '@/components/ZoneComp.vue'
import CounterComp from '@/components/CounterComp.vue'
import TokenComp from '@/components/TokenComp.vue'
import DieComp from '@/components/DieComp.vue'
import TimerComp from '@/components/TimerComp.vue'
import HandComp from '@/components/HandComp.vue'
import MinimapComp from '@/components/MinimapComp.vue'
import RemoteCursors from '@/components/RemoteCursors.vue'
import TablePanel from '@/components/ui/TablePanel.vue'
import TableButton from '@/components/ui/TableButton.vue'
import TableSettingsPanel from '@/components/ui/TableSettingsPanel.vue'
import PlayersPanel from '@/components/ui/PlayersPanel.vue'
import ChatPanel from '@/components/ui/ChatPanel.vue'
import InstructionsPanel from '@/components/ui/InstructionsPanel.vue'
import RadialMenu from '@/components/ui/RadialMenu.vue'
import type { RadialMenuItem } from '@/components/ui/RadialMenu.vue'
import { useCardStore } from '@/stores/cards'
import { useCardInteraction } from '@/composables/useCardInteraction'
import { useViewport } from '@/composables/useViewport'
import { useWebSocket } from '@/composables/useWebSocket'
import { useCursor } from '@/composables/useCursor'
import { useRemoteThrow } from '@/composables/useRemoteThrow'
import { useRadialMenu } from '@/composables/useRadialMenu'
import {
  SquarePlus,
  Copy,
  Check,
  DoorOpen,
  Users,
  Wifi,
  WifiOff,
  Settings,
  Hash,
  CircleDot,
  Dices,
  Timer,
} from 'lucide-vue-next'
import {
  CARD_BACK_COL,
  CARD_BACK_ROW,
  CARD_W,
  CARD_H,
  STACK_OFFSET_X,
  STACK_OFFSET_Y,
  ZONE_DEFAULT_WIDTH,
  ZONE_DEFAULT_HEIGHT,
  CURSOR_THROTTLE_MS,
} from '@/types'
import type { Zone } from '@/types'
import type { ServerMessage, ClientMessage, TableSettings } from '../../shared/types'

const route = useRoute()
const router = useRouter()
const cardStore = useCardStore()

// Room info from route
const routeRoomCode = computed(() => (route.params.code as string)?.toUpperCase() || null)
const playerName = computed(() => (route.query.name as string) || 'Player')
const tableName = computed(() => (route.query.tableName as string) || '')
const isPublicTable = computed(() => route.query.public === 'true')
const isNewTable = computed(() => route.name === 'table-new')

// WebSocket connection
const ws = useWebSocket()
const codeCopied = ref(false)
const showSettings = ref(false)
const showPlayers = ref(false)
const showChat = ref(false)
const showInstructions = ref(false)
const editingZoneId = ref<number | null>(null)

// Get current player's color for cursor
const playerColor = computed(() => {
  const player = ws.players.value.find((p) => p.id === ws.playerId.value)
  return player?.color || '#ef4444' // Default to red
})

// Get a player's color by their ID
const getPlayerColor = (playerId: string | null): string | null => {
  if (!playerId) return null
  const player = ws.players.value.find((p) => p.id === playerId)
  return player?.color || null
}

// Check if a card should show the lock glow (only bottom card for stack locks)
const shouldShowLockGlow = (card: (typeof cardStore.cards)[0]): boolean => {
  // Card-level lock always shows glow
  if (card.lockedBy && card.lockedBy !== ws.playerId.value) return true
  // Stack-level lock only shows glow on bottom card
  if (card.stackId !== null) {
    const stack = cardStore.stacks.find((s) => s.id === card.stackId)
    if (stack?.lockedBy && stack.lockedBy !== ws.playerId.value) {
      return stack.cardIds[0] === card.id // Only bottom card
    }
  }
  return false
}

// Get the lock color for a card (checks both card and stack locks)
const getCardLockColor = (card: (typeof cardStore.cards)[0]): string | null => {
  // Check card-level lock first
  if (card.lockedBy && card.lockedBy !== ws.playerId.value) {
    return getPlayerColor(card.lockedBy) || '#888' // Fallback to gray if player not found
  }
  // Check stack-level lock (only return color for bottom card)
  if (card.stackId !== null) {
    const stack = cardStore.stacks.find((s) => s.id === card.stackId)
    if (stack?.lockedBy && stack.lockedBy !== ws.playerId.value) {
      // Only return color for bottom card (where the glow shows)
      if (stack.cardIds[0] === card.id) {
        return getPlayerColor(stack.lockedBy) || '#888' // Fallback to gray if player not found
      }
    }
  }
  return null
}

// Get the lock holder's player ID for a card (checks both card and stack locks)
const getCardLockHolder = (card: (typeof cardStore.cards)[0]): string | null => {
  if (card.lockedBy && card.lockedBy !== ws.playerId.value) {
    return card.lockedBy
  }
  if (card.stackId !== null) {
    const stack = cardStore.stacks.find((s) => s.id === card.stackId)
    if (stack?.lockedBy && stack.lockedBy !== ws.playerId.value) {
      return stack.lockedBy
    }
  }
  return null
}

// Check if a card is the bottom card of its stack (for shadow rendering)
const isStackBottom = (card: (typeof cardStore.cards)[0]): boolean => {
  if (card.stackId === null) return false
  const stack = cardStore.stacks.find((s) => s.id === card.stackId)
  return stack ? stack.cardIds[0] === card.id : false
}

// Get the number of cards in a stack (for visual depth effect on bottom card)
const getStackSize = (card: (typeof cardStore.cards)[0]): number => {
  if (card.stackId === null) return 1
  const stack = cardStore.stacks.find((s) => s.id === card.stackId)
  return stack ? stack.cardIds.length : 1
}

// Check if a card should appear face-down (considering zone visibility)
const shouldShowFaceDown = (card: (typeof cardStore.cards)[0]): boolean => {
  // If card is already face-down, always show face-down
  if (!card.faceUp) return true

  // Check if card is in a zone with visibility restrictions
  if (card.stackId !== null) {
    const stack = cardStore.stacks.find((s) => s.id === card.stackId)
    if (stack?.zoneId !== undefined) {
      const zone = cardStore.zones.find((z) => z.id === stack.zoneId)
      if (zone) {
        // 'hidden' visibility: cards always appear face-down to everyone
        if (zone.visibility === 'hidden') return true
        // 'owner' visibility: cards appear face-down to non-owners
        if (zone.visibility === 'owner' && zone.ownerId !== ws.playerId.value) return true
      }
    }
  }

  return false
}

// Get the transform for a card (combines drag tilt with zone layout rotation)
const getCardTransform = (card: (typeof cardStore.cards)[0], index: number): string | undefined => {
  const isDragging = interaction.drag.activeIndex.value === index
  const isThrowing = interaction.physics.throwingCardId.value === card.id

  if (isDragging || isThrowing) {
    // During drag/throw, use physics tilt
    return `rotate(${interaction.physics.tilt.value}deg)`
  }

  // Check for zone reorder position (has adjusted rotation)
  const reorderPos = zoneReorderPositions.value.get(card.id)
  if (reorderPos) {
    return `rotate(${reorderPos.rotation}deg)`
  }

  // Apply zone layout rotation if present
  if (card.rotation !== undefined && card.rotation !== 0) {
    return `rotate(${card.rotation}deg)`
  }

  return undefined
}

// Get the position for a card that's being held by another player
// Card follows the holder's cursor, centered under it
// For stack drags, maintains the card's offset within the stack
const getLockedCardPosition = (
  card: (typeof cardStore.cards)[0],
): { x: number; y: number } | null => {
  const holderId = getCardLockHolder(card)
  if (!holderId) return null

  const cursor = ws.cursors.value.get(holderId)
  if (!cursor) return null

  // Check if this is a stack lock (not a card lock)
  if (card.stackId !== null) {
    const stack = cardStore.stacks.find((s) => s.id === card.stackId)
    if (stack?.lockedBy && stack.lockedBy !== ws.playerId.value) {
      // Find card's index in the stack to calculate offset
      const cardIndex = stack.cardIds.indexOf(card.id)
      if (cardIndex !== -1) {
        // Position relative to cursor with stack offset
        return {
          x: cursor.x - CARD_W / 2 + cardIndex * STACK_OFFSET_X,
          y: cursor.y - CARD_H / 2 + cardIndex * STACK_OFFSET_Y,
        }
      }
    }
  }

  // Single card drag - center under cursor
  return {
    x: cursor.x - CARD_W / 2,
    y: cursor.y - CARD_H / 2,
  }
}

// Get adjusted position for a card during zone reordering
// Returns the shifted position if this card needs to move, otherwise null
const getZoneReorderPosition = (
  card: (typeof cardStore.cards)[0],
): { x: number; y: number; rotation: number } | null => {
  const adjusted = zoneReorderPositions.value.get(card.id)
  return adjusted ?? null
}

// Custom cursor based on player color (sets up global style via side effect)
useCursor(playerColor)

// Create refs for template binding
const canvasRef = ref<HTMLElement | null>(null)
const handRef = ref<HTMLElement | null>(null)
const handCompRef = ref<InstanceType<typeof HandComp> | null>(null)

// Refs for entity components (to access openModal)
const counterRefs = ref(new Map<number, InstanceType<typeof CounterComp>>())
const tokenRefs = ref(new Map<number, InstanceType<typeof TokenComp>>())
const dieRefs = ref(new Map<number, InstanceType<typeof DieComp>>())
const timerRefs = ref(new Map<number, InstanceType<typeof TimerComp>>())

// Viewport for pan/zoom
const viewport = useViewport(canvasRef)

// Track if space is held for panning
const spaceHeld = ref(false)

// Track activity for state sync debouncing
let lastActivityTime = Date.now()
const trackActivity = () => {
  lastActivityTime = Date.now()
}

// Set up card interaction with WebSocket send function
const interaction = useCardInteraction({
  handRef: handRef,
  sendMessage: (msg: ClientMessage) => {
    trackActivity()
    ws.send(msg)
  },
  spaceHeld: spaceHeld,
})

// Remote throw physics for other players' card throws
const remoteThrow = useRemoteThrow((id) => cardStore.getCardById(id))

// Radial context menu
const radialMenu = useRadialMenu()

// Compute cursor class based on interaction state
const cursorClass = computed(() => {
  // If dragging, show grabbing cursor
  if (interaction.drag.isDragging.value) {
    return 'cursor--grabbing'
  }
  // If panning (space held or middle mouse), show grab cursor
  if (viewport.isPanning.value || spaceHeld.value) {
    return 'cursor--grab'
  }
  // Default pointer
  return ''
})

// Wire viewport transform to drag system
watch(
  () => viewport.screenToWorld,
  (fn) => interaction.drag.setScreenToWorld(fn),
  { immediate: true },
)

// Note: Full state sync is handled in the message handlers for room:created and room:joined
// to avoid race conditions with incremental updates. The watcher below only syncs hand cards.

// Sync hand cards when they change
watch(
  () => ws.handCardIds.value,
  (ids) => {
    cardStore.setHandCardIds(ids)
  },
)

// Handle server messages for real-time updates
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
        query: { name: playerName.value },
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
      cardStore.updateCardFromServer(message.cardId, { faceUp: message.faceUp })
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
      message.cardUpdates.forEach((update) => {
        cardStore.updateCardFromServer(update.cardId, { faceUp: update.faceUp })
      })
      break

    case 'stack:faces_set':
      message.cardIds.forEach((cardId) => {
        cardStore.updateCardFromServer(cardId, { faceUp: message.faceUp })
      })
      break

    case 'zone:created':
      cardStore.addZoneFromServer(message.zone)
      break

    case 'zone:updated':
      // For our own zone updates, we already have correct local state
      // Only update for remote player changes
      if (message.playerId !== ws.playerId.value) {
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
          const newStack: import('@/types').Stack = {
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
          const newStack: import('@/types').Stack = {
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

    case 'table:reset':
      // Table was reset - sync the new state (hands are cleared)
      cardStore.syncFromServer(message.state, [])
      break
  }
})

// Ghost card for hand dragging
const handDragCard = computed(() => {
  if (interaction.drag.target.value?.type !== 'hand-card') return null
  const index = interaction.drag.target.value.index
  return cardStore.cards[index] ?? null
})

// Check if ghost card is in reorder mode (inside hand zone)
const isHandReordering = computed(() => {
  return (
    handCompRef.value?.handDropTargetIndex !== null &&
    handCompRef.value?.handDragStartIndex !== null
  )
})

const handDragPosition = computed(() => interaction.drag.position.value)

// Zone reorder ghost card
const isZoneReordering = computed(() => {
  return interaction.zoneDragSource.value !== null && interaction.zoneDropTargetIndex.value !== null
})

const zoneGhostCard = computed(() => {
  if (!isZoneReordering.value) return null
  const source = interaction.zoneDragSource.value
  if (!source) return null

  // Get the card being dragged
  const stack = cardStore.stacks.find((s) => s.id === source.stackId)
  if (!stack) return null
  const cardId = stack.cardIds[source.cardIndex]
  if (cardId === undefined) return null
  const card = cardStore.getCardById(cardId)
  if (!card) return null

  // Get the target position
  const targetIndex = interaction.zoneDropTargetIndex.value
  if (targetIndex === null) return null

  const position = cardStore.getZoneCardPosition(source.zoneId, targetIndex, stack.cardIds.length)
  if (!position) return null

  return {
    col: card.col,
    row: card.row,
    x: position.x,
    y: position.y,
    rotation: position.rotation,
  }
})

// Calculate adjusted positions for cards during zone reordering
// Other cards shift to make room for the ghost card
const zoneReorderPositions = computed(() => {
  const positions = new Map<number, { x: number; y: number; rotation: number }>()
  if (!isZoneReordering.value) return positions

  const source = interaction.zoneDragSource.value
  if (!source) return positions

  const targetIndex = interaction.zoneDropTargetIndex.value
  if (targetIndex === null) return positions

  const stack = cardStore.stacks.find((s) => s.id === source.stackId)
  if (!stack) return positions

  const fromIndex = source.cardIndex
  const toIndex = targetIndex

  // For each card in the zone stack, calculate where it should appear
  // The dragged card is hidden (handled separately), other cards shift
  stack.cardIds.forEach((cardId, currentIndex) => {
    // Skip the card being dragged - it follows the cursor
    if (currentIndex === fromIndex) return

    // Calculate the visual index this card should appear at
    let visualIndex = currentIndex

    if (fromIndex < toIndex) {
      // Dragging forward: cards between fromIndex and toIndex shift back one spot
      if (currentIndex > fromIndex && currentIndex <= toIndex) {
        visualIndex = currentIndex - 1
      }
    } else if (fromIndex > toIndex) {
      // Dragging backward: cards between toIndex and fromIndex shift forward one spot
      if (currentIndex >= toIndex && currentIndex < fromIndex) {
        visualIndex = currentIndex + 1
      }
    }

    // Only add to map if position changed
    if (visualIndex !== currentIndex) {
      const position = cardStore.getZoneCardPosition(
        source.zoneId,
        visualIndex,
        stack.cardIds.length,
      )
      if (position) {
        positions.set(cardId, position)
      }
    }
  })

  return positions
})

// Wire up hand card drop handler
interaction.setHandCardDropHandler((event) => {
  const result = handCompRef.value?.handleHandCardDrop(event)
  if (!result) return false

  // If cards were removed from hand (dropped on table), notify server
  if (result.removedCards && result.removedCards.length > 0) {
    trackActivity()
    for (const removed of result.removedCards) {
      ws.send({
        type: 'hand:remove',
        cardId: removed.cardId,
        x: removed.x,
        y: removed.y,
        faceUp: removed.faceUp,
      })
    }

    // If multiple cards were dropped, create a stack from them
    if (result.removedCards.length > 1) {
      const cardIds = result.removedCards.map((r) => r.cardId)
      const firstCard = result.removedCards[0]!
      ws.send({
        type: 'stack:create',
        cardIds,
        anchorX: firstCard.x,
        anchorY: firstCard.y,
      })
    }

    // Clear selection after drop
    handCompRef.value?.clearHandSelection()
  } else if (result.removedCard) {
    // Single card removed from hand
    trackActivity()
    ws.send({
      type: 'hand:remove',
      cardId: result.removedCard.cardId,
      x: result.removedCard.x,
      y: result.removedCard.y,
      faceUp: result.removedCard.faceUp,
    })
  }

  return result.handled
})

// Wrap pointer up to pass handRef
const onPointerUp = (event: PointerEvent) => {
  interaction.onCardPointerUp(event, handRef)
}

// Check if a zone is being dragged
const isZoneDragging = (zoneId: number) => {
  return (
    interaction.drag.target.value?.type === 'zone' &&
    interaction.drag.target.value.zoneId === zoneId
  )
}

// Create new zone at center of viewport (in world coordinates)
const addZone = () => {
  const bounds = viewport.getVisibleBounds()
  const centerX = bounds.x + bounds.width / 2 - 50
  const centerY = bounds.y + bounds.height / 2 - 50

  // Send to server
  trackActivity()
  ws.send({
    type: 'zone:create',
    x: centerX,
    y: centerY,
    width: ZONE_DEFAULT_WIDTH,
    height: ZONE_DEFAULT_HEIGHT,
    label: 'New Zone',
    faceUp: false,
  })
}

// Handle zone update from ZoneComp (label, faceUp, locked, layout, cardSettings, etc.)
const onZoneUpdate = (zoneId: number, updates: Partial<Zone>) => {
  trackActivity()
  ws.send({
    type: 'zone:update',
    zoneId,
    updates,
  })
}

// Handle zone delete from ZoneComp
const onZoneDelete = (zoneId: number) => {
  trackActivity()
  ws.send({
    type: 'zone:delete',
    zoneId,
  })
}

// ============================================================================
// Counter Handling
// ============================================================================

// Counter drag state
const draggingCounterId = ref<number | null>(null)
const counterDragOffset = ref({ x: 0, y: 0 })

// Create new counter at center of viewport
const addCounter = () => {
  const bounds = viewport.getVisibleBounds()
  const centerX = bounds.x + bounds.width / 2 - 40
  const centerY = bounds.y + bounds.height / 2 - 30

  trackActivity()
  ws.send({
    type: 'counter:create',
    x: centerX,
    y: centerY,
    label: 'Counter',
    value: 0,
    step: 1,
    color: '#3b82f6',
  })
}

// Handle counter increment from CounterComp
const onCounterIncrement = (counterId: number, delta: number) => {
  trackActivity()
  ws.send({
    type: 'counter:increment',
    counterId,
    delta,
  })
}

// Handle counter update from CounterComp
const onCounterUpdate = (counterId: number, updates: Record<string, unknown>) => {
  trackActivity()
  // Update local state immediately for responsiveness
  cardStore.updateCounterFromServer(
    counterId,
    updates as Parameters<typeof cardStore.updateCounterFromServer>[1],
  )
  ws.send({
    type: 'counter:update',
    counterId,
    updates,
  })
}

// Handle counter delete from CounterComp
const onCounterDelete = (counterId: number) => {
  trackActivity()
  ws.send({
    type: 'counter:delete',
    counterId,
  })
}

// Counter pointer handlers
const onCounterPointerDown = (event: PointerEvent, counterId: number) => {
  const counter = cardStore.getCounterById(counterId)
  if (!counter) return

  // Don't start drag if locked by another player
  if (counter.lockedBy && counter.lockedBy !== ws.playerId.value) return

  event.stopPropagation()
  ;(event.target as HTMLElement).setPointerCapture(event.pointerId)

  // Calculate offset from counter origin to pointer
  const worldPos = viewport.screenToWorld(event.clientX, event.clientY)
  counterDragOffset.value = {
    x: worldPos.x - counter.x,
    y: worldPos.y - counter.y,
  }

  draggingCounterId.value = counterId

  // Lock the counter
  trackActivity()
  ws.send({
    type: 'counter:lock',
    counterId,
  })
}

const onCounterPointerMove = (event: PointerEvent) => {
  if (draggingCounterId.value === null) return

  const counter = cardStore.getCounterById(draggingCounterId.value)
  if (!counter) return

  const worldPos = viewport.screenToWorld(event.clientX, event.clientY)
  const newX = worldPos.x - counterDragOffset.value.x
  const newY = worldPos.y - counterDragOffset.value.y

  // Update local position immediately for smooth dragging
  counter.x = newX
  counter.y = newY

  // Send position update to server (throttled via the normal message flow)
  trackActivity()
  ws.send({
    type: 'counter:update',
    counterId: draggingCounterId.value,
    updates: { x: newX, y: newY },
  })
}

const onCounterPointerUp = (event: PointerEvent) => {
  if (draggingCounterId.value === null) return
  ;(event.target as HTMLElement).releasePointerCapture(event.pointerId)

  // Unlock the counter
  ws.send({
    type: 'counter:unlock',
    counterId: draggingCounterId.value,
  })

  draggingCounterId.value = null
}

// Check if a counter is being dragged
const isCounterDragging = (counterId: number): boolean => {
  return draggingCounterId.value === counterId
}

// Check if a counter is locked by another player
const isCounterLockedByOther = (counter: { lockedBy: string | null }): boolean => {
  return counter.lockedBy !== null && counter.lockedBy !== ws.playerId.value
}

// Get counter lock color
const getCounterLockColor = (counter: { lockedBy: string | null }): string | undefined => {
  if (!counter.lockedBy || counter.lockedBy === ws.playerId.value) return undefined
  return getPlayerColor(counter.lockedBy) || '#888'
}

// ============================================================================
// Token Handlers
// ============================================================================

// Token drag state
const draggingTokenId = ref<number | null>(null)
const tokenDragOffset = ref({ x: 0, y: 0 })

// Create new token at center of viewport
const addColorToken = () => {
  const bounds = viewport.getVisibleBounds()
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2

  trackActivity()
  ws.send({
    type: 'token:create',
    x: centerX,
    y: centerY,
    kind: 'color',
    shape: 'circle',
    color: '#ef4444',
    size: 'medium',
  })
}

const addSpriteToken = () => {
  const bounds = viewport.getVisibleBounds()
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2

  trackActivity()
  ws.send({
    type: 'token:create',
    x: centerX,
    y: centerY,
    kind: 'sprite',
    sprite: 'star',
    color: '#f59e0b',
    size: 'medium',
  })
}

// Handle token update from TokenComp
const onTokenUpdate = (tokenId: number, updates: Record<string, unknown>) => {
  trackActivity()
  // Update local state immediately for responsiveness
  cardStore.updateTokenFromServer(
    tokenId,
    updates as Parameters<typeof cardStore.updateTokenFromServer>[1],
  )
  ws.send({
    type: 'token:update',
    tokenId,
    updates,
  })
}

// Handle token delete from TokenComp
const onTokenDelete = (tokenId: number) => {
  trackActivity()
  ws.send({
    type: 'token:delete',
    tokenId,
  })
}

// Token pointer handlers
const onTokenPointerDown = (event: PointerEvent, tokenId: number) => {
  const token = cardStore.getTokenById(tokenId)
  if (!token) return

  // Don't start drag if locked by another player
  if (token.lockedBy && token.lockedBy !== ws.playerId.value) return

  event.stopPropagation()
  ;(event.target as HTMLElement).setPointerCapture(event.pointerId)

  // Calculate offset from token origin to pointer
  const worldPos = viewport.screenToWorld(event.clientX, event.clientY)
  tokenDragOffset.value = {
    x: worldPos.x - token.x,
    y: worldPos.y - token.y,
  }

  draggingTokenId.value = tokenId

  // Lock the token
  trackActivity()
  ws.send({
    type: 'token:lock',
    tokenId,
  })
}

const onTokenPointerMove = (event: PointerEvent) => {
  if (draggingTokenId.value === null) return

  const token = cardStore.getTokenById(draggingTokenId.value)
  if (!token) return

  const worldPos = viewport.screenToWorld(event.clientX, event.clientY)
  const newX = worldPos.x - tokenDragOffset.value.x
  const newY = worldPos.y - tokenDragOffset.value.y

  // Update local position immediately for smooth dragging
  token.x = newX
  token.y = newY

  // Send position update to server
  trackActivity()
  ws.send({
    type: 'token:update',
    tokenId: draggingTokenId.value,
    updates: { x: newX, y: newY },
  })
}

const onTokenPointerUp = (event: PointerEvent) => {
  if (draggingTokenId.value === null) return
  ;(event.target as HTMLElement).releasePointerCapture(event.pointerId)

  // Unlock the token
  ws.send({
    type: 'token:unlock',
    tokenId: draggingTokenId.value,
  })

  draggingTokenId.value = null
}

// Check if a token is being dragged
const isTokenDragging = (tokenId: number): boolean => {
  return draggingTokenId.value === tokenId
}

// Check if a token is locked by another player
const isTokenLockedByOther = (token: { lockedBy: string | null }): boolean => {
  return token.lockedBy !== null && token.lockedBy !== ws.playerId.value
}

// Get token lock color
const getTokenLockColor = (token: { lockedBy: string | null }): string | undefined => {
  if (!token.lockedBy || token.lockedBy === ws.playerId.value) return undefined
  return getPlayerColor(token.lockedBy) || '#888'
}

// ============================================================================
// Die Handlers
// ============================================================================

// Die drag state
const draggingDieId = ref<number | null>(null)
const dieDragOffset = ref({ x: 0, y: 0 })

// Create new die at center of viewport
const addDie = () => {
  const bounds = viewport.getVisibleBounds()
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2

  trackActivity()
  ws.send({
    type: 'die:create',
    x: centerX,
    y: centerY,
    color: '#ef4444',
  })
}

// Handle die roll from DieComp
const onDieRoll = (dieId: number) => {
  trackActivity()
  // Trigger local animation immediately
  cardStore.setDieRolling(dieId, true)
  ws.send({
    type: 'die:roll',
    dieId,
  })
}

// Handle die update from DieComp
const onDieUpdate = (dieId: number, updates: Record<string, unknown>) => {
  trackActivity()
  // Update local state immediately for responsiveness
  cardStore.updateDieFromServer(
    dieId,
    updates as Parameters<typeof cardStore.updateDieFromServer>[1],
  )
  ws.send({
    type: 'die:update',
    dieId,
    updates,
  })
}

// Handle die delete from DieComp
const onDieDelete = (dieId: number) => {
  trackActivity()
  ws.send({
    type: 'die:delete',
    dieId,
  })
}

// Die pointer handlers
const onDiePointerDown = (event: PointerEvent, dieId: number) => {
  const die = cardStore.getDieById(dieId)
  if (!die) return

  // Don't start drag if locked by another player
  if (die.lockedBy && die.lockedBy !== ws.playerId.value) return

  event.stopPropagation()
  ;(event.target as HTMLElement).setPointerCapture(event.pointerId)

  // Calculate offset from die origin to pointer
  const worldPos = viewport.screenToWorld(event.clientX, event.clientY)
  dieDragOffset.value = {
    x: worldPos.x - die.x,
    y: worldPos.y - die.y,
  }

  draggingDieId.value = dieId

  // Lock the die
  trackActivity()
  ws.send({
    type: 'die:lock',
    dieId,
  })
}

const onDiePointerMove = (event: PointerEvent) => {
  if (draggingDieId.value === null) return

  const die = cardStore.getDieById(draggingDieId.value)
  if (!die) return

  const worldPos = viewport.screenToWorld(event.clientX, event.clientY)
  const newX = worldPos.x - dieDragOffset.value.x
  const newY = worldPos.y - dieDragOffset.value.y

  // Update local position immediately for smooth dragging
  die.x = newX
  die.y = newY

  // Send position update to server
  trackActivity()
  ws.send({
    type: 'die:update',
    dieId: draggingDieId.value,
    updates: { x: newX, y: newY },
  })
}

const onDiePointerUp = (event: PointerEvent) => {
  if (draggingDieId.value === null) return
  ;(event.target as HTMLElement).releasePointerCapture(event.pointerId)

  // Unlock the die
  ws.send({
    type: 'die:unlock',
    dieId: draggingDieId.value,
  })

  draggingDieId.value = null
}

// Check if a die is being dragged
const isDieDragging = (dieId: number): boolean => {
  return draggingDieId.value === dieId
}

// Check if a die is locked by another player
const isDieLockedByOther = (die: { lockedBy: string | null }): boolean => {
  return die.lockedBy !== null && die.lockedBy !== ws.playerId.value
}

// Get die lock color
const getDieLockColor = (die: { lockedBy: string | null }): string | undefined => {
  if (!die.lockedBy || die.lockedBy === ws.playerId.value) return undefined
  return getPlayerColor(die.lockedBy) || '#888'
}

// ============================================================================
// Timer Handlers
// ============================================================================

// Timer drag state
const draggingTimerId = ref<number | null>(null)
const timerDragOffset = ref({ x: 0, y: 0 })

// Create new timer at center of viewport
const addTimer = (mode: 'countdown' | 'stopwatch' = 'countdown') => {
  const bounds = viewport.getVisibleBounds()
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2

  trackActivity()
  ws.send({
    type: 'timer:create',
    x: centerX,
    y: centerY,
    mode,
    durationMs: mode === 'countdown' ? 60000 : undefined,
  })
}

// Handle timer start from TimerComp
const onTimerStart = (timerId: number) => {
  trackActivity()
  ws.send({
    type: 'timer:start',
    timerId,
  })
}

// Handle timer pause from TimerComp
const onTimerPause = (timerId: number) => {
  trackActivity()
  ws.send({
    type: 'timer:pause',
    timerId,
  })
}

// Handle timer reset from TimerComp
const onTimerReset = (timerId: number) => {
  trackActivity()
  ws.send({
    type: 'timer:reset',
    timerId,
  })
}

// Handle timer update from TimerComp
const onTimerUpdate = (timerId: number, updates: Record<string, unknown>) => {
  trackActivity()
  // Update local state immediately for responsiveness
  cardStore.updateTimerFromServer(
    timerId,
    updates as Parameters<typeof cardStore.updateTimerFromServer>[1],
  )
  ws.send({
    type: 'timer:update',
    timerId,
    updates,
  })
}

// Handle timer delete from TimerComp
const onTimerDelete = (timerId: number) => {
  trackActivity()
  ws.send({
    type: 'timer:delete',
    timerId,
  })
}

// Timer pointer handlers
const onTimerPointerDown = (event: PointerEvent, timerId: number) => {
  const timer = cardStore.getTimerById(timerId)
  if (!timer) return

  // Don't start drag if locked by another player
  if (timer.lockedBy && timer.lockedBy !== ws.playerId.value) return

  event.stopPropagation()
  ;(event.target as HTMLElement).setPointerCapture(event.pointerId)

  // Calculate offset from timer origin to pointer
  const worldPos = viewport.screenToWorld(event.clientX, event.clientY)
  timerDragOffset.value = {
    x: worldPos.x - timer.x,
    y: worldPos.y - timer.y,
  }

  draggingTimerId.value = timerId

  // Lock the timer
  trackActivity()
  ws.send({
    type: 'timer:lock',
    timerId,
  })
}

const onTimerPointerMove = (event: PointerEvent) => {
  if (draggingTimerId.value === null) return

  const timer = cardStore.getTimerById(draggingTimerId.value)
  if (!timer) return

  const worldPos = viewport.screenToWorld(event.clientX, event.clientY)
  const newX = worldPos.x - timerDragOffset.value.x
  const newY = worldPos.y - timerDragOffset.value.y

  // Update local position immediately for smooth dragging
  timer.x = newX
  timer.y = newY

  // Send position update to server
  trackActivity()
  ws.send({
    type: 'timer:update',
    timerId: draggingTimerId.value,
    updates: { x: newX, y: newY },
  })
}

const onTimerPointerUp = (event: PointerEvent) => {
  if (draggingTimerId.value === null) return
  ;(event.target as HTMLElement).releasePointerCapture(event.pointerId)

  // Unlock the timer
  ws.send({
    type: 'timer:unlock',
    timerId: draggingTimerId.value,
  })

  draggingTimerId.value = null
}

// Check if a timer is being dragged
const isTimerDragging = (timerId: number): boolean => {
  return draggingTimerId.value === timerId
}

// Check if a timer is locked by another player
const isTimerLockedByOther = (timer: { lockedBy: string | null }): boolean => {
  return timer.lockedBy !== null && timer.lockedBy !== ws.playerId.value
}

// Get timer lock color
const getTimerLockColor = (timer: { lockedBy: string | null }): string | undefined => {
  if (!timer.lockedBy || timer.lockedBy === ws.playerId.value) return undefined
  return getPlayerColor(timer.lockedBy) || '#888'
}

// Right-click handler for cards to open radial menu
const onCardRightClick = (event: MouseEvent, index: number) => {
  event.preventDefault()
  event.stopPropagation()

  const card = cardStore.cards[index]
  if (!card) return

  // If card is part of a selection with multiple cards, use selection menu
  if (cardStore.isSelected(card.id) && cardStore.getSelectedIds().length > 1) {
    radialMenu.open(event.clientX, event.clientY, {
      type: 'selection',
      cardIds: cardStore.getSelectedIds(),
    })
    return
  }

  // If card is in a stack, check if it's in a zone with non-stack layout
  if (card.stackId !== null) {
    const stack = cardStore.stacks.find((s) => s.id === card.stackId)
    if (stack) {
      // Check if stack is in a zone with a non-stack layout
      const zone = cardStore.zones.find((z) => z.stackId === stack.id)
      if (zone && zone.layout !== 'stack') {
        // For non-stack zone layouts (grid, row, column, fan, circle),
        // show card menu since user clicked a specific visible card
        radialMenu.open(event.clientX, event.clientY, {
          type: 'card',
          cardId: card.id,
          isInStack: true,
          isInZone: true,
          isFaceUp: card.faceUp,
        })
        return
      }

      // Stack layout - show stack menu
      radialMenu.open(event.clientX, event.clientY, {
        type: 'stack',
        stackId: stack.id,
        cardCount: stack.cardIds.length,
      })
      return
    }
  }

  // Single free card
  radialMenu.open(event.clientX, event.clientY, {
    type: 'card',
    cardId: card.id,
    isInStack: false,
    isInZone: false,
    isFaceUp: card.faceUp,
  })
}

// Right-click handler for zones
const onZoneRightClick = (event: MouseEvent, zoneId: number) => {
  event.preventDefault()
  event.stopPropagation()

  const zone = cardStore.zones.find((z) => z.id === zoneId)
  radialMenu.open(event.clientX, event.clientY, {
    type: 'zone',
    zoneId,
    locked: zone?.locked ?? false,
  })
}

// Right-click on canvas (empty space)
const onCanvasRightClick = (event: MouseEvent) => {
  event.preventDefault()

  // Convert to world coordinates for zone creation position
  const worldPos = viewport.screenToWorld(event.clientX, event.clientY)
  radialMenu.open(event.clientX, event.clientY, {
    type: 'canvas',
    worldX: worldPos.x,
    worldY: worldPos.y,
  })
}

// Right-click handler for hand cards
const onHandCardRightClick = (event: MouseEvent, cardId: number) => {
  event.preventDefault()
  event.stopPropagation()

  const card = cardStore.getCardById(cardId)
  if (!card) return

  // If card is part of a hand selection with multiple cards, use hand-selection menu
  if (
    handCompRef.value?.isHandCardSelected(cardId) &&
    (handCompRef.value?.handSelectionCount ?? 0) > 1
  ) {
    radialMenu.open(event.clientX, event.clientY, {
      type: 'hand-selection',
      cardIds: [...(handCompRef.value?.selectedHandCardIds ?? [])],
    })
    return
  }

  // Single hand card
  radialMenu.open(event.clientX, event.clientY, {
    type: 'hand-card',
    cardId: card.id,
    isFaceUp: card.faceUp,
  })
}

// Right-click handler for counters
const onCounterRightClick = (event: MouseEvent, counterId: number) => {
  event.preventDefault()
  event.stopPropagation()

  const counter = cardStore.getCounterById(counterId)
  if (!counter) return

  radialMenu.open(event.clientX, event.clientY, {
    type: 'counter',
    counterId,
    value: counter.value,
  })
}

// Right-click handler for tokens
const onTokenRightClick = (event: MouseEvent, tokenId: number) => {
  event.preventDefault()
  event.stopPropagation()

  const token = cardStore.getTokenById(tokenId)
  if (!token) return

  radialMenu.open(event.clientX, event.clientY, {
    type: 'token',
    tokenId,
    kind: token.kind,
  })
}

// Right-click handler for dice
const onDieRightClick = (event: MouseEvent, dieId: number) => {
  event.preventDefault()
  event.stopPropagation()

  const die = cardStore.getDieById(dieId)
  if (!die) return

  radialMenu.open(event.clientX, event.clientY, {
    type: 'die',
    dieId,
    value: die.value,
  })
}

// Right-click handler for timers
const onTimerRightClick = (event: MouseEvent, timerId: number) => {
  event.preventDefault()
  event.stopPropagation()

  const timer = cardStore.getTimerById(timerId)
  if (!timer) return

  radialMenu.open(event.clientX, event.clientY, {
    type: 'timer',
    timerId,
    status: timer.status,
    mode: timer.mode,
  })
}

// Handle radial menu item selection
const onRadialMenuSelect = (item: RadialMenuItem) => {
  const target = radialMenu.target.value
  if (!target) return

  trackActivity()

  switch (target.type) {
    case 'card':
      handleCardAction(item.id, target.cardId)
      break
    case 'stack':
      handleStackAction(item.id, target.stackId)
      break
    case 'zone':
      handleZoneAction(item.id, target.zoneId)
      break
    case 'selection':
      handleSelectionAction(item.id, target.cardIds)
      break
    case 'hand-card':
      handleHandCardAction(item.id, target.cardId)
      break
    case 'hand-selection':
      handleHandSelectionAction(item.id, target.cardIds)
      break
    case 'canvas':
      handleCanvasAction(item.id, target.worldX, target.worldY)
      break
    case 'counter':
      handleCounterAction(item.id, target.counterId)
      break
    case 'token':
      handleTokenAction(item.id, target.tokenId)
      break
    case 'die':
      handleDieAction(item.id, target.dieId)
      break
    case 'timer':
      handleTimerAction(item.id, target.timerId)
      break
  }
}

const handleCardAction = (action: string, cardId: number) => {
  const card = cardStore.getCardById(cardId)
  if (!card) return

  switch (action) {
    case 'flip':
      cardStore.flipCard(cardId)
      ws.send({ type: 'card:flip', cardId })
      break
    case 'to-hand':
      if (cardStore.addToHand(cardId)) {
        ws.send({ type: 'hand:add', cardId })
      }
      break
    case 'pick-up':
      cardStore.removeFromStack(cardId)
      ws.send({ type: 'stack:remove_card', cardId })
      break
  }
}

const handleStackAction = (action: string, stackId: number) => {
  const stack = cardStore.stacks.find((s) => s.id === stackId)
  if (!stack) return

  switch (action) {
    case 'flip-stack':
      cardStore.flipStack(stackId)
      ws.send({ type: 'stack:flip', stackId })
      break
    case 'shuffle':
      cardStore.shuffleStack(stackId)
      ws.send({ type: 'stack:shuffle', stackId })
      break
    case 'spread': {
      // Spread cards out in a row from the stack position
      const spacing = CARD_W + 10
      const startX = stack.anchorX - ((stack.cardIds.length - 1) * spacing) / 2
      stack.cardIds.forEach((cardId, i) => {
        const card = cardStore.getCardById(cardId)
        if (card) {
          cardStore.removeFromStack(cardId)
          card.x = startX + i * spacing
          card.y = stack.anchorY
          ws.send({ type: 'card:move', cardId, x: card.x, y: card.y })
        }
      })
      break
    }
    case 'all-face-up':
      // Set all cards in stack to face up
      stack.cardIds.forEach((cardId) => {
        const card = cardStore.getCardById(cardId)
        if (card) card.faceUp = true
      })
      ws.send({ type: 'stack:set_faces', stackId, faceUp: true })
      break
    case 'all-face-down':
      // Set all cards in stack to face down
      stack.cardIds.forEach((cardId) => {
        const card = cardStore.getCardById(cardId)
        if (card) card.faceUp = false
      })
      ws.send({ type: 'stack:set_faces', stackId, faceUp: false })
      break
    case 'draw-top': {
      // Draw just the top card from stack
      const topCardId = stack.cardIds[stack.cardIds.length - 1]
      if (topCardId !== undefined) {
        cardStore.addToHand(topCardId)
        ws.send({ type: 'hand:add', cardId: topCardId })
      }
      break
    }
    case 'all-to-hand':
      cardStore.addStackToHand(stackId)
      ws.send({ type: 'hand:add_stack', stackId })
      break
  }
}

const handleZoneAction = (action: string, zoneId: number) => {
  const zone = cardStore.zones.find((z) => z.id === zoneId)
  if (!zone) return

  switch (action) {
    case 'zone-settings':
      editingZoneId.value = zoneId
      break
    case 'zone-lock':
      ws.send({ type: 'zone:update', zoneId, updates: { locked: !zone.locked } })
      break
    case 'zone-flip-all':
      if (zone.stackId !== null) {
        const stack = cardStore.stacks.find((s) => s.id === zone.stackId)
        if (stack) {
          stack.cardIds.forEach((cardId) => {
            cardStore.flipCard(cardId)
            ws.send({ type: 'card:flip', cardId })
          })
        }
      }
      break
    case 'zone-shuffle':
      if (zone.stackId !== null) {
        cardStore.shuffleStack(zone.stackId)
        ws.send({ type: 'stack:shuffle', stackId: zone.stackId })
      }
      break
    case 'zone-delete':
      ws.send({ type: 'zone:delete', zoneId })
      break
  }
}

const handleSelectionAction = (action: string, cardIds: number[]) => {
  switch (action) {
    case 'stack-selection': {
      // Find center of selection
      let sumX = 0,
        sumY = 0,
        count = 0
      cardIds.forEach((id) => {
        const card = cardStore.getCardById(id)
        if (card) {
          sumX += card.x
          sumY += card.y
          count++
        }
      })
      if (count > 0) {
        const newStack = cardStore.stackSelection(sumX / count, sumY / count)
        if (newStack) {
          ws.send({
            type: 'stack:create',
            cardIds: newStack.cardIds,
            anchorX: newStack.anchorX,
            anchorY: newStack.anchorY,
          })
        }
      }
      break
    }
    case 'flip-selection':
      cardIds.forEach((cardId) => {
        cardStore.flipCard(cardId)
        ws.send({ type: 'card:flip', cardId })
      })
      break
    case 'to-hand':
      cardIds.forEach((cardId) => {
        if (cardStore.addToHand(cardId)) {
          ws.send({ type: 'hand:add', cardId })
        }
      })
      cardStore.clearSelection()
      break
    case 'deselect':
      cardStore.clearSelection()
      break
  }
}

const handleCanvasAction = (action: string, worldX: number, worldY: number) => {
  switch (action) {
    case 'create-zone': {
      // Create zone centered on the click position
      const x = worldX - ZONE_DEFAULT_WIDTH / 2
      const y = worldY - ZONE_DEFAULT_HEIGHT / 2
      ws.send({
        type: 'zone:create',
        x,
        y,
        width: ZONE_DEFAULT_WIDTH,
        height: ZONE_DEFAULT_HEIGHT,
        label: 'New Zone',
        faceUp: false,
      })
      break
    }
    case 'deal-card':
      // TODO: Deal from a deck
      break
    case 'reset-view':
      viewport.resetViewport()
      break
  }
}

const handleHandCardAction = (action: string, cardId: number) => {
  const card = cardStore.getCardById(cardId)
  if (!card) return

  switch (action) {
    case 'play-to-table': {
      // Remove from hand and place on table face-up at center of viewport
      const bounds = viewport.getVisibleBounds()
      const x = bounds.x + bounds.width / 2 - CARD_W / 2
      const y = bounds.y + bounds.height / 2 - CARD_H / 2
      cardStore.removeFromHand(cardId)
      card.x = x
      card.y = y
      card.faceUp = true
      ws.send({ type: 'hand:remove', cardId, x, y, faceUp: true })
      break
    }
    case 'play-face-down': {
      // Remove from hand and place on table face-down at center of viewport
      const bounds = viewport.getVisibleBounds()
      const x = bounds.x + bounds.width / 2 - CARD_W / 2
      const y = bounds.y + bounds.height / 2 - CARD_H / 2
      cardStore.removeFromHand(cardId)
      card.x = x
      card.y = y
      card.faceUp = false
      ws.send({ type: 'hand:remove', cardId, x, y, faceUp: false })
      break
    }
  }
}

const handleHandSelectionAction = (action: string, cardIds: number[]) => {
  switch (action) {
    case 'play-all-to-table': {
      // Play all selected cards to table, spread out
      const bounds = viewport.getVisibleBounds()
      const startX = bounds.x + bounds.width / 2 - ((cardIds.length - 1) * (CARD_W + 10)) / 2
      const centerY = bounds.y + bounds.height / 2 - CARD_H / 2

      cardIds.forEach((cardId, i) => {
        const card = cardStore.getCardById(cardId)
        if (card) {
          const x = startX + i * (CARD_W + 10)
          const y = centerY
          cardStore.removeFromHand(cardId)
          card.x = x
          card.y = y
          ws.send({ type: 'hand:remove', cardId, x, y, faceUp: card.faceUp })
        }
      })
      handCompRef.value?.clearHandSelection()
      break
    }
    case 'stack-and-play': {
      // Create a stack from selected cards and play to table
      const bounds = viewport.getVisibleBounds()
      const centerX = bounds.x + bounds.width / 2 - CARD_W / 2
      const centerY = bounds.y + bounds.height / 2 - CARD_H / 2

      // Remove all from hand first
      cardIds.forEach((cardId) => {
        const card = cardStore.getCardById(cardId)
        if (card) {
          cardStore.removeFromHand(cardId)
          ws.send({ type: 'hand:remove', cardId, x: centerX, y: centerY, faceUp: card.faceUp })
        }
      })

      // Create stack
      const newStack = cardStore.createStackAt(centerX, centerY, 'free')
      cardIds.forEach((cardId) => {
        const card = cardStore.getCardById(cardId)
        if (card) {
          newStack.cardIds.push(cardId)
          card.stackId = newStack.id
          card.isInDeck = true
        }
      })
      cardStore.updateStackPositions(newStack)

      ws.send({
        type: 'stack:create',
        cardIds: newStack.cardIds,
        anchorX: newStack.anchorX,
        anchorY: newStack.anchorY,
      })
      handCompRef.value?.clearHandSelection()
      break
    }
    case 'flip-selection':
      cardIds.forEach((cardId) => {
        cardStore.flipCard(cardId)
      })
      break
    case 'deselect':
      handCompRef.value?.clearHandSelection()
      break
  }
}

const handleCounterAction = (action: string, counterId: number) => {
  const counter = cardStore.getCounterById(counterId)
  if (!counter) return

  switch (action) {
    case 'counter-reset':
      // Reset counter to zero (or min if set)
      const resetValue = counter.min !== undefined ? counter.min : 0
      ws.send({
        type: 'counter:update',
        counterId,
        updates: { value: resetValue },
      })
      break
    case 'counter-settings':
      // Open the counter's modal - find the component ref
      // For now we trigger the double-click behavior by emitting update
      // The component exposes openModal via defineExpose
      counterRefs.value.get(counterId)?.openModal()
      break
    case 'counter-delete':
      ws.send({ type: 'counter:delete', counterId })
      break
  }
}

const handleTokenAction = (action: string, tokenId: number) => {
  const token = cardStore.getTokenById(tokenId)
  if (!token) return

  switch (action) {
    case 'token-duplicate': {
      // Create a copy of the token slightly offset
      ws.send({
        type: 'token:create',
        x: token.x + 20,
        y: token.y + 20,
        kind: token.kind,
        shape: token.shape,
        color: token.color,
        label: token.label,
        sprite: token.sprite,
        size: token.size,
      })
      break
    }
    case 'token-settings':
      tokenRefs.value.get(tokenId)?.openModal()
      break
    case 'token-delete':
      ws.send({ type: 'token:delete', tokenId })
      break
  }
}

const handleDieAction = (action: string, dieId: number) => {
  const die = cardStore.getDieById(dieId)
  if (!die) return

  switch (action) {
    case 'die-roll':
      cardStore.setDieRolling(dieId, true)
      ws.send({ type: 'die:roll', dieId })
      break
    case 'die-settings':
      dieRefs.value.get(dieId)?.openModal()
      break
    case 'die-delete':
      ws.send({ type: 'die:delete', dieId })
      break
  }
}

const handleTimerAction = (action: string, timerId: number) => {
  const timer = cardStore.getTimerById(timerId)
  if (!timer) return

  switch (action) {
    case 'timer-start':
      ws.send({ type: 'timer:start', timerId })
      break
    case 'timer-pause':
      ws.send({ type: 'timer:pause', timerId })
      break
    case 'timer-reset':
      ws.send({ type: 'timer:reset', timerId })
      break
    case 'timer-settings':
      timerRefs.value.get(timerId)?.openModal()
      break
    case 'timer-delete':
      ws.send({ type: 'timer:delete', timerId })
      break
  }
}

// Canvas dimensions for minimap
const canvasDimensions = computed(() => {
  const rect = canvasRef.value?.getBoundingClientRect()
  return { width: rect?.width ?? 800, height: rect?.height ?? 600 }
})

// Background style based on table settings
const canvasBackgroundStyle = computed(() => {
  const backgrounds: Record<string, string> = {
    'green-felt': `
      radial-gradient(1200px 800px at 30% 25%, rgba(255, 255, 255, 0.08), transparent 55%),
      radial-gradient(900px 700px at 70% 75%, rgba(0, 0, 0, 0.25), transparent 60%),
      repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.02) 0 2px, rgba(0, 0, 0, 0.02) 2px 4px),
      linear-gradient(180deg, #1f7a3a 0%, #0f4f27 100%)
    `,
    'blue-felt': `
      radial-gradient(1200px 800px at 30% 25%, rgba(255, 255, 255, 0.08), transparent 55%),
      radial-gradient(900px 700px at 70% 75%, rgba(0, 0, 0, 0.25), transparent 60%),
      repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.02) 0 2px, rgba(0, 0, 0, 0.02) 2px 4px),
      linear-gradient(180deg, #1a5a8a 0%, #0f3a5a 100%)
    `,
    'red-felt': `
      radial-gradient(1200px 800px at 30% 25%, rgba(255, 255, 255, 0.08), transparent 55%),
      radial-gradient(900px 700px at 70% 75%, rgba(0, 0, 0, 0.25), transparent 60%),
      repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.02) 0 2px, rgba(0, 0, 0, 0.02) 2px 4px),
      linear-gradient(180deg, #8a1a1a 0%, #5a0f0f 100%)
    `,
    'wood-oak': `
      radial-gradient(1200px 800px at 30% 25%, rgba(255, 255, 255, 0.06), transparent 55%),
      radial-gradient(900px 700px at 70% 75%, rgba(0, 0, 0, 0.3), transparent 60%),
      repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.03) 0 1px, transparent 1px 8px),
      linear-gradient(180deg, #8b6b4e 0%, #5c4033 100%)
    `,
    'wood-dark': `
      radial-gradient(1200px 800px at 30% 25%, rgba(255, 255, 255, 0.04), transparent 55%),
      radial-gradient(900px 700px at 70% 75%, rgba(0, 0, 0, 0.4), transparent 60%),
      repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.05) 0 1px, transparent 1px 8px),
      linear-gradient(180deg, #3d2817 0%, #1a0f0a 100%)
    `,
    slate: `
      radial-gradient(1200px 800px at 30% 25%, rgba(255, 255, 255, 0.06), transparent 55%),
      radial-gradient(900px 700px at 70% 75%, rgba(0, 0, 0, 0.3), transparent 60%),
      linear-gradient(180deg, #4a5568 0%, #2d3748 100%)
    `,
  }
  return { background: backgrounds[ws.tableSettings.value.background] || backgrounds['green-felt'] }
})

// Table settings handlers
const handleSettingsUpdate = (settings: Partial<TableSettings>) => {
  ws.updateTableSettings(settings)
}

const handleVisibilityUpdate = (isPublic: boolean) => {
  ws.updateTableVisibility(isPublic)
}

const handleNameUpdate = (name: string) => {
  ws.updateTableName(name)
}

const handleTableReset = () => {
  ws.resetTable()
  showSettings.value = false
}

// Copy room code to clipboard
const copyRoomCode = async () => {
  if (!ws.roomCode.value) return
  try {
    const fullAddress = `${window.location.origin}/table/${ws.roomCode.value}`
    await navigator.clipboard.writeText(fullAddress)
    codeCopied.value = true
    setTimeout(() => {
      codeCopied.value = false
    }, 2000)
  } catch {
    // Fallback for older browsers
    console.warn('Clipboard API not available')
  }
}

// Leave table and go back to landing
const leaveTable = () => {
  ws.leaveRoom()
  router.push({ name: 'landing' })
}

// Keyboard handlers for panning
const onKeyDown = (event: KeyboardEvent) => {
  // Don't intercept keyboard events when typing in an input field
  const target = event.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return
  }

  if (event.code === 'Space' && !event.repeat) {
    spaceHeld.value = true
    event.preventDefault()
  }
  // Reset viewport with Home key
  if (event.code === 'Home') {
    viewport.resetViewport()
  }
}

const onKeyUp = (event: KeyboardEvent) => {
  if (event.code === 'Space') {
    spaceHeld.value = false
    viewport.endPan()
  }
}

// Canvas pointer handlers for panning
const onCanvasPointerDown = (event: PointerEvent) => {
  // Close radial menu on any click
  radialMenu.close()

  // Close any open panels when clicking on canvas
  showSettings.value = false
  showPlayers.value = false

  // Clear card selection when clicking on empty canvas (left-click only)
  if (event.button === 0 && !spaceHeld.value) {
    cardStore.clearSelection()
  }

  // Middle mouse button or space+left click for panning
  if (event.button === 1 || (event.button === 0 && spaceHeld.value)) {
    event.preventDefault()
    viewport.startPan(event)
    ;(event.target as HTMLElement)?.setPointerCapture(event.pointerId)
  }
}

// Throttled cursor sending
let lastCursorSend = 0
let lastCursorState: 'default' | 'grab' | 'grabbing' = 'default'

const sendCursorUpdate = (x: number, y: number, state: 'default' | 'grab' | 'grabbing') => {
  const now = Date.now()
  // Always send if state changed, otherwise throttle
  if (state === lastCursorState && now - lastCursorSend < CURSOR_THROTTLE_MS) return
  lastCursorSend = now
  lastCursorState = state

  ws.send({ type: 'cursor:update', x, y, state })
}

// Get current cursor state for sending
const getCursorState = (): 'default' | 'grab' | 'grabbing' => {
  if (interaction.drag.isDragging.value) return 'grabbing'
  return 'default'
}

const onCanvasPointerMove = (event: PointerEvent) => {
  if (viewport.isPanning.value) {
    viewport.updatePan(event)
  }

  // Send cursor position in world coordinates with state
  const worldPos = viewport.screenToWorld(event.clientX, event.clientY)
  sendCursorUpdate(worldPos.x, worldPos.y, getCursorState())
}

const onCanvasPointerUp = (event: PointerEvent) => {
  if (viewport.isPanning.value) {
    viewport.endPan()
    ;(event.target as HTMLElement)?.releasePointerCapture(event.pointerId)
  }
}

// Periodic state sync - only after inactivity
const STATE_SYNC_INTERVAL = 30_000
const INACTIVITY_THRESHOLD = 5_000 // Only sync after 5 seconds of inactivity
let syncInterval: ReturnType<typeof setInterval> | null = null

// Connect to room on mount
onMounted(() => {
  ws.connect()

  // Wait for connection, then create or join room
  const unwatch = watch(
    () => ws.isConnected.value,
    (connected) => {
      if (connected) {
        if (isNewTable.value) {
          ws.createRoom(playerName.value, {
            tableName: tableName.value || undefined,
            isPublic: isPublicTable.value || undefined,
          })
        } else if (routeRoomCode.value) {
          ws.joinRoom(routeRoomCode.value, playerName.value)
        }
        unwatch()
      }
    },
    { immediate: true },
  )

  // Start periodic state sync - only syncs after inactivity
  syncInterval = setInterval(() => {
    if (ws.isConnected.value && ws.roomCode.value) {
      const timeSinceActivity = Date.now() - lastActivityTime
      if (timeSinceActivity >= INACTIVITY_THRESHOLD) {
        ws.send({ type: 'state:request' })
      }
    }
  }, STATE_SYNC_INTERVAL)

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})

onBeforeUnmount(() => {
  interaction.drag.cancelRaf()
  ws.disconnect()
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})
</script>

<template>
  <div class="table-view" :class="cursorClass" @contextmenu.prevent>
    <!-- Header bar -->
    <header class="table-header">
      <div class="table-header__left">
        <button class="table-header__back" @click="leaveTable" title="Leave Table">
          <DoorOpen :size="18" />
        </button>
        <div class="table-header__info">
          <h1 class="table-header__title">🃏 cardz</h1>
          <div v-if="ws.roomCode.value" class="table-header__room">
            <span class="table-header__code">{{ ws.roomCode.value }}</span>
            <button
              class="table-header__copy"
              :class="{ 'table-header__copy--copied': codeCopied }"
              @click="copyRoomCode"
              title="Copy room code"
            >
              <Check v-if="codeCopied" :size="14" />
              <Copy v-else :size="14" />
            </button>
          </div>
          <span v-else-if="isNewTable" class="table-header__new-badge">New Table</span>
        </div>
      </div>

      <div class="table-header__right">
        <div class="table-header__players-wrapper">
          <button
            class="table-header__players"
            :class="{ 'table-header__players--active': showPlayers }"
            :title="`${ws.players.value.length} player(s) connected`"
            @click="showPlayers = !showPlayers"
          >
            <Users :size="16" />
            <span>{{ ws.players.value.length }}</span>
          </button>
          <PlayersPanel
            v-if="showPlayers"
            :players="ws.players.value"
            :hand-counts="ws.handCounts.value"
            :current-player-id="ws.playerId.value"
            :own-hand-count="cardStore.handCount"
            @close="showPlayers = false"
          />
        </div>
        <button
          class="table-header__settings"
          :class="{ 'table-header__settings--active': showSettings }"
          @click="showSettings = !showSettings"
          title="Table Settings"
        >
          <Settings :size="16" />
        </button>
        <div
          class="table-header__status"
          :class="{ 'table-header__status--connected': ws.isConnected.value }"
          :title="ws.isConnected.value ? 'Connected' : 'Connecting...'"
        >
          <Wifi v-if="ws.isConnected.value" :size="16" />
          <WifiOff v-else :size="16" />
        </div>

        <!-- Settings Panel -->
        <TableSettingsPanel
          v-if="showSettings"
          :settings="ws.tableSettings.value"
          :is-public="ws.tableIsPublic.value"
          :table-name="ws.tableName.value || tableName"
          @update:settings="handleSettingsUpdate"
          @update:visibility="handleVisibilityUpdate"
          @update:name="handleNameUpdate"
          @reset="handleTableReset"
          @close="showSettings = false"
        />
      </div>
    </header>

    <!-- Canvas -->
    <div
      ref="canvasRef"
      class="canvas"
      :style="canvasBackgroundStyle"
      @wheel="viewport.onWheel"
      @pointerdown="onCanvasPointerDown"
      @pointermove="onCanvasPointerMove"
      @pointerup="onCanvasPointerUp"
      @pointercancel="onCanvasPointerUp"
      @contextmenu="onCanvasRightClick"
    >
      <!-- Table UI (fixed position, not affected by pan/zoom) -->
      <div class="table-ui">
        <!-- Minimap -->
        <MinimapComp
          :viewport="viewport"
          :canvas-width="canvasDimensions.width"
          :canvas-height="canvasDimensions.height"
        />

        <TablePanel class="table-ui__add-panel" title="Add Item" column>
          <TableButton title="Add Zone" @click="addZone">
            <SquarePlus />
          </TableButton>
          <TableButton title="Add Counter" @click="addCounter">
            <Hash />
          </TableButton>
          <TableButton title="Add Token" @click="addColorToken">
            <CircleDot />
          </TableButton>
          <TableButton title="Add Die" @click="addDie">
            <Dices />
          </TableButton>
          <TableButton title="Add Timer" @click="addTimer('countdown')">
            <Timer />
          </TableButton>
        </TablePanel>
      </div>

      <!-- World container (pan/zoom transform) -->
      <div class="world" :style="{ transform: viewport.worldTransform.value }">
        <!-- Zones (deck areas) -->
        <ZoneComp
          v-for="zone in cardStore.zones"
          :key="zone.id"
          :zone="zone"
          :is-dragging="isZoneDragging(zone.id)"
          :current-player-id="ws.playerId.value"
          :open-settings="editingZoneId === zone.id"
          @pointerdown="interaction.onZonePointerDown($event, zone.id)"
          @pointermove="interaction.onZonePointerMove"
          @pointerup="interaction.onZonePointerUp"
          @contextmenu="onZoneRightClick($event, zone.id)"
          @zone:update="onZoneUpdate"
          @zone:delete="onZoneDelete"
          @settings:close="editingZoneId = null"
        />

        <!-- Counters -->
        <CounterComp
          v-for="counter in cardStore.counters"
          :key="counter.id"
          :ref="(el: any) => el && counterRefs.set(counter.id, el)"
          :counter="counter"
          :is-dragging="isCounterDragging(counter.id)"
          :is-locked-by-other="isCounterLockedByOther(counter)"
          :lock-color="getCounterLockColor(counter)"
          @pointerdown="onCounterPointerDown($event, counter.id)"
          @pointermove="onCounterPointerMove"
          @pointerup="onCounterPointerUp"
          @contextmenu="onCounterRightClick($event, counter.id)"
          @counter:increment="onCounterIncrement"
          @counter:update="onCounterUpdate"
          @counter:delete="onCounterDelete"
        />

        <!-- Tokens -->
        <TokenComp
          v-for="token in cardStore.tokens"
          :key="token.id"
          :ref="(el: any) => el && tokenRefs.set(token.id, el)"
          :token="token"
          :is-dragging="isTokenDragging(token.id)"
          :is-locked-by-other="isTokenLockedByOther(token)"
          :lock-color="getTokenLockColor(token)"
          @pointerdown="onTokenPointerDown($event, token.id)"
          @pointermove="onTokenPointerMove"
          @pointerup="onTokenPointerUp"
          @contextmenu="onTokenRightClick($event, token.id)"
          @token:update="onTokenUpdate"
          @token:delete="onTokenDelete"
        />

        <!-- Dice -->
        <DieComp
          v-for="die in cardStore.dice"
          :key="die.id"
          :ref="(el: any) => el && dieRefs.set(die.id, el)"
          :die="die"
          :is-dragging="isDieDragging(die.id)"
          :is-locked-by-other="isDieLockedByOther(die)"
          :lock-color="getDieLockColor(die)"
          @pointerdown="onDiePointerDown($event, die.id)"
          @pointermove="onDiePointerMove"
          @pointerup="onDiePointerUp"
          @contextmenu="onDieRightClick($event, die.id)"
          @die:roll="onDieRoll"
          @die:update="onDieUpdate"
          @die:delete="onDieDelete"
        />

        <!-- Timers -->
        <TimerComp
          v-for="timer in cardStore.timers"
          :key="timer.id"
          :ref="(el: any) => el && timerRefs.set(timer.id, el)"
          :timer="timer"
          :is-dragging="isTimerDragging(timer.id)"
          :is-locked-by-other="isTimerLockedByOther(timer)"
          :lock-color="getTimerLockColor(timer)"
          @pointerdown="onTimerPointerDown($event, timer.id)"
          @pointermove="onTimerPointerMove"
          @pointerup="onTimerPointerUp"
          @contextmenu="onTimerRightClick($event, timer.id)"
          @timer:start="onTimerStart"
          @timer:pause="onTimerPause"
          @timer:reset="onTimerReset"
          @timer:update="onTimerUpdate"
          @timer:delete="onTimerDelete"
        />

        <Card
          v-for="(card, index) in cardStore.cards"
          v-show="!card.inHand"
          :key="card.id"
          :class="{
            dragging:
              interaction.drag.activeIndex.value === index ||
              (interaction.drag.target.value?.type === 'stack' &&
                card.stackId === interaction.drag.target.value.stackId &&
                isStackBottom(card)),
            'in-deck': card.isInDeck,
            'in-stack': card.stackId !== null,
            'stack-bottom': isStackBottom(card),
            'stack-target':
              interaction.hover.state.ready && interaction.hover.state.cardId === card.id,
            'face-down': shouldShowFaceDown(card),
            selected: cardStore.isSelected(card.id),
            shuffling:
              cardStore.shufflingStackId !== null && card.stackId === cardStore.shufflingStackId,
            'locked-by-other': shouldShowLockGlow(card),
            'zone-reorder-shift': zoneReorderPositions.get(card.id) !== undefined,
          }"
          :style="{
            '--col': shouldShowFaceDown(card) ? CARD_BACK_COL : card.col,
            '--row': shouldShowFaceDown(card) ? CARD_BACK_ROW : card.row,
            '--shuffle-seed': card.id % 10,
            '--lock-color': getCardLockColor(card),
            '--stack-size': isStackBottom(card) ? getStackSize(card) : 1,
            left: `${getZoneReorderPosition(card)?.x ?? getLockedCardPosition(card)?.x ?? card.x}px`,
            top: `${getZoneReorderPosition(card)?.y ?? getLockedCardPosition(card)?.y ?? card.y}px`,
            zIndex: interaction.getCardZ(index),
            transform: getCardTransform(card, index),
          }"
          @pointerdown="interaction.onCardPointerDown($event, index)"
          @pointermove="interaction.onCardPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @contextmenu="onCardRightClick($event, index)"
          @dblclick="interaction.onCardDoubleClick($event, index)"
        />

        <!-- Ghost card when dragging from hand (in world space) -->
        <Card
          v-if="handDragCard && !isHandReordering"
          class="hand-ghost"
          :style="{
            '--col': handCompRef?.drawFaceDown ? CARD_BACK_COL : handDragCard.col,
            '--row': handCompRef?.drawFaceDown ? CARD_BACK_ROW : handDragCard.row,
            left: `${handDragPosition.x}px`,
            top: `${handDragPosition.y}px`,
            zIndex: 2000,
          }"
        />

        <!-- Ghost card for zone reordering (shows drop target position) -->
        <Card
          v-if="zoneGhostCard"
          class="zone-ghost"
          :style="{
            '--col': zoneGhostCard.col,
            '--row': zoneGhostCard.row,
            left: `${zoneGhostCard.x}px`,
            top: `${zoneGhostCard.y}px`,
            transform: `rotate(${zoneGhostCard.rotation}deg)`,
            zIndex: 1500,
          }"
        />

        <!-- Remote player cursors -->
        <RemoteCursors
          :cursors="ws.cursors.value"
          :players="ws.players.value"
          :current-player-id="ws.playerId.value"
        />
      </div>

      <!-- Player hand (fixed position) -->
      <HandComp
        ref="handCompRef"
        v-model:hand-ref="handRef"
        :canvas-ref="canvasRef"
        :drag="interaction.drag"
        :is-drop-target="interaction.isOverHand.value"
        :space-held="spaceHeld"
        @card-pointer-up="onPointerUp"
        @card-context-menu="onHandCardRightClick"
      />

      <!-- Selection count indicator -->
      <div v-if="cardStore.hasSelection" class="selection-indicator">
        {{ cardStore.selectionCount }} selected
      </div>
    </div>

    <!-- Chat Panel -->
    <ChatPanel
      v-if="ws.isConnected.value"
      :messages="ws.chatMessages.value"
      :typing-players="ws.typingPlayers.value"
      v-model:is-open="showChat"
      @send="ws.sendChat"
      @typing="ws.sendTyping"
    />

    <!-- Instructions Panel -->
    <InstructionsPanel v-model:is-open="showInstructions" />

    <!-- Radial Context Menu -->
    <RadialMenu
      :visible="radialMenu.visible.value"
      :x="radialMenu.position.value.x"
      :y="radialMenu.position.value.y"
      :items="radialMenu.items.value"
      @select="onRadialMenuSelect"
      @close="radialMenu.close()"
    />
  </div>
</template>

<style scoped>
.table-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0a0a12;
}

.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background: rgba(0, 0, 0, 0.6);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 1001;
  flex-shrink: 0;
}

.table-header__left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.table-header__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 6px;
  color: #a0a0b0;
  cursor: pointer;
  transition: all 0.2s;
}

.table-header__back:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.table-header__info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.table-header__title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  color: #fff;
}

.table-header__room {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem 0.25rem 0.75rem;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
}

.table-header__code {
  font-family: monospace;
  font-size: 0.875rem;
  letter-spacing: 0.1em;
  color: #e94560;
  font-weight: 600;
}

.table-header__copy {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #a0a0b0;
  cursor: pointer;
  transition: all 0.2s;
}

.table-header__copy:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.table-header__copy--copied {
  color: #4ade80;
}

.table-header__new-badge {
  padding: 0.25rem 0.5rem;
  background: linear-gradient(135deg, #e94560 0%, #d63447 100%);
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #fff;
}

.table-header__right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.table-header__players-wrapper {
  position: relative;
}

.table-header__players {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: #a0a0b0;
  font-size: 0.875rem;
  background: transparent;
  border: none;
  padding: 0.375rem 0.5rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.table-header__players:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.table-header__players--active {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.table-header__status {
  display: flex;
  align-items: center;
  color: #ef4444;
  transition: color 0.3s;
}

.table-header__status--connected {
  color: #4ade80;
}

.table-header__settings {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 6px;
  color: #a0a0b0;
  cursor: pointer;
  transition: all 0.2s;
}

.table-header__settings:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.table-header__settings--active {
  background: rgba(233, 69, 96, 0.2);
  color: #e94560;
}

.canvas {
  flex: 1;
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.06),
    inset 0 0 80px rgba(0, 0, 0, 0.35);
  position: relative;
  overflow: hidden;
  user-select: none;
  touch-action: none;
  transition: background 0.5s ease;
}

.world {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  will-change: transform;
  image-rendering: -webkit-optimize-contrast; /* Safari */
  image-rendering: crisp-edges;
}

.stack-target {
  box-shadow:
    0 0 0 2px rgba(255, 255, 255, 0.6),
    0 0 8px rgba(255, 255, 255, 0.3);
  animation: stack-glow 2s ease-in-out infinite;
}

.selected {
  outline: 2px solid rgba(0, 150, 255, 0.9);
  outline-offset: 1px;
  box-shadow: 0 0 8px rgba(0, 150, 255, 0.6);
}

/* Card being grabbed by another player */
.locked-by-other {
  outline: 2px solid var(--lock-color, #888);
  outline-offset: 1px;
  box-shadow: 0 0 12px var(--lock-color, #888);
  animation: grabbed-pulse 1s ease-in-out infinite;
  /* Smooth position interpolation to match remote cursor transition */
  transition:
    left 0.05s linear,
    top 0.05s linear;
}

@keyframes grabbed-pulse {
  0%,
  100% {
    box-shadow: 0 0 8px var(--lock-color, #888);
  }
  50% {
    box-shadow: 0 0 16px var(--lock-color, #888);
  }
}

.selection-indicator {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  pointer-events: none;
}

.table-ui {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 1000;
}

@keyframes stack-glow {
  0%,
  100% {
    box-shadow:
      0 0 0 2px rgba(255, 255, 255, 0.6),
      0 0 8px rgba(255, 255, 255, 0.3);
  }
  50% {
    box-shadow:
      0 0 0 2px rgba(255, 255, 255, 0.8),
      0 0 12px rgba(255, 255, 255, 0.4);
  }
}

.shuffling {
  --delay: calc(var(--shuffle-seed, 0) * 0.02s);
  --dir: calc(1 - 2 * (var(--shuffle-seed, 0) - 5) / 5);
  animation: shuffle-card 0.3s ease-out var(--delay);
  transform-origin: center center;
}

@keyframes shuffle-card {
  0% {
    filter: brightness(1);
    transform: rotate(0deg);
  }
  15% {
    filter: brightness(1.3);
    transform: rotate(calc(10deg * var(--dir, 1)));
  }
  35% {
    filter: brightness(0.9);
    transform: rotate(calc(-8deg * var(--dir, 1)));
  }
  55% {
    filter: brightness(1.2);
    transform: rotate(calc(5deg * var(--dir, 1)));
  }
  75% {
    filter: brightness(1);
    transform: rotate(calc(-2deg * var(--dir, 1)));
  }
  100% {
    filter: brightness(1);
    transform: rotate(0deg);
  }
}

.hand-ghost {
  pointer-events: none;
  cursor: grabbing;
}

.zone-ghost {
  pointer-events: none;
  opacity: 0.6;
  filter: brightness(1.2);
  box-shadow:
    0 0 0 2px rgba(100, 200, 255, 0.8),
    0 0 15px rgba(100, 200, 255, 0.5);
  border-radius: 4px;
}

.zone-reorder-shift {
  transition:
    left 0.15s ease-out,
    top 0.15s ease-out,
    transform 0.15s ease-out;
}
</style>
