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
import { useCardStore } from '@/stores/cards'
import { useCardInteraction } from '@/composables/useCardInteraction'
import { useViewport } from '@/composables/useViewport'
import { useWebSocket } from '@/composables/useWebSocket'
import { useCursor } from '@/composables/useCursor'
import { SquarePlus, Copy, Check, LogOut, Users, Wifi, WifiOff } from 'lucide-vue-next'
import {
  CARD_BACK_COL,
  CARD_BACK_ROW,
  ZONE_DEFAULT_WIDTH,
  ZONE_DEFAULT_HEIGHT,
  CURSOR_THROTTLE_MS,
} from '@/types'
import type { ServerMessage, ClientMessage } from '../../shared/types'

const route = useRoute()
const router = useRouter()
const cardStore = useCardStore()

// Room info from route
const routeRoomCode = computed(() => (route.params.code as string)?.toUpperCase() || null)
const playerName = computed(() => (route.query.name as string) || 'Player')
const isNewTable = computed(() => route.name === 'table-new')

// WebSocket connection
const ws = useWebSocket()
const codeCopied = ref(false)

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

// Check if a card is locked by another player (not the current player)
const isLockedByOther = (lockedBy: string | null): boolean => {
  return lockedBy !== null && lockedBy !== ws.playerId.value
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

// Set up card interaction with WebSocket send function
const interaction = useCardInteraction({
  handRef: handRef,
  sendMessage: (msg: ClientMessage) => ws.send(msg),
})

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
      // Full state sync on room creation
      if (ws.gameState.value) {
        cardStore.syncFromServer(ws.gameState.value, ws.handCardIds.value)
      }
      // Update route to include room code
      router.replace({
        name: 'table',
        params: { code: message.roomCode },
        query: { name: playerName.value },
      })
      break

    case 'room:joined':
      // Full state sync when joining a room
      if (ws.gameState.value) {
        cardStore.syncFromServer(ws.gameState.value, ws.handCardIds.value)
      }
      break

    case 'room:error':
      // Room not found or other error - redirect to landing
      if (message.code === 'NOT_FOUND' || message.code === 'INVALID_CODE') {
        router.replace({ name: 'landing' })
      }
      break

    case 'card:moved':
      cardStore.updateCardFromServer(message.cardId, {
        x: message.x,
        y: message.y,
        z: message.z,
      })
      break

    case 'card:locked':
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
      if (message.cardUpdates) {
        message.cardUpdates.forEach((update) => {
          cardStore.updateCardFromServer(update.cardId, {
            x: update.x,
            y: update.y,
          })
        })
      }
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
        }
      } else {
        // Add to existing stack
        const existingStack = cardStore.stacks.find((s) => s.id === message.stackId)
        if (existingStack && !existingStack.cardIds.includes(message.cardState.cardId)) {
          existingStack.cardIds.push(message.cardState.cardId)
        }
      }
      // Update the card state
      cardStore.updateCardFromServer(message.cardState.cardId, {
        x: message.cardState.x,
        y: message.cardState.y,
        z: message.cardState.z,
        faceUp: message.cardState.faceUp,
        stackId: message.stackId,
      })
      break
    }

    case 'state:sync':
      // Full state sync from server (e.g., after reconnection)
      if (ws.gameState.value) {
        cardStore.syncFromServer(ws.gameState.value, ws.handCardIds.value)
      }
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
interaction.setHandCardDropHandler((event) => handCompRef.value?.handleHandCardDrop(event) ?? false)

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

// Handle zone update from ZoneComp (label, faceUp, locked)
const onZoneUpdate = (
  zoneId: number,
  updates: { label?: string; faceUp?: boolean; locked?: boolean },
) => {
  ws.send({
    type: 'zone:update',
    zoneId,
    updates,
  })
}

// Handle zone delete from ZoneComp
const onZoneDelete = (zoneId: number) => {
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

// Connect to room on mount
onMounted(() => {
  ws.connect()

  // Wait for connection, then create or join room
  const unwatch = watch(
    () => ws.isConnected.value,
    (connected) => {
      if (connected) {
        if (isNewTable.value) {
          ws.createRoom(playerName.value)
        } else if (routeRoomCode.value) {
          ws.joinRoom(routeRoomCode.value, playerName.value)
        }
        unwatch()
      }
    },
    { immediate: true },
  )

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})

onBeforeUnmount(() => {
  interaction.drag.cancelRaf()
  ws.disconnect()
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
        <div
          class="table-header__players"
          :title="`${ws.players.value.length} player(s) connected`"
        >
          <Users :size="16" />
          <span>{{ ws.players.value.length }}</span>
        </div>
        <div
          class="table-header__status"
          :class="{ 'table-header__status--connected': ws.isConnected.value }"
          :title="ws.isConnected.value ? 'Connected' : 'Connecting...'"
        >
          <Wifi v-if="ws.isConnected.value" :size="16" />
          <WifiOff v-else :size="16" />
        </div>
      </div>
    </header>

    <!-- Canvas -->
    <div
      ref="canvasRef"
      class="canvas"
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
            dragging: interaction.drag.activeIndex.value === index,
            'in-deck': card.isInDeck,
            'stack-target':
              interaction.hover.state.ready && interaction.hover.state.cardId === card.id,
            'face-down': !card.faceUp,
            selected: cardStore.isSelected(card.id),
            shuffling:
              cardStore.shufflingStackId !== null && card.stackId === cardStore.shufflingStackId,
            'locked-by-other': isLockedByOther(card.lockedBy),
          }"
          :style="{
            '--col': interaction.getCardCol(index),
            '--row': interaction.getCardRow(index),
            '--shuffle-seed': card.id % 10,
            '--lock-color': getPlayerColor(card.lockedBy),
            left: `${card.x}px`,
            top: `${card.y}px`,
            zIndex: interaction.getCardZ(index),
            transform:
              interaction.drag.activeIndex.value === index ||
              interaction.physics.throwingCardId.value === card.id
                ? `rotate(${interaction.physics.tilt.value}deg)`
                : undefined,
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

.table-header__players {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: #a0a0b0;
  font-size: 0.875rem;
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

.canvas {
  flex: 1;
  background:
    radial-gradient(1200px 800px at 30% 25%, rgba(255, 255, 255, 0.08), transparent 55%),
    radial-gradient(900px 700px at 70% 75%, rgba(0, 0, 0, 0.25), transparent 60%),
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.02) 0 2px, rgba(0, 0, 0, 0.02) 2px 4px),
    linear-gradient(180deg, #1f7a3a 0%, #0f4f27 100%);
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.06),
    inset 0 0 80px rgba(0, 0, 0, 0.35);
  position: relative;
  overflow: hidden;
  user-select: none;
  touch-action: none;
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
