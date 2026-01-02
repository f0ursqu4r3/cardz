<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Card from '@/components/CardComp.vue'
import ZoneComp from '@/components/ZoneComp.vue'
import HandComp from '@/components/HandComp.vue'
import { useCardStore } from '@/stores/cards'
import { useCardInteraction } from '@/composables/useCardInteraction'

const cardStore = useCardStore()

// Create refs for template binding
const canvasRef = ref<HTMLElement | null>(null)
const handRef = ref<HTMLElement | null>(null)
const handCompRef = ref<InstanceType<typeof HandComp> | null>(null)

// Set up card interaction
const interaction = useCardInteraction({
  handRef: handRef,
})

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

// Create new zone on double-click
const createNewZone = () => {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (rect) {
    cardStore.createZone(rect.width / 2 - 33, rect.height / 2 - 42, 'New Zone', false)
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
  <div ref="canvasRef" class="canvas" @dblclick="createNewZone">
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

    <!-- Player hand -->
    <HandComp
      ref="handCompRef"
      v-model:hand-ref="handRef"
      :canvas-ref="canvasRef"
      :drag="interaction.drag"
      :is-drop-target="interaction.isOverHand.value"
      @card-pointer-up="onPointerUp"
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
