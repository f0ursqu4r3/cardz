import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref, type Ref } from 'vue'
import { useDrag } from '@/composables/useDrag'
import { createMockElement, createMockPointerEvent } from '../test-utils'

describe('useDrag', () => {
  let canvasRef: Ref<HTMLElement | null>

  beforeEach(() => {
    const mockElement = createMockElement({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
    })
    canvasRef = ref(mockElement)

    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initialization', () => {
    it('initializes with default values', () => {
      const drag = useDrag()

      expect(drag.isDragging.value).toBe(false)
      expect(drag.activeIndex.value).toBe(null)
      expect(drag.target.value).toBe(null)
    })
  })

  describe('pointer initialization', () => {
    it('initializes pointer and stores coordinates', () => {
      const drag = useDrag()
      const event = createMockPointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 200,
        clientY: 150,
      })

      drag.initPointer(event, canvasRef)

      const pending = drag.getPending()
      expect(pending.x).toBe(200)
      expect(pending.y).toBe(150)
    })

    it('clears any previous drag state', () => {
      const drag = useDrag()

      // First interaction
      drag.initPointer(
        createMockPointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 }),
        canvasRef,
      )

      // Reinitialize
      drag.initPointer(
        createMockPointerEvent('pointerdown', { pointerId: 2, clientX: 200, clientY: 200 }),
        canvasRef,
      )

      expect(drag.isDragging.value).toBe(false)
      expect(drag.target.value).toBe(null)
      expect(drag.activeIndex.value).toBe(null)
    })
  })

  describe('canvas point calculation', () => {
    it('calculates canvas-relative coordinates', () => {
      const drag = useDrag()
      const event = createMockPointerEvent('pointermove', {
        clientX: 400,
        clientY: 300,
      })

      const point = drag.getCanvasPoint(event, canvasRef)

      expect(point.x).toBe(400)
      expect(point.y).toBe(300)
    })

    it('uses screenToWorld function when provided', () => {
      const screenToWorld = vi.fn().mockReturnValue({ x: 200, y: 150 })
      const drag = useDrag(screenToWorld)
      const event = createMockPointerEvent('pointermove', {
        clientX: 400,
        clientY: 300,
      })

      const point = drag.getCanvasPoint(event, canvasRef)

      expect(screenToWorld).toHaveBeenCalledWith(400, 300)
      expect(point.x).toBe(200)
      expect(point.y).toBe(150)
    })

    it('allows updating screenToWorld function', () => {
      const drag = useDrag()
      const newScreenToWorld = vi.fn().mockReturnValue({ x: 100, y: 50 })

      drag.setScreenToWorld(newScreenToWorld)

      const event = createMockPointerEvent('pointermove', {
        clientX: 400,
        clientY: 300,
      })
      const point = drag.getCanvasPoint(event, canvasRef)

      expect(newScreenToWorld).toHaveBeenCalled()
      expect(point.x).toBe(100)
      expect(point.y).toBe(50)
    })
  })

  describe('bounds checking', () => {
    it('returns true when pointer is inside element', () => {
      const drag = useDrag()
      const event = createMockPointerEvent('pointermove', {
        clientX: 400,
        clientY: 300,
      })

      expect(drag.isInBounds(event, canvasRef)).toBe(true)
    })

    it('returns false when pointer is outside element', () => {
      const drag = useDrag()
      const event = createMockPointerEvent('pointermove', {
        clientX: 900, // Outside 800-wide canvas
        clientY: 300,
      })

      expect(drag.isInBounds(event, canvasRef)).toBe(false)
    })

    it('returns false for null element ref', () => {
      const drag = useDrag()
      const nullRef = ref<HTMLElement | null>(null)
      const event = createMockPointerEvent('pointermove', {
        clientX: 400,
        clientY: 300,
      })

      expect(drag.isInBounds(event, nullRef)).toBe(false)
    })
  })

  describe('drag start', () => {
    it('starts drag when pointer is initialized', () => {
      const drag = useDrag()

      // Must initialize pointer first
      drag.initPointer(
        createMockPointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 150 }),
        canvasRef,
      )

      const result = drag.startDrag(
        createMockPointerEvent('pointermove', { pointerId: 1 }),
        0,
        180,
        130,
        canvasRef,
        { type: 'card', index: 0 },
      )

      expect(result).toBe(true)
      expect(drag.isDragging.value).toBe(true)
      expect(drag.activeIndex.value).toBe(0)
      expect(drag.target.value).toEqual({ type: 'card', index: 0 })
    })

    it('returns false if already dragging', () => {
      const drag = useDrag()

      drag.initPointer(
        createMockPointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 150 }),
        canvasRef,
      )

      drag.startDrag(
        createMockPointerEvent('pointermove', { pointerId: 1 }),
        0,
        180,
        130,
        canvasRef,
        { type: 'card', index: 0 },
      )

      const result = drag.startDrag(
        createMockPointerEvent('pointermove', { pointerId: 1 }),
        1,
        280,
        230,
        canvasRef,
        { type: 'card', index: 1 },
      )

      expect(result).toBe(false)
    })

    it('returns false if pointer not initialized', () => {
      const drag = useDrag()

      const result = drag.startDrag(
        createMockPointerEvent('pointermove', { pointerId: 1 }),
        0,
        180,
        130,
        canvasRef,
        { type: 'card', index: 0 },
      )

      expect(result).toBe(false)
    })
  })

  describe('drag update', () => {
    it('updates pending coordinates', () => {
      const drag = useDrag()

      drag.initPointer(
        createMockPointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 150 }),
        canvasRef,
      )

      const result = drag.updatePending(
        createMockPointerEvent('pointermove', { pointerId: 1, clientX: 250, clientY: 200 }),
        canvasRef,
      )

      expect(result).toBe(true)
      const pending = drag.getPending()
      expect(pending.x).toBe(250)
      expect(pending.y).toBe(200)
    })

    it('returns false for different pointer ID', () => {
      const drag = useDrag()

      drag.initPointer(
        createMockPointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 150 }),
        canvasRef,
      )

      const result = drag.updatePending(
        createMockPointerEvent('pointermove', { pointerId: 2, clientX: 250, clientY: 200 }),
        canvasRef,
      )

      expect(result).toBe(false)
    })
  })

  describe('getDelta', () => {
    it('returns position minus offset', () => {
      const drag = useDrag()

      drag.initPointer(
        createMockPointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 150 }),
        canvasRef,
      )

      // Simulate starting a drag with offset
      drag.startDrag(
        createMockPointerEvent('pointermove', { pointerId: 1 }),
        0,
        180, // cardX
        130, // cardY
        canvasRef,
        { type: 'card', index: 0 },
      )

      // Update position
      drag.updatePending(
        createMockPointerEvent('pointermove', { pointerId: 1, clientX: 220, clientY: 170 }),
        canvasRef,
      )

      const delta = drag.getDelta()
      // delta = pending - offset
      // offset was: initPointer(200, 150) - card(180, 130) = (20, 20)
      // pending is now (220, 170)
      // so delta = (220 - 20, 170 - 20) = (200, 150)
      expect(delta.x).toBe(200)
      expect(delta.y).toBe(150)
    })
  })

  describe('setOffset', () => {
    it('allows manually setting offset', () => {
      const drag = useDrag()

      drag.initPointer(
        createMockPointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 150 }),
        canvasRef,
      )

      drag.setOffset(50, 30)

      const delta = drag.getDelta()
      expect(delta.x).toBe(150) // 200 - 50
      expect(delta.y).toBe(120) // 150 - 30
    })
  })

  describe('pointer validation', () => {
    it('validates correct pointer ID', () => {
      const drag = useDrag()

      drag.initPointer(
        createMockPointerEvent('pointerdown', { pointerId: 42, clientX: 200, clientY: 150 }),
        canvasRef,
      )

      expect(drag.isValidPointer(42)).toBe(true)
      expect(drag.isValidPointer(1)).toBe(false)
    })
  })

  describe('long press timer', () => {
    it('sets and calls long press callback', () => {
      const drag = useDrag()
      const callback = vi.fn()

      drag.setLongPressTimer(callback)

      expect(callback).not.toHaveBeenCalled()

      vi.advanceTimersByTime(500) // LONG_PRESS_MS

      expect(callback).toHaveBeenCalled()
    })

    it('clears long press timer', () => {
      const drag = useDrag()
      const callback = vi.fn()

      drag.setLongPressTimer(callback)
      drag.clearLongPressTimer()

      vi.advanceTimersByTime(600)

      expect(callback).not.toHaveBeenCalled()
    })

    it('replaces existing timer when setting new one', () => {
      const drag = useDrag()
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      drag.setLongPressTimer(callback1)
      vi.advanceTimersByTime(200)

      drag.setLongPressTimer(callback2)
      vi.advanceTimersByTime(500)

      expect(callback1).not.toHaveBeenCalled()
      expect(callback2).toHaveBeenCalled()
    })
  })

  describe('RAF scheduling', () => {
    beforeEach(() => {
      vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn((cb) => {
          cb(performance.now())
          return 1
        }),
      )
      vi.stubGlobal('cancelAnimationFrame', vi.fn())
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('schedules position update via RAF', () => {
      const drag = useDrag()
      const applyPosition = vi.fn()

      drag.schedulePositionUpdate(applyPosition)

      expect(applyPosition).toHaveBeenCalled()
    })

    it('cancels RAF when requested', () => {
      const drag = useDrag()

      drag.cancelRaf()

      expect(vi.mocked(cancelAnimationFrame)).toHaveBeenCalledTimes(0) // No RAF to cancel initially
    })
  })

  describe('reset', () => {
    it('resets all state', () => {
      const drag = useDrag()

      drag.initPointer(
        createMockPointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 150 }),
        canvasRef,
      )
      drag.startDrag(
        createMockPointerEvent('pointermove', { pointerId: 1 }),
        0,
        180,
        130,
        canvasRef,
        { type: 'card', index: 0 },
      )

      drag.reset()

      expect(drag.isDragging.value).toBe(false)
      expect(drag.activeIndex.value).toBe(null)
      expect(drag.target.value).toBe(null)
    })

    it('clears long press timer on reset', () => {
      const drag = useDrag()
      const callback = vi.fn()

      drag.setLongPressTimer(callback)
      drag.reset()

      vi.advanceTimersByTime(600)

      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('computed position', () => {
    it('provides reactive position', () => {
      const drag = useDrag()

      drag.initPointer(
        createMockPointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 150 }),
        canvasRef,
      )

      drag.startDrag(
        createMockPointerEvent('pointermove', { pointerId: 1 }),
        0,
        180,
        130,
        canvasRef,
        { type: 'card', index: 0 },
      )

      drag.getDelta() // This updates the reactive position

      expect(drag.position.value).toHaveProperty('x')
      expect(drag.position.value).toHaveProperty('y')
    })
  })

  describe('drag targets', () => {
    it('handles card drag target', () => {
      const drag = useDrag()

      drag.initPointer(
        createMockPointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 150 }),
        canvasRef,
      )

      drag.startDrag(
        createMockPointerEvent('pointermove', { pointerId: 1 }),
        0,
        180,
        130,
        canvasRef,
        { type: 'card', index: 5 },
      )

      expect(drag.target.value).toEqual({ type: 'card', index: 5 })
    })

    it('handles stack drag target', () => {
      const drag = useDrag()

      drag.initPointer(
        createMockPointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 150 }),
        canvasRef,
      )

      drag.startDrag(
        createMockPointerEvent('pointermove', { pointerId: 1 }),
        0,
        180,
        130,
        canvasRef,
        { type: 'stack', stackId: 3, index: 0 },
      )

      expect(drag.target.value).toEqual({ type: 'stack', stackId: 3, index: 0 })
    })

    it('handles selection drag target', () => {
      const drag = useDrag()

      drag.initPointer(
        createMockPointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 150 }),
        canvasRef,
      )

      drag.startDrag(
        createMockPointerEvent('pointermove', { pointerId: 1 }),
        0,
        180,
        130,
        canvasRef,
        { type: 'selection' },
      )

      expect(drag.target.value).toEqual({ type: 'selection' })
    })

    it('handles hand-card drag target', () => {
      const drag = useDrag()

      drag.initPointer(
        createMockPointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 150 }),
        canvasRef,
      )

      drag.startDrag(
        createMockPointerEvent('pointermove', { pointerId: 1 }),
        0,
        180,
        130,
        canvasRef,
        { type: 'hand-card', index: 2 },
      )

      expect(drag.target.value).toEqual({ type: 'hand-card', index: 2 })
    })

    it('handles zone drag target', () => {
      const drag = useDrag()

      drag.initPointer(
        createMockPointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 150 }),
        canvasRef,
      )

      drag.startDrag(
        createMockPointerEvent('pointermove', { pointerId: 1 }),
        0,
        180,
        130,
        canvasRef,
        { type: 'zone', zoneId: 1 },
      )

      expect(drag.target.value).toEqual({ type: 'zone', zoneId: 1 })
    })

    it('handles zone-resize drag target', () => {
      const drag = useDrag()

      drag.initPointer(
        createMockPointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 150 }),
        canvasRef,
      )

      drag.startDrag(
        createMockPointerEvent('pointermove', { pointerId: 1 }),
        0,
        180,
        130,
        canvasRef,
        { type: 'zone-resize', zoneId: 1, handle: 'se' },
      )

      expect(drag.target.value).toEqual({ type: 'zone-resize', zoneId: 1, handle: 'se' })
    })
  })
})
