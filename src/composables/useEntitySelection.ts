import { ref, computed, type Ref, type ComputedRef } from 'vue'
import type { EntityType, EntityTypeMap } from '@/types/entity'
import type { useViewport } from './useViewport'

/**
 * External selection state that can be provided from card store.
 * Accepts either refs/computedRefs or plain getters (for Pinia compatibility).
 */
export interface ExternalSelectionState {
  /** Check if entity is selected */
  isSelected: (id: number) => boolean
  /** Toggle selection state */
  toggleSelect: (id: number) => void
  /** Clear all selections */
  clearSelection: () => void
  /** Whether any entities are selected - can be a reactive ref or a plain getter */
  hasSelection: ComputedRef<boolean> | Ref<boolean> | (() => boolean)
  /** Number of selected entities - can be a reactive ref or a plain getter */
  selectionCount: ComputedRef<number> | Ref<number> | (() => number)
  /** Get array of selected IDs */
  getSelectedIds: () => number[]
}

/**
 * Configuration for entity selection composable
 */
export interface EntitySelectionConfig<T extends EntityType> {
  /** Entity type for message construction */
  entityType: T
  /** Function to get entity by ID */
  getEntityById: (id: number) => EntityTypeMap[T] | undefined
  /** Viewport for coordinate conversion */
  viewport: ReturnType<typeof useViewport>
  /** Function to send messages (for position updates) */
  sendMessage: (msg: { type: string; [key: string]: unknown }) => void
  /** Optional external selection state (e.g., from card store) */
  externalState?: ExternalSelectionState
}

/**
 * Generic composable for multi-selection and group drag of entities.
 * Extracts the selection pattern used by dice (and potentially other entity types).
 * Can use its own internal state or bridge to external state (like card store).
 */
export function useEntitySelection<T extends EntityType>(config: EntitySelectionConfig<T>) {
  const { entityType, getEntityById, viewport, sendMessage, externalState } = config

  // Internal state (only used if no external state provided)
  const internalSelectedIds = ref<Set<number>>(new Set())

  // Multi-drag state
  const selectionStartPositions = ref<Map<number, { x: number; y: number }>>(new Map())
  const selectionDragStart = ref<{ x: number; y: number } | null>(null)

  // Use external methods if provided, otherwise use internal implementation
  // Wrap external getters in computed for consistent reactive interface
  const hasSelection = externalState?.hasSelection
    ? typeof externalState.hasSelection === 'function'
      ? computed(externalState.hasSelection as () => boolean)
      : externalState.hasSelection
    : computed(() => internalSelectedIds.value.size > 0)

  const selectionCount = externalState?.selectionCount
    ? typeof externalState.selectionCount === 'function'
      ? computed(externalState.selectionCount as () => number)
      : externalState.selectionCount
    : computed(() => internalSelectedIds.value.size)

  /**
   * Check if an entity is selected
   */
  const isSelected = externalState?.isSelected ?? ((id: number): boolean => {
    return internalSelectedIds.value.has(id)
  })

  /**
   * Toggle selection state for an entity
   */
  const toggleSelect = externalState?.toggleSelect ?? ((id: number): void => {
    if (internalSelectedIds.value.has(id)) {
      internalSelectedIds.value.delete(id)
    } else {
      internalSelectedIds.value.add(id)
    }
  })

  /**
   * Clear all selections
   */
  const clearSelection = externalState?.clearSelection ?? ((): void => {
    internalSelectedIds.value.clear()
  })

  /**
   * Get array of selected entity IDs
   */
  const getSelectedIds = externalState?.getSelectedIds ?? ((): number[] => {
    return Array.from(internalSelectedIds.value)
  })

  /**
   * Start a multi-selection drag operation.
   * Call this when pointer down occurs on a selected entity.
   */
  const startSelectionDrag = (event: PointerEvent): void => {
    const worldPos = viewport.screenToWorld(event.clientX, event.clientY)
    selectionDragStart.value = { x: worldPos.x, y: worldPos.y }
    selectionStartPositions.value = new Map()

    // Store initial positions of all selected entities
    getSelectedIds().forEach((id) => {
      const entity = getEntityById(id)
      if (entity) {
        selectionStartPositions.value.set(id, { x: entity.x, y: entity.y })
      }
    })
  }

  /**
   * Update positions during a multi-selection drag.
   * @param event - Pointer move event
   * @param excludeId - Entity ID to exclude (being dragged by useEntityDrag)
   */
  const updateSelectionDrag = (event: PointerEvent, excludeId?: number): void => {
    if (!selectionDragStart.value) return

    const worldPos = viewport.screenToWorld(event.clientX, event.clientY)
    const deltaX = worldPos.x - selectionDragStart.value.x
    const deltaY = worldPos.y - selectionDragStart.value.y

    // Move all selected entities except the excluded one
    selectionStartPositions.value.forEach((startPos, id) => {
      if (id !== excludeId) {
        const entity = getEntityById(id)
        if (entity) {
          entity.x = startPos.x + deltaX
          entity.y = startPos.y + deltaY
        }
      }
    })
  }

  /**
   * End a multi-selection drag, sending final positions to server.
   * @param excludeId - Entity ID to exclude (already handled by useEntityDrag)
   */
  const endSelectionDrag = (excludeId?: number): void => {
    if (!selectionDragStart.value) return

    // Send final positions for all selected entities
    selectionStartPositions.value.forEach((_, id) => {
      if (id !== excludeId) {
        const entity = getEntityById(id)
        if (entity) {
          sendMessage({
            type: `${entityType}:update`,
            [`${entityType}Id`]: id,
            updates: { x: entity.x, y: entity.y },
          })
        }
      }
    })

    selectionDragStart.value = null
    selectionStartPositions.value.clear()
  }

  /**
   * Check if a multi-selection drag is active
   */
  const isDraggingSelection = computed(() => selectionDragStart.value !== null)

  return {
    // Selection state
    hasSelection,
    selectionCount,

    // Selection methods
    isSelected,
    toggleSelect,
    clearSelection,
    getSelectedIds,

    // Multi-drag methods
    startSelectionDrag,
    updateSelectionDrag,
    endSelectionDrag,
    isDraggingSelection,
    selectionDragStart,
  }
}
