<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import {
  Lock,
  LockOpen,
  Settings,
  Eye,
  EyeOff,
  Trash2,
  Users,
  User,
  EyeClosed,
  Layers,
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyStart,
  Grid3X3,
  Circle,
  CircleDot,
} from 'lucide-vue-next'
import ModalBase from '@/components/ui/ModalBase.vue'
import { useCardStore } from '@/stores/cards'
import type { Zone, ZoneLayout } from '@/types'

const props = defineProps<{
  zone: Zone
  isDragging: boolean
  currentPlayerId?: string | null
  openSettings?: boolean
}>()

const emit = defineEmits<{
  pointerdown: [event: PointerEvent]
  pointermove: [event: PointerEvent]
  pointerup: [event: PointerEvent]
  contextmenu: [event: MouseEvent]
  dblclick: [event: MouseEvent]
  'zone:update': [zoneId: number, updates: Partial<Omit<Zone, 'id' | 'stackId'>>]
  'zone:delete': [zoneId: number]
  'settings:close': []
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
  emit('settings:close')
}

// Watch for external trigger to open settings
watch(
  () => props.openSettings,
  (shouldOpen) => {
    if (shouldOpen && !showModal.value) {
      openModal()
    }
  },
)

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
    ...props.zone.cardSettings,
    cardScale: props.zone.cardSettings?.cardScale ?? 1.0,
    cardSpacing: spacing,
  }
  cardStore.updateZone(props.zone.id, { cardSettings })
  emit('zone:update', props.zone.id, { cardSettings })
}

const onRandomOffsetChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const randomOffset = parseFloat(target.value)
  const cardSettings = {
    ...props.zone.cardSettings,
    cardScale: props.zone.cardSettings?.cardScale ?? 1.0,
    cardSpacing: props.zone.cardSettings?.cardSpacing ?? 0.5,
    randomOffset,
  }
  cardStore.updateZone(props.zone.id, { cardSettings })
  emit('zone:update', props.zone.id, { cardSettings })
}

const onRandomRotationChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const randomRotation = parseFloat(target.value)
  const cardSettings = {
    ...props.zone.cardSettings,
    cardScale: props.zone.cardSettings?.cardScale ?? 1.0,
    cardSpacing: props.zone.cardSettings?.cardSpacing ?? 0.5,
    randomRotation,
  }
  cardStore.updateZone(props.zone.id, { cardSettings })
  emit('zone:update', props.zone.id, { cardSettings })
}

