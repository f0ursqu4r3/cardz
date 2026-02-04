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
import ActivityPanel from '@/components/ui/ActivityPanel.vue'
import InstructionsPanel from '@/components/ui/InstructionsPanel.vue'
import RadialMenu from '@/components/ui/RadialMenu.vue'
import { useCardStore } from '@/stores/cards'
import { useCardInteraction } from '@/composables/useCardInteraction'
import { useViewport } from '@/composables/useViewport'
import { useWebSocket } from '@/composables/useWebSocket'
import { useCursor } from '@/composables/useCursor'
import { useRemoteThrow } from '@/composables/useRemoteThrow'
import { useRadialMenu } from '@/composables/useRadialMenu'
import { useAllEntityManagers } from '@/composables/useEntityManager'
import { useCardDisplayHelpers } from '@/composables/useCardDisplayHelpers'
import { useContextMenu } from '@/composables/useContextMenu'
import { useRadialMenuActions } from '@/composables/useRadialMenuActions'
import { useGameStateSync } from '@/composables/useGameStateSync'
import { useToast } from '@/composables/useToast'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { usePerformanceSettings, type PerformanceSettings } from '@/composables/usePerformanceSettings'
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
  ChevronDown,
  Timer,
  MessageCircle,
  Activity,
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

// Player profile from localStorage
const profile = usePlayerProfile()
const playerName = computed(() => profile.name.value || 'Player')
const performance = usePerformanceSettings()
const performanceClasses = computed(() => ({
  'table-view--low-latency': performance.settings.value.lowLatencyDrag,
  'table-view--reduced-effects': performance.settings.value.reduceEffects,
}))

// Room info from route
const routeRoomCode = computed(() => (route.params.code as string)?.toUpperCase() || null)
const tableName = computed(() => (route.query.tableName as string) || '')
const isPublicTable = computed(() => route.query.public === 'true')
const isNewTable = computed(() => route.name === 'table-new')
const inviteToken = computed(() => (route.query.invite as string) || '')
const inviteLink = computed(() => {
  if (!ws.roomCode.value || !ws.inviteToken.value) return ''
  return `${window.location.origin}/table/${ws.roomCode.value}?invite=${ws.inviteToken.value}`
})

// WebSocket connection
const ws = useWebSocket()
const codeCopied = ref(false)
const showSettings = ref(false)
const showPlayers = ref(false)
const showChat = ref(false)
const showActivity = ref(false)
const showInstructions = ref(false)
const editingZoneId = ref<number | null>(null)
const requestToPlaySent = ref(false)
const showZoneTemplates = ref(false)

// Get current player's color for cursor
const playerColor = computed(() => {
  const player = ws.players.value.find((p) => p.id === ws.playerId.value)
  return player?.color || '#ef4444' // Default to red
})

// Notify if assigned color differs from preferred (one-time check after joining)
const colorMismatchChecked = ref(false)
watch(
  () => ws.playerId.value && ws.players.value.length > 0,
  (ready) => {
    if (ready && !colorMismatchChecked.value) {
      colorMismatchChecked.value = true
      const player = ws.players.value.find((p) => p.id === ws.playerId.value)
      if (player && profile.preferredColor.value && player.color !== profile.preferredColor.value) {
        toast.info('Your preferred color was taken')
      }
    }
  },
  { immediate: true },
)

// Sync player profile to localStorage when it changes (from panel edits)
watch(
  () => {
    const player = ws.players.value.find((p) => p.id === ws.playerId.value)
    return player ? { name: player.name, color: player.color } : null
  },
  (playerInfo) => {
    if (playerInfo && colorMismatchChecked.value) {
      // Only sync after initial join (when colorMismatchChecked is true)
      if (playerInfo.name && playerInfo.name !== profile.name.value) {
        profile.name.value = playerInfo.name
      }
      if (playerInfo.color && playerInfo.color !== profile.preferredColor.value) {
        profile.preferredColor.value = playerInfo.color
      }
    }
  },
)

// Check if current player is the table creator
const isCreator = computed(() => {
  const player = ws.players.value.find((p) => p.id === ws.playerId.value)
  return player?.role === 'creator'
})

// Check if current player is a moderator
const isModerator = computed(() => {
  const player = ws.players.value.find((p) => p.id === ws.playerId.value)
  return player?.role === 'moderator'
})

const isSpectator = computed(() => {
  const player = ws.players.value.find((p) => p.id === ws.playerId.value)
  return player?.role === 'spectator'
})

const isReadOnly = computed(() => {
  if (isSpectator.value) return true
  return (
    ws.tableSettings.value.permissionsPreset === 'host-only' && !isCreator.value && !isModerator.value
  )
})

const canUndoRedo = computed(() => isCreator.value || isModerator.value)

const lastSpectatorNoticeAt = ref(0)
const showSpectatorNotice = (message = 'Spectators are view-only. Request to play to interact.') => {
  const now = Date.now()
  if (now - lastSpectatorNoticeAt.value < 2000) return
  lastSpectatorNoticeAt.value = now
  toast.info(message)
}

const canInteract = () => {
  if (!isReadOnly.value) return true
  if (isSpectator.value) {
    showSpectatorNotice()
  } else {
    toast.info('Only the table creator or moderators can interact right now.')
  }
  return false
}

