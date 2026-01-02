<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Card from '@/components/CardComp.vue'
import ZoneComp from '@/components/ZoneComp.vue'
import HandComp from '@/components/HandComp.vue'
import { useCardStore } from '@/stores/cards'
import { useCardInteraction } from '@/composables/useCardInteraction'
import { SquarePlus } from 'lucide-vue-next'
import { CARD_BACK_COL, CARD_BACK_ROW } from '@/types'

const cardStore = useCardStore()

// Create refs for template binding
const canvasRef = ref<HTMLElement | null>(null)
const handRef = ref<HTMLElement | null>(null)
const handCompRef = ref<InstanceType<typeof HandComp> | null>(null)

// Set up card interaction
const interaction = useCardInteraction({
  handRef: handRef,
})

// Ghost card for hand dragging
const handDragCard = computed(() => {
  if (interaction.drag.target.value?.type !== 'hand-card') return null
  const index = interaction.drag.target.value.index
  return cardStore.cards[index] ?? null
})

// Check if ghost card is in reorder mode (inside hand zone)
const isHandReordering = computed(() => {
  return (
    handCompRef.value?.handDropTargetIndex !== null &&
    handCompRef.value?.handDragStartIndex !== null
  )
})

const handDragPosition = computed(() => interaction.drag.position.value)

// Wire up hand card drop handler
interaction.setHandCardDropHandler((event) => handCompRef.value?.handleHandCardDrop(event) ?? false)

// Wrap pointer up to pass handRef
const onPointerUp = (event: PointerEvent) => {
  interaction.onCardPointerUp(event, handRef)
}

// Check if a zone is being dragged
const isZoneDragging = (zoneId: number) => {
  return (
    interaction.drag.target.value?.type === 'zone' &&
    interaction.drag.target.value.zoneId === zoneId
  )
}

// Create new zone at center of canvas
const addZone = () => {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (rect) {
    cardStore.createZone(rect.width / 2 - 50, rect.height / 2 - 50, 'New Zone', false)
  }
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
    <!-- Table UI -->
    <div class="table-ui">
      <button class="table-ui__btn" @click="addZone" title="Add Zone">
        <SquarePlus class="table-ui__icon" />
      </button>
    </div>

    <!-- Zones (deck areas) -->
    <ZoneComp
      v-for="zone in cardStore.zones"
      :key="zone.id"
      :zone="zone"
      :is-dragging="isZoneDragging(zone.id)"
      @pointerdown="interaction.onZonePointerDown($event, zone.id)"
      @pointermove="interaction.onZonePointerMove"
      @pointerup="interaction.onZonePointerUp"
    />

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
        shuffling:
          cardStore.shufflingStackId !== null && card.stackId === cardStore.shufflingStackId,
      }"
      :style="{
        '--col': interaction.getCardCol(index),
        '--row': interaction.getCardRow(index),
        '--shuffle-seed': card.id % 10,
        left: `${card.x}px`,
        top: `${card.y}px`,
        zIndex: interaction.getCardZ(index),
        transform:
          interaction.drag.activeIndex.value === index ||
          interaction.physics.throwingCardId.value === card.id
            ? `rotate(${interaction.physics.tilt.value}deg)`
            : undefined,
      }"
      @pointerdown="interaction.onCardPointerDown($event, index)"
      @pointermove="interaction.onCardPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @contextmenu="interaction.onCardContextMenu"
      @dblclick="interaction.onCardDoubleClick($event, index)"
    />

    <!-- Player hand -->
    <HandComp
      ref="handCompRef"
      v-model:hand-ref="handRef"
      :canvas-ref="canvasRef"
      :drag="interaction.drag"
      :is-drop-target="interaction.isOverHand.value"
      @card-pointer-up="onPointerUp"
    />

    <!-- Ghost card when dragging from hand -->
    <Card
      v-if="handDragCard && !isHandReordering"
      class="hand-ghost"
      :style="{
        '--col': handCompRef?.drawFaceDown ? CARD_BACK_COL : handDragCard.col,
        '--row': handCompRef?.drawFaceDown ? CARD_BACK_ROW : handDragCard.row,
        left: `${handDragPosition.x}px`,
        top: `${handDragPosition.y}px`,
        zIndex: 2000,
      }"
    />

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

.table-ui {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 1000;
}

.table-ui__btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  backdrop-filter: blur(8px);
}

.table-ui__btn:hover {
  background: rgba(0, 0, 0, 0.75);
  border-color: rgba(255, 255, 255, 0.25);
}

.table-ui__btn:active {
  transform: scale(0.97);
}

.table-ui__icon {
  width: 16px;
  height: 16px;
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

.shuffling {
  --delay: calc(var(--shuffle-seed, 0) * 0.02s);
  --dir: calc(1 - 2 * (var(--shuffle-seed, 0) - 5) / 5);
  animation: shuffle-card 0.3s ease-out var(--delay);
  transform-origin: center center;
}

@keyframes shuffle-card {
  0% {
    filter: brightness(1);
    transform: rotate(0deg);
  }
  15% {
    filter: brightness(1.3);
    transform: rotate(calc(10deg * var(--dir, 1)));
  }
  35% {
    filter: brightness(0.9);
    transform: rotate(calc(-8deg * var(--dir, 1)));
  }
  55% {
    filter: brightness(1.2);
    transform: rotate(calc(5deg * var(--dir, 1)));
  }
  75% {
    filter: brightness(1);
    transform: rotate(calc(-2deg * var(--dir, 1)));
  }
  100% {
    filter: brightness(1);
    transform: rotate(0deg);
  }
}

.hand-ghost {
  pointer-events: none;
  cursor: grabbing;
}
</style>
