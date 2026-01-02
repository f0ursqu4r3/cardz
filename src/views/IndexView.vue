<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Card from '@/components/CardComp.vue'
import { useCardStore } from '@/stores/cards'
import { useCardInteraction } from '@/composables/useCardInteraction'
import { useHand } from '@/composables/useHand'

const cardStore = useCardStore()

// Create refs for template binding
const canvasRef = ref<HTMLElement | null>(null)
const handRef = ref<HTMLElement | null>(null)
const zoneLabelInputRef = ref<HTMLInputElement | null>(null)

// Set up card interaction first (to get shared drag instance)
const interaction = useCardInteraction({
  handRef: handRef,
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

// Zone label editing
const finishZoneLabelEdit = () => {
  cardStore.editingZoneId = null
}

const onZoneLabelKeydown = (event: KeyboardEvent, zoneId: number) => {
  if (event.key === 'Enter') {
    finishZoneLabelEdit()
  } else if (event.key === 'Escape') {
    finishZoneLabelEdit()
  }
}

const onZoneLabelInput = (event: Event, zoneId: number) => {
  const target = event.target as HTMLInputElement
  cardStore.updateZone(zoneId, { label: target.value })
}

// Toggle zone face up/down
const toggleZoneFaceUp = (zoneId: number) => {
  const zone = cardStore.zones.find((z) => z.id === zoneId)
  if (zone) {
    cardStore.updateZone(zoneId, { faceUp: !zone.faceUp })
  }
}

// Create new zone
const createNewZone = () => {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (rect) {
    cardStore.createZone(rect.width / 2 - 33, rect.height / 2 - 42, 'New Zone', false)
  }
}

// Focus input when editing zone
watch(
  () => cardStore.editingZoneId,
  async (zoneId) => {
    if (zoneId !== null) {
      await nextTick()
      zoneLabelInputRef.value?.focus()
      zoneLabelInputRef.value?.select()
    }
  },
)

onMounted(() => {
  interaction.initCards(10, canvasRef)
})

onBeforeUnmount(() => {
  interaction.drag.cancelRaf()
})
</script>

<template>
  <div ref="canvasRef" class="canvas" @dblclick="createNewZone">
    <!-- Zones (deck areas) -->
    <div
      v-for="zone in cardStore.zones"
      :key="zone.id"
      class="zone"
      :class="{
        'zone--dragging':
          interaction.drag.target.value?.type === 'zone' &&
          interaction.drag.target.value.zoneId === zone.id,
        'zone--face-down': !zone.faceUp,
      }"
      :style="{
        transform: `translate3d(${zone.x}px, ${zone.y}px, 0)`,
        width: `${zone.width}px`,
        height: `${zone.height}px`,
      }"
      @pointerdown="interaction.onZonePointerDown($event, zone.id)"
      @pointermove="interaction.onZonePointerMove"
      @pointerup="interaction.onZonePointerUp"
      @pointercancel="interaction.onZonePointerUp"
      @dblclick.stop="interaction.onZoneDoubleClick($event, zone.id)"
      @contextmenu.prevent
    >
      <div class="zone__header">
        <input
          v-if="cardStore.editingZoneId === zone.id"
          ref="zoneLabelInputRef"
          type="text"
          class="zone__label-input"
          :value="zone.label"
          @input="onZoneLabelInput($event, zone.id)"
          @keydown="onZoneLabelKeydown($event, zone.id)"
          @blur="finishZoneLabelEdit"
          @pointerdown.stop
        />
        <span v-else class="zone__label">{{ zone.label }}</span>
        <span class="zone__count">{{ cardStore.getZoneCardCount(zone.id) }}</span>
      </div>
      <button
        class="zone__face-toggle"
        :title="zone.faceUp ? 'Cards face up' : 'Cards face down'"
        @click.stop="toggleZoneFaceUp(zone.id)"
        @pointerdown.stop
      >
        {{ zone.faceUp ? '👁' : '🂠' }}
      </button>
      <div class="zone__resize-handle" />
    </div>

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

.zone {
  position: absolute;
  border: 2px dashed rgba(255, 255, 255, 0.7);
  border-radius: 8px;
  color: #f0f0f0;
  background-color: rgba(0, 0, 0, 0.15);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2) inset;
  cursor: grab;
  touch-action: none;
}

.zone--dragging {
  cursor: grabbing;
  opacity: 0.8;
}

.zone--face-down {
  border-color: rgba(255, 200, 100, 0.7);
}

.zone__header {
  position: absolute;
  top: 4px;
  left: 4px;
  right: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  pointer-events: none;
}

.zone__label {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.zone__label-input {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 2px;
  color: #f0f0f0;
  padding: 1px 4px;
  width: 100%;
  outline: none;
  pointer-events: auto;
}

.zone__count {
  font-weight: 700;
  font-size: 12px;
  flex-shrink: 0;
}

.zone__face-toggle {
  position: absolute;
  bottom: 4px;
  left: 4px;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.3);
  color: #f0f0f0;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.zone__face-toggle:hover {
  background: rgba(0, 0, 0, 0.5);
}

.zone__resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: se-resize;
  background: linear-gradient(
    135deg,
    transparent 50%,
    rgba(255, 255, 255, 0.3) 50%
  );
  border-radius: 0 0 6px 0;
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
