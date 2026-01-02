import { ref, type Ref } from 'vue'
import type { DragTarget } from '@/types'
import { LONG_PRESS_MS } from '@/types'

export interface DragCallbacks {
  onDragStart?: () => void
  onDragMove?: (x: number, y: number) => void
  onDragEnd?: () => void
}

export function useDrag() {
  const isDragging = ref(false)
  const activeIndex = ref<number | null>(null)
  const target = ref<DragTarget | null>(null)

  const state = {
    pointerId: null as number | null,
    offsetX: 0,
    offsetY: 0,
    pendingX: 0,
    pendingY: 0,
    rafId: 0,
    timerId: null as number | null,
  }

  const getCanvasPoint = (
    event: PointerEvent,
    canvasRef: Ref<HTMLElement | null> | null,
  ): { x: number; y: number } => {
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

    const { x, y } = getCanvasPoint(event, canvasRef)

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

  const getDelta = () => ({
    x: state.pendingX - state.offsetX,
    y: state.pendingY - state.offsetY,
  })

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
    isValidPointer,
  }
}
