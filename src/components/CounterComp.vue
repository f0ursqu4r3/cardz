<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { Minus, Plus, X, Trash2 } from 'lucide-vue-next'
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
const valueInputRef = ref<HTMLInputElement | null>(null)

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

const onBackdropClick = (event: MouseEvent) => {
  if ((event.target as HTMLElement).classList.contains('counter-modal')) {
    closeModal()
  }
}

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    saveChanges()
  } else if (event.key === 'Escape') {
    closeModal()
  }
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
      zIndex: isDragging ? 1000 : counter.z,
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
  <Teleport to="body">
    <div v-if="showModal" class="counter-modal" @click="onBackdropClick">
      <div class="counter-modal__content" @pointerdown.stop>
        <div class="counter-modal__header">
          <h3>Counter Properties</h3>
          <button class="counter-modal__close" @click="closeModal">
            <X :size="16" />
          </button>
        </div>
        <div class="counter-modal__body">
          <label class="counter-modal__field">
            <span class="counter-modal__label">Label</span>
            <input
              ref="labelInputRef"
              v-model="formLabel"
              type="text"
              class="counter-modal__input"
              @keydown="onKeydown"
            />
          </label>
          <label class="counter-modal__field">
            <span class="counter-modal__label">Value</span>
            <input
              ref="valueInputRef"
              v-model.number="formValue"
              type="number"
              class="counter-modal__input"
              @keydown="onKeydown"
            />
          </label>
          <div class="counter-modal__row">
            <label class="counter-modal__field counter-modal__field--half">
              <span class="counter-modal__label">Min (optional)</span>
              <input
                v-model.number="formMin"
                type="number"
                class="counter-modal__input"
                placeholder="None"
                @keydown="onKeydown"
              />
            </label>
            <label class="counter-modal__field counter-modal__field--half">
              <span class="counter-modal__label">Max (optional)</span>
              <input
                v-model.number="formMax"
                type="number"
                class="counter-modal__input"
                placeholder="None"
                @keydown="onKeydown"
              />
            </label>
          </div>
          <label class="counter-modal__field">
            <span class="counter-modal__label">Step</span>
            <input
              v-model.number="formStep"
              type="number"
              min="1"
              class="counter-modal__input"
              @keydown="onKeydown"
            />
          </label>
          <label class="counter-modal__field">
            <span class="counter-modal__label">Color</span>
            <div class="counter-modal__color-row">
              <input v-model="formColor" type="color" class="counter-modal__color-picker" />
              <input
                v-model="formColor"
                type="text"
                class="counter-modal__input counter-modal__input--color"
                pattern="^#[0-9a-fA-F]{6}$"
              />
            </div>
          </label>
        </div>
        <div class="counter-modal__footer">
          <button class="counter-modal__delete" @click="deleteCounter">
            <Trash2 :size="14" />
            Delete
          </button>
          <button class="counter-modal__save" @click="saveChanges">Save</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.counter {
  position: absolute;
  background: rgba(0, 0, 0, 0.7);
  border: 2px solid var(--counter-color, #3b82f6);
  border-radius: 8px;
  padding: 8px 12px;
  min-width: 80px;
  color: #f0f0f0;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition:
    box-shadow 0.15s ease,
    transform 0.05s ease;
}

.counter--dragging {
  cursor: grabbing;
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.4),
    0 0 0 2px var(--counter-color, #3b82f6);
  transition: none; /* Disable transition during drag for smooth movement */
}

.counter--locked {
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.3),
    0 0 12px 2px var(--lock-color, #888);
  cursor: not-allowed;
}

.counter__label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #888;
  margin-bottom: 4px;
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
  gap: 8px;
  user-select: none;
  -webkit-user-select: none;
}

.counter__value {
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  min-width: 40px;
  text-align: center;
  color: var(--counter-color, #3b82f6);
  user-select: none;
  -webkit-user-select: none;
}

.counter__btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: #f0f0f0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background 0.15s ease;
}

.counter__btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

.counter__btn:active:not(:disabled) {
  background: rgba(255, 255, 255, 0.3);
}

.counter__btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Modal styles */
.counter-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.counter-modal__content {
  background: #2a2a2a;
  border-radius: 8px;
  min-width: 280px;
  max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.counter-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.counter-modal__header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #f0f0f0;
}

.counter-modal__close {
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

.counter-modal__close:hover {
  color: #f0f0f0;
}

.counter-modal__body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.counter-modal__row {
  display: flex;
  gap: 12px;
}

.counter-modal__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.counter-modal__field--half {
  flex: 1;
}

.counter-modal__label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #888;
}

.counter-modal__input {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 8px 10px;
  color: #f0f0f0;
  font-size: 14px;
  outline: none;
}

.counter-modal__input:focus {
  border-color: rgba(255, 255, 255, 0.4);
}

.counter-modal__input--color {
  flex: 1;
}

.counter-modal__color-row {
  display: flex;
  gap: 8px;
  align-items: center;
  user-select: none;
}

.counter-modal__color-picker {
  width: 40px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
}

.counter-modal__color-picker::-webkit-color-swatch-wrapper {
  padding: 0;
}

.counter-modal__color-picker::-webkit-color-swatch {
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.counter-modal__footer {
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.counter-modal__delete {
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

.counter-modal__delete:hover {
  background: rgba(180, 60, 60, 0.5);
}

.counter-modal__save {
  background: rgba(60, 120, 180, 0.4);
  border: 1px solid rgba(60, 120, 180, 0.6);
  border-radius: 4px;
  padding: 6px 16px;
  color: #a0d0ff;
  font-size: 12px;
  cursor: pointer;
}

.counter-modal__save:hover {
  background: rgba(60, 120, 180, 0.6);
}
</style>
