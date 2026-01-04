<script setup lang="ts">
import { nextTick, ref } from 'vue'
import {
  Lock,
  LockOpen,
  Settings,
  Eye,
  EyeOff,
  Trash2,
  X,
  Users,
  User,
  EyeClosed,
  Layers,
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyStart,
  Grid3X3,
  Circle,
} from 'lucide-vue-next'
import { useCardStore } from '@/stores/cards'
import type { Zone, ZoneLayout } from '@/types'

const props = defineProps<{
  zone: Zone
  isDragging: boolean
  currentPlayerId?: string | null
}>()

const emit = defineEmits<{
  pointerdown: [event: PointerEvent]
  pointermove: [event: PointerEvent]
  pointerup: [event: PointerEvent]
  dblclick: [event: MouseEvent]
  'zone:update': [zoneId: number, updates: Partial<Omit<Zone, 'id' | 'stackId'>>]
  'zone:delete': [zoneId: number]
}>()

const cardStore = useCardStore()
const showModal = ref(false)
const labelInputRef = ref<HTMLInputElement | null>(null)

const openModal = () => {
  // Don't allow opening modal if locked
  if (props.zone.locked) return
  showModal.value = true
  nextTick(() => {
    labelInputRef.value?.focus()
    labelInputRef.value?.select()
  })
}

const closeModal = () => {
  showModal.value = false
}

const onLabelKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    closeModal()
  } else if (event.key === 'Escape') {
    closeModal()
  }
}

const onLabelInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  cardStore.updateZone(props.zone.id, { label: target.value })
  emit('zone:update', props.zone.id, { label: target.value })
}

const toggleFaceUp = () => {
  const newFaceUp = !props.zone.faceUp
  cardStore.updateZone(props.zone.id, { faceUp: newFaceUp })
  emit('zone:update', props.zone.id, { faceUp: newFaceUp })
}

const toggleLocked = () => {
  const newLocked = !props.zone.locked
  cardStore.updateZone(props.zone.id, { locked: newLocked })
  emit('zone:update', props.zone.id, { locked: newLocked })
}

const setVisibility = (visibility: Zone['visibility']) => {
  // If setting to 'owner', also set the current player as owner
  const updates: Partial<Zone> = { visibility }
  if (visibility === 'owner' && props.currentPlayerId) {
    updates.ownerId = props.currentPlayerId
  } else if (visibility !== 'owner') {
    updates.ownerId = null
  }
  cardStore.updateZone(props.zone.id, updates)
  emit('zone:update', props.zone.id, updates)
}

const setLayout = (layout: ZoneLayout) => {
  cardStore.updateZone(props.zone.id, { layout })
  emit('zone:update', props.zone.id, { layout })
}

const onSpacingChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const spacing = parseFloat(target.value)
  const cardSettings = {
    cardScale: props.zone.cardSettings?.cardScale ?? 1.0,
    cardSpacing: spacing,
  }
  cardStore.updateZone(props.zone.id, { cardSettings })
  emit('zone:update', props.zone.id, { cardSettings })
}

const deleteZone = () => {
  closeModal()
  cardStore.deleteZone(props.zone.id)
  emit('zone:delete', props.zone.id)
}

// Close modal on outside click
const onBackdropClick = (event: MouseEvent) => {
  if ((event.target as HTMLElement).classList.contains('zone-modal')) {
    closeModal()
  }
}

// Handle double-click to open modal (only if not locked)
const handleDoubleClick = (event: MouseEvent) => {
  emit('dblclick', event)
  if (!props.zone.locked) {
    openModal()
  }
}

defineExpose({ openModal })
</script>

