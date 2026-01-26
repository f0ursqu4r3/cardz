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
import { useCardStore } from '@/stores/cards'
import { useCardInteraction } from '@/composables/useCardInteraction'
import { useViewport } from '@/composables/useViewport'
import { useWebSocket } from '@/composables/useWebSocket'
import { useCursor } from '@/composables/useCursor'
import { useRemoteThrow } from '@/composables/useRemoteThrow'
import { useRadialMenu } from '@/composables/useRadialMenu'
import { useEntityDrag } from '@/composables/useEntityDrag'
import { useCardDisplayHelpers } from '@/composables/useCardDisplayHelpers'
import { useContextMenu } from '@/composables/useContextMenu'
import { useRadialMenuActions } from '@/composables/useRadialMenuActions'
import { useGameStateSync } from '@/composables/useGameStateSync'
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
  ZONE_DEFAULT_WIDTH,
  ZONE_DEFAULT_HEIGHT,
  CURSOR_THROTTLE_MS,
} from '@/types'
import type { TableSettings } from '../../shared/types'

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

// Space key state for pan mode
const spaceHeld = ref(false)

// Viewport (pan/zoom) management
const viewport = useViewport(canvasRef)

// Card interaction system
const interaction = useCardInteraction({
  handRef,
  sendMessage: ws.send,
  spaceHeld,
  playerId: ws.playerId,
})

// Remote throw physics
const remoteThrow = useRemoteThrow((id) => cardStore.getCardById(id))

// Radial context menu
const radialMenu = useRadialMenu()

// Activity tracking for sync throttling
let lastActivityTime = Date.now()
const trackActivity = () => {
  lastActivityTime = Date.now()
}

// Dynamic cursor class
const cursorClass = computed(() => ({
  'cursor--grabbing': viewport.isPanning.value || interaction.drag.isDragging.value,
  'cursor--grab': spaceHeld.value && !viewport.isPanning.value,
}))

// Wire viewport transform to card interaction
watch(
  () => viewport.screenToWorld,
  (fn) => {
    interaction.drag.setScreenToWorld(fn)
  },
  { immediate: true },
)

// Sync hand cards when they change
watch(
  () => ws.handCardIds.value,
  (ids) => {
    cardStore.setHandCardIds(ids)
  },
)

// Initialize card display helpers
const cardDisplayHelpers = useCardDisplayHelpers({
  cardStore,
  playerId: ws.playerId,
  players: ws.players,
  cursors: ws.cursors,
  interaction,
})

// Destructure for template use
const {
  zoneReorderPositions,
  shouldShowLockGlow,
  getCardLockColor,
  isStackBottom,
  getStackSize,
  shouldShowFaceDown,
  getCardTransform,
  getLockedCardPosition,
  getZoneReorderPosition,
} = cardDisplayHelpers

// Initialize context menu handlers
const contextMenu = useContextMenu({
  cardStore,
  radialMenu,
  viewport,
  handCompRef,
})

const {
  onCardRightClick,
  onZoneRightClick,
  onCanvasRightClick,
  onHandCardRightClick,
  onCounterRightClick,
  onTokenRightClick,
  onDieRightClick,
  onTimerRightClick,
} = contextMenu

// Initialize radial menu actions
const radialMenuActions = useRadialMenuActions({
  cardStore,
  sendMessage: ws.send,
  viewport,
  radialMenu,
  handCompRef,
  editingZoneId,
  entityRefs: {
    counters: counterRefs,
    tokens: tokenRefs,
    dice: dieRefs,
    timers: timerRefs,
  },
  trackActivity,
  setDieRolling: cardStore.setDieRolling,
})

const { onRadialMenuSelect } = radialMenuActions

// Initialize game state sync (handles all WebSocket messages)
useGameStateSync({
  cardStore,
  ws,
  remoteThrow,
  router,
  playerName,
})

// Initialize entity drag handlers
const counterDrag = useEntityDrag({
  entityType: 'counter',
  getEntityById: cardStore.getCounterById,
  playerId: ws.playerId,
  players: ws.players,
  viewport,
  sendMessage: ws.send,
  trackActivity,
})

const tokenDrag = useEntityDrag({
  entityType: 'token',
  getEntityById: cardStore.getTokenById,
  playerId: ws.playerId,
  players: ws.players,
  viewport,
  sendMessage: ws.send,
  trackActivity,
})

const dieDrag = useEntityDrag({
  entityType: 'die',
  getEntityById: cardStore.getDieById,
  playerId: ws.playerId,
  players: ws.players,
  viewport,
  sendMessage: ws.send,
  trackActivity,
})

