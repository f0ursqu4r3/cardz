<script setup lang="ts">
import { computed, type Ref } from 'vue'
import Card from '@/components/CardComp.vue'
import { useCardStore } from '@/stores/cards'
import { useHand } from '@/composables/useHand'
import type { useDrag } from '@/composables/useDrag'

const props = defineProps<{
  canvasRef: HTMLElement | null
  drag: ReturnType<typeof useDrag>
  isDropTarget: boolean
}>()

const emit = defineEmits<{
  cardPointerUp: [event: PointerEvent]
}>()

const cardStore = useCardStore()
const handRef = defineModel<HTMLElement | null>('handRef', { required: true })
const canvasRef = computed<HTMLElement | null>(() => props.canvasRef)

// Use the hand composable
const hand = useHand(canvasRef, handRef as Ref<HTMLElement | null>, props.drag)

// Check if a specific card is being dragged from hand
const isDraggingCard = (cardId: number) => {
  return (
    props.drag.target.value?.type === 'hand-card' &&
    cardStore.cards[props.drag.target.value.index]?.id === cardId
  )
}

// Get the card being dragged for ghost display
const draggedCard = computed(() => {
  if (props.drag.target.value?.type !== 'hand-card') return null
  return cardStore.cards[props.drag.target.value.index] ?? null
})

// Check if we're in reorder mode (dragging within hand)
const isReordering = computed(() => {
  return hand.handDropTargetIndex.value !== null && hand.handDragStartIndex.value !== null
})

const onCardPointerUp = (event: PointerEvent) => {
  emit('cardPointerUp', event)
}

// Prevent context menu on right-click drag
const onCardContextMenu = (event: Event) => {
  event.preventDefault()
}

// Expose hand methods for parent component
defineExpose({
  handleHandCardDrop: hand.handleHandCardDrop,
  resetHandDrag: hand.resetHandDrag,
  drawFaceDown: hand.drawFaceDown,
  handDropTargetIndex: hand.handDropTargetIndex,
  handDragStartIndex: hand.handDragStartIndex,
  getHandCardX: hand.getHandCardX,
})
</script>

<template>
  <div
    ref="handRef"
    class="hand"
    :class="{ 'hand--drop-target': isDropTarget }"
    :style="{ width: `${hand.handWidth.value}px` }"
  >
    <div class="hand__cards">
      <!-- Placeholder when dragging card out of hand -->
      <div
        v-if="draggedCard && !isReordering && hand.handDragStartIndex.value !== null"
        class="hand__placeholder"
        :style="{
          '--hand-x': `${hand.getHandCardX(hand.handDragStartIndex.value)}px`,
          zIndex: hand.handDragStartIndex.value,
        }"
      />
      <Card
        v-for="(card, handIndex) in cardStore.handCards"
        :key="card.id"
        class="hand__card"
        :class="{
          'hand__card--hidden': isDraggingCard(card.id),
          'hand__card--face-down': isDraggingCard(card.id) && hand.drawFaceDown.value,
        }"
        :style="{
          '--col': hand.drawFaceDown.value && isDraggingCard(card.id) ? 13 : card.col,
          '--row': hand.drawFaceDown.value && isDraggingCard(card.id) ? 1 : card.row,
          '--hand-x': `${hand.getHandCardX(handIndex) + hand.getHandCardOffset(handIndex)}px`,
          zIndex: handIndex,
        }"
        @pointerdown="hand.onHandCardPointerDown($event, card.id)"
        @pointermove="hand.onHandCardPointerMove"
        @pointerup="onCardPointerUp"
        @pointercancel="onCardPointerUp"
        @contextmenu="onCardContextMenu"
      />
      <!-- Ghost card for reordering -->
      <Card
        v-if="isReordering && draggedCard && hand.handDropTargetIndex.value !== null"
        class="hand__ghost"
        :style="{
          '--col': draggedCard.col,
          '--row': draggedCard.row,
          '--hand-x': `${hand.getHandCardX(hand.handDropTargetIndex.value)}px`,
          zIndex: 100,
        }"
      />
    </div>
    <span v-if="cardStore.handCount === 0" class="hand__label">Hand</span>
  </div>
</template>

<style scoped>
.hand {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  height: calc(var(--tile-h) + 32px);
  padding: 8px 24px;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.2) 0%,
    rgba(0, 0, 0, 0.05) 75%,
    transparent 100%
  );
  box-shadow: inset 0px 0px 4px -2px rgba(255, 255, 255, 0.3);
  border-radius: 12px 12px 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    width 0.2s ease-out,
    box-shadow 0.2s ease-out;
}

.hand--drop-target {
  box-shadow:
    0 0 0 2px rgba(100, 200, 255, 0.7),
    0 0 20px rgba(100, 200, 255, 0.4),
    inset 0 0 30px rgba(100, 200, 255, 0.1);
}

.hand__cards {
  position: relative;
  height: var(--tile-h);
  width: 0;
  pointer-events: none;
}

.hand__card {
  position: absolute;
  cursor: grab;
  transition: transform 0.15s ease-out;
  pointer-events: auto;
  transform: translateX(var(--hand-x, 0));
}

.hand__card:hover {
  transform: translateX(var(--hand-x, 0)) translateY(-10px);
}

.hand__card--dragging {
  opacity: 0.5;
}

.hand__card--hidden {
  opacity: 0;
  pointer-events: none;
}

.hand__placeholder {
  position: absolute;
  width: var(--tile-w);
  height: var(--tile-h);
  border: 2px dashed rgba(255, 255, 255, 0.5);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  transform: translateX(var(--hand-x, 0));
  pointer-events: none;
}

.hand__ghost {
  position: absolute;
  transform: translateX(var(--hand-x, 0));
  pointer-events: none;
  opacity: 0.7;
}

.hand__label {
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.5);
  pointer-events: none;
}
</style>
