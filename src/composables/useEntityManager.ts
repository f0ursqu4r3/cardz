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
  })

  return { counter, token, die, timer }
}