const timerDrag = useEntityDrag({
  entityType: 'timer',
  getEntityById: cardStore.getTimerById,
  playerId: ws.playerId,
  players: ws.players,
  viewport,
  sendMessage: ws.send,
  trackActivity,
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

// Check if we're in zone reordering mode
const isZoneReordering = computed(() => {
  return (
    interaction.drag.target.value?.type === 'hand-card' &&
    interaction.zoneDragSource.value !== null &&
    interaction.zoneDropTargetIndex.value !== null
  )
})

// Ghost card for zone reordering
const zoneGhostCard = computed(() => {
  if (!isZoneReordering.value) return null

  const source = interaction.zoneDragSource.value
  if (!source) return null

  const targetIndex = interaction.zoneDropTargetIndex.value
  if (targetIndex === null) return null

  // Get the card ID from the stack using the card index
  const stack = cardStore.stacks.find((s) => s.id === source.stackId)
  if (!stack) return null

  const cardId = stack.cardIds[source.cardIndex]
  if (cardId === undefined) return null

  const card = cardStore.getCardById(cardId)
  if (!card) return null

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

// Wire up hand card drop handler
interaction.setHandCardDropHandler((event) => {
  const result = handCompRef.value?.handleHandCardDrop(event)
  if (!result) return false

  // If cards were removed from hand (dropped on table), notify server
  if (result.removedCards && result.removedCards.length > 0) {
    for (const removed of result.removedCards) {
      const card = cardStore.getCardById(removed.cardId)
      if (card) {
        card.x = removed.x
        card.y = removed.y
        trackActivity()
        ws.send({
          type: 'hand:remove',
          cardId: removed.cardId,
          x: removed.x,
          y: removed.y,
          faceUp: removed.faceUp,
        })
      }
    }
  }

  return true
})

// Pointer up handler (used by both cards and hand)
const onPointerUp = (event: PointerEvent) => {
  interaction.onCardPointerUp(event)
}

// Zone handlers
const isZoneDragging = (zoneId: number): boolean => {
  const target = interaction.drag.target.value
  return (
    (target?.type === 'zone' && target.zoneId === zoneId) ||
    (target?.type === 'zone-resize' && target.zoneId === zoneId)
  )
}

const addZone = () => {
  const bounds = viewport.getVisibleBounds()
  const centerX = bounds.x + bounds.width / 2 - ZONE_DEFAULT_WIDTH / 2
  const centerY = bounds.y + bounds.height / 2 - ZONE_DEFAULT_HEIGHT / 2

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

const onZoneUpdate = (zoneId: number, updates: Record<string, unknown>) => {
  trackActivity()
  ws.send({
    type: 'zone:update',
    zoneId,
    updates,
  })
}

const onZoneDelete = (zoneId: number) => {
  trackActivity()
  ws.send({ type: 'zone:delete', zoneId })
  editingZoneId.value = null
}

// Entity creation handlers
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

const onCounterIncrement = (counterId: number, delta: number) => {
  trackActivity()
  ws.send({
    type: 'counter:increment',
    counterId,
    delta,
  })
}

const onCounterUpdate = (counterId: number, updates: Record<string, unknown>) => {
  trackActivity()
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

const onCounterDelete = (counterId: number) => {
  trackActivity()
  ws.send({
    type: 'counter:delete',
    counterId,
  })
}

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

const onTokenUpdate = (tokenId: number, updates: Record<string, unknown>) => {
  trackActivity()
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

const onTokenDelete = (tokenId: number) => {
  trackActivity()
  ws.send({
    type: 'token:delete',
    tokenId,
  })
}

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

const onDieRoll = (dieId: number) => {
  trackActivity()
  cardStore.setDieRolling(dieId, true)
  ws.send({
    type: 'die:roll',
    dieId,
  })
}

const onDieUpdate = (dieId: number, updates: Record<string, unknown>) => {
  trackActivity()
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

const onDieDelete = (dieId: number) => {
  trackActivity()
  ws.send({
    type: 'die:delete',
    dieId,
  })
}

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

const onTimerStart = (timerId: number) => {
  trackActivity()
  ws.send({
    type: 'timer:start',
    timerId,
  })
}

const onTimerPause = (timerId: number) => {
  trackActivity()
  ws.send({
    type: 'timer:pause',
    timerId,
  })
}

const onTimerReset = (timerId: number) => {
  trackActivity()
  ws.send({
    type: 'timer:reset',
    timerId,
  })
}

const onTimerUpdate = (timerId: number, updates: Record<string, unknown>) => {
  trackActivity()
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

const onTimerDelete = (timerId: number) => {
  trackActivity()
  ws.send({
    type: 'timer:delete',
    timerId,
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
          :is-dragging="counterDrag.isDragging(counter.id)"
          :is-locked-by-other="counterDrag.isLockedByOther(counter)"
          :lock-color="counterDrag.getLockColor(counter)"
          @pointerdown="counterDrag.onPointerDown($event, counter.id)"
          @pointermove="counterDrag.onPointerMove"
          @pointerup="counterDrag.onPointerUp"
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
          :is-dragging="tokenDrag.isDragging(token.id)"
          :is-locked-by-other="tokenDrag.isLockedByOther(token)"
          :lock-color="tokenDrag.getLockColor(token)"
          @pointerdown="tokenDrag.onPointerDown($event, token.id)"
          @pointermove="tokenDrag.onPointerMove"
          @pointerup="tokenDrag.onPointerUp"
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
          :is-dragging="dieDrag.isDragging(die.id)"
          :is-locked-by-other="dieDrag.isLockedByOther(die)"
          :lock-color="dieDrag.getLockColor(die)"
          @pointerdown="dieDrag.onPointerDown($event, die.id)"
          @pointermove="dieDrag.onPointerMove"
          @pointerup="dieDrag.onPointerUp"
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
          :is-dragging="timerDrag.isDragging(timer.id)"
          :is-locked-by-other="timerDrag.isLockedByOther(timer)"
          :lock-color="timerDrag.getLockColor(timer)"
          @pointerdown="timerDrag.onPointerDown($event, timer.id)"
          @pointermove="timerDrag.onPointerMove"
          @pointerup="timerDrag.onPointerUp"
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
                card.stackId === interaction.drag.target.value.stackId),
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
  z-index: 3000;
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
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.2s;
}

.table-header__back:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.4);
  color: #ef4444;
}

.table-header__info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.table-header__title {
  font-size: 1.125rem;
  font-weight: 600;
  color: white;
  margin: 0;
}

.table-header__room {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  background: rgba(255, 255, 255, 0.08);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.table-header__code {
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.9);
  letter-spacing: 0.05em;
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
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.2s;
}

.table-header__copy:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.table-header__copy--copied {
  color: #22c55e;
}

.table-header__new-badge {
  font-size: 0.75rem;
  color: #22c55e;
  background: rgba(34, 197, 94, 0.15);
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
}

.table-header__right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  position: relative;
}

.table-header__players-wrapper {
  position: relative;
}

.table-header__players {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.875rem;
}

.table-header__players:hover,
.table-header__players--active {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
}

.table-header__settings {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.2s;
}

.table-header__settings:hover,
.table-header__settings--active {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
  color: white;
}

.table-header__status {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: rgba(255, 255, 255, 0.4);
}

.table-header__status--connected {
  color: #22c55e;
}

.canvas {
  flex: 1;
  position: relative;
  overflow: hidden;
  touch-action: none;
}

.table-ui {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 2500;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.table-ui__add-panel {
  margin-top: 0.5rem;
}

.world {
  position: absolute;
  transform-origin: 0 0;
  will-change: transform;
  z-index: 1;
}

/* Card states */
:deep(.card) {
  position: absolute;
  transition:
    box-shadow 0.15s ease,
    filter 0.15s ease;
}

:deep(.card.dragging) {
  filter: brightness(1.1);
  /* Optimize for position changes during drag */
  will-change: left, top, transform;
  transition: none !important;
}

/* Shadow only on bottom card of dragged stack (or single dragged card) */
:deep(.card.dragging:not(.in-stack)),
:deep(.card.dragging.stack-bottom) {
  box-shadow:
    0 15px 35px rgba(0, 0, 0, 0.4),
    0 5px 15px rgba(0, 0, 0, 0.3);
}

/* Non-bottom cards in dragged stack: no shadow */
:deep(.card.dragging.in-stack:not(.stack-bottom)) {
  box-shadow: none;
}

:deep(.card.stack-bottom) {
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.3),
    calc(var(--stack-size, 1) * 0.5px) calc(var(--stack-size, 1) * -0.5px) 0
      rgba(255, 255, 255, 0.1);
}

:deep(.card.stack-target) {
  box-shadow:
    0 0 0 2px #22c55e,
    0 4px 12px rgba(34, 197, 94, 0.3);
}

:deep(.card.selected) {
  box-shadow:
    0 0 0 2px #3b82f6,
    0 4px 12px rgba(59, 130, 246, 0.3);
}

:deep(.card.shuffling) {
  animation: shuffle 0.3s ease-in-out;
  animation-delay: calc(var(--shuffle-seed, 0) * 0.02s);
}

@keyframes shuffle {
  0%,
  100% {
    transform: translateX(0) rotate(0deg);
  }
  25% {
    transform: translateX(calc(-5px + var(--shuffle-seed, 0) * 1px)) rotate(-2deg);
  }
  75% {
    transform: translateX(calc(5px - var(--shuffle-seed, 0) * 1px)) rotate(2deg);
  }
}

:deep(.card.locked-by-other) {
  box-shadow:
    0 0 0 2px var(--lock-color, #888),
    0 0 12px var(--lock-color, #888);
  pointer-events: none;
}

:deep(.card.zone-reorder-shift) {
  transition:
    left 0.15s ease,
    top 0.15s ease;
}

:deep(.card.hand-ghost) {
  opacity: 0.8;
  pointer-events: none;
  box-shadow:
    0 10px 25px rgba(0, 0, 0, 0.3),
    0 4px 10px rgba(0, 0, 0, 0.2);
}

:deep(.card.zone-ghost) {
  opacity: 0.5;
  pointer-events: none;
}

.selection-indicator {
  position: fixed;
  bottom: 120px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(59, 130, 246, 0.9);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  z-index: 200;
}
</style>
