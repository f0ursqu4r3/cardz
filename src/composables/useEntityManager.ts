import { type Ref } from 'vue'
import type { EntityType, EntityTypeMap, EntityContextData } from '@/types/entity'
import { useEntityDrag, type DraggableEntity } from './useEntityDrag'
import { useEntitySelection, type ExternalSelectionState } from './useEntitySelection'
import type { useViewport } from './useViewport'
import type { useRadialMenu } from './useRadialMenu'
import type { ClientMessage, Player } from '../../shared/types'
import type { useCardStore } from '@/stores/cards'

/**
 * Configuration for a single entity manager
 */
export interface EntityManagerConfig<T extends EntityType> {
  /** Entity type identifier */
  entityType: T
  /** Function to get entity by ID */
  getEntityById: (id: number) => EntityTypeMap[T] | undefined
  /** Current player ID */
  playerId: Ref<string | null>
  /** Players list for lock colors */
  players: Ref<Player[]>
  /** Viewport for coordinate conversion */
  viewport: ReturnType<typeof useViewport>
  /** Radial menu composable for context menus */
  radialMenu: ReturnType<typeof useRadialMenu>
  /** Function to send WebSocket messages */
  sendMessage: (msg: ClientMessage) => void
  /** Function to track user activity */
  trackActivity: () => void
  /** Function to set cursor type */
  setCursor: (type: 'default' | 'grab' | 'grabbing') => void
  /** Callback for cursor position during drag */
  onCursorMove?: (worldX: number, worldY: number) => void
  /** Callback when shake gesture detected (for dice) */
  onShake?: (entityId: number) => void
  /** Function to get context menu data for an entity */
  getContextMenuData: (entity: EntityTypeMap[T]) => EntityContextData[T]
  /** Whether this entity type supports multi-selection */
  supportsSelection?: boolean
  /** External selection state (e.g., from card store) */
  externalSelectionState?: ExternalSelectionState
  /** Callback to move co-selected entities during drag */
  onSelectionDragMove?: (entityId: number, deltaX: number, deltaY: number) => void
  /** Callback when drag ends (for co-selected entity final updates) */
  onSelectionDragEnd?: (entityId: number) => void
}

/**
 * Unified entity manager composable that bundles:
 * - Drag handling (via useEntityDrag)
 * - Multi-selection handling (via useEntitySelection)
 * - Context menu handling
 */
export function useEntityManager<T extends EntityType>(config: EntityManagerConfig<T>) {
  const {
    entityType,
    getEntityById,
    playerId,
    players,
    viewport,
    radialMenu,
    sendMessage,
    trackActivity,
    setCursor,
    onCursorMove,
    onShake,
    getContextMenuData,
    supportsSelection = false,
    externalSelectionState,
    onSelectionDragMove,
    onSelectionDragEnd,
  } = config

  // Initialize drag handler
  const drag = useEntityDrag({
    entityType,
    getEntityById: getEntityById as (id: number) => DraggableEntity | undefined,
    playerId,
    players,
    viewport,
    sendMessage,
    trackActivity,
    setCursor,
    onCursorMove,
    onShake,
    onSelectionDragMove,
    onSelectionDragEnd,
  })

  // Initialize selection handler (if supported)
  const selection = supportsSelection
    ? useEntitySelection({
        entityType,
        getEntityById,
        viewport,
        sendMessage: sendMessage as (msg: { type: string; [key: string]: unknown }) => void,
        externalState: externalSelectionState,
      })
    : null

  /**
   * Context menu handler - opens radial menu with entity-specific data
   */
  const onContextMenu = (event: MouseEvent, entityId: number): void => {
    event.preventDefault()
    event.stopPropagation()

    const entity = getEntityById(entityId)
    if (!entity) return

    const contextData = getContextMenuData(entity)
    radialMenu.open(event.clientX, event.clientY, {
      type: entityType,
      [`${entityType}Id`]: entityId,
      ...contextData,
    } as Parameters<typeof radialMenu.open>[2])
  }

  /**
   * Unified pointer down handler
   * Handles both selection toggling and drag initiation
   */
  const onPointerDown = (event: PointerEvent, entityId: number): void => {
    const isCtrlClick = event.ctrlKey || event.metaKey

    if (supportsSelection && selection) {
      if (isCtrlClick) {
        // Toggle selection on Ctrl+click
        event.stopPropagation()
        selection.toggleSelect(entityId)
        return
      }

      // Clear selection if clicking unselected entity
      if (selection.hasSelection.value && !selection.isSelected(entityId)) {
        selection.clearSelection()
      }

      // Start selection drag if this entity is selected
      if (selection.isSelected(entityId)) {
        event.stopPropagation()
        selection.startSelectionDrag(event)
      }
    }

    // Proceed with normal drag handling
    drag.onPointerDown(event, entityId)
  }

  /**
   * Unified pointer move handler
   * Updates both selection drag and individual entity drag
   */
  const onPointerMove = (event: PointerEvent): void => {
    // Update selection drag if active
    if (selection?.selectionDragStart.value && drag.draggingId.value !== null) {
      selection.updateSelectionDrag(event, drag.draggingId.value)
    }

    // Update individual entity drag
    drag.onPointerMove(event)
  }

  /**
   * Unified pointer up handler
   * Finalizes both selection drag and individual entity drag
   */
  const onPointerUp = (event: PointerEvent): void => {
    // Finalize selection drag if active
    if (selection?.selectionDragStart.value && drag.draggingId.value !== null) {
      selection.endSelectionDrag(drag.draggingId.value)
    }

    // Finalize individual entity drag
    drag.onPointerUp(event)
  }

  return {
    // Drag state and methods
    draggingId: drag.draggingId,
    isDragging: drag.isDragging,
    isLockedByOther: drag.isLockedByOther,
    getLockColor: drag.getLockColor,

    // Selection (if supported)
    selection,

    // Unified event handlers
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onContextMenu,
  }
}

