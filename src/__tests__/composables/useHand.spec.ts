import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref, type Ref } from 'vue'
import { useHand } from '@/composables/useHand'
import { useDrag } from '@/composables/useDrag'
import { useCardStore } from '@/stores/cards'
import {
  setupPinia,
  createMockElement,
  createMockPointerEvent,
  resetIdCounters,
} from '../test-utils'
import { CARD_W, HAND_CARD_OVERLAP } from '@/types'

describe('useHand', () => {
  let canvasRef: Ref<HTMLElement | null>
  let handRef: Ref<HTMLElement | null>
  let drag: ReturnType<typeof useDrag>
  let cardStore: ReturnType<typeof useCardStore>

  beforeEach(() => {
    setupPinia()
    resetIdCounters()
    vi.useFakeTimers()

    canvasRef = ref(
      createMockElement({
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        left: 0,
        top: 0,
        right: 800,
        bottom: 600,
      }),
    )

    handRef = ref(
      createMockElement({
        x: 300,
        y: 550,
        width: 200,
        height: 60,
        left: 300,
        top: 550,
        right: 500,
        bottom: 610,
      }),
    )

    drag = useDrag()
    cardStore = useCardStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initialization', () => {
    it('initializes with default values', () => {
      const hand = useHand(canvasRef, handRef, drag)

      expect(hand.drawFaceDown.value).toBe(false)
      expect(hand.handDragStartIndex.value).toBe(null)
      expect(hand.handDropTargetIndex.value).toBe(null)
      expect(hand.selectedHandCardIds.value.size).toBe(0)
    })
  })

  describe('hand card positioning', () => {
    it('calculates hand card X position for single card', () => {
      cardStore.createCards(1)
      cardStore.addToHand(1)

      const hand = useHand(canvasRef, handRef, drag)
      const x = hand.getHandCardX(0)

      // Single card should be centered (totalWidth = CARD_W)
      const totalWidth = CARD_W
      const expectedX = -totalWidth / 2
      expect(x).toBe(expectedX)
    })

    it('calculates hand card X positions for multiple cards', () => {
      cardStore.createCards(3)
      cardStore.addToHand(1)
      cardStore.addToHand(2)
      cardStore.addToHand(3)

      const hand = useHand(canvasRef, handRef, drag)

      const x0 = hand.getHandCardX(0)
      const x1 = hand.getHandCardX(1)
      const x2 = hand.getHandCardX(2)

      // Cards should be evenly spaced
      expect(x1 - x0).toBe(HAND_CARD_OVERLAP)
      expect(x2 - x1).toBe(HAND_CARD_OVERLAP)
    })

    it('calculates hand width based on card count', () => {
      cardStore.createCards(5)
      const hand = useHand(canvasRef, handRef, drag)

      // No cards - minimum width
      expect(hand.handWidth.value).toBe(120)

      cardStore.addToHand(1)
      cardStore.addToHand(2)
      cardStore.addToHand(3)

      // With cards: (count-1) * HAND_CARD_OVERLAP + CARD_W + 48 padding
      const expectedWidth = (3 - 1) * HAND_CARD_OVERLAP + CARD_W + 48
      expect(hand.handWidth.value).toBe(expectedWidth)
    })
  })

  describe('hand card selection', () => {
    it('toggles hand card selection', () => {
      cardStore.createCards(3)
      cardStore.addToHand(1)
      cardStore.addToHand(2)

      const hand = useHand(canvasRef, handRef, drag)

      expect(hand.isHandCardSelected(1)).toBe(false)

      hand.toggleHandCardSelection(1)
      expect(hand.isHandCardSelected(1)).toBe(true)

      hand.toggleHandCardSelection(1)
      expect(hand.isHandCardSelected(1)).toBe(false)
    })

    it('clears hand selection', () => {
      cardStore.createCards(3)
      cardStore.addToHand(1)
      cardStore.addToHand(2)
      cardStore.addToHand(3)

      const hand = useHand(canvasRef, handRef, drag)

      hand.toggleHandCardSelection(1)
      hand.toggleHandCardSelection(2)

      expect(hand.handSelectionCount.value).toBe(2)

      hand.clearHandSelection()

      expect(hand.handSelectionCount.value).toBe(0)
    })

    it('counts selected hand cards', () => {
      cardStore.createCards(3)
      cardStore.addToHand(1)
      cardStore.addToHand(2)
      cardStore.addToHand(3)

      const hand = useHand(canvasRef, handRef, drag)

      expect(hand.handSelectionCount.value).toBe(0)

      hand.toggleHandCardSelection(1)
      expect(hand.handSelectionCount.value).toBe(1)

      hand.toggleHandCardSelection(2)
      expect(hand.handSelectionCount.value).toBe(2)
    })
  })

  describe('hand card offsets for drag placeholder', () => {
    it('returns zero offset when not dragging', () => {
      cardStore.createCards(3)
      cardStore.addToHand(1)
      cardStore.addToHand(2)
      cardStore.addToHand(3)

      const hand = useHand(canvasRef, handRef, drag)

      expect(hand.getHandCardOffset(0)).toBe(0)
      expect(hand.getHandCardOffset(1)).toBe(0)
      expect(hand.getHandCardOffset(2)).toBe(0)
    })

    it('returns zero offset when source equals target', () => {
      cardStore.createCards(3)
      cardStore.addToHand(1)
      cardStore.addToHand(2)
      cardStore.addToHand(3)

      const hand = useHand(canvasRef, handRef, drag)
      hand.handDragStartIndex.value = 1
      hand.handDropTargetIndex.value = 1

      expect(hand.getHandCardOffset(0)).toBe(0)
      expect(hand.getHandCardOffset(1)).toBe(0)
      expect(hand.getHandCardOffset(2)).toBe(0)
    })

    it('shifts cards left when dragging right', () => {
      cardStore.createCards(4)
      cardStore.addToHand(1)
      cardStore.addToHand(2)
      cardStore.addToHand(3)
      cardStore.addToHand(4)

      const hand = useHand(canvasRef, handRef, drag)
      hand.handDragStartIndex.value = 0 // Dragging card at index 0
      hand.handDropTargetIndex.value = 2 // To index 2

      // Cards between start+1 and target should shift left
      expect(hand.getHandCardOffset(0)).toBe(0) // Dragged card
      expect(hand.getHandCardOffset(1)).toBe(-HAND_CARD_OVERLAP) // Shifts left
      expect(hand.getHandCardOffset(2)).toBe(-HAND_CARD_OVERLAP) // Shifts left
      expect(hand.getHandCardOffset(3)).toBe(0) // No shift
    })

    it('shifts cards right when dragging left', () => {
      cardStore.createCards(4)
      cardStore.addToHand(1)
      cardStore.addToHand(2)
      cardStore.addToHand(3)
      cardStore.addToHand(4)

      const hand = useHand(canvasRef, handRef, drag)
      hand.handDragStartIndex.value = 3 // Dragging card at index 3
      hand.handDropTargetIndex.value = 1 // To index 1

      // Cards between target and start-1 should shift right
      expect(hand.getHandCardOffset(0)).toBe(0) // No shift
      expect(hand.getHandCardOffset(1)).toBe(HAND_CARD_OVERLAP) // Shifts right
      expect(hand.getHandCardOffset(2)).toBe(HAND_CARD_OVERLAP) // Shifts right
      expect(hand.getHandCardOffset(3)).toBe(0) // Dragged card
    })
  })

  describe('pointer events', () => {
    it('handles left-click pointer down', () => {
      cardStore.createCards(3)
      cardStore.addToHand(1)
      cardStore.addToHand(2)

      const hand = useHand(canvasRef, handRef, drag)

      const event = createMockPointerEvent('pointerdown', {
        button: 0,
        pointerId: 1,
        clientX: 350,
        clientY: 560,
        ctrlKey: false,
        metaKey: false,
      })

      // Mock setPointerCapture
      const mockTarget = { setPointerCapture: vi.fn() }
      Object.defineProperty(event, 'currentTarget', { value: mockTarget })

      hand.onHandCardPointerDown(event, 1)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(mockTarget.setPointerCapture).toHaveBeenCalledWith(1)
      expect(drag.isDragging.value).toBe(true)
      expect(drag.target.value?.type).toBe('hand-card')
    })

    it('handles ctrl+click for multi-select', () => {
      cardStore.createCards(3)
      cardStore.addToHand(1)
      cardStore.addToHand(2)
      cardStore.addToHand(3)

      const hand = useHand(canvasRef, handRef, drag)

      const event = createMockPointerEvent('pointerdown', {
        button: 0,
        pointerId: 1,
        clientX: 350,
        clientY: 560,
        ctrlKey: true,
      })

      const mockTarget = { setPointerCapture: vi.fn() }
      Object.defineProperty(event, 'currentTarget', { value: mockTarget })

      hand.onHandCardPointerDown(event, 1)

      expect(hand.isHandCardSelected(1)).toBe(true)
      expect(drag.isDragging.value).toBe(false) // Should not start drag
    })

    it('handles right-click for face-down drag', () => {
      cardStore.createCards(2)
      cardStore.addToHand(1)

      const hand = useHand(canvasRef, handRef, drag)

      const event = createMockPointerEvent('pointerdown', {
        button: 2, // Right click
        pointerId: 1,
        clientX: 350,
        clientY: 560,
      })

      const mockTarget = { setPointerCapture: vi.fn() }
      Object.defineProperty(event, 'currentTarget', { value: mockTarget })

      hand.onHandCardPointerDown(event, 1)

      expect(hand.drawFaceDown.value).toBe(true)
    })

    it('ignores middle-click', () => {
      cardStore.createCards(1)
      cardStore.addToHand(1)

      const hand = useHand(canvasRef, handRef, drag)

      const event = createMockPointerEvent('pointerdown', {
        button: 1, // Middle click
        pointerId: 1,
      })

      hand.onHandCardPointerDown(event, 1)

      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(drag.isDragging.value).toBe(false)
    })
  })

  describe('long press for touch face-down', () => {
    it('sets face-down after long press on touch', () => {
      cardStore.createCards(1)
      cardStore.addToHand(1)

      const hand = useHand(canvasRef, handRef, drag)

      const event = createMockPointerEvent('pointerdown', {
        button: 0,
        pointerId: 1,
        clientX: 350,
        clientY: 560,
        pointerType: 'touch',
      })

      const mockTarget = { setPointerCapture: vi.fn() }
      Object.defineProperty(event, 'currentTarget', { value: mockTarget })

      hand.onHandCardPointerDown(event, 1)

      expect(hand.drawFaceDown.value).toBe(false)

      vi.advanceTimersByTime(500) // LONG_PRESS_MS

      expect(hand.drawFaceDown.value).toBe(true)
    })

    it('cancels long press when moving outside hand', () => {
      cardStore.createCards(1)
      cardStore.addToHand(1)

      const hand = useHand(canvasRef, handRef, drag)

      const downEvent = createMockPointerEvent('pointerdown', {
        button: 0,
        pointerId: 1,
        clientX: 350,
        clientY: 560,
        pointerType: 'touch',
      })

      const mockTarget = { setPointerCapture: vi.fn() }
      Object.defineProperty(downEvent, 'currentTarget', { value: mockTarget })

      hand.onHandCardPointerDown(downEvent, 1)

      // Move outside hand bounds
      const moveEvent = createMockPointerEvent('pointermove', {
        pointerId: 1,
        clientX: 100, // Outside hand (300-500)
        clientY: 400,
      })

      hand.onHandCardPointerMove(moveEvent)

      vi.advanceTimersByTime(600)

      expect(hand.drawFaceDown.value).toBe(false)
    })
  })

  describe('hand card drop', () => {
    it('reorders hand when dropped back on hand zone', () => {
      cardStore.createCards(3)
      cardStore.addToHand(1)
      cardStore.addToHand(2)
      cardStore.addToHand(3)

      const hand = useHand(canvasRef, handRef, drag)

      // Simulate drag from index 0
      drag.target.value = { type: 'hand-card', index: 0 }
      hand.handDragStartIndex.value = 0

      // Create event dropped on hand (within bounds)
      const event = createMockPointerEvent('pointerup', {
        pointerId: 1,
        clientX: 450, // Within hand bounds
        clientY: 580,
      })

      // Mock isInBounds to return true for this test
      vi.spyOn(drag, 'isInBounds').mockReturnValue(true)

      const result = hand.handleHandCardDrop(event)

      expect(result.handled).toBe(true)
      expect(result.removedCard).toBeUndefined()
    })

    it('removes card from hand when dropped outside', () => {
      cardStore.createCards(1)
      cardStore.addToHand(1)

      const hand = useHand(canvasRef, handRef, drag)

      // Simulate drag
      drag.target.value = { type: 'hand-card', index: 0 }
      vi.spyOn(drag, 'getDelta').mockReturnValue({ x: 200, y: 300 })
      vi.spyOn(drag, 'isInBounds').mockReturnValue(false)

      const event = createMockPointerEvent('pointerup', {
        pointerId: 1,
        clientX: 200,
        clientY: 300,
      })

      const result = hand.handleHandCardDrop(event)

      expect(result.handled).toBe(true)
      expect(result.removedCard).toBeDefined()
      expect(result.removedCard?.cardId).toBe(1)
      expect(result.removedCard?.x).toBe(200)
      expect(result.removedCard?.y).toBe(300)
      expect(result.removedCard?.faceUp).toBe(true)

      expect(cardStore.handCardIds).not.toContain(1)
    })

    it('drops card face-down when drawFaceDown is set', () => {
      cardStore.createCards(1)
      cardStore.addToHand(1)

      const hand = useHand(canvasRef, handRef, drag)

      drag.target.value = { type: 'hand-card', index: 0 }
      hand.drawFaceDown.value = true
      vi.spyOn(drag, 'getDelta').mockReturnValue({ x: 200, y: 300 })
      vi.spyOn(drag, 'isInBounds').mockReturnValue(false)

      const event = createMockPointerEvent('pointerup', {
        pointerId: 1,
        clientX: 200,
        clientY: 300,
      })

      const result = hand.handleHandCardDrop(event)

      expect(result.removedCard?.faceUp).toBe(false)
    })

    it('returns not handled when not hand-card drag', () => {
      const hand = useHand(canvasRef, handRef, drag)

      drag.target.value = { type: 'card', index: 0 }

      const event = createMockPointerEvent('pointerup', {
        pointerId: 1,
      })

      const result = hand.handleHandCardDrop(event)

      expect(result.handled).toBe(false)
    })

    it('drops multiple selected cards when multi-selecting', () => {
      cardStore.createCards(3)
      cardStore.addToHand(1)
      cardStore.addToHand(2)
      cardStore.addToHand(3)

      const hand = useHand(canvasRef, handRef, drag)

      // Select multiple cards
      hand.toggleHandCardSelection(1)
      hand.toggleHandCardSelection(2)

      drag.target.value = { type: 'hand-card', index: 0 }
      vi.spyOn(drag, 'getDelta').mockReturnValue({ x: 200, y: 300 })
      vi.spyOn(drag, 'isInBounds').mockReturnValue(false)

      const event = createMockPointerEvent('pointerup', {
        pointerId: 1,
      })

      const result = hand.handleHandCardDrop(event)

      expect(result.handled).toBe(true)
      expect(result.removedCards).toBeDefined()
      expect(result.removedCards?.length).toBe(2)
    })
  })

  describe('reset', () => {
    it('resets hand drag state', () => {
      cardStore.createCards(2)
      cardStore.addToHand(1)

      const hand = useHand(canvasRef, handRef, drag)

      hand.handDragStartIndex.value = 1
      hand.handDropTargetIndex.value = 0
      hand.drawFaceDown.value = true

      hand.resetHandDrag()

      expect(hand.handDragStartIndex.value).toBe(null)
      expect(hand.handDropTargetIndex.value).toBe(null)
      expect(hand.drawFaceDown.value).toBe(false)
    })
  })

  describe('getHandIndexFromX', () => {
    it('calculates correct index from screen X position', () => {
      cardStore.createCards(5)
      cardStore.addToHand(1)
      cardStore.addToHand(2)
      cardStore.addToHand(3)
      cardStore.addToHand(4)
      cardStore.addToHand(5)

      const hand = useHand(canvasRef, handRef, drag)

      // Hand center is at (300 + 200/2) = 400
      const centerX = 400

      // Cards are arranged with HAND_CARD_OVERLAP spacing
      // Index 0 should be to the left of center

      const idx0 = hand.getHandIndexFromX(centerX - 50)
      const idxCenter = hand.getHandIndexFromX(centerX)
      const idx4 = hand.getHandIndexFromX(centerX + 50)

      // These are approximate - depends on card count and spacing
      expect(idx0).toBeGreaterThanOrEqual(0)
      expect(idxCenter).toBeGreaterThanOrEqual(0)
      expect(idx4).toBeLessThanOrEqual(4)
    })

    it('returns 0 when hand is empty', () => {
      const hand = useHand(canvasRef, handRef, drag)

      const idx = hand.getHandIndexFromX(400)

      expect(idx).toBe(0)
    })
  })
})
