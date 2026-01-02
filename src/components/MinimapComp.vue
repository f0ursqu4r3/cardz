<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCardStore } from '@/stores/cards'
import type { useViewport } from '@/composables/useViewport'
import { ZoomIn, ZoomOut, Home, Maximize2, Map } from 'lucide-vue-next'

const props = defineProps<{
  viewport: ReturnType<typeof useViewport>
  canvasWidth: number
  canvasHeight: number
}>()

const cardStore = useCardStore()
const minimapRef = ref<HTMLElement | null>(null)
const isDragging = ref(false)
const isCollapsed = ref(false)

// Minimap dimensions
const MINIMAP_WIDTH = 180
const MINIMAP_HEIGHT = 120

// Calculate world bounds (extent of all objects)
const worldBounds = computed(() => {
  let minX = 0
  let minY = 0
  let maxX = 1000
  let maxY = 800

  // Include all cards
  cardStore.cards.forEach((card) => {
    if (!card.inHand) {
      minX = Math.min(minX, card.x - 50)
      minY = Math.min(minY, card.y - 50)
      maxX = Math.max(maxX, card.x + 150)
      maxY = Math.max(maxY, card.y + 200)
    }
  })

  // Include all zones
  cardStore.zones.forEach((zone) => {
    minX = Math.min(minX, zone.x - 50)
    minY = Math.min(minY, zone.y - 50)
    maxX = Math.max(maxX, zone.x + zone.width + 50)
    maxY = Math.max(maxY, zone.y + zone.height + 50)
  })

  // Add padding
  const padding = 200
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  }
})

// Scale factor to fit world in minimap
const scale = computed(() => {
  const scaleX = MINIMAP_WIDTH / worldBounds.value.width
  const scaleY = MINIMAP_HEIGHT / worldBounds.value.height
  return Math.min(scaleX, scaleY)
})

// Convert world coords to minimap coords
const toMinimap = (worldX: number, worldY: number) => ({
  x: (worldX - worldBounds.value.x) * scale.value,
  y: (worldY - worldBounds.value.y) * scale.value,
})

// Visible viewport rectangle on minimap
const viewportRect = computed(() => {
  const bounds = props.viewport.getVisibleBounds()
  const topLeft = toMinimap(bounds.x, bounds.y)
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bounds.width * scale.value,
    height: bounds.height * scale.value,
  }
})

// Card positions on minimap
const minimapCards = computed(() =>
  cardStore.cards
    .filter((c) => !c.inHand)
    .map((card) => {
      const pos = toMinimap(card.x, card.y)
      return {
        id: card.id,
        x: pos.x,
        y: pos.y,
        width: 6,
        height: 8,
        isInStack: card.stackId !== null,
      }
    }),
)

// Zone positions on minimap
const minimapZones = computed(() =>
  cardStore.zones.map((zone) => {
    const pos = toMinimap(zone.x, zone.y)
    return {
      id: zone.id,
      x: pos.x,
      y: pos.y,
      width: zone.width * scale.value,
      height: zone.height * scale.value,
    }
  }),
)

// Handle click/drag on minimap to pan
const handleMinimapClick = (event: PointerEvent) => {
  const rect = minimapRef.value?.getBoundingClientRect()
  if (!rect) return

  const minimapX = event.clientX - rect.left
  const minimapY = event.clientY - rect.top

  // Convert minimap coords to world coords
  const worldX = minimapX / scale.value + worldBounds.value.x
  const worldY = minimapY / scale.value + worldBounds.value.y

  // Pan to center this point
  props.viewport.panToCenter(worldX, worldY)
}

const onPointerDown = (event: PointerEvent) => {
  event.preventDefault()
  isDragging.value = true
  ;(event.target as HTMLElement)?.setPointerCapture(event.pointerId)
  handleMinimapClick(event)
}

const onPointerMove = (event: PointerEvent) => {
  if (!isDragging.value) return
  handleMinimapClick(event)
}

const onPointerUp = (event: PointerEvent) => {
  isDragging.value = false
  ;(event.target as HTMLElement)?.releasePointerCapture(event.pointerId)
}

// View controls
const handleZoomIn = (event: Event) => {
  event.stopPropagation()
  props.viewport.zoomIn()
}

