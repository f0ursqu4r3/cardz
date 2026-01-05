<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCardStore } from '@/stores/cards'
import type { useViewport } from '@/composables/useViewport'
import { ZoomIn, ZoomOut, Home, Maximize2, Map } from 'lucide-vue-next'
import TablePanel from '@/components/ui/TablePanel.vue'
import TableButton from '@/components/ui/TableButton.vue'
import TableToolbar from '@/components/ui/TableToolbar.vue'

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

// Visible viewport rectangle on minimap (clamped to minimap bounds)
const viewportRect = computed(() => {
  const bounds = props.viewport.getVisibleBounds()
  const topLeft = toMinimap(bounds.x, bounds.y)
  const width = bounds.width * scale.value
  const height = bounds.height * scale.value

  // Clamp the rectangle to stay within minimap bounds
  const clampedX = Math.max(0, Math.min(topLeft.x, MINIMAP_WIDTH - 2))
  const clampedY = Math.max(0, Math.min(topLeft.y, MINIMAP_HEIGHT - 2))
  const clampedWidth = Math.min(width, MINIMAP_WIDTH - clampedX)
  const clampedHeight = Math.min(height, MINIMAP_HEIGHT - clampedY)

  // Ensure minimum visible size
  return {
    x: clampedX,
    y: clampedY,
    width: Math.max(4, clampedWidth),
    height: Math.max(4, clampedHeight),
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
    <TablePanel v-if="isCollapsed">
      <TableButton title="Show Minimap" @click="toggleCollapsed">
        <Map />
      </TableButton>
    </TablePanel>

    <!-- Expanded state -->
    <TablePanel v-else no-padding>
      <!-- Controls bar -->
      <TableToolbar border-bottom>
        <TableButton size="sm" title="Zoom Out" @click="handleZoomOut">
          <ZoomOut />
        </TableButton>
        <span class="label">{{ Math.round(viewport.zoom.value * 100) }}%</span>
        <TableButton size="sm" title="Zoom In" @click="handleZoomIn">
          <ZoomIn />
        </TableButton>
        <div class="separator" />
        <TableButton size="sm" title="Reset View (Home)" @click="handleReset">
          <Home />
        </TableButton>
        <TableButton size="sm" title="Fit All" @click="handleFitAll">
          <Maximize2 />
        </TableButton>
        <div class="separator" />
        <TableButton size="sm" title="Hide Minimap" @click="toggleCollapsed">
          <Map />
        </TableButton>
      </TableToolbar>

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
    </TablePanel>
  </div>
</template>

<style scoped>
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