const deleteZone = () => {
  closeModal()
  emit('zone:delete', props.zone.id)
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
    @contextmenu="emit('contextmenu', $event)"
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
  <ModalBase v-if="showModal" title="Zone Properties" @close="closeModal">
    <label class="form-field">
      <span class="form-label">Label</span>
      <input
        ref="labelInputRef"
        type="text"
        class="form-input"
        :value="zone.label"
        @input="onLabelInput"
        @keydown="onLabelKeydown"
      />
    </label>
    <label class="form-field form-field--row">
      <span class="form-label">Cards face up</span>
      <button
        class="toggle-btn"
        :class="{ 'toggle-btn--active': zone.faceUp }"
        @click="toggleFaceUp"
      >
        <Eye v-if="zone.faceUp" :size="14" />
        <EyeOff v-else :size="14" />
        {{ zone.faceUp ? 'Yes' : 'No' }}
      </button>
    </label>
    <div class="form-field">
      <span class="form-label">Visibility</span>
      <div class="option-group option-group--stretch">
        <button
          class="option-btn option-btn--vertical"
          :class="{ 'option-btn--active': zone.visibility === 'public' }"
          @click="setVisibility('public')"
          title="Everyone can see cards"
        >
          <Users :size="14" />
          Public
        </button>
        <button
          class="option-btn option-btn--vertical"
          :class="{ 'option-btn--active': zone.visibility === 'owner' }"
          @click="setVisibility('owner')"
          title="Only you can see cards"
        >
          <User :size="14" />
          Private
        </button>
        <button
          class="option-btn option-btn--vertical"
          :class="{ 'option-btn--active': zone.visibility === 'hidden' }"
          @click="setVisibility('hidden')"
          title="No one can see cards"
        >
          <EyeClosed :size="14" />
          Hidden
        </button>
      </div>
    </div>
    <div class="form-field">
      <span class="form-label">Card Layout</span>
      <div class="option-group option-group--wrap">
        <button
          class="option-btn option-btn--small"
          :class="{ 'option-btn--active': zone.layout === 'stack' }"
          @click="setLayout('stack')"
          title="Stack cards on top of each other"
        >
          <Layers :size="14" />
          Stack
        </button>
        <button
          class="option-btn option-btn--small"
          :class="{ 'option-btn--active': zone.layout === 'row' }"
          @click="setLayout('row')"
          title="Arrange cards in a row"
        >
          <AlignHorizontalJustifyStart :size="14" />
          Row
        </button>
        <button
          class="option-btn option-btn--small"
          :class="{ 'option-btn--active': zone.layout === 'column' }"
          @click="setLayout('column')"
          title="Arrange cards in a column"
        >
          <AlignVerticalJustifyStart :size="14" />
          Column
        </button>
        <button
          class="option-btn option-btn--small"
          :class="{ 'option-btn--active': zone.layout === 'grid' }"
          @click="setLayout('grid')"
          title="Arrange cards in a grid"
        >
          <Grid3X3 :size="14" />
          Grid
        </button>
        <button
          class="option-btn option-btn--small"
          :class="{ 'option-btn--active': zone.layout === 'fan' }"
          @click="setLayout('fan')"
          title="Fan cards in an arc"
        >
          <Circle :size="14" />
          Fan
        </button>
        <button
          class="option-btn option-btn--small"
          :class="{ 'option-btn--active': zone.layout === 'circle' }"
          @click="setLayout('circle')"
          title="Arrange cards in a circle"
        >
          <CircleDot :size="14" />
          Circle
        </button>
      </div>
    </div>
    <div v-if="zone.layout !== 'stack'" class="form-field">
      <span class="form-label">Card Spacing</span>
      <div class="slider-row">
        <span class="slider-label">Tight</span>
        <input
          type="range"
          class="slider"
          min="0"
          max="1"
          step="0.1"
          :value="zone.cardSettings?.cardSpacing ?? 0.5"
          @input="onSpacingChange"
        />
        <span class="slider-label">Spread</span>
      </div>
    </div>
    <div v-if="zone.layout !== 'stack'" class="form-field">
      <span class="form-label">Random Offset</span>
      <div class="slider-row">
        <span class="slider-label">None</span>
        <input
          type="range"
          class="slider"
          min="0"
          max="30"
          step="2"
          :value="zone.cardSettings?.randomOffset ?? 0"
          @input="onRandomOffsetChange"
        />
        <span class="slider-label">Max</span>
      </div>
      <span class="slider-value">{{ zone.cardSettings?.randomOffset ?? 0 }}px</span>
    </div>
    <div v-if="zone.layout !== 'stack'" class="form-field">
      <span class="form-label">Random Rotation</span>
      <div class="slider-row">
        <span class="slider-label">None</span>
        <input
          type="range"
          class="slider"
          min="0"
          max="45"
          step="5"
          :value="zone.cardSettings?.randomRotation ?? 0"
          @input="onRandomRotationChange"
        />
        <span class="slider-label">Max</span>
      </div>
      <span class="slider-value">±{{ zone.cardSettings?.randomRotation ?? 0 }}°</span>
    </div>
    <label class="form-field form-field--row">
      <span class="form-label">Locked</span>
      <button
        class="toggle-btn"
        :class="{ 'toggle-btn--active': zone.locked }"
        @click="toggleLocked"
      >
        <Lock v-if="zone.locked" :size="14" />
        <LockOpen v-else :size="14" />
        {{ zone.locked ? 'Yes' : 'No' }}
      </button>
    </label>

    <template #footer>
      <button class="btn btn--danger" @click="deleteZone">
        <Trash2 :size="14" />
        Delete Zone
      </button>
    </template>
  </ModalBase>
</template>

<style scoped>
.zone {
  position: absolute;
  border: 2px dashed rgba(255, 255, 255, 0.7);
  border-radius: var(--radius-lg);
  color: var(--color-text-primary);
  background-color: rgba(0, 0, 0, 0.15);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2) inset;
  cursor: inherit;
  touch-action: none;
}

.zone--dragging {
  opacity: 0.8;
}

