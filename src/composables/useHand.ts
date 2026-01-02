import { computed, type Ref } from 'vue'
import { useCardStore } from '@/stores/cards'
import type { useDrag } from '@/composables/useDrag'
import type { DragTarget } from '@/types'
import { CARD_W, HAND_CARD_OVERLAP, LONG_PRESS_MS } from '@/types'
import { ref } from 'vue'

export function useHand(
  canvasRef: Ref<HTMLElement | null> | null,
  handRef: Ref<HTMLElement | null>,
  drag: ReturnType<typeof useDrag>,
) {
  const cardStore = useCardStore()

  // Track original hand index for reordering
  const handDragStartIndex = ref<number | null>(null)
  const handDropTargetIndex = ref<number | null>(null)
  // Track if card should be drawn face-down (right-click or long-press on touch)
  const drawFaceDown = ref(false)
  // Long-press timer for touch face-down draw
  let longPressTimer: number | null = null

  // Hand card position calculation
  const getHandCardX = (index: number): number => {
    const totalCards = cardStore.handCount
    const totalWidth = (totalCards - 1) * HAND_CARD_OVERLAP + CARD_W
    const startX = -totalWidth / 2
    return startX + index * HAND_CARD_OVERLAP
  }

  // Computed hand width based on card count
  const handWidth = computed(() => {
    const count = cardStore.handCount
    if (count === 0) return 120 // min-width when empty
    return (count - 1) * HAND_CARD_OVERLAP + CARD_W + 48 // +48 for padding
  })

  // Calculate hand index from screen X position (relative to hand center)
  const getHandIndexFromX = (screenX: number): number => {
    const handEl = handRef.value
    if (!handEl) return 0

    const handRect = handEl.getBoundingClientRect()
    const handCenterX = handRect.left + handRect.width / 2
    const relativeX = screenX - handCenterX

    const totalCards = cardStore.handCount
    if (totalCards === 0) return 0

    const totalWidth = (totalCards - 1) * HAND_CARD_OVERLAP + CARD_W
    const startX = -totalWidth / 2

    // Calculate index from position
    const idx = Math.round((relativeX - startX) / HAND_CARD_OVERLAP)
    return Math.max(0, Math.min(totalCards - 1, idx))
  }

  // Calculate offset for cards to make room for drop placeholder
  const getHandCardOffset = (handIndex: number): number => {
    const start = handDragStartIndex.value
    const target = handDropTargetIndex.value
    if (start === null || target === null || start === target) return 0
    if (handIndex === start) return 0 // Dragged card doesn't shift

    if (start < target) {
      // Dragging right: cards between start+1 and target shift left
      if (handIndex > start && handIndex <= target) {
        return -HAND_CARD_OVERLAP
      }
    } else {
      // Dragging left: cards between target and start-1 shift right
      if (handIndex >= target && handIndex < start) {
        return HAND_CARD_OVERLAP
      }
    }
    return 0
  }

  const clearLongPressTimer = () => {
    if (longPressTimer !== null) {
      window.clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }

  const startHandCardDrag = (event: PointerEvent, cardId: number, faceDown: boolean) => {
    const index = cardStore.cards.findIndex((c) => c.id === cardId)
    if (index === -1) return

    // Store the hand index for reordering
    handDragStartIndex.value = cardStore.handCardIds.indexOf(cardId)
    drawFaceDown.value = faceDown

    drag.initPointer(event, canvasRef)

    const target: DragTarget = { type: 'hand-card', index }
    drag.target.value = target
    drag.activeIndex.value = index
    drag.isDragging.value = true
    drag.setOffset(CARD_W / 2, 30) // Drag from center-ish of card
  }

  // Hand card event handlers
  const onHandCardPointerDown = (event: PointerEvent, cardId: number) => {
    // Accept left-click (0) or right-click (2)
    if (event.button !== 0 && event.button !== 2) return

    event.preventDefault()
    const targetEl = event.currentTarget as HTMLElement | null
    targetEl?.setPointerCapture(event.pointerId)

    // Right-click: immediately start face-down drag
    if (event.button === 2) {
      startHandCardDrag(event, cardId, true)
      return
    }

    // Left-click: start normal drag, but set up long-press for face-down (touch support)
    // Detect touch by checking pointer type
    const isTouch = event.pointerType === 'touch'

    if (isTouch) {
      // For touch: set up long-press timer for face-down draw
      clearLongPressTimer()
      longPressTimer = window.setTimeout(() => {
        longPressTimer = null
        // Convert to face-down drag
        drawFaceDown.value = true
      }, LONG_PRESS_MS)
    }

    startHandCardDrag(event, cardId, false)
  }

  const onHandCardPointerMove = (event: PointerEvent) => {
    if (!drag.isValidPointer(event.pointerId)) return
    drag.updatePending(event, canvasRef)

    // Clear long-press timer on significant movement (user is dragging, not long-pressing)
    // Only clear if moving outside hand zone (reordering doesn't cancel long-press)
    if (longPressTimer !== null && !drag.isInBounds(event, handRef)) {
      clearLongPressTimer()
    }

    // Update drop target index for placeholder
    if (drag.target.value?.type === 'hand-card' && drag.isInBounds(event, handRef)) {
      handDropTargetIndex.value = getHandIndexFromX(event.clientX)
    } else {
      handDropTargetIndex.value = null
    }
  }

  const handleHandCardDrop = (event: PointerEvent) => {
    clearLongPressTimer()

    if (drag.target.value?.type !== 'hand-card') return false

    const card = cardStore.cards[drag.target.value.index]
    if (!card) return false

    // If dropped back on hand zone, possibly reorder
    if (drag.isInBounds(event, handRef)) {
      const targetIndex = getHandIndexFromX(event.clientX)
      if (handDragStartIndex.value !== null && targetIndex !== handDragStartIndex.value) {
        cardStore.reorderHand(handDragStartIndex.value, targetIndex)
      }
    } else {
      // Remove from hand and place on canvas
      cardStore.removeFromHand(card.id)
      card.x = drag.getDelta().x
      card.y = drag.getDelta().y
      // Set face-down if right-click drag or long-press
      card.faceUp = !drawFaceDown.value
      cardStore.bumpCardZ(card.id)
    }

    handDragStartIndex.value = null
    handDropTargetIndex.value = null
    drawFaceDown.value = false
    return true
  }

  const resetHandDrag = () => {
    clearLongPressTimer()
    handDragStartIndex.value = null
    handDropTargetIndex.value = null
    drawFaceDown.value = false
  }

  return {
    drawFaceDown,
    handDragStartIndex,
    handDropTargetIndex,
    handWidth,
    getHandCardX,
    getHandIndexFromX,
    getHandCardOffset,
    onHandCardPointerDown,
    onHandCardPointerMove,
    handleHandCardDrop,
    resetHandDrag,
  }
}
