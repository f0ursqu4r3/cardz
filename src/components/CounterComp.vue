<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { Minus, Plus, Trash2 } from 'lucide-vue-next'
import ModalBase from '@/components/ui/ModalBase.vue'
import type { Counter } from '@/types'

const props = defineProps<{
  counter: Counter
  isDragging: boolean
  isLockedByOther: boolean
  lockColor?: string
}>()

const emit = defineEmits<{
  pointerdown: [event: PointerEvent]
  pointermove: [event: PointerEvent]
  pointerup: [event: PointerEvent]
  contextmenu: [event: MouseEvent]
  'counter:increment': [counterId: number, delta: number]
  'counter:update': [counterId: number, updates: Partial<Omit<Counter, 'id'>>]
  'counter:delete': [counterId: number]
}>()

const showModal = ref(false)
const labelInputRef = ref<HTMLInputElement | null>(null)

// Local form state for modal
const formLabel = ref('')
const formValue = ref(0)
const formMin = ref<number | undefined>(undefined)
const formMax = ref<number | undefined>(undefined)
const formStep = ref(1)
const formColor = ref('#3b82f6')

const increment = (event: Event) => {
  event.stopPropagation()
  emit('counter:increment', props.counter.id, props.counter.step)
}

const decrement = (event: Event) => {
  event.stopPropagation()
  emit('counter:increment', props.counter.id, -props.counter.step)
}

const openModal = () => {
  // Initialize form with current values
  formLabel.value = props.counter.label
  formValue.value = props.counter.value
  formMin.value = props.counter.min
  formMax.value = props.counter.max
  formStep.value = props.counter.step
  formColor.value = props.counter.color
  showModal.value = true
  nextTick(() => {
    labelInputRef.value?.focus()
    labelInputRef.value?.select()
  })
}

const closeModal = () => {
  showModal.value = false
}

const saveChanges = () => {
  emit('counter:update', props.counter.id, {
    label: formLabel.value,
    value: formValue.value,
    min: formMin.value,
    max: formMax.value,
    step: formStep.value,
    color: formColor.value,
  })
  closeModal()
}

const deleteCounter = () => {
  closeModal()
  emit('counter:delete', props.counter.id)
}

defineExpose({ openModal })
</script>

<template>
  <div
    class="counter"
    :class="{
      'counter--dragging': isDragging,
      'counter--locked': isLockedByOther,
    }"
    :style="{
      transform: `translate3d(${counter.x}px, ${counter.y}px, 0)`,
      '--counter-color': counter.color,
      '--lock-color': lockColor,
      zIndex: isDragging || isLockedByOther ? 10000 : counter.z,
    }"
    @pointerdown="emit('pointerdown', $event)"
    @pointermove="emit('pointermove', $event)"
    @pointerup="emit('pointerup', $event)"
    @pointercancel="emit('pointerup', $event)"
    @dblclick.stop="openModal"
    @contextmenu="emit('contextmenu', $event)"
  >
    <div class="counter__label">{{ counter.label }}</div>
    <div class="counter__value-row">
      <button
        class="counter__btn counter__btn--minus"
        :disabled="counter.min !== undefined && counter.value <= counter.min"
        @click.stop="decrement"
        @dblclick.stop="decrement"
        @pointerdown.stop
      >
        <Minus :size="14" />
      </button>
      <span class="counter__value">{{ counter.value }}</span>
      <button
        class="counter__btn counter__btn--plus"
        :disabled="counter.max !== undefined && counter.value >= counter.max"
        @click.stop="increment"
        @dblclick.stop="increment"
        @pointerdown.stop
      >
        <Plus :size="14" />
      </button>
    </div>
  </div>

  <!-- Counter Properties Modal -->
  <ModalBase v-if="showModal" title="Counter Properties" @close="closeModal">
    <label class="form-field">
      <span class="form-label">Label</span>
      <input
        ref="labelInputRef"
        v-model="formLabel"
        type="text"
        class="form-input"
      />
    </label>
    <label class="form-field">
      <span class="form-label">Value</span>
      <input
        v-model.number="formValue"
        type="number"
        class="form-input"
      />
    </label>
    <div class="form-row">
      <label class="form-field form-field--half">
        <span class="form-label">Min (optional)</span>
        <input
          v-model.number="formMin"
          type="number"
          class="form-input"
          placeholder="None"
        />
      </label>
      <label class="form-field form-field--half">
        <span class="form-label">Max (optional)</span>
        <input
          v-model.number="formMax"
          type="number"
          class="form-input"
          placeholder="None"
        />
      </label>
    </div>
    <label class="form-field">
      <span class="form-label">Step</span>
      <input
        v-model.number="formStep"
        type="number"
        min="1"
        class="form-input"
      />
    </label>
    <label class="form-field">
      <span class="form-label">Color</span>
      <div class="color-row">
        <input v-model="formColor" type="color" class="color-picker" />
        <input
          v-model="formColor"
          type="text"
          class="form-input form-input--color"
          pattern="^#[0-9a-fA-F]{6}$"
        />
      </div>
    </label>

    <template #footer>
      <button class="btn btn--danger" @click="deleteCounter">
        <Trash2 :size="14" />
        Delete
      </button>
      <button class="btn btn--primary" @click="saveChanges">Save</button>
    </template>
  </ModalBase>
</template>

<style scoped>
.counter {
  position: absolute;
  background: var(--color-surface-300);
  border: 2px solid var(--counter-color, var(--color-primary));
  border-radius: var(--radius-lg);
  padding: var(--spacing-4) var(--spacing-6);
  min-width: 80px;
  color: var(--color-text-primary);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  box-shadow: var(--shadow-md);
  transition:
    box-shadow var(--transition-normal),
    transform var(--transition-fast);
}

.counter--dragging {
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.4),
    0 0 0 2px var(--counter-color, var(--color-primary));
  transition: none;
}

.counter--locked {
  box-shadow:
    var(--shadow-md),
    var(--shadow-glow);
  --glow-color: var(--lock-color, #888);
  transition:
    left var(--transition-fast),
    top var(--transition-fast),
    box-shadow var(--transition-normal);
}

.counter__label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-2);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
  -webkit-user-select: none;
}

.counter__value-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-4);
  user-select: none;
  -webkit-user-select: none;
}

.counter__value {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  min-width: 40px;
  text-align: center;
  color: var(--counter-color, var(--color-primary));
  user-select: none;
  -webkit-user-select: none;
}

.counter__btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background var(--transition-normal);
}

.counter__btn:hover:not(:disabled) {
  background: var(--color-surface-active);
}

.counter__btn:active:not(:disabled) {
  background: rgba(255, 255, 255, 0.3);
}

.counter__btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Form styles for modal content */
.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.form-field--half {
  flex: 1;
}

.form-row {
  display: flex;
  gap: var(--spacing-6);
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

.form-input--color {
  flex: 1;
}

.color-row {
  display: flex;
  gap: var(--spacing-4);
  align-items: center;
}

.color-picker {
  width: 40px;
  height: var(--input-height);
  padding: 0;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  background: transparent;
}

.color-picker::-webkit-color-swatch-wrapper {
  padding: 0;
}

.color-picker::-webkit-color-swatch {
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-default);
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

.btn--primary {
  background: var(--color-primary-bg);
  border: 1px solid var(--color-primary-border);
  padding: var(--btn-padding-sm);
  color: var(--color-primary-light);
}

.btn--primary:hover {
  background: var(--color-primary-bg-hover);
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