<template>
  <div
    class="zone"
    :class="{
      'zone--dragging': isDragging,
      'zone--face-down': !zone.faceUp,
      'zone--locked': zone.locked,
      'zone--private': zone.visibility === 'owner',
      'zone--hidden': zone.visibility === 'hidden',
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
    @dblclick.stop="handleDoubleClick"
    @contextmenu.prevent
  >
    <div class="zone__header">
      <span class="zone__label">{{ zone.label }}</span>
      <span class="zone__count">{{ cardStore.getZoneCardCount(zone.id) }}</span>
    </div>
    <div class="zone__controls" :class="{ 'zone__controls--locked': zone.locked }" @dblclick.stop>
      <button
        class="zone__lock-toggle"
        :title="zone.locked ? 'Locked (click to unlock)' : 'Unlocked (click to lock)'"
        @click.stop="toggleLocked"
        @pointerdown.stop
      >
        <Lock v-if="zone.locked" :size="12" />
        <LockOpen v-else :size="12" />
      </button>
      <button
        v-if="!zone.locked"
        class="zone__settings"
        title="Zone settings"
        @click.stop="openModal"
        @pointerdown.stop
      >
        <Settings :size="12" />
      </button>
    </div>
    <!-- Visibility indicator -->
    <div class="zone__visibility-indicator" :title="`Visibility: ${zone.visibility}`">
      <Users v-if="zone.visibility === 'public'" :size="10" />
      <User v-else-if="zone.visibility === 'owner'" :size="10" />
      <EyeClosed v-else :size="10" />
    </div>
    <div v-if="!zone.locked" class="zone__resize-handle" />
  </div>

  <!-- Zone Properties Modal -->
  <Teleport to="body">
    <div v-if="showModal" class="zone-modal" @click="onBackdropClick">
      <div class="zone-modal__content" @pointerdown.stop>
        <div class="zone-modal__header">
          <h3>Zone Properties</h3>
          <button class="zone-modal__close" @click="closeModal">
            <X :size="16" />
          </button>
        </div>
        <div class="zone-modal__body">
          <label class="zone-modal__field">
            <span class="zone-modal__label">Label</span>
            <input
              ref="labelInputRef"
              type="text"
              class="zone-modal__input"
              :value="zone.label"
              @input="onLabelInput"
              @keydown="onLabelKeydown"
            />
          </label>
          <label class="zone-modal__field zone-modal__field--row">
            <span class="zone-modal__label">Cards face up</span>
            <button
              class="zone-modal__toggle"
              :class="{ 'zone-modal__toggle--active': zone.faceUp }"
              @click="toggleFaceUp"
            >
              <Eye v-if="zone.faceUp" :size="14" />
              <EyeOff v-else :size="14" />
              {{ zone.faceUp ? 'Yes' : 'No' }}
            </button>
          </label>
          <div class="zone-modal__field">
            <span class="zone-modal__label">Visibility</span>
            <div class="zone-modal__visibility-options">
              <button
                class="zone-modal__visibility-btn"
                :class="{ 'zone-modal__visibility-btn--active': zone.visibility === 'public' }"
                @click="setVisibility('public')"
                title="Everyone can see cards"
              >
                <Users :size="14" />
                Public
              </button>
              <button
                class="zone-modal__visibility-btn"
                :class="{ 'zone-modal__visibility-btn--active': zone.visibility === 'owner' }"
                @click="setVisibility('owner')"
                title="Only you can see cards"
              >
                <User :size="14" />
                Private
              </button>
              <button
                class="zone-modal__visibility-btn"
                :class="{ 'zone-modal__visibility-btn--active': zone.visibility === 'hidden' }"
                @click="setVisibility('hidden')"
                title="No one can see cards"
              >
                <EyeClosed :size="14" />
                Hidden
              </button>
            </div>
          </div>
          <div class="zone-modal__field">
            <span class="zone-modal__label">Card Layout</span>
            <div class="zone-modal__layout-options">
              <button
                class="zone-modal__layout-btn"
                :class="{ 'zone-modal__layout-btn--active': zone.layout === 'stack' }"
                @click="setLayout('stack')"
                title="Stack cards on top of each other"
              >
                <Layers :size="14" />
                Stack
              </button>
              <button
                class="zone-modal__layout-btn"
                :class="{ 'zone-modal__layout-btn--active': zone.layout === 'row' }"
                @click="setLayout('row')"
                title="Arrange cards in a row"
              >
                <AlignHorizontalJustifyStart :size="14" />
                Row
              </button>
              <button
                class="zone-modal__layout-btn"
                :class="{ 'zone-modal__layout-btn--active': zone.layout === 'column' }"
                @click="setLayout('column')"
                title="Arrange cards in a column"
              >
                <AlignVerticalJustifyStart :size="14" />
                Column
              </button>
              <button
                class="zone-modal__layout-btn"
                :class="{ 'zone-modal__layout-btn--active': zone.layout === 'grid' }"
                @click="setLayout('grid')"
                title="Arrange cards in a grid"
              >
                <Grid3X3 :size="14" />
                Grid
              </button>
              <button
                class="zone-modal__layout-btn"
                :class="{ 'zone-modal__layout-btn--active': zone.layout === 'fan' }"
                @click="setLayout('fan')"
                title="Fan cards in an arc"
              >
                <Circle :size="14" />
                Fan
              </button>
            </div>
          </div>
          <div v-if="zone.layout !== 'stack'" class="zone-modal__field">
            <span class="zone-modal__label">Card Spacing</span>
            <div class="zone-modal__slider-row">
              <span class="zone-modal__slider-label">Tight</span>
              <input
                type="range"
                class="zone-modal__slider"
                min="0"
                max="1"
                step="0.1"
                :value="zone.cardSettings?.cardSpacing ?? 0.5"
                @input="onSpacingChange"
              />
              <span class="zone-modal__slider-label">Spread</span>
            </div>
          </div>
          <label class="zone-modal__field zone-modal__field--row">
            <span class="zone-modal__label">Locked</span>
            <button
              class="zone-modal__toggle"
              :class="{ 'zone-modal__toggle--active': zone.locked }"
              @click="toggleLocked"
            >
              <Lock v-if="zone.locked" :size="14" />
              <LockOpen v-else :size="14" />
              {{ zone.locked ? 'Yes' : 'No' }}
            </button>
          </label>
        </div>
        <div class="zone-modal__footer">
          <button class="zone-modal__delete" @click="deleteZone">
            <Trash2 :size="14" />
            Delete Zone
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.zone {
  position: absolute;
  border: 2px dashed rgba(255, 255, 255, 0.7);
  border-radius: 8px;
  color: #f0f0f0;
  background-color: rgba(0, 0, 0, 0.15);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2) inset;
  /* Cursor handled by parent .table-view with custom colored cursors */
  cursor: inherit;
  touch-action: none;
}