const canManageSnapshots = computed(() => isCreator.value)

const hasConnectedOnce = ref(false)
watch(
  () => ws.isConnected.value,
  (connected) => {
    if (connected) {
      hasConnectedOnce.value = true
    }
  },
  { immediate: true },
)

const connectionStatusLabel = computed(() => {
  if (ws.isConnected.value) return 'Connected'
  if (ws.isReconnecting.value) return 'Reconnecting...'
  return hasConnectedOnce.value ? 'Disconnected' : 'Connecting...'
})

// Colors used by other players (for color selection in edit mode)
const usedColors = computed(() => {
  return new Set(
    ws.players.value
      .filter((p) => p.id !== ws.playerId.value)
      .map((p) => p.color)
  )
})

const connectedPlayersCount = computed(
  () => ws.players.value.filter((p) => p.connected).length,
)
const totalPlayersCount = computed(() => ws.players.value.length)
const playersCountLabel = computed(() =>
  connectedPlayersCount.value === totalPlayersCount.value
    ? `${connectedPlayersCount.value}`
    : `${connectedPlayersCount.value}/${totalPlayersCount.value}`,
)

// Custom cursor based on player color (sets up global style via side effect)
const cursor = useCursor(playerColor)

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
  onCursorMove: (worldX, worldY) => {
    ws.send({ type: 'cursor:update', x: worldX, y: worldY, state: 'grabbing' })
  },
})

// Remote throw physics
const remoteThrow = useRemoteThrow((id) => cardStore.getCardById(id))

// Radial context menu
const radialMenu = useRadialMenu()

watch(
  () => isSpectator.value,
  (spectating) => {
    if (spectating) {
      radialMenu.close()
      cardStore.clearSelection()
      cardStore.clearDieSelection()
    } else {
      requestToPlaySent.value = false
    }
  },
)

// Activity tracking for sync throttling
let lastActivityTime = Date.now()
const trackActivity = () => {
  lastActivityTime = Date.now()
}

