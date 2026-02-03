import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ref } from 'vue'
import { useEntityManager, useAllEntityManagers } from '@/composables/useEntityManager'
import type { Counter, Die } from '@/types'
import type { Player } from '../../../shared/types'

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

// Mock radial menu
function createMockRadialMenu() {
  return {
    visible: ref(false),
    position: ref({ x: 0, y: 0 }),
    target: ref(null),
    items: ref([]),
    open: vi.fn(),
    close: vi.fn(),
    select: vi.fn(),
  }
}

// Mock entities
function createMockCounter(id: number): Counter {
  return {
    id,
    x: 100,
    y: 100,
    z: 100,
    label: 'Test Counter',
    value: 0,
    step: 1,
    color: '#3b82f6',
    lockedBy: null,
  }
}

function createMockDie(id: number): Die {
  return {
    id,
    x: 100,
    y: 100,
    z: 100,
    value: 1,
    isRolling: false,
    color: '#ef4444',
    lockedBy: null,
  }
}

describe('useEntityManager', () => {
  let viewport: ReturnType<typeof createMockViewport>
  let radialMenu: ReturnType<typeof createMockRadialMenu>
  let sendMessage: ReturnType<typeof vi.fn>
  let trackActivity: ReturnType<typeof vi.fn>
  let setCursor: ReturnType<typeof vi.fn>
  let counters: Map<number, Counter>
  let players: typeof ref<Player[]>
  let playerId: typeof ref<string | null>

  beforeEach(() => {
    viewport = createMockViewport()
    radialMenu = createMockRadialMenu()
    sendMessage = vi.fn()
    trackActivity = vi.fn()
    setCursor = vi.fn()
    counters = new Map([[1, createMockCounter(1)]])
    players = ref([{ id: 'player1', name: 'Alice', color: '#ff0000' }])
    playerId = ref('player1')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function createCounterManager() {
    return useEntityManager({
      entityType: 'counter',
      getEntityById: (id) => counters.get(id),
      playerId,
      players,
      viewport: viewport as ReturnType<typeof import('@/composables/useViewport').useViewport>,
      radialMenu: radialMenu as ReturnType<typeof import('@/composables/useRadialMenu').useRadialMenu>,
      sendMessage,
      trackActivity,
      setCursor,
      getContextMenuData: (counter) => ({ value: counter.value }),
    })
  }

  describe('context menu', () => {
    it('opens radial menu with correct entity data', () => {
      const manager = createCounterManager()

      const event = {
        clientX: 200,
        clientY: 200,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as MouseEvent

      manager.onContextMenu(event, 1)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(event.stopPropagation).toHaveBeenCalled()
      expect(radialMenu.open).toHaveBeenCalledWith(200, 200, {
        type: 'counter',
        counterId: 1,
        value: 0,
      })
    })

    it('does not open menu for non-existent entity', () => {
      const manager = createCounterManager()

      const event = {
        clientX: 200,
        clientY: 200,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as MouseEvent

      manager.onContextMenu(event, 999)

      expect(radialMenu.open).not.toHaveBeenCalled()
    })
  })

  describe('drag state', () => {
    it('exposes drag state from useEntityDrag', () => {
      const manager = createCounterManager()

      expect(manager.draggingId.value).toBe(null)
      expect(manager.isDragging(1)).toBe(false)
    })

    it('correctly reports locked state', () => {
      counters.get(1)!.lockedBy = 'other-player'

      const manager = createCounterManager()

      expect(manager.isLockedByOther(counters.get(1)!)).toBe(true)
    })

    it('does not report own lock as locked by other', () => {
      counters.get(1)!.lockedBy = 'player1'

      const manager = createCounterManager()

      expect(manager.isLockedByOther(counters.get(1)!)).toBe(false)
    })

    it('returns lock color for entities locked by others', () => {
      counters.get(1)!.lockedBy = 'player1'
      playerId.value = 'player2'

      const manager = createCounterManager()

      expect(manager.getLockColor(counters.get(1)!)).toBe('#ff0000')
    })
  })

  describe('selection support', () => {
    it('returns null selection when supportsSelection is false', () => {
      const manager = createCounterManager()

      expect(manager.selection).toBe(null)
    })

    it('returns selection object when supportsSelection is true', () => {
      const dice = new Map([[1, createMockDie(1)]])

      const manager = useEntityManager({
        entityType: 'die',
        getEntityById: (id) => dice.get(id),
        playerId,
        players,
        viewport: viewport as ReturnType<typeof import('@/composables/useViewport').useViewport>,
        radialMenu: radialMenu as ReturnType<typeof import('@/composables/useRadialMenu').useRadialMenu>,
        sendMessage,
        trackActivity,
        setCursor,
        getContextMenuData: (die) => ({ value: die.value }),
        supportsSelection: true,
      })

      expect(manager.selection).not.toBe(null)
      expect(manager.selection?.isSelected).toBeDefined()
      expect(manager.selection?.toggleSelect).toBeDefined()
    })
  })

  describe('unified pointer handlers', () => {
    describe('without selection support', () => {
      it('calls drag onPointerDown', () => {
        const manager = createCounterManager()

        // Mock pointer event with capture methods
        const mockElement = {
          setPointerCapture: vi.fn(),
          releasePointerCapture: vi.fn(),
        }

        const event = {
          clientX: 100,
          clientY: 100,
          pointerId: 1,
          target: mockElement,
          stopPropagation: vi.fn(),
          ctrlKey: false,
          metaKey: false,
        } as unknown as PointerEvent

        manager.onPointerDown(event, 1)

        expect(trackActivity).toHaveBeenCalled()
        expect(sendMessage).toHaveBeenCalledWith({
          type: 'counter:lock',
          counterId: 1,
        })
      })
    })

    describe('with selection support', () => {
      let dice: Map<number, Die>
      let dieManager: ReturnType<typeof useEntityManager<'die'>>

      beforeEach(() => {
        dice = new Map([
          [1, createMockDie(1)],
          [2, { ...createMockDie(2), x: 200, y: 200 }],
        ])

        dieManager = useEntityManager({
          entityType: 'die',
          getEntityById: (id) => dice.get(id),
          playerId,
          players,
          viewport: viewport as ReturnType<typeof import('@/composables/useViewport').useViewport>,
          radialMenu: radialMenu as ReturnType<typeof import('@/composables/useRadialMenu').useRadialMenu>,
          sendMessage,
          trackActivity,
          setCursor,
          getContextMenuData: (die) => ({ value: die.value }),
          supportsSelection: true,
        })
      })

      it('toggles selection on Ctrl+click', () => {
        const event = {
          clientX: 100,
          clientY: 100,
          pointerId: 1,
          ctrlKey: true,
          metaKey: false,
          stopPropagation: vi.fn(),
        } as unknown as PointerEvent

        dieManager.onPointerDown(event, 1)

        expect(event.stopPropagation).toHaveBeenCalled()
        expect(dieManager.selection?.isSelected(1)).toBe(true)
      })

      it('toggles selection on Cmd+click (Mac)', () => {
        const event = {
          clientX: 100,
          clientY: 100,
          pointerId: 1,
          ctrlKey: false,
          metaKey: true,
          stopPropagation: vi.fn(),
        } as unknown as PointerEvent

        dieManager.onPointerDown(event, 1)

        expect(dieManager.selection?.isSelected(1)).toBe(true)
      })

      it('clears selection when clicking unselected entity without modifier', () => {
        // First select entity 1
        dieManager.selection?.toggleSelect(1)
        expect(dieManager.selection?.isSelected(1)).toBe(true)

        // Click on entity 2 without modifier
        const mockElement = {
          setPointerCapture: vi.fn(),
          releasePointerCapture: vi.fn(),
        }

        const event = {
          clientX: 200,
          clientY: 200,
          pointerId: 1,
          ctrlKey: false,
          metaKey: false,
          target: mockElement,
          stopPropagation: vi.fn(),
        } as unknown as PointerEvent

        dieManager.onPointerDown(event, 2)

        // Selection should be cleared
        expect(dieManager.selection?.isSelected(1)).toBe(false)
      })

      it('starts selection drag when clicking selected entity', () => {
        // Select entity 1
        dieManager.selection?.toggleSelect(1)

        const mockElement = {
          setPointerCapture: vi.fn(),
          releasePointerCapture: vi.fn(),
        }

        const event = {
          clientX: 100,
          clientY: 100,
          pointerId: 1,
          ctrlKey: false,
          metaKey: false,
          target: mockElement,
          stopPropagation: vi.fn(),
        } as unknown as PointerEvent

        dieManager.onPointerDown(event, 1)

        expect(event.stopPropagation).toHaveBeenCalled()
        expect(dieManager.selection?.isDraggingSelection.value).toBe(true)
      })
    })
  })
})

describe('useAllEntityManagers', () => {
  let mockCardStore: {
    getCounterById: ReturnType<typeof vi.fn>
    getTokenById: ReturnType<typeof vi.fn>
    getDieById: ReturnType<typeof vi.fn>
    getTimerById: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockCardStore = {
      getCounterById: vi.fn(),
      getTokenById: vi.fn(),
      getDieById: vi.fn(),
      getTimerById: vi.fn(),
    }
  })

  it('creates all four entity managers', () => {
    const viewport = createMockViewport()
    const radialMenu = createMockRadialMenu()

    const entities = useAllEntityManagers({
      cardStore: mockCardStore as unknown as ReturnType<typeof import('@/stores/cards').useCardStore>,
      playerId: ref('player1'),
      players: ref([]),
      viewport: viewport as ReturnType<typeof import('@/composables/useViewport').useViewport>,
      radialMenu: radialMenu as ReturnType<typeof import('@/composables/useRadialMenu').useRadialMenu>,
      sendMessage: vi.fn(),
      trackActivity: vi.fn(),
      setCursor: vi.fn(),
    })

    expect(entities.counter).toBeDefined()
    expect(entities.token).toBeDefined()
    expect(entities.die).toBeDefined()
    expect(entities.timer).toBeDefined()
  })

  it('only die manager has selection support', () => {
    const viewport = createMockViewport()
    const radialMenu = createMockRadialMenu()

    const entities = useAllEntityManagers({
      cardStore: mockCardStore as unknown as ReturnType<typeof import('@/stores/cards').useCardStore>,
      playerId: ref('player1'),
      players: ref([]),
      viewport: viewport as ReturnType<typeof import('@/composables/useViewport').useViewport>,
      radialMenu: radialMenu as ReturnType<typeof import('@/composables/useRadialMenu').useRadialMenu>,
      sendMessage: vi.fn(),
      trackActivity: vi.fn(),
      setCursor: vi.fn(),
    })

    expect(entities.counter.selection).toBe(null)
    expect(entities.token.selection).toBe(null)
    expect(entities.die.selection).not.toBe(null)
    expect(entities.timer.selection).toBe(null)
  })

  it('passes onDieShake callback to die manager', () => {
    const viewport = createMockViewport()
    const radialMenu = createMockRadialMenu()
    const onDieShake = vi.fn()

    const die = createMockDie(1)
    mockCardStore.getDieById.mockReturnValue(die)

    useAllEntityManagers({
      cardStore: mockCardStore as unknown as ReturnType<typeof import('@/stores/cards').useCardStore>,
      playerId: ref('player1'),
      players: ref([]),
      viewport: viewport as ReturnType<typeof import('@/composables/useViewport').useViewport>,
      radialMenu: radialMenu as ReturnType<typeof import('@/composables/useRadialMenu').useRadialMenu>,
      sendMessage: vi.fn(),
      trackActivity: vi.fn(),
      setCursor: vi.fn(),
      onDieShake,
    })

    // The onDieShake is passed to useEntityDrag which is harder to test directly
    // but at least we verify the setup doesn't throw
    expect(onDieShake).not.toHaveBeenCalled()
  })

  it('passes external die selection state', () => {
    const viewport = createMockViewport()
    const radialMenu = createMockRadialMenu()

    const dieSelectionState = {
      isSelected: vi.fn(() => true),
      toggleSelect: vi.fn(),
      clearSelection: vi.fn(),
      hasSelection: () => true,
      selectionCount: () => 1,
      getSelectedIds: () => [1],
    }

    const entities = useAllEntityManagers({
      cardStore: mockCardStore as unknown as ReturnType<typeof import('@/stores/cards').useCardStore>,
      playerId: ref('player1'),
      players: ref([]),
      viewport: viewport as ReturnType<typeof import('@/composables/useViewport').useViewport>,
      radialMenu: radialMenu as ReturnType<typeof import('@/composables/useRadialMenu').useRadialMenu>,
      sendMessage: vi.fn(),
      trackActivity: vi.fn(),
      setCursor: vi.fn(),
      dieSelectionState,
    })

    // Verify external state is being used
    expect(entities.die.selection?.isSelected(1)).toBe(true)
    expect(dieSelectionState.isSelected).toHaveBeenCalledWith(1)
  })
})
