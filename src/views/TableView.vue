<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Card from '@/components/CardComp.vue'
import ZoneComp from '@/components/ZoneComp.vue'
import HandComp from '@/components/HandComp.vue'
import MinimapComp from '@/components/MinimapComp.vue'
import RemoteCursors from '@/components/RemoteCursors.vue'
import TablePanel from '@/components/ui/TablePanel.vue'
import TableButton from '@/components/ui/TableButton.vue'
import TableSettingsPanel from '@/components/ui/TableSettingsPanel.vue'
import PlayersPanel from '@/components/ui/PlayersPanel.vue'
import ChatPanel from '@/components/ui/ChatPanel.vue'
import { useCardStore } from '@/stores/cards'
import { useCardInteraction } from '@/composables/useCardInteraction'
import { useViewport } from '@/composables/useViewport'
import { useWebSocket } from '@/composables/useWebSocket'
import { useCursor } from '@/composables/useCursor'
import { useRemoteThrow } from '@/composables/useRemoteThrow'
import { SquarePlus, Copy, Check, LogOut, Users, Wifi, WifiOff, Settings } from 'lucide-vue-next'
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

// Get the transform for a card (combines drag tilt with zone layout rotation)
const getCardTransform = (card: (typeof cardStore.cards)[0], index: number): string | undefined => {
  const isDragging = interaction.drag.activeIndex.value === index
  const isThrowing = interaction.physics.throwingCardId.value === card.id

  if (isDragging || isThrowing) {
    // During drag/throw, use physics tilt
    return `rotate(${interaction.physics.tilt.value}deg)`
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

// Custom cursor based on player color (sets up global style via side effect)
useCursor(playerColor)

// Create refs for template binding
const canvasRef = ref<HTMLElement | null>(null)
const handRef = ref<HTMLElement | null>(null)
const handCompRef = ref<InstanceType<typeof HandComp> | null>(null)

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
})

// Remote throw physics for other players' card throws
const remoteThrow = useRemoteThrow((id) => cardStore.cards.find((c) => c.id === id))

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
      // Skip if this is our own card move
      if (message.playerId === ws.playerId.value) {
        cardStore.updateCardFromServer(message.cardId, {
          x: message.x,
          y: message.y,
          z: message.z,
        })
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
      cardStore.updateStackFromServer(message.stackId, {
        anchorX: message.anchorX,
        anchorY: message.anchorY,
      })
      // Handle zone detachment
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
      message.cardUpdates.forEach((update) => {
        cardStore.updateCardFromServer(update.cardId, {
          x: update.x,
          y: update.y,
        })
      })
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

    case 'stack:flipped':
      message.cardUpdates.forEach((update) => {
        cardStore.updateCardFromServer(update.cardId, { faceUp: update.faceUp })
      })
      break

    case 'zone:created':
      cardStore.addZoneFromServer(message.zone)
      break

    case 'zone:updated':
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
      break

    case 'zone:deleted':
      cardStore.removeZone(message.zoneId)
      if (message.stackDeleted !== null) {
        cardStore.removeStack(message.stackDeleted)
      }
      message.scatteredCards.forEach((update) => {
        cardStore.updateCardFromServer(update.cardId, {
          x: update.x,
          y: update.y,
          stackId: null,
        })
      })
      break

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

const handleTableReset = () => {
  ws.resetTable()
  showSettings.value = false
}

// Copy room code to clipboard
const copyRoomCode = async () => {
  if (!ws.roomCode.value) return
  try {
    await navigator.clipboard.writeText(ws.roomCode.value)
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
  // Close any open panels when clicking on canvas
  showSettings.value = false
  showPlayers.value = false

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
  <div class="table-view" :class="cursorClass">
    <!-- Header bar -->
    <header class="table-header">
      <div class="table-header__left">
        <button class="table-header__back" @click="leaveTable" title="Leave Table">
          <LogOut :size="18" />
        </button>
        <div class="table-header__info">
          <h1 class="table-header__title">🃏 Cardz</h1>
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
    >
      <!-- Table UI (fixed position, not affected by pan/zoom) -->
      <div class="table-ui">
        <!-- Minimap -->
        <MinimapComp
          :viewport="viewport"
          :canvas-width="canvasDimensions.width"
          :canvas-height="canvasDimensions.height"
        />

        <TablePanel>
          <TableButton title="Add Zone" @click="addZone">
            <SquarePlus />
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
          @pointerdown="interaction.onZonePointerDown($event, zone.id)"
          @pointermove="interaction.onZonePointerMove"
          @pointerup="interaction.onZonePointerUp"
          @zone:update="onZoneUpdate"
          @zone:delete="onZoneDelete"
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
            'face-down': !card.faceUp,
            selected: cardStore.isSelected(card.id),
            shuffling:
              cardStore.shufflingStackId !== null && card.stackId === cardStore.shufflingStackId,
            'locked-by-other': shouldShowLockGlow(card),
          }"
          :style="{
            '--col': interaction.getCardCol(index),
            '--row': interaction.getCardRow(index),
            '--shuffle-seed': card.id % 10,
            '--lock-color': getCardLockColor(card),
            '--stack-size': isStackBottom(card) ? getStackSize(card) : 1,
            left: `${getLockedCardPosition(card)?.x ?? card.x}px`,
            top: `${getLockedCardPosition(card)?.y ?? card.y}px`,
            zIndex: interaction.getCardZ(index),
            transform: getCardTransform(card, index),
          }"
          @pointerdown="interaction.onCardPointerDown($event, index)"
          @pointermove="interaction.onCardPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @contextmenu="interaction.onCardContextMenu"
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
        @card-pointer-up="onPointerUp"
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
      v-model:is-open="showChat"
      @send="ws.sendChat"
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
</style>
