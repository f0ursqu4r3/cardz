<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import { X, Trash2, Star, Skull, Circle, Coins, Heart, Shield, Gem, Square, Triangle } from 'lucide-vue-next'
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

const onBackdropClick = (event: MouseEvent) => {
  if ((event.target as HTMLElement).classList.contains('token-modal')) {
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
  <Teleport to="body">
    <div v-if="showModal" class="token-modal" @click="onBackdropClick">
      <div class="token-modal__content" @pointerdown.stop>
        <div class="token-modal__header">
          <h3>Token Properties</h3>
          <button class="token-modal__close" @click="closeModal">
            <X :size="16" />
          </button>
        </div>
        <div class="token-modal__body">
          <label class="token-modal__field">
            <span class="token-modal__label">Label (optional)</span>
            <input
              ref="labelInputRef"
              v-model="formLabel"
              type="text"
              class="token-modal__input"
              placeholder="None"
              maxlength="16"
              @keydown="onKeydown"
            />
          </label>

          <!-- Shape selector (for color tokens) -->
          <div v-if="token.kind === 'color'" class="token-modal__field">
            <span class="token-modal__label">Shape</span>
            <div class="token-modal__shapes">
              <button
                class="token-modal__shape-btn"
                :class="{ 'token-modal__shape-btn--active': formShape === 'circle' }"
                @click="formShape = 'circle'"
              >
                <Circle :size="20" />
              </button>
              <button
                class="token-modal__shape-btn"
                :class="{ 'token-modal__shape-btn--active': formShape === 'square' }"
                @click="formShape = 'square'"
              >
                <Square :size="20" />
              </button>
              <button
                class="token-modal__shape-btn"
                :class="{ 'token-modal__shape-btn--active': formShape === 'star' }"
                @click="formShape = 'star'"
              >
                <Star :size="20" />
              </button>
              <button
                class="token-modal__shape-btn"
                :class="{ 'token-modal__shape-btn--active': formShape === 'triangle' }"
                @click="formShape = 'triangle'"
              >
                <Triangle :size="20" />
              </button>
            </div>
          </div>

          <!-- Sprite selector (for sprite tokens) -->
          <div v-if="token.kind === 'sprite'" class="token-modal__field">
            <span class="token-modal__label">Icon</span>
            <div class="token-modal__shapes">
              <button
                class="token-modal__shape-btn"
                :class="{ 'token-modal__shape-btn--active': formSprite === 'star' }"
                @click="formSprite = 'star'"
              >
                <Star :size="20" />
              </button>
              <button
                class="token-modal__shape-btn"
                :class="{ 'token-modal__shape-btn--active': formSprite === 'skull' }"
                @click="formSprite = 'skull'"
              >
                <Skull :size="20" />
              </button>
              <button
                class="token-modal__shape-btn"
                :class="{ 'token-modal__shape-btn--active': formSprite === 'coin' }"
                @click="formSprite = 'coin'"
              >
                <Coins :size="20" />
              </button>
              <button
                class="token-modal__shape-btn"
                :class="{ 'token-modal__shape-btn--active': formSprite === 'heart' }"
                @click="formSprite = 'heart'"
              >
                <Heart :size="20" />
              </button>
              <button
                class="token-modal__shape-btn"
                :class="{ 'token-modal__shape-btn--active': formSprite === 'shield' }"
                @click="formSprite = 'shield'"
              >
                <Shield :size="20" />
              </button>
              <button
                class="token-modal__shape-btn"
                :class="{ 'token-modal__shape-btn--active': formSprite === 'gem' }"
                @click="formSprite = 'gem'"
              >
                <Gem :size="20" />
              </button>
            </div>
          </div>

          <label class="token-modal__field">
            <span class="token-modal__label">Size</span>
            <div class="token-modal__sizes">
              <button
                class="token-modal__size-btn"
                :class="{ 'token-modal__size-btn--active': formSize === 'small' }"
                @click="formSize = 'small'"
              >
                S
              </button>
              <button
                class="token-modal__size-btn"
                :class="{ 'token-modal__size-btn--active': formSize === 'medium' }"
                @click="formSize = 'medium'"
              >
                M
              </button>
              <button
                class="token-modal__size-btn"
                :class="{ 'token-modal__size-btn--active': formSize === 'large' }"
                @click="formSize = 'large'"
              >
                L
              </button>
            </div>
          </label>

          <label class="token-modal__field">
            <span class="token-modal__label">Color</span>
            <div class="token-modal__color-row">
              <input v-model="formColor" type="color" class="token-modal__color-picker" />
              <input
                v-model="formColor"
                type="text"
                class="token-modal__input token-modal__input--color"
                pattern="^#[0-9a-fA-F]{6}$"
              />
            </div>
          </label>
        </div>
        <div class="token-modal__footer">
          <button class="token-modal__delete" @click="deleteToken">
            <Trash2 :size="14" />
            Delete
          </button>
          <button class="token-modal__save" @click="saveChanges">Save</button>
        </div>
      </div>
    </div>
  </Teleport>
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
  transition: transform 0.05s ease;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

.token--dragging {
  transition: none; /* Disable transition during drag for smooth movement */
}

.token--locked {
  /* Smooth interpolation for remote player drag movements */
  transition:
    left 0.05s linear,
    top 0.05s linear;
}

.token--locked::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  box-shadow: 0 0 12px 2px var(--lock-color, #888);
  pointer-events: none;
}

/* Color token shapes */
.token__shape {
  width: 100%;
  height: 100%;
  background: var(--token-color);
}

.token__shape--circle {
  border-radius: 50%;
}

.token__shape--square {
  border-radius: 4px;
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
  font-size: 10px;
  color: #f0f0f0;
  background: rgba(0, 0, 0, 0.6);
  padding: 1px 4px;
  border-radius: 2px;
  white-space: nowrap;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Modal styles */
.token-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.token-modal__content {
  background: #2a2a2a;
  border-radius: 8px;
  min-width: 280px;
  max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.token-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.token-modal__header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #f0f0f0;
}

.token-modal__close {
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

.token-modal__close:hover {
  color: #f0f0f0;
}

.token-modal__body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.token-modal__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.token-modal__label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #888;
}

.token-modal__input {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 8px 10px;
  color: #f0f0f0;
  font-size: 14px;
  outline: none;
}

.token-modal__input:focus {
  border-color: rgba(255, 255, 255, 0.4);
}

.token-modal__input--color {
  flex: 1;
}

.token-modal__shapes {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.token-modal__shape-btn {
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.3);
  color: #888;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.token-modal__shape-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #f0f0f0;
}

.token-modal__shape-btn--active {
  border-color: rgba(60, 120, 180, 0.8);
  background: rgba(60, 120, 180, 0.3);
  color: #a0d0ff;
}

.token-modal__sizes {
  display: flex;
  gap: 8px;
}

.token-modal__size-btn {
  width: 40px;
  height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.3);
  color: #888;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.token-modal__size-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #f0f0f0;
}

.token-modal__size-btn--active {
  border-color: rgba(60, 120, 180, 0.8);
  background: rgba(60, 120, 180, 0.3);
  color: #a0d0ff;
}

.token-modal__color-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.token-modal__color-picker {
  width: 40px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
}

.token-modal__color-picker::-webkit-color-swatch-wrapper {
  padding: 0;
}

.token-modal__color-picker::-webkit-color-swatch {
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.token-modal__footer {
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.token-modal__delete {
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

.token-modal__delete:hover {
  background: rgba(180, 60, 60, 0.5);
}

.token-modal__save {
  background: rgba(60, 120, 180, 0.4);
  border: 1px solid rgba(60, 120, 180, 0.6);
  border-radius: 4px;
  padding: 6px 16px;
  color: #a0d0ff;
  font-size: 12px;
  cursor: pointer;
}

.token-modal__save:hover {
  background: rgba(60, 120, 180, 0.6);
}
</style>
