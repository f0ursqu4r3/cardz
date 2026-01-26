<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import { Trash2, Star, Skull, Circle, Coins, Heart, Shield, Gem, Square, Triangle } from 'lucide-vue-next'
import ModalBase from '@/components/ui/ModalBase.vue'
import type { Token, TokenShape, TokenSprite, TokenSize } from '@/types'

const props = defineProps<{
  token: Token
  isDragging: boolean
  isLockedByOther: boolean
  lockColor?: string
}>()

const emit = defineEmits<{
  pointerdown: [event: PointerEvent]
  pointermove: [event: PointerEvent]
  pointerup: [event: PointerEvent]
  contextmenu: [event: MouseEvent]
  'token:update': [tokenId: number, updates: Partial<Omit<Token, 'id'>>]
  'token:delete': [tokenId: number]
}>()

const showModal = ref(false)
const labelInputRef = ref<HTMLInputElement | null>(null)

// Local form state for modal
const formLabel = ref('')
const formShape = ref<TokenShape>('circle')
const formSprite = ref<TokenSprite>('star')
const formColor = ref('#ef4444')
const formSize = ref<TokenSize>('medium')

// Size map for rendering
const sizeMap = {
  small: 24,
  medium: 36,
  large: 48,
}

const tokenSize = computed(() => sizeMap[props.token.size])

const openModal = () => {
  // Initialize form with current values
  formLabel.value = props.token.label ?? ''
  formShape.value = props.token.shape ?? 'circle'
  formSprite.value = props.token.sprite ?? 'star'
  formColor.value = props.token.color
  formSize.value = props.token.size
  showModal.value = true
  nextTick(() => {
    labelInputRef.value?.focus()
  })
}

const closeModal = () => {
  showModal.value = false
}

const saveChanges = () => {
  emit('token:update', props.token.id, {
    label: formLabel.value || undefined,
    shape: props.token.kind === 'color' ? formShape.value : undefined,
    sprite: props.token.kind === 'sprite' ? formSprite.value : undefined,
    color: formColor.value,
    size: formSize.value,
  })
  closeModal()
}

const deleteToken = () => {
  closeModal()
  emit('token:delete', props.token.id)
}

defineExpose({ openModal })
</script>

