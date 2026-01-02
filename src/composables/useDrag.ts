import { ref, computed, type Ref } from 'vue'
import type { DragTarget } from '@/types'
import { LONG_PRESS_MS } from '@/types'

export interface DragCallbacks {
  onDragStart?: () => void
  onDragMove?: (x: number, y: number) => void
  onDragEnd?: () => void
}

// Viewport transform function type
export type ScreenToWorldFn = (screenX: number, screenY: number) => { x: number; y: number }

export function useDrag(screenToWorld?: ScreenToWorldFn) {
  const isDragging = ref(false)
  const activeIndex = ref<number | null>(null)
  const target = ref<DragTarget | null>(null)

  // Reactive position for UI binding (screen coordinates)
  const dragX = ref(0)
  const dragY = ref(0)

  const state = {
    pointerId: null as number | null,
    offsetX: 0,
    offsetY: 0,
    pendingX: 0,
    pendingY: 0,
    rafId: 0,
    timerId: null as number | null,
  }

  // Store the screenToWorld function so it can be updated
  let screenToWorldFn: ScreenToWorldFn | undefined = screenToWorld

  const setScreenToWorld = (fn: ScreenToWorldFn | undefined) => {
    screenToWorldFn = fn
  }

  const getCanvasPoint = (
    event: PointerEvent,
    canvasRef: Ref<HTMLElement | null> | null,
  ): { x: number; y: number } => {
    // If we have a viewport transform, use it to get world coordinates
    if (screenToWorldFn) {
      return screenToWorldFn(event.clientX, event.clientY)
    }

    // Fallback to simple canvas-relative coordinates
    const rect = canvasRef?.value?.getBoundingClientRect()
    const x = rect ? event.clientX - rect.left : event.clientX
    const y = rect ? event.clientY - rect.top : event.clientY
    return { x, y }
  }

  const isInBounds = (event: PointerEvent, elementRef: Ref<HTMLElement | null>): boolean => {
    const rect = elementRef.value?.getBoundingClientRect()
    if (!rect) return false
    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    )
  }

  const startDrag = (
    event: PointerEvent,
    index: number,
    cardX: number,
    cardY: number,
    canvasRef: Ref<HTMLElement | null>,
    dragTarget: DragTarget,
  ) => {
    if (isDragging.value || state.pointerId === null) return false

    // Use pending coordinates (already in world space from initPointer)
    // instead of re-transforming via getCanvasPoint
    const x = state.pendingX
    const y = state.pendingY

    target.value = dragTarget
    state.offsetX = x - cardX
    state.offsetY = y - cardY
    activeIndex.value = index
    isDragging.value = true

    return true
  }

  const initPointer = (event: PointerEvent, canvasRef: Ref<HTMLElement | null> | null) => {
    const { x, y } = getCanvasPoint(event, canvasRef)
    state.pointerId = event.pointerId
    state.pendingX = x
    state.pendingY = y
    isDragging.value = false
    target.value = null
    activeIndex.value = null
  }

  const updatePending = (event: PointerEvent, canvasRef: Ref<HTMLElement | null> | null) => {
    if (event.pointerId !== state.pointerId) return false
    const { x, y } = getCanvasPoint(event, canvasRef)
    state.pendingX = x
    state.pendingY = y
    // Update reactive position for UI binding (e.g., ghost cards)
    dragX.value = x - state.offsetX
    dragY.value = y - state.offsetY
    return true
  }

  const schedulePositionUpdate = (applyPosition: () => void) => {
    if (state.rafId) return
    state.rafId = window.requestAnimationFrame(() => {
      state.rafId = 0
      applyPosition()
    })
  }

  const cancelRaf = () => {
    if (state.rafId) {
      window.cancelAnimationFrame(state.rafId)
      state.rafId = 0
    }
  }

  const setLongPressTimer = (callback: () => void) => {
    if (state.timerId !== null) {
      window.clearTimeout(state.timerId)
    }
    state.timerId = window.setTimeout(callback, LONG_PRESS_MS)
  }

  const clearLongPressTimer = () => {
    if (state.timerId !== null) {
      window.clearTimeout(state.timerId)
      state.timerId = null
    }
  }

  const reset = () => {
    activeIndex.value = null
    state.pointerId = null
    isDragging.value = false
    target.value = null
    clearLongPressTimer()
    cancelRaf()
  }

  const getDelta = () => {
    const x = state.pendingX - state.offsetX
    const y = state.pendingY - state.offsetY
    dragX.value = x
    dragY.value = y
    return { x, y }
  }

  // Computed reactive position (updated via getDelta calls)
  const position = computed(() => ({ x: dragX.value, y: dragY.value }))

  const getPending = () => ({
    x: state.pendingX,
    y: state.pendingY,
  })

  const setOffset = (offsetX: number, offsetY: number) => {
    state.offsetX = offsetX
    state.offsetY = offsetY
  }

  const isValidPointer = (pointerId: number) => pointerId === state.pointerId

  return {
    isDragging,
    activeIndex,
    target,
    position,
    getCanvasPoint,
    isInBounds,
    startDrag,
    initPointer,
    updatePending,
    schedulePositionUpdate,
    cancelRaf,
    setLongPressTimer,
    clearLongPressTimer,
    reset,
    getDelta,
    getPending,
    setOffset,
    setScreenToWorld,
    isValidPointer,
  }
}
