<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { X, Trash2, Play, Pause, RotateCcw } from 'lucide-vue-next'
import type { Timer, TimerMode } from '@/types'

const props = defineProps<{
  timer: Timer
  isDragging: boolean
  isLockedByOther: boolean
  lockColor?: string
}>()

const emit = defineEmits<{
  pointerdown: [event: PointerEvent]
  pointermove: [event: PointerEvent]
  pointerup: [event: PointerEvent]
  contextmenu: [event: MouseEvent]
  'timer:start': [timerId: number]
  'timer:pause': [timerId: number]
  'timer:reset': [timerId: number]
  'timer:update': [timerId: number, updates: Partial<Omit<Timer, 'id'>>]
  'timer:delete': [timerId: number]
}>()

const showModal = ref(false)
const formLabel = ref('')
const formMode = ref<TimerMode>('countdown')
const formDurationMinutes = ref(1)

// Current display time - updated via animation frame for running timers
const displayMs = ref(0)
let animationFrameId: number | null = null

// Calculate current elapsed/remaining time
const calculateCurrentTime = (): number => {
  if (props.timer.status === 'running' && props.timer.startedAt !== null) {
    const now = Date.now()
    const elapsed = props.timer.elapsedMs + (now - props.timer.startedAt)

    if (props.timer.mode === 'countdown') {
      return Math.max(0, props.timer.durationMs - elapsed)
    } else {
      return elapsed
    }
  } else {
    if (props.timer.mode === 'countdown') {
      return Math.max(0, props.timer.durationMs - props.timer.elapsedMs)
    } else {
      return props.timer.elapsedMs
    }
  }
}

// Update display time for animation
const updateDisplay = () => {
  displayMs.value = calculateCurrentTime()

  if (props.timer.status === 'running') {
    animationFrameId = requestAnimationFrame(updateDisplay)
  }
}

// Watch for timer state changes
const startAnimation = () => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
  }
  updateDisplay()
}

onMounted(() => {
  updateDisplay()
})

onUnmounted(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
  }
})

// Watch for status changes
const timerStatus = computed(() => props.timer.status)
const timerStartedAt = computed(() => props.timer.startedAt)

// Re-start animation when timer status changes to running
const checkAnimation = () => {
  if (props.timer.status === 'running') {
    startAnimation()
  } else {
    displayMs.value = calculateCurrentTime()
  }
}

