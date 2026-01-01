<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Card from '@/components/CardComp.vue'
import { useCardStore } from '@/stores/cards'
import { useDrag } from '@/composables/useDrag'
import { useHover } from '@/composables/useHover'
import type { DragTarget } from '@/types'
import { CARD_BACK_COL, CARD_BACK_ROW } from '@/types'

const canvasRef = ref<HTMLElement | null>(null)
const deckRef = ref<HTMLElement | null>(null)

const cardStore = useCardStore()
const drag = useDrag()
const hover = useHover()

// Deck anchor helper
const getDeckAnchor = (): { x: number; y: number } | null => {
  const deckRect = deckRef.value?.getBoundingClientRect()
  const canvasRect = canvasRef.value?.getBoundingClientRect()
  if (!deckRect || !canvasRect) return null
  return {
    x: deckRect.left - canvasRect.left + 8,
    y: deckRect.top - canvasRect.top + 8,
  }
}

// Computed z-index for cards
const getCardZ = (index: number) => {
  const card = cardStore.cards[index]
  if (!card) return 0

  const draggingStackId = drag.target.value?.type === 'stack' ? drag.target.value.stackId : null

  return cardStore.cardZ(card, index, drag.activeIndex.value, draggingStackId)
}

// Apply pending position during drag
const applyPendingPosition = () => {
  if (!drag.isDragging.value || !drag.target.value) return

  const { x, y } = drag.getDelta()

  if (drag.target.value.type === 'stack') {
    const stackId = drag.target.value.stackId
    const stack = cardStore.stacks.find((item) => item.id === stackId)
    if (!stack) return

    stack.anchorX = x
    stack.anchorY = y
    cardStore.updateStackPositions(stack, getDeckAnchor)
    return
  }

  const card = cardStore.cards[drag.target.value.index]
  if (!card) return

  card.x = x
  card.y = y
}

// Start dragging a stack (long press)
const startStackDrag = (index: number) => {
  if (drag.isDragging.value) return

  const card = cardStore.cards[index]
  if (!card || card.stackId === null) return

  const stack = cardStore.stacks.find((item) => item.id === card.stackId)
  if (!stack) return

  const { x, y } = drag.getPending()
  const target: DragTarget = { type: 'stack', stackId: stack.id, index }

  drag.target.value = target
  drag.activeIndex.value = index
  drag.isDragging.value = true

  // Calculate offset from stack anchor
  const offsetX = x - stack.anchorX
  const offsetY = y - stack.anchorY

  // Manually set internal state for offset
  drag.startDrag(
    { pointerId: 0, clientX: x, clientY: y } as PointerEvent,
    index,
    offsetX,
    offsetY,
    canvasRef,
    target,
  )

  hover.reset()
  drag.schedulePositionUpdate(applyPendingPosition)
}

// Start dragging a single card
const startCardDrag = (index: number): boolean => {
  if (drag.isDragging.value) return false

  const card = cardStore.cards[index]
  if (!card) return false

  // If card is in a stack, only allow dragging from top
  if (card.stackId !== null) {
    const stack = cardStore.stacks.find((item) => item.id === card.stackId)
    if (!stack) return false

    const topId = stack.cardIds[stack.cardIds.length - 1]
    if (topId !== card.id) return false

    cardStore.removeFromStack(card.id)
  }

  const { x, y } = drag.getPending()
  const target: DragTarget = { type: 'card', index }

  drag.startDrag(
    { pointerId: 0, clientX: x, clientY: y } as PointerEvent,
    index,
    card.x,
    card.y,
    canvasRef,
    target,
  )

  hover.reset()
  drag.schedulePositionUpdate(applyPendingPosition)
  return true
}

// Pointer event handlers
const onCardPointerDown = (event: PointerEvent, index: number) => {
  // Left-click (0) or right-click (2) only
  if (event.button !== 0 && event.button !== 2) return

  event.preventDefault()
  const targetEl = event.currentTarget as HTMLElement | null
  targetEl?.setPointerCapture(event.pointerId)

  drag.initPointer(event, canvasRef)
  drag.activeIndex.value = index

  const card = cardStore.cards[index]
  const isInStack = card && card.stackId !== null

  // Right-click on stacked card = immediate stack drag
  if (event.button === 2 && isInStack) {
    startStackDrag(index)
    return
  }

  // Left-click on stacked card = long-press for stack, move for card
  if (isInStack) {
    drag.setLongPressTimer(() => startStackDrag(index))
  } else {
    startCardDrag(index)
  }
}

// Prevent context menu on right-click drag
const onCardContextMenu = (event: Event) => {
  event.preventDefault()
}

// Double-click to flip card
const onCardDoubleClick = (event: MouseEvent, index: number) => {
  event.preventDefault()
  const card = cardStore.cards[index]
  if (!card) return

  if (event.button === 2 && card.stackId !== null) {
    // Right double-click on stacked card = flip entire stack
    cardStore.flipStack(card.stackId)
  } else {
    // Left double-click = flip single card (top of stack if stacked)
    cardStore.flipCard(card.id)
  }
}

// Get the sprite column for a card (face or back)
const getCardCol = (index: number) => {
  const card = cardStore.cards[index]
  return card?.faceUp ? card.col : CARD_BACK_COL
}

// Get the sprite row for a card (face or back)
const getCardRow = (index: number) => {
  const card = cardStore.cards[index]
  return card?.faceUp ? card.row : CARD_BACK_ROW
}