const handleZoomOut = (event: Event) => {
  event.stopPropagation()
  props.viewport.zoomOut()
}

const handleReset = (event: Event) => {
  event.stopPropagation()
  props.viewport.resetViewport()
}

const handleFitAll = (event: Event) => {
  event.stopPropagation()
  props.viewport.fitAll(worldBounds.value)
}

const toggleCollapsed = () => {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <div class="minimap-container">
    <!-- Collapsed state: just a button -->
    <button
      v-if="isCollapsed"
      class="minimap-toggle minimap-toggle--collapsed"
      @click="toggleCollapsed"
      title="Show Minimap"
    >
      <Map :size="18" />
    </button>

    <!-- Expanded state -->
    <div v-else class="minimap-panel">
      <!-- Controls bar -->
      <div class="minimap-controls">
        <button class="minimap-btn" @click="handleZoomOut" title="Zoom Out">
          <ZoomOut :size="14" />
        </button>
        <span class="minimap-zoom">{{ Math.round(viewport.zoom.value * 100) }}%</span>
        <button class="minimap-btn" @click="handleZoomIn" title="Zoom In">
          <ZoomIn :size="14" />
        </button>
        <div class="minimap-separator" />
        <button class="minimap-btn" @click="handleReset" title="Reset View (Home)">
          <Home :size="14" />
        </button>
        <button class="minimap-btn" @click="handleFitAll" title="Fit All">
          <Maximize2 :size="14" />
        </button>
        <div class="minimap-separator" />
        <button class="minimap-btn" @click="toggleCollapsed" title="Hide Minimap">
          <Map :size="14" />
        </button>
      </div>

      <!-- Minimap display -->
      <div
        ref="minimapRef"
        class="minimap"
        :style="{ width: `${MINIMAP_WIDTH}px`, height: `${MINIMAP_HEIGHT}px` }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <!-- Zones -->
        <div
          v-for="zone in minimapZones"
          :key="`zone-${zone.id}`"
          class="minimap__zone"
          :style="{
            left: `${zone.x}px`,
            top: `${zone.y}px`,
            width: `${zone.width}px`,
            height: `${zone.height}px`,
          }"
        />

        <!-- Cards -->
        <div
          v-for="card in minimapCards"
          :key="`card-${card.id}`"
          class="minimap__card"
          :class="{ 'minimap__card--stacked': card.isInStack }"
          :style="{
            left: `${card.x}px`,
            top: `${card.y}px`,
            width: `${card.width}px`,
            height: `${card.height}px`,
          }"
        />

        <!-- Viewport indicator -->
        <div
          class="minimap__viewport"
          :style="{
            left: `${viewportRect.x}px`,
            top: `${viewportRect.y}px`,
            width: `${viewportRect.width}px`,
            height: `${viewportRect.height}px`,
          }"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.minimap-container {
  /* Positioned by parent flex container */
}

.minimap-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  backdrop-filter: blur(4px);
  transition: all 0.15s ease;
}

.minimap-toggle:hover {
  background: rgba(0, 0, 0, 0.8);
  border-color: rgba(255, 255, 255, 0.3);
  color: white;
}

.minimap-panel {
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  overflow: hidden;
  backdrop-filter: blur(4px);
}

.minimap-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.minimap-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.15s ease;
}

.minimap-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

.minimap-btn:active {
  background: rgba(255, 255, 255, 0.25);
}

.minimap-zoom {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  min-width: 36px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.minimap-separator {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.15);
  margin: 0 2px;
}

.minimap {
  position: relative;
  cursor: crosshair;
}

.minimap__zone {
  position: absolute;
  background: rgba(100, 150, 100, 0.4);
  border: 1px solid rgba(100, 200, 100, 0.5);
  border-radius: 2px;
  pointer-events: none;
}

.minimap__card {
  position: absolute;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 1px;
  pointer-events: none;
}

.minimap__card--stacked {
  background: rgba(200, 200, 255, 0.8);
}

.minimap__viewport {
  position: absolute;
  border: 2px solid rgba(100, 200, 255, 0.8);
  background: rgba(100, 200, 255, 0.1);
  border-radius: 2px;
  pointer-events: none;
}
</style>