/**
 * Configuration for creating all entity managers at once
 */
export interface AllEntityManagersConfig {
  /** Card store for entity lookups */
  cardStore: ReturnType<typeof useCardStore>
  /** Current player ID */
  playerId: Ref<string | null>
  /** Players list for lock colors */
  players: Ref<Player[]>
  /** Viewport for coordinate conversion */
  viewport: ReturnType<typeof useViewport>
  /** Radial menu composable */
  radialMenu: ReturnType<typeof useRadialMenu>
  /** Function to send WebSocket messages */
  sendMessage: (msg: ClientMessage) => void
  /** Function to track user activity */
  trackActivity: () => void
  /** Function to set cursor type */
  setCursor: (type: 'default' | 'grab' | 'grabbing') => void
  /** Callback for cursor position during drag */
  onCursorMove?: (worldX: number, worldY: number) => void
  /** Callback when die shake gesture detected */
  onDieShake?: (dieId: number) => void
  /** External die selection state from card store */
  dieSelectionState?: ExternalSelectionState
}

/**
 * Factory function to create all 4 entity managers at once.
 * This replaces the 4 separate useEntityDrag calls in TableView.vue.
 */
export function useAllEntityManagers(config: AllEntityManagersConfig) {
  const {
    cardStore,
    playerId,
    players,
    viewport,
    radialMenu,
    sendMessage,
    trackActivity,
    setCursor,
    onCursorMove,
    onDieShake,
    dieSelectionState,
  } = config

  // Shared selection drag: move all selected entities by delta (excluding the one being dragged)
  const moveCoSelected = (
    excludeType: string,
    excludeId: number,
    deltaX: number,
    deltaY: number,
  ) => {
    // Move selected cards
    if (excludeType !== 'card') {
      cardStore.moveSelection(deltaX, deltaY)
    }
    // Move selected counters
    for (const id of cardStore.selectedCounterIds) {
      if (excludeType === 'counter' && id === excludeId) continue
      const c = cardStore.getCounterById(id)
      if (c) { c.x += deltaX; c.y += deltaY }
    }
    // Move selected tokens
    for (const id of cardStore.selectedTokenIds) {
      if (excludeType === 'token' && id === excludeId) continue
      const t = cardStore.getTokenById(id)
      if (t) { t.x += deltaX; t.y += deltaY }
    }
    // Move selected dice
    for (const id of cardStore.selectedDieIds) {
      if (excludeType === 'die' && id === excludeId) continue
      const d = cardStore.getDieById(id)
      if (d) { d.x += deltaX; d.y += deltaY }
    }
    // Move selected timers
    for (const id of cardStore.selectedTimerIds) {
      if (excludeType === 'timer' && id === excludeId) continue
      const t = cardStore.getTimerById(id)
      if (t) { t.x += deltaX; t.y += deltaY }
    }
  }

  // Send final position updates for co-selected entities on drag end
  const sendCoSelectedFinalPositions = (excludeType: string, excludeId: number) => {
    for (const id of cardStore.selectedCounterIds) {
      if (excludeType === 'counter' && id === excludeId) continue
      const c = cardStore.getCounterById(id)
      if (c) sendMessage({ type: 'counter:update', counterId: id, updates: { x: c.x, y: c.y } })
    }
    for (const id of cardStore.selectedTokenIds) {
      if (excludeType === 'token' && id === excludeId) continue
      const t = cardStore.getTokenById(id)
      if (t) sendMessage({ type: 'token:update', tokenId: id, updates: { x: t.x, y: t.y } })
    }
    for (const id of cardStore.selectedDieIds) {
      if (excludeType === 'die' && id === excludeId) continue
      const d = cardStore.getDieById(id)
      if (d) sendMessage({ type: 'die:update', dieId: id, updates: { x: d.x, y: d.y } })
    }
    for (const id of cardStore.selectedTimerIds) {
      if (excludeType === 'timer' && id === excludeId) continue
      const t = cardStore.getTimerById(id)
      if (t) sendMessage({ type: 'timer:update', timerId: id, updates: { x: t.x, y: t.y } })
    }
    // Cards are handled separately by useCardInteraction's selection drag
    // but we need to send updates for cards selected via marquee
    for (const id of cardStore.getSelectedIds()) {
      if (excludeType === 'card') continue
      const card = cardStore.cards.find((c) => c.id === id)
      if (card) sendMessage({ type: 'card:move', cardId: id, x: card.x, y: card.y })
    }
  }

  const isEntitySelected = (type: string, id: number): boolean => {
    switch (type) {
      case 'counter': return cardStore.isCounterSelected(id)
      case 'token': return cardStore.isTokenSelected(id)
      case 'die': return cardStore.isDieSelected(id)
      case 'timer': return cardStore.isTimerSelected(id)
      default: return false
    }
  }

  const makeSelectionCallbacks = (type: string) => ({
    onSelectionDragMove: (entityId: number, deltaX: number, deltaY: number) => {
      if (!isEntitySelected(type, entityId)) return
      moveCoSelected(type, entityId, deltaX, deltaY)
    },
    onSelectionDragEnd: (entityId: number) => {
      if (!isEntitySelected(type, entityId)) return
      sendCoSelectedFinalPositions(type, entityId)
    },
  })

  const counter = useEntityManager({
    entityType: 'counter',
    getEntityById: cardStore.getCounterById,
    playerId,
    players,
    viewport,
    radialMenu,
    sendMessage,
    trackActivity,
    setCursor,
    onCursorMove,
    getContextMenuData: (counter) => ({ value: counter.value }),
    ...makeSelectionCallbacks('counter'),
  })

  const token = useEntityManager({
    entityType: 'token',
    getEntityById: cardStore.getTokenById,
    playerId,
    players,
    viewport,
    radialMenu,
    sendMessage,
    trackActivity,
    setCursor,
    onCursorMove,
    getContextMenuData: (token) => ({ kind: token.kind }),
    ...makeSelectionCallbacks('token'),
  })

  const die = useEntityManager({
    entityType: 'die',
    getEntityById: cardStore.getDieById,
    playerId,
    players,
    viewport,
    radialMenu,
    sendMessage,
    trackActivity,
    setCursor,
    onCursorMove,
    onShake: onDieShake,
    getContextMenuData: (die) => ({ value: die.value }),
    supportsSelection: true,
    externalSelectionState: dieSelectionState,
    ...makeSelectionCallbacks('die'),
  })

  const timer = useEntityManager({
    entityType: 'timer',
    getEntityById: cardStore.getTimerById,
    playerId,
    players,
    viewport,
    radialMenu,
    sendMessage,
    trackActivity,
    setCursor,
    onCursorMove,
    getContextMenuData: (timer) => ({ status: timer.status, mode: timer.mode }),
    ...makeSelectionCallbacks('timer'),
  })

  return { counter, token, die, timer }
}