const onCardPointerMove = (event: PointerEvent) => {
  if (!drag.isValidPointer(event.pointerId)) return

  drag.updatePending(event, canvasRef)

  // Try to start card drag if not already dragging
  if (!drag.isDragging.value && drag.activeIndex.value !== null) {
    const card = cardStore.cards[drag.activeIndex.value]
    if (card && card.stackId !== null) {
      if (startCardDrag(drag.activeIndex.value)) {
        drag.clearLongPressTimer()
      }
    }
  }

  if (!drag.isDragging.value) return

  // Update hover target for card drags
  if (drag.target.value?.type === 'card') {
    const draggingId =
      drag.activeIndex.value !== null ? (cardStore.cards[drag.activeIndex.value]?.id ?? -1) : -1
    const { x, y } = drag.getPending()
    hover.update(x, y, cardStore.cards, draggingId, (card, idx) =>
      cardStore.cardZ(card, idx, drag.activeIndex.value, null),
    )
  }

  drag.schedulePositionUpdate(applyPendingPosition)
}

const onCardPointerUp = (event: PointerEvent) => {
  if (!drag.isValidPointer(event.pointerId)) return

  const targetEl = event.currentTarget as HTMLElement | null
  targetEl?.releasePointerCapture(event.pointerId)

  drag.clearLongPressTimer()

  if (!drag.isDragging.value) {
    drag.reset()
    hover.reset()
    return
  }

  applyPendingPosition()

  // Handle stack drop
  if (drag.target.value?.type === 'stack') {
    if (drag.isInBounds(event, deckRef)) {
      const stackId = drag.target.value.stackId
      const stack = cardStore.stacks.find((item) => item.id === stackId)
      if (stack) {
        const ids = [...stack.cardIds]
        ids.forEach((id) => cardStore.addToDeckZone(id, getDeckAnchor))
      }
    }
  }
  // Handle card drop
  else if (drag.activeIndex.value !== null) {
    const card = cardStore.cards[drag.activeIndex.value]
    if (card) {
      let stacked = false

      // Try to stack on hover target
      if (hover.state.ready && hover.state.cardId) {
        stacked = cardStore.stackCardOnTarget(card.id, hover.state.cardId)
      }

      // Try to add to deck zone
      if (!stacked && drag.isInBounds(event, deckRef)) {
        stacked = cardStore.addToDeckZone(card.id, getDeckAnchor)
      }

      // Reset card state if not stacked
      if (!stacked) {
        card.stackId = null
        card.isInDeck = false
        cardStore.bumpCardZ(card.id)
      }
    }
  }

  drag.reset()
  hover.reset()
  cardStore.updateAllStacks(getDeckAnchor)
}

onMounted(() => {
  const rect = canvasRef.value?.getBoundingClientRect()
  cardStore.createCards(10, rect?.width, rect?.height)
  cardStore.updateAllStacks(getDeckAnchor)
})

onBeforeUnmount(() => {
  drag.cancelRaf()
})
</script>

<template>
  <div ref="canvasRef" class="canvas">
    <Card
      v-for="(card, index) in cardStore.cards"
      :key="card.id"
      :class="{
        dragging: drag.activeIndex.value === index,
        'in-deck': card.isInDeck,
        'stack-target': hover.state.ready && hover.state.cardId === card.id,
        'face-down': !card.faceUp,
      }"
      :style="{
        '--col': getCardCol(index),
        '--row': getCardRow(index),
        transform: `translate3d(${card.x}px, ${card.y}px, 0)`,
        zIndex: getCardZ(index),
      }"
      @pointerdown="onCardPointerDown($event, index)"
      @pointermove="onCardPointerMove"
      @pointerup="onCardPointerUp"
      @pointercancel="onCardPointerUp"
      @contextmenu="onCardContextMenu"
      @dblclick="onCardDoubleClick($event, index)"
    />

    <div ref="deckRef" class="deck" aria-hidden="true">
      <span class="deck__label">Deck</span>
      <span class="deck__count">{{ cardStore.deckCount }}</span>
    </div>
  </div>
</template>

<style scoped>
.canvas {
  width: 100%;
  height: 100%;
  background:
    radial-gradient(1200px 800px at 30% 25%, rgba(255, 255, 255, 0.08), transparent 55%),
    radial-gradient(900px 700px at 70% 75%, rgba(0, 0, 0, 0.25), transparent 60%),
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.02) 0 2px, rgba(0, 0, 0, 0.02) 2px 4px),
    linear-gradient(180deg, #1f7a3a 0%, #0f4f27 100%);
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.06),
    inset 0 0 80px rgba(0, 0, 0, 0.35);
  position: relative;
  overflow: hidden;
  user-select: none;
  touch-action: none;
}

.deck {
  position: absolute;
  right: 24px;
  bottom: 24px;
  width: calc(var(--tile-w) + 24px);
  height: calc(var(--tile-h) + 24px);
  border: 2px dashed rgba(255, 255, 255, 0.7);
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 10px;
  color: #f0f0f0;
  background-color: rgba(0, 0, 0, 0.15);
  pointer-events: none;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2) inset;
}

.deck__label {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.deck__count {
  font-weight: 700;
  font-size: 14px;
}

.stack-target {
  outline: 2px solid rgba(255, 255, 0, 0.9);
  outline-offset: 2px;
  box-shadow: 0 0 6px rgba(255, 255, 0, 0.7);
}
</style>
