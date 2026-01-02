<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import Card from '@/components/CardComp.vue'
import { useCardStore } from '@/stores/cards'
import { useCardInteraction } from '@/composables/useCardInteraction'
import { useHand } from '@/composables/useHand'

const cardStore = useCardStore()

// Create refs for template binding
const canvasRef = ref<HTMLElement | null>(null)
const deckRef = ref<HTMLElement | null>(null)
const handRef = ref<HTMLElement | null>(null)

// Set up card interaction first (to get shared drag instance)
const interaction = useCardInteraction({
  handRef: handRef,
  deckRef: deckRef,
})

// Set up hand management with shared drag instance
const hand = useHand(canvasRef, handRef, interaction.drag)

// Wire up hand card drop handler
interaction.setHandCardDropHandler((event) => hand.handleHandCardDrop(event))

// Wrap pointer up to pass handRef
const onPointerUp = (event: PointerEvent) => {
  interaction.onCardPointerUp(event, handRef)
}

// Wrap hand card pointer up
const onHandCardPointerUp = (event: PointerEvent) => {
  onPointerUp(event)
}

onMounted(() => {
  interaction.initCards(10, canvasRef)
})

onBeforeUnmount(() => {
  interaction.drag.cancelRaf()
})
</script>

<template>
  <div ref="canvasRef" class="canvas">
    <Card
      v-for="(card, index) in cardStore.cards"
      v-show="!card.inHand"
      :key="card.id"
      :class="{
        dragging: interaction.drag.activeIndex.value === index,
        'in-deck': card.isInDeck,
        'stack-target': interaction.hover.state.ready && interaction.hover.state.cardId === card.id,
        'face-down': !card.faceUp,
        selected: cardStore.isSelected(card.id),
      }"
      :style="{
        '--col': interaction.getCardCol(index),
        '--row': interaction.getCardRow(index),
        transform: `translate3d(${card.x}px, ${card.y}px, 0)`,
        zIndex: interaction.getCardZ(index),
      }"
      @pointerdown="interaction.onCardPointerDown($event, index)"
      @pointermove="interaction.onCardPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @contextmenu="interaction.onCardContextMenu"
      @dblclick="interaction.onCardDoubleClick($event, index)"
    />

    <div ref="deckRef" class="deck" aria-hidden="true">
      <span class="deck__label">Deck</span>
      <span class="deck__count">{{ cardStore.deckCount }}</span>
    </div>

    <!-- Player hand zone -->
    <div
      ref="handRef"
      class="hand"
      :class="{ 'hand--drop-target': interaction.isOverHand.value }"
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
          :class="{
            'hand__card--dragging':
              interaction.drag.target.value?.type === 'hand-card' &&
              cardStore.cards[interaction.drag.target.value.index]?.id === card.id,
          }"
          :style="{
            '--col': card.col,
            '--row': card.row,
            '--hand-x': `${hand.getHandCardX(handIndex) + hand.getHandCardOffset(handIndex)}px`,
            zIndex: handIndex,
          }"
          @pointerdown="hand.onHandCardPointerDown($event, card.id)"
          @pointermove="hand.onHandCardPointerMove"
          @pointerup="onHandCardPointerUp"
          @pointercancel="onHandCardPointerUp"
        />
      </div>
      <span v-if="cardStore.handCount === 0" class="hand__label">Hand</span>
    </div>

    <!-- Selection count indicator -->
    <div v-if="cardStore.hasSelection" class="selection-indicator">
      {{ cardStore.selectionCount }} selected
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
  box-shadow:
    0 0 0 2px rgba(255, 255, 255, 0.6),
    0 0 8px rgba(255, 255, 255, 0.3);
  animation: stack-glow 2s ease-in-out infinite;
}

.selected {
  outline: 2px solid rgba(0, 150, 255, 0.9);
  outline-offset: 1px;
  box-shadow: 0 0 8px rgba(0, 150, 255, 0.6);
}

.selection-indicator {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  pointer-events: none;
}

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

@keyframes stack-glow {
  0%,
  100% {
    box-shadow:
      0 0 0 2px rgba(255, 255, 255, 0.6),
      0 0 8px rgba(255, 255, 255, 0.3);
  }
  50% {
    box-shadow:
      0 0 0 2px rgba(255, 255, 255, 0.8),
      0 0 12px rgba(255, 255, 255, 0.4);
  }
}
</style>