<template>
  <div
    class="token"
    :class="{
      'token--dragging': isDragging,
      'token--locked': isLockedByOther,
    }"
    :style="{
      transform: `translate3d(${token.x - tokenSize / 2}px, ${token.y - tokenSize / 2}px, 0)`,
      '--token-color': token.color,
      '--lock-color': lockColor,
      '--token-size': `${tokenSize}px`,
      zIndex: isDragging || isLockedByOther ? 10000 : token.z,
    }"
    @pointerdown="emit('pointerdown', $event)"
    @pointermove="emit('pointermove', $event)"
    @pointerup="emit('pointerup', $event)"
    @pointercancel="emit('pointerup', $event)"
    @dblclick.stop="openModal"
    @contextmenu="emit('contextmenu', $event)"
  >
    <!-- Color token shapes -->
    <template v-if="token.kind === 'color'">
      <div v-if="token.shape === 'circle'" class="token__shape token__shape--circle" />
      <div v-else-if="token.shape === 'square'" class="token__shape token__shape--square" />
      <div v-else-if="token.shape === 'star'" class="token__shape token__shape--star" />
      <div v-else-if="token.shape === 'triangle'" class="token__shape token__shape--triangle" />
    </template>

    <!-- Sprite tokens -->
    <template v-else>
      <Star v-if="token.sprite === 'star'" class="token__sprite" :size="tokenSize * 0.7" />
      <Skull v-else-if="token.sprite === 'skull'" class="token__sprite" :size="tokenSize * 0.7" />
      <Coins v-else-if="token.sprite === 'coin'" class="token__sprite" :size="tokenSize * 0.7" />
      <Heart v-else-if="token.sprite === 'heart'" class="token__sprite" :size="tokenSize * 0.7" />
      <Shield v-else-if="token.sprite === 'shield'" class="token__sprite" :size="tokenSize * 0.7" />
      <Gem v-else-if="token.sprite === 'gem'" class="token__sprite" :size="tokenSize * 0.7" />
    </template>

    <!-- Label (if present) -->
    <span v-if="token.label" class="token__label">{{ token.label }}</span>
  </div>

  <!-- Token Properties Modal -->
  <ModalBase v-if="showModal" title="Token Properties" @close="closeModal">
    <label class="form-field">
      <span class="form-label">Label (optional)</span>
      <input
        ref="labelInputRef"
        v-model="formLabel"
        type="text"
        class="form-input"
        placeholder="None"
        maxlength="16"
      />
    </label>

    <!-- Shape selector (for color tokens) -->
    <div v-if="token.kind === 'color'" class="form-field">
      <span class="form-label">Shape</span>
      <div class="option-group">
        <button
          class="option-btn"
          :class="{ 'option-btn--active': formShape === 'circle' }"
          @click="formShape = 'circle'"
        >
          <Circle :size="20" />
        </button>
        <button
          class="option-btn"
          :class="{ 'option-btn--active': formShape === 'square' }"
          @click="formShape = 'square'"
        >
          <Square :size="20" />
        </button>
        <button
          class="option-btn"
          :class="{ 'option-btn--active': formShape === 'star' }"
          @click="formShape = 'star'"
        >
          <Star :size="20" />
        </button>
        <button
          class="option-btn"
          :class="{ 'option-btn--active': formShape === 'triangle' }"
          @click="formShape = 'triangle'"
        >
          <Triangle :size="20" />
        </button>
      </div>
    </div>

    <!-- Sprite selector (for sprite tokens) -->
    <div v-if="token.kind === 'sprite'" class="form-field">
      <span class="form-label">Icon</span>
      <div class="option-group">
        <button
          class="option-btn"
          :class="{ 'option-btn--active': formSprite === 'star' }"
          @click="formSprite = 'star'"
        >
          <Star :size="20" />
        </button>
        <button
          class="option-btn"
          :class="{ 'option-btn--active': formSprite === 'skull' }"
          @click="formSprite = 'skull'"
        >
          <Skull :size="20" />
        </button>
        <button
          class="option-btn"
          :class="{ 'option-btn--active': formSprite === 'coin' }"
          @click="formSprite = 'coin'"
        >
          <Coins :size="20" />
        </button>
        <button
          class="option-btn"
          :class="{ 'option-btn--active': formSprite === 'heart' }"
          @click="formSprite = 'heart'"
        >
          <Heart :size="20" />
        </button>
        <button
          class="option-btn"
          :class="{ 'option-btn--active': formSprite === 'shield' }"
          @click="formSprite = 'shield'"
        >
          <Shield :size="20" />
        </button>
        <button
          class="option-btn"
          :class="{ 'option-btn--active': formSprite === 'gem' }"
          @click="formSprite = 'gem'"
        >
          <Gem :size="20" />
        </button>
      </div>
    </div>

    <label class="form-field">
      <span class="form-label">Size</span>
      <div class="option-group">
        <button
          class="option-btn option-btn--text"
          :class="{ 'option-btn--active': formSize === 'small' }"
          @click="formSize = 'small'"
        >
          S
        </button>
        <button
          class="option-btn option-btn--text"
          :class="{ 'option-btn--active': formSize === 'medium' }"
          @click="formSize = 'medium'"
        >
          M
        </button>
        <button
          class="option-btn option-btn--text"
          :class="{ 'option-btn--active': formSize === 'large' }"
          @click="formSize = 'large'"
        >
          L
        </button>
      </div>
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
      <button class="btn btn--danger" @click="deleteToken">
        <Trash2 :size="14" />
        Delete
      </button>
      <button class="btn btn--primary" @click="saveChanges">Save</button>
    </template>
  </ModalBase>
</template>

<style scoped>
.token {
  position: absolute;
  width: var(--token-size);
  height: var(--token-size);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--transition-fast);
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

.token--dragging {
  transition: none;
}

.token--locked {
  transition:
    left var(--transition-fast),
    top var(--transition-fast);
}

.token--locked::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-glow);
  --glow-color: var(--lock-color, #888);
  pointer-events: none;
}

/* Color token shapes */
.token__shape {
  width: 100%;
  height: 100%;
  background: var(--token-color);
}

.token__shape--circle {
  border-radius: var(--radius-full);
}

.token__shape--square {
  border-radius: var(--radius-md);
}

.token__shape--star {
  clip-path: polygon(
    50% 0%,
    61% 35%,
    98% 35%,
    68% 57%,
    79% 91%,
    50% 70%,
    21% 91%,
    32% 57%,
    2% 35%,
    39% 35%
  );
}

.token__shape--triangle {
  clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
}

/* Sprite tokens */
.token__sprite {
  color: var(--token-color);
}

/* Label */
.token__label {
  position: absolute;
  bottom: -16px;
  left: 50%;
  transform: translateX(-50%);
  font-size: var(--font-size-xs);
  color: var(--color-text-primary);
  background: var(--color-surface-overlay);
  padding: 1px var(--spacing-2);
  border-radius: var(--radius-sm);
  white-space: nowrap;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
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

.option-group {
  display: flex;
  gap: var(--spacing-4);
  flex-wrap: wrap;
}

.option-btn {
  width: 40px;
  height: 40px;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  background: var(--color-surface-input);
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-normal);
}

.option-btn--text {
  height: 32px;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
}

.option-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.option-btn--active {
  border-color: var(--color-primary-border-active);
  background: var(--color-info-bg);
  color: var(--color-info-text);
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
