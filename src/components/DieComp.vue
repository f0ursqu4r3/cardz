<script setup lang="ts">
import { ref, computed } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import ModalBase from '@/components/ui/ModalBase.vue'
import type { Die } from '@/types'

const props = defineProps<{
  die: Die
  isDragging: boolean
  isLockedByOther: boolean
  lockColor?: string
}>()

const emit = defineEmits<{
  pointerdown: [event: PointerEvent]
  pointermove: [event: PointerEvent]
  pointerup: [event: PointerEvent]
  contextmenu: [event: MouseEvent]
  'die:roll': [dieId: number]
  'die:update': [dieId: number, updates: Partial<Omit<Die, 'id'>>]
  'die:delete': [dieId: number]
}>()

const showModal = ref(false)
const formColor = ref('#ef4444')

const DIE_SIZE = 40

// Pip positions for each face value (relative positions 0-1)
const pipPatterns: Record<number, { x: number; y: number }[]> = {
  1: [{ x: 0.5, y: 0.5 }],
  2: [
    { x: 0.25, y: 0.25 },
    { x: 0.75, y: 0.75 },
  ],
  3: [
    { x: 0.25, y: 0.25 },
    { x: 0.5, y: 0.5 },
    { x: 0.75, y: 0.75 },
  ],
  4: [
    { x: 0.25, y: 0.25 },
    { x: 0.75, y: 0.25 },
    { x: 0.25, y: 0.75 },
    { x: 0.75, y: 0.75 },
  ],
  5: [
    { x: 0.25, y: 0.25 },
    { x: 0.75, y: 0.25 },
    { x: 0.5, y: 0.5 },
    { x: 0.25, y: 0.75 },
    { x: 0.75, y: 0.75 },
  ],
  6: [
    { x: 0.25, y: 0.25 },
    { x: 0.75, y: 0.25 },
    { x: 0.25, y: 0.5 },
    { x: 0.75, y: 0.5 },
    { x: 0.25, y: 0.75 },
    { x: 0.75, y: 0.75 },
  ],
}

const currentPips = computed(() => pipPatterns[props.die.value] || [])

const rollDie = () => {
  if (props.isLockedByOther) return
  emit('die:roll', props.die.id)
}

const openModal = () => {
  formColor.value = props.die.color
  showModal.value = true
}

const closeModal = () => {
  showModal.value = false
}

const saveChanges = () => {
  emit('die:update', props.die.id, {
    color: formColor.value,
  })
  closeModal()
}

const deleteDie = () => {
  closeModal()
  emit('die:delete', props.die.id)
}

defineExpose({ openModal, rollDie })
</script>

<template>
  <div
    class="die"
    :class="{
      'die--dragging': isDragging,
      'die--locked': isLockedByOther,
      'die--rolling': die.isRolling,
    }"
    :style="{
      left: `${die.x - DIE_SIZE / 2}px`,
      top: `${die.y - DIE_SIZE / 2}px`,
      '--die-color': die.color,
      '--lock-color': lockColor,
      zIndex: isDragging || isLockedByOther ? 10000 : die.z,
    }"
    @pointerdown="emit('pointerdown', $event)"
    @pointermove="emit('pointermove', $event)"
    @pointerup="emit('pointerup', $event)"
    @pointercancel="emit('pointerup', $event)"
    @dblclick.stop="rollDie"
    @contextmenu="emit('contextmenu', $event)"
  >
    <div class="die__face">
      <div
        v-for="(pip, index) in currentPips"
        :key="index"
        class="die__pip"
        :style="{
          left: `${pip.x * 100}%`,
          top: `${pip.y * 100}%`,
        }"
      />
    </div>
  </div>

  <!-- Die Properties Modal -->
  <ModalBase v-if="showModal" title="Die Properties" @close="closeModal">
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

    <div class="form-field">
      <span class="form-label">Actions</span>
      <button class="btn btn--success" @click="rollDie">
        Roll Die
      </button>
    </div>

    <template #footer>
      <button class="btn btn--danger" @click="deleteDie">
        <Trash2 :size="14" />
        Delete
      </button>
      <button class="btn btn--primary" @click="saveChanges">Save</button>
    </template>
  </ModalBase>
</template>

<style scoped>
.die {
  position: absolute;
  width: 40px;
  height: 40px;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.die--locked {
  transition:
    left var(--transition-fast),
    top var(--transition-fast);
}

.die--locked::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-glow);
  --glow-color: var(--lock-color, #888);
  pointer-events: none;
}

.die--rolling {
  animation: die-shake 0.5s ease-in-out;
}

@keyframes die-shake {
  0%, 100% { transform: rotate(0deg) scale(1); }
  10% { transform: rotate(-15deg) scale(1.1); }
  20% { transform: rotate(15deg) scale(1.1); }
  30% { transform: rotate(-10deg) scale(1.05); }
  40% { transform: rotate(10deg) scale(1.05); }
  50% { transform: rotate(-5deg) scale(1); }
  60% { transform: rotate(5deg) scale(1); }
  70% { transform: rotate(-3deg) scale(1); }
  80% { transform: rotate(3deg) scale(1); }
  90% { transform: rotate(-1deg) scale(1); }
}

.die__face {
  width: 100%;
  height: 100%;
  background: var(--die-color, var(--color-danger));
  border-radius: var(--radius-lg);
  position: relative;
  box-shadow: var(--shadow-sm), var(--shadow-inset);
}

.die__pip {
  position: absolute;
  width: 8px;
  height: 8px;
  background: white;
  border-radius: var(--radius-full);
  transform: translate(-50%, -50%);
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.2),
    0 1px 0 rgba(255, 255, 255, 0.3);
}

/* Form styles for modal content */
.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
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

.btn--success {
  background: var(--color-success-bg);
  border: 1px solid var(--color-success-border);
  padding: var(--btn-padding-md);
  color: var(--color-success-light);
  font-weight: var(--font-weight-semibold);
}

.btn--success:hover {
  background: var(--color-success-bg-hover);
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