// Format time as MM:SS or HH:MM:SS
const formattedTime = computed(() => {
  const totalSeconds = Math.floor(displayMs.value / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
})

// Timer controls
const togglePlayPause = () => {
  if (props.isLockedByOther) return

  if (props.timer.status === 'running') {
    emit('timer:pause', props.timer.id)
  } else if (props.timer.status !== 'finished') {
    emit('timer:start', props.timer.id)
    // Start local animation immediately
    startAnimation()
  }
}

const resetTimer = () => {
  if (props.isLockedByOther) return
  emit('timer:reset', props.timer.id)
}

const openModal = () => {
  formLabel.value = props.timer.label
  formMode.value = props.timer.mode
  formDurationMinutes.value = Math.round(props.timer.durationMs / 60000)
  showModal.value = true
}

const closeModal = () => {
  showModal.value = false
}

const saveChanges = () => {
  emit('timer:update', props.timer.id, {
    label: formLabel.value,
    mode: formMode.value,
    durationMs: formDurationMinutes.value * 60000,
  })
  closeModal()
}

const deleteTimer = () => {
  closeModal()
  emit('timer:delete', props.timer.id)
}

const onBackdropClick = (event: MouseEvent) => {
  if ((event.target as HTMLElement).classList.contains('timer-modal')) {
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

// Determine icon color class based on timer status
const statusClass = computed(() => {
  if (props.timer.status === 'finished') return 'timer--finished'
  if (props.timer.status === 'running') return 'timer--running'
  return ''
})

// Update display when props change
const unwatchStatus = computed(() => {
  checkAnimation()
  return props.timer.status
})

defineExpose({ openModal })
</script>

<template>
  <div
    class="timer"
    :class="{
      'timer--dragging': isDragging,
      'timer--locked': isLockedByOther,
      [statusClass]: true,
    }"
    :style="{
      transform: `translate3d(${timer.x - 70}px, ${timer.y - 30}px, 0)`,
      '--lock-color': lockColor,
      zIndex: isDragging ? 1000 : timer.z,
    }"
    @pointerdown="emit('pointerdown', $event)"
    @pointermove="emit('pointermove', $event)"
    @pointerup="emit('pointerup', $event)"
    @pointercancel="emit('pointerup', $event)"
    @dblclick.stop="openModal"
    @contextmenu="emit('contextmenu', $event)"
  >
    <div class="timer__label">{{ timer.label }}</div>
    <div class="timer__display">{{ formattedTime }}</div>
    <div class="timer__controls">
      <button
        class="timer__btn"
        :disabled="isLockedByOther || timer.status === 'finished'"
        @click.stop="togglePlayPause"
        @pointerdown.stop
      >
        <Pause v-if="timer.status === 'running'" :size="14" />
        <Play v-else :size="14" />
      </button>
      <button
        class="timer__btn"
        :disabled="isLockedByOther"
        @click.stop="resetTimer"
        @pointerdown.stop
      >
        <RotateCcw :size="14" />
      </button>
    </div>
    <div class="timer__mode">{{ timer.mode }}</div>
  </div>

  <!-- Timer Properties Modal -->
  <Teleport to="body">
    <div v-if="showModal" class="timer-modal" @click="onBackdropClick">
      <div class="timer-modal__content" @pointerdown.stop @keydown="onKeydown">
        <div class="timer-modal__header">
          <h3>Timer Properties</h3>
          <button class="timer-modal__close" @click="closeModal">
            <X :size="16" />
          </button>
        </div>
        <div class="timer-modal__body">
          <label class="timer-modal__field">
            <span class="timer-modal__label">Label</span>
            <input
              v-model="formLabel"
              type="text"
              class="timer-modal__input"
              maxlength="32"
              autofocus
            />
          </label>

          <label class="timer-modal__field">
            <span class="timer-modal__label">Mode</span>
            <select v-model="formMode" class="timer-modal__input">
              <option value="countdown">Countdown</option>
              <option value="stopwatch">Stopwatch</option>
            </select>
          </label>

          <label v-if="formMode === 'countdown'" class="timer-modal__field">
            <span class="timer-modal__label">Duration (minutes)</span>
            <input
              v-model.number="formDurationMinutes"
              type="number"
              class="timer-modal__input"
              min="1"
              max="1440"
            />
          </label>
        </div>
        <div class="timer-modal__footer">
          <button class="timer-modal__delete" @click="deleteTimer">
            <Trash2 :size="14" />
            Delete
          </button>
          <button class="timer-modal__save" @click="saveChanges">Save</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.timer {
  position: absolute;
  width: 140px;
  background: rgba(30, 30, 35, 0.95);
  border-radius: 8px;
  padding: 8px 12px;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.timer--dragging {
  cursor: grabbing;
}

.timer--locked {
  cursor: not-allowed;
}

.timer--locked::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 12px;
  box-shadow: 0 0 12px 2px var(--lock-color, #888);
  pointer-events: none;
}

.timer--running {
  border-color: rgba(60, 180, 120, 0.5);
}

.timer--finished {
  border-color: rgba(180, 60, 60, 0.5);
}

.timer__label {
  font-size: 10px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
}

.timer__display {
  font-family: 'Courier New', monospace;
  font-size: 24px;
  font-weight: bold;
  color: #f0f0f0;
  text-align: center;
  letter-spacing: 2px;
  user-select: none;
  -webkit-user-select: none;
}

.timer--running .timer__display {
  color: #60c090;
}

.timer--finished .timer__display {
  color: #e08080;
}

.timer__controls {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
}

.timer__btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 4px 8px;
  color: #ccc;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.timer__btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.timer__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.timer__mode {
  font-size: 9px;
  color: #666;
  text-align: center;
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  user-select: none;
  -webkit-user-select: none;
}

/* Modal styles */
.timer-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.timer-modal__content {
  background: #2a2a2a;
  border-radius: 8px;
  min-width: 280px;
  max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.timer-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.timer-modal__header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #f0f0f0;
}

.timer-modal__close {
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

.timer-modal__close:hover {
  color: #f0f0f0;
}

.timer-modal__body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.timer-modal__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.timer-modal__label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #888;
}

.timer-modal__input {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 8px 10px;
  color: #f0f0f0;
  font-size: 14px;
  outline: none;
}

.timer-modal__input:focus {
  border-color: rgba(255, 255, 255, 0.4);
}

.timer-modal__footer {
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.timer-modal__delete {
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

.timer-modal__delete:hover {
  background: rgba(180, 60, 60, 0.5);
}

.timer-modal__save {
  background: rgba(60, 120, 180, 0.4);
  border: 1px solid rgba(60, 120, 180, 0.6);
  border-radius: 4px;
  padding: 6px 16px;
  color: #a0d0ff;
  font-size: 12px;
  cursor: pointer;
}

.timer-modal__save:hover {
  background: rgba(60, 120, 180, 0.6);
}
</style>
