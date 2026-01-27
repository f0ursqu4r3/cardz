import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, computed, nextTick } from 'vue'
import { useEntitySelection, type ExternalSelectionState } from '@/composables/useEntitySelection'
import type { Die } from '@/types'

// Mock viewport
function createMockViewport() {
  return {
    screenToWorld: vi.fn((x: number, y: number) => ({ x, y })),
    worldToScreen: vi.fn((x: number, y: number) => ({ x, y })),
    scale: ref(1),
    panX: ref(0),
    panY: ref(0),
    isPanning: ref(false),
    getVisibleBounds: vi.fn(() => ({ x: 0, y: 0, width: 800, height: 600 })),
    startPan: vi.fn(),
    updatePan: vi.fn(),
    endPan: vi.fn(),
    onWheel: vi.fn(),
  }
}

// Mock die entity
function createMockDie(id: number, x = 100, y = 100): Die {
  return {
    id,
    x,
    y,
    z: 100,
    value: 1,
    isRolling: false,
    color: '#ff0000',
    lockedBy: null,
  }
}

describe('useEntitySelection', () => {
  let viewport: ReturnType<typeof createMockViewport>
  let sendMessage: ReturnType<typeof vi.fn>
  let dice: Map<number, Die>

  beforeEach(() => {
    viewport = createMockViewport()
    sendMessage = vi.fn()
    dice = new Map([
      [1, createMockDie(1, 100, 100)],
      [2, createMockDie(2, 200, 200)],
      [3, createMockDie(3, 300, 300)],
    ])
  })

  function createSelection(externalState?: ExternalSelectionState) {
    return useEntitySelection({
      entityType: 'die',
      getEntityById: (id) => dice.get(id),
      viewport: viewport as ReturnType<typeof import('@/composables/useViewport').useViewport>,
      sendMessage,
      externalState,
    })
  }

  describe('internal state mode', () => {
    describe('initialization', () => {
      it('initializes with empty selection', () => {
        const selection = createSelection()

        expect(selection.hasSelection.value).toBe(false)
        expect(selection.selectionCount.value).toBe(0)
        expect(selection.getSelectedIds()).toEqual([])
      })
    })

    describe('selection management', () => {
      it('toggles selection on', () => {
        const selection = createSelection()

        selection.toggleSelect(1)

        expect(selection.isSelected(1)).toBe(true)
        expect(selection.hasSelection.value).toBe(true)
        expect(selection.selectionCount.value).toBe(1)
      })

      it('toggles selection off', () => {
        const selection = createSelection()

        selection.toggleSelect(1)
        selection.toggleSelect(1)

        expect(selection.isSelected(1)).toBe(false)
        expect(selection.hasSelection.value).toBe(false)
      })

      it('selects multiple entities', () => {
        const selection = createSelection()

        selection.toggleSelect(1)
        selection.toggleSelect(2)
        selection.toggleSelect(3)

        expect(selection.selectionCount.value).toBe(3)
        expect(selection.getSelectedIds()).toContain(1)
        expect(selection.getSelectedIds()).toContain(2)
        expect(selection.getSelectedIds()).toContain(3)
      })

      it('clears all selections', () => {
        const selection = createSelection()

        selection.toggleSelect(1)
        selection.toggleSelect(2)
        selection.clearSelection()

        expect(selection.hasSelection.value).toBe(false)
        expect(selection.selectionCount.value).toBe(0)
      })
    })

    describe('multi-selection drag', () => {
      it('starts selection drag and records positions', () => {
        const selection = createSelection()

        selection.toggleSelect(1)
        selection.toggleSelect(2)

        const event = {
          clientX: 100,
          clientY: 100,
        } as PointerEvent

        selection.startSelectionDrag(event)

        expect(selection.isDraggingSelection.value).toBe(true)
        expect(viewport.screenToWorld).toHaveBeenCalledWith(100, 100)
      })

      it('updates entity positions during drag', () => {
        const selection = createSelection()

        selection.toggleSelect(1)
        selection.toggleSelect(2)

        // Start drag at (100, 100)
        selection.startSelectionDrag({ clientX: 100, clientY: 100 } as PointerEvent)

        // Move to (150, 150) - delta of (50, 50)
        viewport.screenToWorld.mockReturnValue({ x: 150, y: 150 })
        selection.updateSelectionDrag({ clientX: 150, clientY: 150 } as PointerEvent)

        // Entities should have moved by the delta
        expect(dice.get(1)!.x).toBe(150)
        expect(dice.get(1)!.y).toBe(150)
        expect(dice.get(2)!.x).toBe(250)
        expect(dice.get(2)!.y).toBe(250)
      })

      it('excludes specified entity from drag update', () => {
        const selection = createSelection()

        selection.toggleSelect(1)
        selection.toggleSelect(2)

        selection.startSelectionDrag({ clientX: 100, clientY: 100 } as PointerEvent)

        viewport.screenToWorld.mockReturnValue({ x: 150, y: 150 })
        selection.updateSelectionDrag({ clientX: 150, clientY: 150 } as PointerEvent, 1)

        // Entity 1 should NOT have moved (excluded)
        expect(dice.get(1)!.x).toBe(100)
        expect(dice.get(1)!.y).toBe(100)
        // Entity 2 should have moved
        expect(dice.get(2)!.x).toBe(250)
        expect(dice.get(2)!.y).toBe(250)
      })

      it('sends position updates on drag end', () => {
        const selection = createSelection()

        selection.toggleSelect(1)
        selection.toggleSelect(2)

        selection.startSelectionDrag({ clientX: 100, clientY: 100 } as PointerEvent)
        viewport.screenToWorld.mockReturnValue({ x: 150, y: 150 })
        selection.updateSelectionDrag({ clientX: 150, clientY: 150 } as PointerEvent)

        selection.endSelectionDrag()

        // Should send updates for all selected entities
        expect(sendMessage).toHaveBeenCalledTimes(2)
        expect(sendMessage).toHaveBeenCalledWith({
          type: 'die:update',
          dieId: 1,
          updates: { x: 150, y: 150 },
        })
        expect(sendMessage).toHaveBeenCalledWith({
          type: 'die:update',
          dieId: 2,
          updates: { x: 250, y: 250 },
        })
      })

      it('excludes entity from final position broadcast', () => {
        const selection = createSelection()

        selection.toggleSelect(1)
        selection.toggleSelect(2)

        selection.startSelectionDrag({ clientX: 100, clientY: 100 } as PointerEvent)
        selection.endSelectionDrag(1)

        // Should only send update for entity 2 (entity 1 excluded)
        expect(sendMessage).toHaveBeenCalledTimes(1)
        expect(sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({ dieId: 2 })
        )
      })

      it('clears drag state after end', () => {
        const selection = createSelection()

        selection.toggleSelect(1)
        selection.startSelectionDrag({ clientX: 100, clientY: 100 } as PointerEvent)

        expect(selection.isDraggingSelection.value).toBe(true)

        selection.endSelectionDrag()

        expect(selection.isDraggingSelection.value).toBe(false)
      })

      it('does nothing when ending drag without starting', () => {
        const selection = createSelection()

        selection.toggleSelect(1)
        selection.endSelectionDrag()

        expect(sendMessage).not.toHaveBeenCalled()
      })
    })
  })

  describe('external state mode', () => {
    it('uses external isSelected function', () => {
      const externalState: ExternalSelectionState = {
        isSelected: vi.fn((id) => id === 1),
        toggleSelect: vi.fn(),
        clearSelection: vi.fn(),
        hasSelection: () => true,
        selectionCount: () => 1,
        getSelectedIds: () => [1],
      }

      const selection = createSelection(externalState)

      expect(selection.isSelected(1)).toBe(true)
      expect(selection.isSelected(2)).toBe(false)
      expect(externalState.isSelected).toHaveBeenCalledWith(1)
      expect(externalState.isSelected).toHaveBeenCalledWith(2)
    })

    it('uses external toggleSelect function', () => {
      const externalState: ExternalSelectionState = {
        isSelected: () => false,
        toggleSelect: vi.fn(),
        clearSelection: vi.fn(),
        hasSelection: () => false,
        selectionCount: () => 0,
        getSelectedIds: () => [],
      }

      const selection = createSelection(externalState)

      selection.toggleSelect(1)

      expect(externalState.toggleSelect).toHaveBeenCalledWith(1)
    })

    it('uses external clearSelection function', () => {
      const externalState: ExternalSelectionState = {
        isSelected: () => false,
        toggleSelect: vi.fn(),
        clearSelection: vi.fn(),
        hasSelection: () => false,
        selectionCount: () => 0,
        getSelectedIds: () => [],
      }

      const selection = createSelection(externalState)

      selection.clearSelection()

      expect(externalState.clearSelection).toHaveBeenCalled()
    })

    it('wraps external getter functions in computed', async () => {
      // Use a ref to make the value reactive
      const countRef = ref(0)
      const externalState: ExternalSelectionState = {
        isSelected: () => false,
        toggleSelect: vi.fn(),
        clearSelection: vi.fn(),
        hasSelection: () => countRef.value > 0,
        selectionCount: () => countRef.value,
        getSelectedIds: () => [],
      }

      const selection = createSelection(externalState)

      expect(selection.hasSelection.value).toBe(false)
      expect(selection.selectionCount.value).toBe(0)

      countRef.value = 2

      // The computed should re-evaluate since the getter reads from a ref
      expect(selection.hasSelection.value).toBe(true)
      expect(selection.selectionCount.value).toBe(2)
    })

    it('accepts ref-based external state', () => {
      const selectedIds = ref(new Set([1, 2]))
      const externalState: ExternalSelectionState = {
        isSelected: (id) => selectedIds.value.has(id),
        toggleSelect: vi.fn(),
        clearSelection: vi.fn(),
        hasSelection: computed(() => selectedIds.value.size > 0),
        selectionCount: computed(() => selectedIds.value.size),
        getSelectedIds: () => Array.from(selectedIds.value),
      }

      const selection = createSelection(externalState)

      expect(selection.hasSelection.value).toBe(true)
      expect(selection.selectionCount.value).toBe(2)
      expect(selection.isSelected(1)).toBe(true)
      expect(selection.isSelected(3)).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('handles non-existent entity gracefully in drag', () => {
      const selection = createSelection()

      selection.toggleSelect(999) // Non-existent entity

      selection.startSelectionDrag({ clientX: 100, clientY: 100 } as PointerEvent)
      viewport.screenToWorld.mockReturnValue({ x: 150, y: 150 })
      selection.updateSelectionDrag({ clientX: 150, clientY: 150 } as PointerEvent)

      // Should not throw, just skip the non-existent entity
      selection.endSelectionDrag()

      // No message sent because entity doesn't exist
      expect(sendMessage).not.toHaveBeenCalled()
    })

    it('handles empty selection in drag operations', () => {
      const selection = createSelection()

      // Try to start drag with no selection
      selection.startSelectionDrag({ clientX: 100, clientY: 100 } as PointerEvent)

      expect(selection.isDraggingSelection.value).toBe(true)

      viewport.screenToWorld.mockReturnValue({ x: 150, y: 150 })
      selection.updateSelectionDrag({ clientX: 150, clientY: 150 } as PointerEvent)
      selection.endSelectionDrag()

      // Should complete without errors
      expect(sendMessage).not.toHaveBeenCalled()
    })
  })
})
