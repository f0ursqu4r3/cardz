<script setup lang="ts">
import { ref, computed } from 'vue'
import { X, Trash2 } from 'lucide-vue-next'
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

const onBackdropClick = (event: MouseEvent) => {
  if ((event.target as HTMLElement).classList.contains('die-modal')) {
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
      transform: `translate3d(${die.x - DIE_SIZE / 2}px, ${die.y - DIE_SIZE / 2}px, 0)`,
      '--die-color': die.color,
      '--lock-color': lockColor,
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
  <Teleport to="body">
    <div v-if="showModal" class="die-modal" @click="onBackdropClick">
      <div class="die-modal__content" @pointerdown.stop @keydown="onKeydown">
        <div class="die-modal__header">
          <h3>Die Properties</h3>
          <button class="die-modal__close" @click="closeModal">
            <X :size="16" />
          </button>
        </div>
        <div class="die-modal__body">
          <label class="die-modal__field">
            <span class="die-modal__label">Color</span>
            <div class="die-modal__color-row">
              <input v-model="formColor" type="color" class="die-modal__color-picker" />
              <input
                v-model="formColor"
                type="text"
                class="die-modal__input die-modal__input--color"
                pattern="^#[0-9a-fA-F]{6}$"
              />
            </div>
          </label>

          <div class="die-modal__field">
            <span class="die-modal__label">Actions</span>
            <button class="die-modal__roll-btn" @click="rollDie">
              Roll Die
            </button>
          </div>
        </div>
        <div class="die-modal__footer">
          <button class="die-modal__delete" @click="deleteDie">
            <Trash2 :size="14" />
            Delete
          </button>
          <button class="die-modal__save" @click="saveChanges">Save</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.die {
  position: absolute;
  width: 40px;
  height: 40px;
  cursor: grab;
  touch-action: none;
  user-select: none;
  transition: transform 0.05s ease;
}

.die--dragging {
  cursor: grabbing;
  z-index: 1000;
}

.die--locked {
  cursor: not-allowed;
}

.die--locked::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 8px;
  box-shadow: 0 0 12px 2px var(--lock-color, #888);
  pointer-events: none;
}

.die--rolling {
  animation: die-shake 0.5s ease-in-out;
}

@keyframes die-shake {
  0%, 100% {
    transform: translate3d(var(--tx, 0), var(--ty, 0), 0) rotate(0deg);
  }
  10% {
    transform: translate3d(var(--tx, 0), var(--ty, 0), 0) rotate(-15deg) scale(1.1);
  }
  20% {
    transform: translate3d(var(--tx, 0), var(--ty, 0), 0) rotate(15deg) scale(1.1);
  }
  30% {
    transform: translate3d(var(--tx, 0), var(--ty, 0), 0) rotate(-10deg) scale(1.05);
  }
  40% {
    transform: translate3d(var(--tx, 0), var(--ty, 0), 0) rotate(10deg) scale(1.05);
  }
  50% {
    transform: translate3d(var(--tx, 0), var(--ty, 0), 0) rotate(-5deg);
  }
  60% {
    transform: translate3d(var(--tx, 0), var(--ty, 0), 0) rotate(5deg);
  }
  70% {
    transform: translate3d(var(--tx, 0), var(--ty, 0), 0) rotate(-3deg);
  }
  80% {
    transform: translate3d(var(--tx, 0), var(--ty, 0), 0) rotate(3deg);
  }
  90% {
    transform: translate3d(var(--tx, 0), var(--ty, 0), 0) rotate(-1deg);
  }
}

.die__face {
  width: 100%;
  height: 100%;
  background: var(--die-color, #ef4444);
  border-radius: 8px;
  position: relative;
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.3),
    inset 0 1px 1px rgba(255, 255, 255, 0.2),
    inset 0 -1px 1px rgba(0, 0, 0, 0.1);
}

.die__pip {
  position: absolute;
  width: 8px;
  height: 8px;
  background: white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.2),
    0 1px 0 rgba(255, 255, 255, 0.3);
}

/* Modal styles */
.die-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.die-modal__content {
  background: #2a2a2a;
  border-radius: 8px;
  min-width: 280px;
  max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.die-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.die-modal__header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #f0f0f0;
}

.die-modal__close {
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

.die-modal__close:hover {
  color: #f0f0f0;
}

.die-modal__body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.die-modal__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.die-modal__label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #888;
}

.die-modal__input {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 8px 10px;
  color: #f0f0f0;
  font-size: 14px;
  outline: none;
}

.die-modal__input:focus {
  border-color: rgba(255, 255, 255, 0.4);
}

.die-modal__input--color {
  flex: 1;
}

.die-modal__color-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.die-modal__color-picker {
  width: 40px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
}

.die-modal__color-picker::-webkit-color-swatch-wrapper {
  padding: 0;
}

.die-modal__color-picker::-webkit-color-swatch {
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.die-modal__roll-btn {
  background: rgba(60, 180, 120, 0.4);
  border: 1px solid rgba(60, 180, 120, 0.6);
  border-radius: 4px;
  padding: 8px 16px;
  color: #a0f0c0;
  font-size: 12px;
  cursor: pointer;
  font-weight: 600;
}

.die-modal__roll-btn:hover {
  background: rgba(60, 180, 120, 0.6);
}

.die-modal__footer {
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.die-modal__delete {
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

.die-modal__delete:hover {
  background: rgba(180, 60, 60, 0.5);
}

.die-modal__save {
  background: rgba(60, 120, 180, 0.4);
  border: 1px solid rgba(60, 120, 180, 0.6);
  border-radius: 4px;
  padding: 6px 16px;
  color: #a0d0ff;
  font-size: 12px;
  cursor: pointer;
}

.die-modal__save:hover {
  background: rgba(60, 120, 180, 0.6);
}
</style>
