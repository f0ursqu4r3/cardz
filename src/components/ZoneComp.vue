<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useCardStore } from '@/stores/cards'
import type { Zone } from '@/types'

const props = defineProps<{
  zone: Zone
  isDragging: boolean
}>()

const emit = defineEmits<{
  pointerdown: [event: PointerEvent]
  pointermove: [event: PointerEvent]
  pointerup: [event: PointerEvent]
  dblclick: [event: MouseEvent]
}>()

const cardStore = useCardStore()
const labelInputRef = ref<HTMLInputElement | null>(null)

const finishLabelEdit = () => {
  cardStore.editingZoneId = null
}

const onLabelKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === 'Escape') {
    finishLabelEdit()
  }
}

const onLabelInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  cardStore.updateZone(props.zone.id, { label: target.value })
}

const toggleFaceUp = () => {
  cardStore.updateZone(props.zone.id, { faceUp: !props.zone.faceUp })
}

// Focus input when editing this zone
watch(
  () => cardStore.editingZoneId,
  async (zoneId) => {
    if (zoneId === props.zone.id) {
      await nextTick()
      labelInputRef.value?.focus()
      labelInputRef.value?.select()
    }
  },
)
</script>

<template>
  <div
    class="zone"
    :class="{
      'zone--dragging': isDragging,
      'zone--face-down': !zone.faceUp,
    }"
    :style="{
      transform: `translate3d(${zone.x}px, ${zone.y}px, 0)`,
      width: `${zone.width}px`,
      height: `${zone.height}px`,
    }"
    @pointerdown="emit('pointerdown', $event)"
    @pointermove="emit('pointermove', $event)"
    @pointerup="emit('pointerup', $event)"
    @pointercancel="emit('pointerup', $event)"
    @dblclick.stop="emit('dblclick', $event)"
    @contextmenu.prevent
  >
    <div class="zone__header">
      <input
        v-if="cardStore.editingZoneId === zone.id"
        ref="labelInputRef"
        type="text"
        class="zone__label-input"
        :value="zone.label"
        @input="onLabelInput"
        @keydown="onLabelKeydown"
        @blur="finishLabelEdit"
        @pointerdown.stop
      />
      <span v-else class="zone__label">{{ zone.label }}</span>
      <span class="zone__count">{{ cardStore.getZoneCardCount(zone.id) }}</span>
    </div>
    <button
      class="zone__face-toggle"
      :title="zone.faceUp ? 'Cards face up' : 'Cards face down'"
      @click.stop="toggleFaceUp"
      @pointerdown.stop
    >
      {{ zone.faceUp ? '👁' : '🂠' }}
    </button>
    <div class="zone__resize-handle" />
  </div>
</template>

<style scoped>
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
  background: linear-gradient(135deg, transparent 50%, rgba(255, 255, 255, 0.3) 50%);
  border-radius: 0 0 6px 0;
}
</style>
