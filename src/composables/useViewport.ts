import { ref, computed, type Ref } from 'vue'

export interface ViewportState {
  panX: number
  panY: number
  zoom: number
}

const MIN_ZOOM = 0.1
const MAX_ZOOM = 2
const ZOOM_SENSITIVITY = 0.001

export function useViewport(canvasRef: Ref<HTMLElement | null>) {
  const panX = ref(0)
  const panY = ref(0)
  const zoom = ref(1)

  // Track panning state
  const isPanning = ref(false)
  let panStartX = 0
  let panStartY = 0
  let panStartPanX = 0
  let panStartPanY = 0

  // CSS transform for the world container
  const worldTransform = computed(
    () => `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`,
  )

  // Convert screen coordinates to world coordinates
  const screenToWorld = (screenX: number, screenY: number): { x: number; y: number } => {
    const rect = canvasRef.value?.getBoundingClientRect()
    if (!rect) return { x: screenX, y: screenY }

    // Get position relative to canvas
    const relX = screenX - rect.left
    const relY = screenY - rect.top

    // Convert to world coordinates (accounting for pan and zoom)
    const worldX = (relX - panX.value) / zoom.value
    const worldY = (relY - panY.value) / zoom.value

    return { x: worldX, y: worldY }
  }

  // Convert world coordinates to screen coordinates
  const worldToScreen = (worldX: number, worldY: number): { x: number; y: number } => {
    const rect = canvasRef.value?.getBoundingClientRect()
    if (!rect) return { x: worldX, y: worldY }

    const screenX = worldX * zoom.value + panX.value + rect.left
    const screenY = worldY * zoom.value + panY.value + rect.top

    return { x: screenX, y: screenY }
  }

  // Zoom centered on a point
  const zoomAt = (screenX: number, screenY: number, delta: number) => {
    const rect = canvasRef.value?.getBoundingClientRect()
    if (!rect) return

    // Get point relative to canvas
    const relX = screenX - rect.left
    const relY = screenY - rect.top

    // Calculate world point before zoom
    const worldX = (relX - panX.value) / zoom.value
    const worldY = (relY - panY.value) / zoom.value

    // Apply zoom and snap to 10% increments
    const rawZoom = zoom.value * (1 - delta * ZOOM_SENSITIVITY)
    const snappedZoom = Math.round(rawZoom * 10) / 10
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, snappedZoom))

    // Adjust pan to keep the point under cursor
    panX.value = relX - worldX * newZoom
    panY.value = relY - worldY * newZoom
    zoom.value = newZoom
  }

  // Handle wheel events (always zoom)
  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    zoomAt(event.clientX, event.clientY, event.deltaY)
  }

  // Start panning (middle mouse or space+drag)
  const startPan = (event: PointerEvent) => {
    isPanning.value = true
    panStartX = event.clientX
    panStartY = event.clientY
    panStartPanX = panX.value
    panStartPanY = panY.value
  }

  // Update pan during drag
  const updatePan = (event: PointerEvent) => {
    if (!isPanning.value) return

    panX.value = panStartPanX + (event.clientX - panStartX)
    panY.value = panStartPanY + (event.clientY - panStartY)
  }

  // End panning
  const endPan = () => {
    isPanning.value = false
  }

  // Reset viewport to default
  const resetViewport = () => {
    panX.value = 0
    panY.value = 0
    zoom.value = 1
  }

  // Zoom in by 10%, centered on viewport
  const zoomIn = () => {
    const rect = canvasRef.value?.getBoundingClientRect()
    if (!rect) return

    const centerX = rect.width / 2
    const centerY = rect.height / 2

    // Calculate world point at center
    const worldX = (centerX - panX.value) / zoom.value
    const worldY = (centerY - panY.value) / zoom.value

    // Apply zoom (+10%)
    const newZoom = Math.min(MAX_ZOOM, Math.round((zoom.value + 0.1) * 10) / 10)

    // Adjust pan to keep center point
    panX.value = centerX - worldX * newZoom
    panY.value = centerY - worldY * newZoom
    zoom.value = newZoom
  }

  // Zoom out by 10%, centered on viewport
  const zoomOut = () => {
    const rect = canvasRef.value?.getBoundingClientRect()
    if (!rect) return

    const centerX = rect.width / 2
    const centerY = rect.height / 2

    // Calculate world point at center
    const worldX = (centerX - panX.value) / zoom.value
    const worldY = (centerY - panY.value) / zoom.value

    // Apply zoom (-10%)
    const newZoom = Math.max(MIN_ZOOM, Math.round((zoom.value - 0.1) * 10) / 10)

    // Adjust pan to keep center point
    panX.value = centerX - worldX * newZoom
    panY.value = centerY - worldY * newZoom
    zoom.value = newZoom
  }

  // Fit all content in view with padding
  const fitAll = (worldBounds: { x: number; y: number; width: number; height: number }) => {
    const rect = canvasRef.value?.getBoundingClientRect()
    if (!rect) return

    const padding = 50 // Screen pixels padding

    // Calculate zoom to fit bounds
    const scaleX = (rect.width - padding * 2) / worldBounds.width
    const scaleY = (rect.height - padding * 2) / worldBounds.height
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(scaleX, scaleY)))

    // Center of world bounds
    const worldCenterX = worldBounds.x + worldBounds.width / 2
    const worldCenterY = worldBounds.y + worldBounds.height / 2

    // Pan to center
    panX.value = rect.width / 2 - worldCenterX * newZoom
    panY.value = rect.height / 2 - worldCenterY * newZoom
    zoom.value = newZoom
  }

  // Pan to center a specific world point in the viewport
  const panToCenter = (worldX: number, worldY: number) => {
    const rect = canvasRef.value?.getBoundingClientRect()
    if (!rect) return

    panX.value = rect.width / 2 - worldX * zoom.value
    panY.value = rect.height / 2 - worldY * zoom.value
  }

  // Get visible world bounds
  const getVisibleBounds = () => {
    const rect = canvasRef.value?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0, width: 0, height: 0 }

    const topLeft = screenToWorld(rect.left, rect.top)
    const bottomRight = screenToWorld(rect.right, rect.bottom)

    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    }
  }

  return {
    panX,
    panY,
    zoom,
    isPanning,
    worldTransform,
    screenToWorld,
    worldToScreen,
    zoomAt,
    zoomIn,
    zoomOut,
    fitAll,
    onWheel,
    startPan,
    updatePan,
    endPan,
    resetViewport,
    panToCenter,
    getVisibleBounds,
  }
}