// Dynamic cursor class
const cursorClass = computed(() => ({
  'cursor--grabbing':
    viewport.isPanning.value ||
    interaction.drag.isDragging.value ||
    cursor.cursorType.value === 'grabbing',
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

// Broadcast selection changes to other players
watch(
  () => [...cardStore.selectedIds],
  (cardIds) => {
    if (ws.isConnected.value) {
      ws.send({ type: 'selection:update', cardIds })
    }
  },
  { deep: true },
)

// Toast notifications
const toast = useToast()

// Watch for WebSocket errors and display them
watch(
  () => ws.error.value,
  (error) => {
    if (error) {
      console.error('[TableView] WebSocket error:', error)
      toast.error(error)
      // Clear the error after showing it
      ws.error.value = null
    }
  },
)

// Watch for kick/ban and redirect to landing page
watch(
  () => ws.kickedReason.value,
  (reason) => {
    if (reason) {
      console.log('[TableView] Player kicked/banned:', reason)
      // Store the reason to show on landing page
      sessionStorage.setItem('cardz_kicked_reason', reason)
      // Disconnect and redirect
      ws.disconnect()
      router.push({ name: 'landing' })
    }
  },
)

watch(
  () => showSettings.value,
  (open) => {
    if (open && ws.isConnected.value) {
      ws.listSnapshots()
    }
  },
)

const reconnectToastShown = ref(false)
watch(
  () => ws.isReconnecting.value,
  (reconnecting) => {
    if (reconnecting && !reconnectToastShown.value) {
      reconnectToastShown.value = true
      toast.info('Connection lost. Reconnecting...')
    }
    if (!reconnecting) {
      reconnectToastShown.value = false
    }
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
} = contextMenu

const onCardRightClickGuarded = (event: MouseEvent, index: number) => {
  if (!canInteract()) return
  onCardRightClick(event, index)
}

const onZoneRightClickGuarded = (event: MouseEvent, zoneId: number) => {
  if (!canInteract()) return
  onZoneRightClick(event, zoneId)
}

const onCanvasRightClickGuarded = (event: MouseEvent) => {
  if (!canInteract()) return
  onCanvasRightClick(event)
}

const onHandCardRightClickGuarded = (event: MouseEvent, cardId: number) => {
  if (!canInteract()) return
  onHandCardRightClick(event, cardId)
}

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
})

// Callback to broadcast cursor position during entity drags
const onEntityCursorMove = (worldX: number, worldY: number) => {
  ws.send({ type: 'cursor:update', x: worldX, y: worldY, state: 'grabbing' })
}

// Initialize all entity managers (replaces 4 separate useEntityDrag calls)
const entities = useAllEntityManagers({
  cardStore,
  playerId: ws.playerId,
  players: ws.players,
  viewport,
  radialMenu,
  sendMessage: ws.send,
  trackActivity,
  setCursor: cursor.setCursor,
  onCursorMove: onEntityCursorMove,
  onDieShake: (dieId) => {
    // Roll the shaken die and all selected dice
    const dieSelection = entities.die.selection
    if (dieSelection?.isSelected(dieId) && (dieSelection.selectionCount.value ?? 0) > 1) {
      // Roll all selected dice
      dieSelection.getSelectedIds().forEach((id) => {
        cardStore.setDieRolling(id, true)
        ws.send({ type: 'die:roll', dieId: id })
      })
    } else {
      // Just roll the single die
      cardStore.setDieRolling(dieId, true)
      ws.send({ type: 'die:roll', dieId })
    }
  },
  dieSelectionState: {
    isSelected: cardStore.isDieSelected,
    toggleSelect: cardStore.toggleDieSelect,
    clearSelection: cardStore.clearDieSelection,
    hasSelection: () => cardStore.hasDieSelection,
    selectionCount: () => cardStore.dieSelectionCount,
    getSelectedIds: cardStore.getSelectedDieIds,
  },
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

type ZoneTemplate = {
  id: string
  label: string
  description: string
  width?: number
  height?: number
  faceUp: boolean
  visibility: 'public' | 'owner' | 'hidden'
  layout: 'stack' | 'row' | 'column' | 'grid' | 'fan' | 'circle'
  cardSettings?: {
    cardScale: number
    cardSpacing: number
    randomOffset?: number
    randomRotation?: number
  }
}

const defaultZoneTemplate: ZoneTemplate = {
  id: 'custom',
  label: 'New Zone',
  description: 'Blank zone',
  faceUp: false,
  visibility: 'public',
  layout: 'stack',
}

const zoneTemplates: ZoneTemplate[] = [
  {
    id: 'deck',
    label: 'Deck',
    description: 'Hidden stack',
    faceUp: false,
    visibility: 'hidden',
    layout: 'stack',
  },
  {
    id: 'discard',
    label: 'Discard',
    description: 'Face-up stack',
    faceUp: true,
    visibility: 'public',
    layout: 'stack',
  },
  {
    id: 'private',
    label: 'Private',
    description: 'Owner-only row',
    faceUp: true,
    visibility: 'owner',
    layout: 'row',
    width: ZONE_DEFAULT_WIDTH * 2,
    cardSettings: { cardScale: 1.0, cardSpacing: 0.6 },
  },
  {
    id: 'row',
    label: 'Row',
    description: 'Public row',
    faceUp: true,
    visibility: 'public',
    layout: 'row',
    width: ZONE_DEFAULT_WIDTH * 2,
    cardSettings: { cardScale: 1.0, cardSpacing: 0.6 },
  },
  {
    id: 'grid',
    label: 'Grid',
    description: 'Public grid',
    faceUp: true,
    visibility: 'public',
    layout: 'grid',
    width: ZONE_DEFAULT_WIDTH * 2.2,
    height: ZONE_DEFAULT_HEIGHT * 1.6,
    cardSettings: { cardScale: 0.95, cardSpacing: 0.7 },
  },
]

const toggleZoneTemplates = () => {
  showZoneTemplates.value = !showZoneTemplates.value
}

const closeZoneTemplates = () => {
  showZoneTemplates.value = false
}

const createZoneFromTemplate = (template: ZoneTemplate) => {
  if (!canInteract()) return
  const bounds = viewport.getVisibleBounds()
  const width = template.width ?? ZONE_DEFAULT_WIDTH
  const height = template.height ?? ZONE_DEFAULT_HEIGHT
  const centerX = bounds.x + bounds.width / 2 - width / 2
  const centerY = bounds.y + bounds.height / 2 - height / 2

  trackActivity()
  const payload: {
    type: 'zone:create'
    x: number
    y: number
    width: number
    height: number
    label: string
    faceUp: boolean
    visibility?: 'public' | 'owner' | 'hidden'
    layout?: 'stack' | 'row' | 'column' | 'grid' | 'fan' | 'circle'
    cardSettings?: {
      cardScale: number
      cardSpacing: number
      randomOffset?: number
      randomRotation?: number
    }
  } = {
    type: 'zone:create',
    x: centerX,
    y: centerY,
    width,
    height,
    label: template.label,
    faceUp: template.faceUp,
    visibility: template.visibility,
    layout: template.layout,
  }
  if (template.cardSettings) {
    payload.cardSettings = template.cardSettings
  }
  ws.send(payload)
  closeZoneTemplates()
}

const addZone = () => {
  createZoneFromTemplate(defaultZoneTemplate)
}

const onZoneUpdate = (zoneId: number, updates: Record<string, unknown>) => {
  if (!canInteract()) return
  trackActivity()
  ws.send({
    type: 'zone:update',
    zoneId,
    updates,
  })
}

const onZoneDelete = (zoneId: number) => {
  if (!canInteract()) return
  trackActivity()
  ws.send({ type: 'zone:delete', zoneId })
  editingZoneId.value = null
}

// Entity creation handlers
const addCounter = () => {
  if (!canInteract()) return
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
  if (!canInteract()) return
  trackActivity()
  ws.send({
    type: 'counter:increment',
    counterId,
    delta,
  })
}

const onCounterUpdate = (counterId: number, updates: Record<string, unknown>) => {
  if (!canInteract()) return
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
  if (!canInteract()) return
  trackActivity()
  ws.send({
    type: 'counter:delete',
    counterId,
  })
}

const addColorToken = () => {
  if (!canInteract()) return
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
  if (!canInteract()) return
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
  if (!canInteract()) return
  trackActivity()
  ws.send({
    type: 'token:delete',
    tokenId,
  })
}

const addDie = () => {
  if (!canInteract()) return
  const bounds = viewport.getVisibleBounds()
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2

  trackActivity()
  ws.send({
    type: 'die:create',
    x: centerX,
    y: centerY,
    color: '#f5f5f5',
    pipColor: '#1a1a1a',
  })
}

const onDieRoll = (dieId: number) => {
  if (!canInteract()) return
  trackActivity()
  cardStore.setDieRolling(dieId, true)
  ws.send({
    type: 'die:roll',
    dieId,
  })
}

const onDieUpdate = (dieId: number, updates: Record<string, unknown>) => {
  if (!canInteract()) return
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
  if (!canInteract()) return
  trackActivity()
  ws.send({
    type: 'die:delete',
    dieId,
  })
}

const addTimer = (mode: 'countdown' | 'stopwatch' = 'countdown') => {
  if (!canInteract()) return
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
  if (!canInteract()) return
  trackActivity()
  ws.send({
    type: 'timer:start',
    timerId,
  })
}

const onTimerPause = (timerId: number) => {
  if (!canInteract()) return
  trackActivity()
  ws.send({
    type: 'timer:pause',
    timerId,
  })
}

const onTimerReset = (timerId: number) => {
  if (!canInteract()) return
  trackActivity()
  ws.send({
    type: 'timer:reset',
    timerId,
  })
}

const onTimerUpdate = (timerId: number, updates: Record<string, unknown>) => {
  if (!canInteract()) return
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
  if (!canInteract()) return
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
  if (!canInteract()) return
  ws.updateTableSettings(settings)
}

const handleVisibilityUpdate = (isPublic: boolean) => {
  if (!canInteract()) return
  ws.updateTableVisibility(isPublic)
}

const handleNameUpdate = (name: string) => {
  if (!canInteract()) return
  ws.updateTableName(name)
}

const handlePerformanceUpdate = (updates: Partial<PerformanceSettings>) => {
  performance.updateSettings(updates)
}

const handleTableReset = () => {
  if (!canInteract()) return
  ws.resetTable()
  showSettings.value = false
}

const handleUndo = () => {
  if (!canUndoRedo.value) {
    toast.error('Only the table creator or moderators can undo')
    return
  }
  if (!canInteract()) return
  if (!ws.isConnected.value) {
    toast.error('Not connected yet')
    return
  }
  ws.undoTable()
}

const handleRedo = () => {
  if (!canUndoRedo.value) {
    toast.error('Only the table creator or moderators can redo')
    return
  }
  if (!canInteract()) return
  if (!ws.isConnected.value) {
    toast.error('Not connected yet')
    return
  }
  ws.redoTable()
}

const handleSnapshotCreate = (name?: string) => {
  if (!canManageSnapshots.value) {
    toast.error('Only the table creator can create snapshots')
    return
  }
  ws.createSnapshot(name)
}

const handleSnapshotRestore = (snapshotId: number) => {
  if (!canManageSnapshots.value) {
    toast.error('Only the table creator can restore snapshots')
    return
  }
  ws.restoreSnapshot(snapshotId)
}

const requestToPlay = () => {
  if (!isSpectator.value) return
  if (!ws.isConnected.value) {
    toast.error('Not connected yet')
    return
  }
  if (requestToPlaySent.value) {
    toast.info('Request already sent')
    return
  }
  ws.sendChat('Requesting to join as a player.')
  requestToPlaySent.value = true
  setTimeout(() => {
    requestToPlaySent.value = false
  }, 30_000)
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

  if ((event.metaKey || event.ctrlKey) && !event.altKey) {
    if (event.code === 'KeyZ') {
      event.preventDefault()
      if (event.shiftKey) {
        handleRedo()
      } else {
        handleUndo()
      }
      return
    }
    if (event.code === 'KeyY') {
      event.preventDefault()
      handleRedo()
      return
    }
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

const touchPointers = new Map<number, { x: number; y: number }>()
let isPinching = false
let pinchStartDistance = 0
let pinchStartZoom = 1

const isTouchPanTarget = (event: PointerEvent): boolean => {
  const target = event.target as HTMLElement | null
  if (!target) return false
  if (
    target.closest('.table-ui') ||
    target.closest('.table-header') ||
    target.closest('.panels-container-top-left') ||
    target.closest('.panels-container-bottom-right') ||
    target.closest('.mobile-hud')
  ) {
    return false
  }
  if (
    target.closest('.card') ||
    target.closest('.token') ||
    target.closest('.die') ||
    target.closest('.counter') ||
    target.closest('.timer') ||
    target.closest('.zone') ||
    target.closest('.hand')
  ) {
    return false
  }
  return true
}

const updateTouchPointer = (event: PointerEvent) => {
  touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
}

const getPinchMetrics = () => {
  const points = Array.from(touchPointers.values())
  if (points.length < 2) return null
  const [p1, p2] = points
  if (!p1 || !p2) return null
  const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  const centerX = (p1.x + p2.x) / 2
  const centerY = (p1.y + p2.y) / 2
  return { distance, centerX, centerY }
}

// Canvas pointer handlers for panning
const onCanvasPointerDown = (event: PointerEvent) => {
  // Close radial menu on any click
  radialMenu.close()
  showZoneTemplates.value = false

  // Close any open panels when clicking on canvas
  showSettings.value = false
  showPlayers.value = false

  if (event.pointerType === 'touch') {
    updateTouchPointer(event)
    if (touchPointers.size >= 2) {
      const metrics = getPinchMetrics()
      if (metrics) {
        isPinching = true
        pinchStartDistance = metrics.distance
        pinchStartZoom = viewport.zoom.value
        viewport.endPan()
        interaction.drag.reset()
        event.preventDefault()
        return
      }
    }

    if (isTouchPanTarget(event)) {
      event.preventDefault()
      viewport.startPan(event)
      ;(event.target as HTMLElement)?.setPointerCapture(event.pointerId)
      return
    }
  }

  // Clear all selections when clicking on empty canvas (left-click only)
  if (event.button === 0 && !spaceHeld.value) {
    cardStore.clearSelection()
    cardStore.clearDieSelection()
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
let lastCursorPosition = { x: 0, y: 0 }

const sendCursorUpdate = (x: number, y: number, state: 'default' | 'grab' | 'grabbing') => {
  const now = Date.now()
  // Always send if state changed, otherwise throttle
  if (state === lastCursorState && now - lastCursorSend < CURSOR_THROTTLE_MS) return
  lastCursorSend = now
  lastCursorState = state
  lastCursorPosition = { x, y }

  ws.send({ type: 'cursor:update', x, y, state })
}

// Send cursor state update when any drag state changes (forces immediate broadcast)
const sendCursorStateChange = () => {
  const state = getCursorState()
  if (state !== lastCursorState) {
    lastCursorState = state
    ws.send({ type: 'cursor:update', x: lastCursorPosition.x, y: lastCursorPosition.y, state })
  }
}

// Watch all drag states to broadcast cursor changes
watch(() => interaction.drag.isDragging.value, sendCursorStateChange)
watch(() => entities.counter.draggingId.value, sendCursorStateChange)
watch(() => entities.token.draggingId.value, sendCursorStateChange)
watch(() => entities.die.draggingId.value, sendCursorStateChange)
watch(() => entities.timer.draggingId.value, sendCursorStateChange)

// Get current cursor state for sending
const getCursorState = (): 'default' | 'grab' | 'grabbing' => {
  // Check all drag states
  if (interaction.drag.isDragging.value) return 'grabbing'
  if (entities.counter.draggingId.value !== null) return 'grabbing'
  if (entities.token.draggingId.value !== null) return 'grabbing'
  if (entities.die.draggingId.value !== null) return 'grabbing'
  if (entities.timer.draggingId.value !== null) return 'grabbing'
  return 'default'
}

const onCanvasPointerMove = (event: PointerEvent) => {
  if (event.pointerType === 'touch') {
    if (touchPointers.has(event.pointerId)) {
      updateTouchPointer(event)
    }
    if (isPinching && touchPointers.size >= 2) {
      const metrics = getPinchMetrics()
      if (metrics && pinchStartDistance > 0) {
        const scale = metrics.distance / pinchStartDistance
        const targetZoom = pinchStartZoom * scale
        viewport.zoomTo(metrics.centerX, metrics.centerY, targetZoom)
      }
      return
    }
  }

  if (viewport.isPanning.value) {
    viewport.updatePan(event)
  }

  // Track cursor position in world coordinates (always update for state change broadcasts)
  const worldPos = viewport.screenToWorld(event.clientX, event.clientY)
  lastCursorPosition = { x: worldPos.x, y: worldPos.y }
  sendCursorUpdate(worldPos.x, worldPos.y, getCursorState())
}

const onCanvasPointerUp = (event: PointerEvent) => {
  if (event.pointerType === 'touch') {
    touchPointers.delete(event.pointerId)
    if (isPinching && touchPointers.size < 2) {
      isPinching = false
      pinchStartDistance = 0
    }
  }
  if (viewport.isPanning.value) {
    viewport.endPan()
    ;(event.target as HTMLElement)?.releasePointerCapture(event.pointerId)
  }
}

// Periodic state sync - only after inactivity
const STATE_SYNC_INTERVAL = 30_000
const INACTIVITY_THRESHOLD = 5_000 // Only sync after 5 seconds of inactivity
let syncInterval: ReturnType<typeof setInterval> | null = null

// Handle player join/leave notifications
const handlePlayerEvents = (message: {
  type: string
  player?: { name: string }
  playerId?: string
  playerName?: string
  kickedBy?: string
  bannedBy?: string
  isReconnect?: boolean
  snapshot?: { name: string }
}) => {
  switch (message.type) {
    case 'room:joined':
      if (message.isReconnect) {
        toast.success('Reconnected')
      }
      break
    case 'room:player_joined':
      if (message.player) {
        toast.info(`${message.player.name} joined the table`)
      }
      break
    case 'room:player_disconnected': {
      const disconnectedPlayer = ws.players.value.find((p) => p.id === message.playerId)
      if (disconnectedPlayer) {
        toast.info(`${disconnectedPlayer.name} disconnected`)
      }
      break
    }
    case 'room:player_reconnected':
      if (message.player) {
        toast.info(`${message.player.name} reconnected`)
      }
      break
    case 'room:player_left':
      // Find the player name from current players list before they're removed
      const leftPlayer = ws.players.value.find(p => p.id === message.playerId)
      if (leftPlayer) {
        toast.info(`${leftPlayer.name} left the table`)
      }
      break
    case 'room:player_kicked':
      // Only show toast for other players being kicked (not ourselves)
      if (message.playerId !== ws.playerId.value && message.playerName) {
        toast.info(`${message.playerName} was kicked by ${message.kickedBy}`)
      }
      break
    case 'room:player_banned':
      // Only show toast for other players being banned (not ourselves)
      if (message.playerId !== ws.playerId.value && message.playerName) {
        toast.info(`${message.playerName} was banned by ${message.bannedBy}`)
      }
      break
    case 'table:snapshot_restored':
      toast.success(
        message.snapshot?.name ? `Snapshot restored: ${message.snapshot.name}` : 'Snapshot restored',
      )
      break
  }
}

// Connect to room on mount
onMounted(() => {
  ws.connect()

  // Listen for player events to show toasts
  ws.onMessage(handlePlayerEvents)

  // Wait for connection, then create or join room
  const unwatch = watch(
    () => ws.isConnected.value,
    (connected) => {
      if (connected) {
        if (isNewTable.value) {
          ws.createRoom(playerName.value, {
            tableName: tableName.value || undefined,
            isPublic: isPublicTable.value || undefined,
            preferredColor: profile.preferredColor.value,
          })
        } else if (routeRoomCode.value) {
          ws.joinRoom(
            routeRoomCode.value,
            playerName.value,
            profile.preferredColor.value,
            inviteToken.value || undefined,
          )
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
  ws.offMessage(handlePlayerEvents)
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
  <div
    class="table-view"
    :class="[cursorClass, performanceClasses, { 'table-view--spectator': isSpectator }]"
    @contextmenu.prevent
  >
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
            :title="`${connectedPlayersCount} connected / ${totalPlayersCount} total`"
            @click="showPlayers = !showPlayers"
          >
            <Users :size="16" />
            <span>{{ playersCountLabel }}</span>
          </button>
          <PlayersPanel
            v-if="showPlayers"
            :players="ws.players.value"
            :hand-counts="ws.handCounts.value"
            :current-player-id="ws.playerId.value"
            :own-hand-count="cardStore.handCount"
            :is-creator="isCreator"
            :is-moderator="isModerator"
            :used-colors="usedColors"
            @close="showPlayers = false"
            @kick="ws.kickPlayer"
            @ban="ws.banPlayer"
            @promote="ws.promotePlayer"
            @demote="ws.demotePlayer"
            @update-player="ws.updatePlayer"
          />
        </div>
        <div v-if="isSpectator" class="table-header__spectator">
          <span class="table-header__spectator-label">Spectating</span>
          <button
            class="table-header__spectator-button"
            :disabled="requestToPlaySent || !ws.isConnected.value"
            @click="requestToPlay"
          >
            {{ requestToPlaySent ? 'Request sent' : 'Request to play' }}
          </button>
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
          :class="{
            'table-header__status--connected': ws.isConnected.value,
            'table-header__status--reconnecting': ws.isReconnecting.value,
          }"
          :title="connectionStatusLabel"
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
          :snapshots="ws.snapshots.value"
          :last-autosave-at="ws.lastAutosaveAt.value"
          :can-manage-snapshots="canManageSnapshots"
          :can-undo-redo="canUndoRedo"
          :can-manage-access="isCreator"
          :invite-link="inviteLink"
          :invite-token="ws.inviteToken.value"
          :performance-settings="performance.settings.value"
          @update:settings="handleSettingsUpdate"
          @update:visibility="handleVisibilityUpdate"
          @update:name="handleNameUpdate"
          @update:performance="handlePerformanceUpdate"
          @reset="handleTableReset"
          @undo="handleUndo"
          @redo="handleRedo"
          @snapshot:create="handleSnapshotCreate"
          @snapshot:restore="handleSnapshotRestore"
          @invite:regenerate="ws.regenerateInviteToken"
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
      @contextmenu="onCanvasRightClickGuarded"
    >
      <!-- Table UI (fixed position, not affected by pan/zoom) -->
      <div class="table-ui">
        <!-- Minimap -->
        <MinimapComp
          :viewport="viewport"
          :canvas-width="canvasDimensions.width"
          :canvas-height="canvasDimensions.height"
        />

        <TablePanel class="table-ui__add-panel" title="Add Item" allow-overflow>
          <div class="table-ui__zone-actions" @pointerdown.stop>
            <TableButton title="Add Zone" @click="addZone">
              <SquarePlus />
            </TableButton>
            <TableButton title="Zone Templates" @click="toggleZoneTemplates">
              <ChevronDown />
            </TableButton>
            <div v-if="showZoneTemplates" class="zone-template-menu" @pointerdown.stop>
              <button
                v-for="template in zoneTemplates"
                :key="template.id"
                class="zone-template-item"
                @click="createZoneFromTemplate(template)"
              >
                <span class="zone-template-item__title">{{ template.label }}</span>
                <span class="zone-template-item__meta">{{ template.description }}</span>
              </button>
            </div>
          </div>
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

      <div class="mobile-hud">
        <div class="mobile-hud__row">
          <div class="mobile-hud__zone-actions" @pointerdown.stop>
            <TableButton title="Add Zone" @click="addZone">
              <SquarePlus />
            </TableButton>
            <TableButton title="Zone Templates" @click="toggleZoneTemplates">
              <ChevronDown />
            </TableButton>
            <div
              v-if="showZoneTemplates"
              class="zone-template-menu zone-template-menu--mobile"
              @pointerdown.stop
            >
              <button
                v-for="template in zoneTemplates"
                :key="template.id"
                class="zone-template-item"
                @click="createZoneFromTemplate(template)"
              >
                <span class="zone-template-item__title">{{ template.label }}</span>
                <span class="zone-template-item__meta">{{ template.description }}</span>
              </button>
            </div>
          </div>
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
        </div>
        <div class="mobile-hud__row mobile-hud__row--secondary">
          <TableButton title="Players" :active="showPlayers" @click="showPlayers = !showPlayers">
            <Users />
          </TableButton>
          <TableButton title="Chat" :active="showChat" @click="showChat = !showChat">
            <MessageCircle />
          </TableButton>
          <TableButton
            title="Activity"
            :active="showActivity"
            @click="showActivity = !showActivity"
          >
            <Activity />
          </TableButton>
          <TableButton title="Settings" :active="showSettings" @click="showSettings = !showSettings">
            <Settings />
          </TableButton>
        </div>
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
          @contextmenu="onZoneRightClickGuarded($event, zone.id)"
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
          :is-dragging="entities.counter.isDragging(counter.id)"
          :is-locked-by-other="entities.counter.isLockedByOther(counter)"
          :lock-color="entities.counter.getLockColor(counter)"
          @pointerdown="entities.counter.onPointerDown($event, counter.id)"
          @pointermove="entities.counter.onPointerMove"
          @pointerup="entities.counter.onPointerUp"
          @contextmenu="entities.counter.onContextMenu($event, counter.id)"
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
          :is-dragging="entities.token.isDragging(token.id)"
          :is-locked-by-other="entities.token.isLockedByOther(token)"
          :lock-color="entities.token.getLockColor(token)"
          @pointerdown="entities.token.onPointerDown($event, token.id)"
          @pointermove="entities.token.onPointerMove"
          @pointerup="entities.token.onPointerUp"
          @contextmenu="entities.token.onContextMenu($event, token.id)"
          @token:update="onTokenUpdate"
          @token:delete="onTokenDelete"
        />

        <!-- Dice -->
        <DieComp
          v-for="die in cardStore.dice"
          :key="die.id"
          :ref="(el: any) => el && dieRefs.set(die.id, el)"
          :die="die"
          :is-dragging="entities.die.isDragging(die.id)"
          :is-locked-by-other="entities.die.isLockedByOther(die)"
          :is-selected="entities.die.selection?.isSelected(die.id) ?? false"
          :lock-color="entities.die.getLockColor(die)"
          @pointerdown="entities.die.onPointerDown($event, die.id)"
          @pointermove="entities.die.onPointerMove"
          @pointerup="entities.die.onPointerUp"
          @contextmenu="entities.die.onContextMenu($event, die.id)"
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
          :is-dragging="entities.timer.isDragging(timer.id)"
          :is-locked-by-other="entities.timer.isLockedByOther(timer)"
          :lock-color="entities.timer.getLockColor(timer)"
          @pointerdown="entities.timer.onPointerDown($event, timer.id)"
          @pointermove="entities.timer.onPointerMove"
          @pointerup="entities.timer.onPointerUp"
          @contextmenu="entities.timer.onContextMenu($event, timer.id)"
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
            'remote-selected': cardStore.getRemoteSelectionColor(card.id) !== null,
            flipping: cardStore.isFlipping(card.id),
          }"
          :style="{
            '--col': shouldShowFaceDown(card) ? CARD_BACK_COL : card.col,
            '--row': shouldShowFaceDown(card) ? CARD_BACK_ROW : card.row,
            '--shuffle-seed': card.id % 10,
            '--lock-color': getCardLockColor(card),
            '--remote-selection-color': cardStore.getRemoteSelectionColor(card.id) ?? undefined,
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
          @contextmenu="onCardRightClickGuarded($event, index)"
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

      </div>

      <!-- Remote player cursors (separate layer for proper z-index, same transform as world) -->
      <div class="cursors-layer" :style="{ transform: viewport.worldTransform.value }">
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
        @card-context-menu="onHandCardRightClickGuarded"
      />

      <!-- Selection count indicator -->
      <div v-if="cardStore.hasSelection" class="selection-indicator">
        {{ cardStore.selectionCount }} card{{ cardStore.selectionCount > 1 ? 's' : '' }} selected
      </div>
      <div v-if="cardStore.hasDieSelection" class="selection-indicator selection-indicator--dice">
        {{ cardStore.dieSelectionCount }} {{ cardStore.dieSelectionCount > 1 ? 'dice' : 'die' }} selected
      </div>
    </div>

    <!-- Top-left panels container -->
    <div v-if="ws.isConnected.value" class="panels-container-top-left">
      <ActivityPanel
        :entries="ws.activityLog.value"
        :can-moderate="isCreator || isModerator"
        v-model:is-open="showActivity"
      />
    </div>

    <!-- Bottom-right panels container -->
    <div v-if="ws.isConnected.value" class="panels-container-bottom-right">
      <ChatPanel
        :messages="ws.chatMessages.value"
        :typing-players="ws.typingPlayers.value"
        :current-player-name="playerName"
        :can-moderate="isCreator || isModerator"
        v-model:is-open="showChat"
        @send="ws.sendChat"
        @typing="ws.sendTyping"
        @delete-message="ws.deleteChatMessage"
      />
    </div>

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

.table-view--spectator .world {
  pointer-events: none;
}

.table-view--spectator :deep(.hand),
.table-view--spectator :deep(.table-ui__add-panel),
.table-view--spectator :deep(.radial-menu) {
  pointer-events: none;
}

.table-view--spectator :deep(.hand) {
  opacity: 0.6;
}

.table-view--spectator :deep(.table-ui__add-panel) {
  opacity: 0.5;
}

.table-view--low-latency :deep(.card),
.table-view--low-latency :deep(.card.locked-by-other),
.table-view--low-latency :deep(.card.zone-reorder-shift) {
  transition: none !important;
}

.table-view--reduced-effects :deep(.card),
.table-view--reduced-effects :deep(.card.dragging),
.table-view--reduced-effects :deep(.card.stack-bottom),
.table-view--reduced-effects :deep(.card.hand-ghost),
.table-view--reduced-effects :deep(.card.zone-ghost) {
  box-shadow: none !important;
  filter: none !important;
}

.table-view--reduced-effects :deep(.card.shuffling) {
  animation: none !important;
}

.table-view--reduced-effects :deep(.zone) {
  box-shadow: none;
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

.table-header__spectator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  border-radius: 8px;
  background: rgba(234, 179, 8, 0.12);
  border: 1px solid rgba(234, 179, 8, 0.35);
}

.table-header__spectator-label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: rgba(253, 224, 71, 0.95);
}

.table-header__spectator-button {
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  border: none;
  background: rgba(253, 224, 71, 0.9);
  color: #1f1300;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
}

.table-header__spectator-button:hover:enabled {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(253, 224, 71, 0.2);
}

.table-header__spectator-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  box-shadow: none;
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

.table-header__status--reconnecting {
  color: #f59e0b;
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
  align-items: stretch;
  gap: 0.5rem;
}

.table-ui__add-panel {
  margin-top: 0.5rem;
  flex-wrap: wrap;
  width: 0;
  min-width: 100%;
}

.table-ui__zone-actions {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
}

.mobile-hud {
  position: fixed;
  left: 50%;
  bottom: calc(0.75rem + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  display: none;
  flex-direction: column;
  gap: 0.4rem;
  z-index: 2400;
  pointer-events: auto;
}

.mobile-hud__row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.5rem;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
}

.mobile-hud__row--secondary {
  justify-content: center;
  background: rgba(12, 12, 20, 0.7);
}

.mobile-hud__zone-actions {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
}

.zone-template-menu--mobile {
  top: auto;
  bottom: 42px;
  left: 0;
}

.zone-template-menu {
  position: absolute;
  top: 38px;
  left: 0;
  min-width: 180px;
  padding: 6px;
  border-radius: 8px;
  background: rgba(12, 12, 20, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow:
    0 12px 24px rgba(0, 0, 0, 0.35),
    0 4px 12px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 2600;
}

.zone-template-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.92);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.zone-template-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.zone-template-item__title {
  font-size: 12px;
  font-weight: 600;
}

.zone-template-item__meta {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.55);
}

.world {
  position: absolute;
  transform-origin: 0 0;
  will-change: transform;
  z-index: 1;
  perspective: 1000px;
}

.cursors-layer {
  position: absolute;
  transform-origin: 0 0;
  pointer-events: none;
  /* Above dragged items (2000) but below table-ui (2500) */
  z-index: 2200;
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

:deep(.card.remote-selected) {
  box-shadow:
    0 0 0 2px var(--remote-selection-color, #888),
    0 4px 12px color-mix(in srgb, var(--remote-selection-color, #888) 30%, transparent);
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
  /* Smooth interpolation for remote player drag movements */
  transition:
    left 0.05s linear,
    top 0.05s linear,
    box-shadow 0.15s ease;
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

.selection-indicator--dice {
  bottom: 160px;
  background: rgba(239, 68, 68, 0.9);
}

.panels-container-top-left {
  position: fixed;
  top: 4rem;
  left: 1rem;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 0.5rem;
  z-index: 100;
}

.panels-container-bottom-right {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: 0.5rem;
  z-index: 100;
}

@media (max-width: 900px) {
  .table-ui {
    display: none;
  }

  .mobile-hud {
    display: flex;
  }

  .table-header {
    padding: 0.35rem 0.5rem;
  }

  .table-header__title {
    display: none;
  }

  .table-header__info {
    gap: 0.5rem;
  }

  .table-header__players span {
    display: none;
  }

  .table-header__spectator-label {
    display: none;
  }

  .table-header__spectator-button {
    padding: 0.25rem 0.5rem;
  }

  .panels-container-top-left {
    top: 3.25rem;
    left: 0.5rem;
  }

  .panels-container-bottom-right {
    bottom: 6.5rem;
    right: 0.75rem;
  }
}
</style>