.zone--dragging {
  opacity: 0.8;
}

.zone--face-down {
  border-color: rgba(255, 200, 100, 0.7);
}

.zone--locked {
  cursor: default;
}

.zone--private {
  border-color: rgba(100, 180, 255, 0.7);
  background-color: rgba(50, 100, 150, 0.15);
}

.zone--hidden {
  border-color: rgba(180, 100, 180, 0.7);
  background-color: rgba(100, 50, 100, 0.15);
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

.zone__count {
  font-weight: 700;
  font-size: 12px;
  flex-shrink: 0;
}

.zone__controls {
  position: absolute;
  bottom: 4px;
  left: 4px;
  display: flex;
  gap: 4px;
}

.zone__controls--locked {
  opacity: 0;
  pointer-events: auto;
  transition: opacity 0.15s ease;
}

.zone__controls--locked:hover,
.zone__controls--locked:focus-within {
  opacity: 1;
}

.zone__lock-toggle,
.zone__settings {
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

.zone__lock-toggle:hover,
.zone__settings:hover {
  background: rgba(0, 0, 0, 0.5);
}

.zone__visibility-indicator {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.3);
  color: rgba(255, 255, 255, 0.6);
  pointer-events: none;
}

.zone--private .zone__visibility-indicator {
  color: rgba(100, 180, 255, 0.8);
}

.zone--hidden .zone__visibility-indicator {
  color: rgba(180, 100, 180, 0.8);
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

/* Modal styles */
.zone-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.zone-modal__content {
  background: #2a2a2a;
  border-radius: 8px;
  min-width: 280px;
  max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.zone-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.zone-modal__header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #f0f0f0;
}

.zone-modal__close {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.zone-modal__close:hover {
  color: #f0f0f0;
}

.zone-modal__body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.zone-modal__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.zone-modal__field--row {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.zone-modal__label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #888;
}

.zone-modal__input {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 8px 10px;
  color: #f0f0f0;
  font-size: 14px;
  outline: none;
}

.zone-modal__input:focus {
  border-color: rgba(255, 255, 255, 0.4);
}

.zone-modal__toggle {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 6px 12px;
  color: #888;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.zone-modal__toggle:hover {
  background: rgba(0, 0, 0, 0.4);
}

.zone-modal__toggle--active {
  background: rgba(100, 180, 100, 0.3);
  border-color: rgba(100, 180, 100, 0.5);
  color: #a0e0a0;
}

.zone-modal__visibility-options {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.zone-modal__visibility-btn {
  flex: 1;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 8px 10px;
  color: #888;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
}

.zone-modal__visibility-btn:hover {
  background: rgba(0, 0, 0, 0.4);
  color: #bbb;
}

.zone-modal__visibility-btn--active {
  background: rgba(100, 180, 255, 0.2);
  border-color: rgba(100, 180, 255, 0.5);
  color: #a0d0ff;
}

.zone-modal__footer {
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: flex-end;
}

.zone-modal__delete {
  background: rgba(180, 60, 60, 0.3);
  border: 1px solid rgba(180, 60, 60, 0.5);
  border-radius: 4px;
  padding: 6px 12px;
  color: #e08080;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.zone-modal__delete:hover {
  background: rgba(180, 60, 60, 0.5);
}

.zone-modal__layout-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.zone-modal__layout-btn {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 6px 10px;
  color: #888;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  transition: all 0.15s ease;
  min-width: 50px;
}

.zone-modal__layout-btn:hover {
  background: rgba(0, 0, 0, 0.4);
  color: #bbb;
}

.zone-modal__layout-btn--active {
  background: rgba(100, 180, 255, 0.2);
  border-color: rgba(100, 180, 255, 0.5);
  color: #a0d0ff;
}

.zone-modal__slider-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.zone-modal__slider-label {
  font-size: 10px;
  color: #666;
  min-width: 36px;
}

.zone-modal__slider-label:last-child {
  text-align: right;
}

.zone-modal__slider {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  appearance: none;
  cursor: pointer;
}

.zone-modal__slider::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  background: #a0d0ff;
  border-radius: 50%;
  cursor: pointer;
}

.zone-modal__slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #a0d0ff;
  border-radius: 50%;
  border: none;
  cursor: pointer;
}
</style>
