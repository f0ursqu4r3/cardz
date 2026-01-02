import { computed, type Ref } from 'vue'
import { useCardStore } from '@/stores/cards'
import type { useDrag } from '@/composables/useDrag'
import type { DragTarget } from '@/types'
import { CARD_W, HAND_CARD_OVERLAP } from '@/types'
import { ref } from 'vue'

export function useHand(
  canvasRef: Ref<HTMLElement | null>,
  handRef: Ref<HTMLElement | null>,
  drag: ReturnType<typeof useDrag>,
) {
  const cardStore = useCardStore()

  // Track original hand index for reordering
  const handDragStartIndex = ref<number | null>(null)
  const handDropTargetIndex = ref<number | null>(null)

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

  // Hand card event handlers
  const onHandCardPointerDown = (event: PointerEvent, cardId: number) => {
    if (event.button !== 0) return

    event.preventDefault()
    const targetEl = event.currentTarget as HTMLElement | null
    targetEl?.setPointerCapture(event.pointerId)

    const index = cardStore.cards.findIndex((c) => c.id === cardId)
    if (index === -1) return

    // Store the hand index for reordering
    handDragStartIndex.value = cardStore.handCardIds.indexOf(cardId)

    drag.initPointer(event, canvasRef)

    const target: DragTarget = { type: 'hand-card', index }
    drag.target.value = target
    drag.activeIndex.value = index
    drag.isDragging.value = true
    drag.setOffset(CARD_W / 2, 30) // Drag from center-ish of card
  }

  const onHandCardPointerMove = (event: PointerEvent) => {
    if (!drag.isValidPointer(event.pointerId)) return
    drag.updatePending(event, canvasRef)

    // Update drop target index for placeholder
    if (drag.target.value?.type === 'hand-card' && drag.isInBounds(event, handRef)) {
      handDropTargetIndex.value = getHandIndexFromX(event.clientX)
    } else {
      handDropTargetIndex.value = null
    }
  }

  const handleHandCardDrop = (event: PointerEvent) => {
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
      cardStore.bumpCardZ(card.id)
    }

    handDragStartIndex.value = null
    handDropTargetIndex.value = null
    return true
  }

  const resetHandDrag = () => {
    handDragStartIndex.value = null
    handDropTargetIndex.value = null
  }

  return {
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
