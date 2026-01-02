<script setup lang="ts">
import { type Ref } from 'vue'
import Card from '@/components/CardComp.vue'
import { useCardStore } from '@/stores/cards'
import { useHand } from '@/composables/useHand'
import type { useDrag } from '@/composables/useDrag'

const props = defineProps<{
  canvasRef: Ref<HTMLElement | null> | null
  drag: ReturnType<typeof useDrag>
  isDropTarget: boolean
}>()

const emit = defineEmits<{
  cardPointerUp: [event: PointerEvent]
}>()

const cardStore = useCardStore()
const handRef = defineModel<HTMLElement | null>('handRef', { required: true })

// Use the hand composable
const hand = useHand(props.canvasRef, handRef as Ref<HTMLElement | null>, props.drag)

// Check if a specific card is being dragged from hand
const isDraggingCard = (cardId: number) => {
  return (
    props.drag.target.value?.type === 'hand-card' &&
    cardStore.cards[props.drag.target.value.index]?.id === cardId
  )
}

const onCardPointerUp = (event: PointerEvent) => {
  emit('cardPointerUp', event)
}

// Expose hand methods for parent component
defineExpose({
  handleHandCardDrop: hand.handleHandCardDrop,
  resetHandDrag: hand.resetHandDrag,
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
      <!-- Drop placeholder -->
      <div
        v-if="hand.handDropTargetIndex.value !== null && hand.handDragStartIndex.value !== null"
        class="hand__placeholder"
        :style="{ '--hand-x': `${hand.getHandCardX(hand.handDropTargetIndex.value)}px` }"
      />
      <Card
        v-for="(card, handIndex) in cardStore.handCards"
        :key="card.id"
        class="hand__card"
        :class="{ 'hand__card--dragging': isDraggingCard(card.id) }"
        :style="{
          '--col': card.col,
          '--row': card.row,
          '--hand-x': `${hand.getHandCardX(handIndex) + hand.getHandCardOffset(handIndex)}px`,
          zIndex: handIndex,
        }"
        @pointerdown="hand.onHandCardPointerDown($event, card.id)"
        @pointermove="hand.onHandCardPointerMove"
        @pointerup="onCardPointerUp"
        @pointercancel="onCardPointerUp"
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

.hand__placeholder {
  position: absolute;
  width: var(--tile-w);
  height: var(--tile-h);
  border: 2px dashed rgba(255, 255, 255, 0.6);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  transform: translateX(var(--hand-x, 0));
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

.hand__label {
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.5);
  pointer-events: none;
}
</style>
