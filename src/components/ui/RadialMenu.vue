<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, type Component } from 'vue'
import {
  RotateCw,
  Hand,
  ArrowUp,
  Shuffle,
  Layers,
  Settings,
  Lock,
  Trash2,
  X,
  Square,
  Search,
  EyeOff,
  ArrowUpFromLine,
} from 'lucide-vue-next'

// Map icon names to components
const iconComponents: Record<string, Component> = {
  'rotate-cw': RotateCw,
  hand: Hand,
  'arrow-up': ArrowUp,
  shuffle: Shuffle,
  layers: Layers,
  settings: Settings,
  lock: Lock,
  trash: Trash2,
  x: X,
  square: Square,
  search: Search,
  'eye-off': EyeOff,
  'arrow-up-from-line': ArrowUpFromLine,
}

export interface RadialMenuItem {
  id: string
  label: string
  icon?: string // Lucide icon name
  disabled?: boolean
  danger?: boolean // Red styling for destructive actions
}

export interface RadialMenuProps {
  items: RadialMenuItem[]
  x: number
  y: number
  visible: boolean
  radius?: number
  itemSize?: number
}

const props = withDefaults(defineProps<RadialMenuProps>(), {
  radius: 80,
  itemSize: 48,
})

const emit = defineEmits<{
  select: [item: RadialMenuItem]
  close: []
}>()

const menuRef = ref<HTMLElement | null>(null)
const hoveredId = ref<string | null>(null)
const isAnimating = ref(false)

// Calculate position for each menu item around the circle
const itemPositions = computed(() => {
  const count = props.items.length
  if (count === 0) return []

  // Start from top (-90deg) and go clockwise
  const startAngle = -Math.PI / 2
  const angleStep = (Math.PI * 2) / count

  return props.items.map((item, index) => {
    const angle = startAngle + angleStep * index
    const x = Math.cos(angle) * props.radius
    const y = Math.sin(angle) * props.radius
    return { item, x, y, angle }
  })
})

// Constrain menu position to viewport
const constrainedPosition = computed(() => {
  const padding = props.radius + props.itemSize / 2 + 10
  const vw = window.innerWidth
  const vh = window.innerHeight

  return {
    x: Math.max(padding, Math.min(vw - padding, props.x)),
    y: Math.max(padding, Math.min(vh - padding, props.y)),
  }
})

// Handle item click
const onItemClick = (item: RadialMenuItem) => {
  if (item.disabled) return
  emit('select', item)
  emit('close')
}

// Handle click outside
const onClickOutside = (event: MouseEvent) => {
  if (!props.visible) return
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    emit('close')
  }
}

// Handle escape key
const onKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && props.visible) {
    emit('close')
  }
}

// Trigger animation on show
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      hoveredId.value = null
      isAnimating.value = true
      setTimeout(() => {
        isAnimating.value = false
      }, 200)
    }
  },
)

onMounted(() => {
  document.addEventListener('click', onClickOutside, true)
  document.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  hoveredId.value = null
  document.removeEventListener('click', onClickOutside, true)
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="radial">
      <div
        v-if="visible"
        ref="menuRef"
        class="radial-menu"
        :style="{
          left: `${constrainedPosition.x}px`,
          top: `${constrainedPosition.y}px`,
        }"
      >
        <!-- Center circle (visual anchor) -->
        <div class="radial-center" />

        <!-- Menu items -->
        <button
          v-for="{ item, x, y } in itemPositions"
          :key="item.id"
          class="radial-item"
          :class="{
            'radial-item--disabled': item.disabled,
            'radial-item--danger': item.danger,
            'radial-item--hovered': hoveredId === item.id,
            'radial-item--animating': isAnimating,
          }"
          :style="{
            '--item-x': `${x}px`,
            '--item-y': `${y}px`,
            width: `${itemSize}px`,
            height: `${itemSize}px`,
          }"
          :disabled="item.disabled"
          :title="item.label"
          @click.stop="onItemClick(item)"
          @mouseenter="hoveredId = item.id"
          @mouseleave="hoveredId = null"
        >
          <component
            :is="iconComponents[item.icon || ''] || item.label.charAt(0)"
            v-if="item.icon && iconComponents[item.icon]"
            :size="20"
            class="radial-item__icon"
          />
          <span v-else class="radial-item__icon">{{ item.label.charAt(0) }}</span>
        </button>

        <!-- Tooltip for hovered item -->
        <Transition name="tooltip">
          <div v-if="hoveredId" class="radial-tooltip">
            {{ itemPositions.find((p) => p.item.id === hoveredId)?.item.label }}
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.radial-menu {
  position: fixed;
  z-index: 10000;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.radial-center {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 24px;
  height: 24px;
  transform: translate(-50%, -50%);
  background: rgba(30, 30, 30, 0.9);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.radial-item {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(calc(-50% + var(--item-x)), calc(-50% + var(--item-y)));
  pointer-events: auto;
  border: none;
  border-radius: 50%;
  background: rgba(40, 40, 40, 0.95);
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.15);
  transition:
    transform 0.15s ease,
    background-color 0.15s ease,
    box-shadow 0.15s ease,
    border-color 0.15s ease;
}

.radial-item--animating {
  animation: radial-pop 0.2s ease-out backwards;
}

.radial-item:nth-child(2) {
  animation-delay: 0ms;
}
.radial-item:nth-child(3) {
  animation-delay: 20ms;
}
.radial-item:nth-child(4) {
  animation-delay: 40ms;
}
.radial-item:nth-child(5) {
  animation-delay: 60ms;
}
.radial-item:nth-child(6) {
  animation-delay: 80ms;
}
.radial-item:nth-child(7) {
  animation-delay: 100ms;
}
.radial-item:nth-child(8) {
  animation-delay: 120ms;
}

@keyframes radial-pop {
  0% {
    transform: translate(-50%, -50%) scale(0);
    opacity: 0;
  }
  70% {
    transform: translate(calc(-50% + var(--item-x) * 1.1), calc(-50% + var(--item-y) * 1.1))
      scale(1.1);
  }
  100% {
    transform: translate(calc(-50% + var(--item-x)), calc(-50% + var(--item-y))) scale(1);
    opacity: 1;
  }
}

.radial-item:hover:not(:disabled) {
  transform: translate(calc(-50% + var(--item-x)), calc(-50% + var(--item-y))) scale(1.15);
  background: rgba(60, 60, 60, 0.95);
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.radial-item:active:not(:disabled) {
  transform: translate(calc(-50% + var(--item-x)), calc(-50% + var(--item-y))) scale(0.95);
}

.radial-item--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.radial-item--danger:hover:not(:disabled) {
  background: rgba(180, 50, 50, 0.95);
  border-color: rgba(255, 100, 100, 0.4);
}

.radial-item__icon {
  line-height: 1;
  user-select: none;
}

.radial-tooltip {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background: rgba(20, 20, 20, 0.95);
  color: #fff;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Transitions */
.radial-enter-active {
  transition: opacity 0.15s ease;
}

.radial-leave-active {
  transition: opacity 0.1s ease;
}

.radial-enter-from,
.radial-leave-to {
  opacity: 0;
}

.tooltip-enter-active {
  transition:
    opacity 0.1s ease,
    transform 0.1s ease;
}

.tooltip-leave-active {
  transition:
    opacity 0.05s ease,
    transform 0.05s ease;
}

.tooltip-enter-from,
.tooltip-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.9);
}
</style>