.zone--face-down {
  border-color: var(--color-warning-border);
}

.zone--private {
  border-color: var(--color-info-border);
  background-color: rgba(50, 100, 150, 0.15);
}

.zone--hidden {
  border-color: var(--color-special-border);
  background-color: var(--color-special-bg);
}

.zone__header {
  position: absolute;
  top: var(--spacing-2);
  left: var(--spacing-2);
  right: var(--spacing-2);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-2);
  pointer-events: none;
}

.zone__label {
  font-size: var(--font-size-xs);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.zone__count {
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-md);
  flex-shrink: 0;
}

.zone__controls {
  position: absolute;
  bottom: var(--spacing-2);
  left: var(--spacing-2);
  display: flex;
  gap: var(--spacing-2);
}

.zone__controls--locked {
  opacity: 0;
  pointer-events: auto;
  transition: opacity var(--transition-normal);
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
  background: var(--color-surface-input);
  color: var(--color-text-primary);
  cursor: pointer;
  font-size: var(--font-size-md);
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
  bottom: var(--spacing-2);
  right: var(--spacing-2);
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  background: var(--color-surface-input);
  color: rgba(255, 255, 255, 0.6);
  pointer-events: none;
}

.zone--private .zone__visibility-indicator {
  color: var(--color-info-muted);
}

.zone--hidden .zone__visibility-indicator {
  color: var(--color-special-text);
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

/* Form styles for modal content */
.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.form-field--row {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.form-label {
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-label);
  color: var(--color-text-secondary);
}

.form-input {
  background: var(--color-surface-input);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  padding: var(--input-padding);
  color: var(--color-text-primary);
  font-size: var(--font-size-base);
  outline: none;
  transition: border-color var(--transition-normal);
}

.form-input:focus {
  border-color: var(--color-border-focus);
}

.toggle-btn {
  background: var(--color-surface-input);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  padding: var(--spacing-3) var(--spacing-6);
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  transition: all var(--transition-normal);
}

.toggle-btn:hover {
  background: rgba(0, 0, 0, 0.4);
}

.toggle-btn--active {
  background: var(--color-toggle-active-bg);
  border-color: var(--color-toggle-active-border);
  color: var(--color-toggle-active-text);
}

.option-group {
  display: flex;
  gap: var(--spacing-4);
  margin-top: var(--spacing-2);
}

.option-group--stretch {
  gap: var(--spacing-4);
}

.option-group--stretch .option-btn {
  flex: 1;
}

.option-group--wrap {
  flex-wrap: wrap;
  gap: var(--spacing-3);
}

.option-btn {
  background: var(--color-surface-input);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  padding: var(--spacing-4) var(--spacing-5);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-2);
  transition: all var(--transition-normal);
}

.option-btn--vertical {
  flex-direction: column;
}

.option-btn--small {
  min-width: 50px;
  padding: var(--spacing-3) var(--spacing-5);
  font-size: var(--font-size-xs);
  gap: 3px;
}

.option-btn:hover {
  background: rgba(0, 0, 0, 0.4);
  color: #bbb;
}

.option-btn--active {
  background: var(--color-info-bg);
  border-color: var(--color-info-border);
  color: var(--color-info-text);
}

.slider-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-4);
  margin-top: var(--spacing-2);
}

.slider-label {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  min-width: 36px;
}

.slider-label:last-child {
  text-align: right;
}

.slider {
  flex: 1;
  height: 4px;
  background: var(--color-border-default);
  border-radius: var(--radius-sm);
  appearance: none;
  cursor: pointer;
}

.slider::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  background: var(--color-info-text);
  border-radius: var(--radius-full);
  cursor: pointer;
}

.slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: var(--color-info-text);
  border-radius: var(--radius-full);
  border: none;
  cursor: pointer;
}

.slider-value {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  text-align: center;
  margin-top: var(--spacing-1);
}

/* Button styles */
.btn {
  border-radius: var(--radius-md);
  font-size: var(--font-size-md);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  transition: background var(--transition-normal);
}

.btn--danger {
  background: var(--color-danger-bg);
  border: 1px solid var(--color-danger-border);
  padding: var(--btn-padding-sm);
  color: var(--color-danger-light);
}

.btn--danger:hover {
  background: var(--color-danger-bg-hover);
}
</style>
