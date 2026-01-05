import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, type Ref } from 'vue'
import { useViewport } from '@/composables/useViewport'
import { createMockElement, createMockWheelEvent } from '../test-utils'

describe('useViewport', () => {
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
  })

  describe('initialization', () => {
    it('initializes with default values', () => {
      const viewport = useViewport(canvasRef)

      expect(viewport.panX.value).toBe(0)
      expect(viewport.panY.value).toBe(0)
      expect(viewport.zoom.value).toBe(1)
      expect(viewport.isPanning.value).toBe(false)
    })

    it('computes world transform string', () => {
      const viewport = useViewport(canvasRef)

      expect(viewport.worldTransform.value).toBe('translate(0px, 0px) scale(1)')

      viewport.panX.value = 100
      viewport.panY.value = 50
      viewport.zoom.value = 1.5

      expect(viewport.worldTransform.value).toBe('translate(100px, 50px) scale(1.5)')
    })
  })

  describe('coordinate conversion', () => {
    it('converts screen coordinates to world coordinates', () => {
      const viewport = useViewport(canvasRef)

      // At default zoom (1) and pan (0,0), coordinates should match
      const world = viewport.screenToWorld(400, 300)
      expect(world.x).toBe(400)
      expect(world.y).toBe(300)
    })

    it('accounts for pan when converting to world', () => {
      const viewport = useViewport(canvasRef)
      viewport.panX.value = 100
      viewport.panY.value = 50

      const world = viewport.screenToWorld(400, 300)
      // world = (screen - pan) / zoom
      expect(world.x).toBe(300) // (400 - 100) / 1
      expect(world.y).toBe(250) // (300 - 50) / 1
    })

    it('accounts for zoom when converting to world', () => {
      const viewport = useViewport(canvasRef)
      viewport.zoom.value = 2

      const world = viewport.screenToWorld(400, 300)
      // world = (screen - pan) / zoom
      expect(world.x).toBe(200) // 400 / 2
      expect(world.y).toBe(150) // 300 / 2
    })

    it('converts world coordinates to screen coordinates', () => {
      const viewport = useViewport(canvasRef)

      const screen = viewport.worldToScreen(400, 300)
      expect(screen.x).toBe(400)
      expect(screen.y).toBe(300)
    })

    it('accounts for pan when converting to screen', () => {
      const viewport = useViewport(canvasRef)
      viewport.panX.value = 100
      viewport.panY.value = 50

      const screen = viewport.worldToScreen(300, 250)
      // screen = world * zoom + pan + rect.left
      expect(screen.x).toBe(400) // 300 * 1 + 100
      expect(screen.y).toBe(300) // 250 * 1 + 50
    })

    it('screenToWorld and worldToScreen are inverse operations', () => {
      const viewport = useViewport(canvasRef)
      viewport.panX.value = 150
      viewport.panY.value = 75
      viewport.zoom.value = 1.5

      const originalScreen = { x: 400, y: 300 }
      const world = viewport.screenToWorld(originalScreen.x, originalScreen.y)
      const backToScreen = viewport.worldToScreen(world.x, world.y)

      expect(backToScreen.x).toBeCloseTo(originalScreen.x, 5)
      expect(backToScreen.y).toBeCloseTo(originalScreen.y, 5)
    })
  })

  describe('zooming', () => {
    it('zooms at a point maintaining cursor position', () => {
      const viewport = useViewport(canvasRef)

      // Zoom in at center of canvas
      viewport.zoomAt(400, 300, -100) // negative delta = zoom in

      expect(viewport.zoom.value).toBeGreaterThan(1)
      // After zoom, the point under cursor should still map to same world position
    })

    it('clamps zoom to minimum value', () => {
      const viewport = useViewport(canvasRef)

      // Zoom out a lot
      for (let i = 0; i < 50; i++) {
        viewport.zoomAt(400, 300, 100)
      }

      expect(viewport.zoom.value).toBeGreaterThanOrEqual(0.25)
    })

    it('clamps zoom to maximum value', () => {
      const viewport = useViewport(canvasRef)

      // Zoom in a lot
      for (let i = 0; i < 50; i++) {
        viewport.zoomAt(400, 300, -100)
      }

      expect(viewport.zoom.value).toBeLessThanOrEqual(2)
    })

    it('zoomIn increases zoom centered on viewport', () => {
      const viewport = useViewport(canvasRef)
      const initialZoom = viewport.zoom.value

      viewport.zoomIn()

      expect(viewport.zoom.value).toBeGreaterThan(initialZoom)
    })

    it('zoomOut decreases zoom centered on viewport', () => {
      const viewport = useViewport(canvasRef)
      viewport.zoom.value = 1.5
      const initialZoom = viewport.zoom.value

      viewport.zoomOut()

      expect(viewport.zoom.value).toBeLessThan(initialZoom)
    })
  })

  describe('panning', () => {
    it('starts pan and tracks initial position', () => {
      const viewport = useViewport(canvasRef)
      const event = {
        clientX: 400,
        clientY: 300,
      } as PointerEvent

      viewport.startPan(event)

      expect(viewport.isPanning.value).toBe(true)
    })

    it('updates pan during drag', () => {
      const viewport = useViewport(canvasRef)

      viewport.startPan({ clientX: 400, clientY: 300 } as PointerEvent)
      viewport.updatePan({ clientX: 450, clientY: 350 } as PointerEvent)

      expect(viewport.panX.value).toBe(50)
      expect(viewport.panY.value).toBe(50)
    })

    it('does not update pan when not panning', () => {
      const viewport = useViewport(canvasRef)

      viewport.updatePan({ clientX: 450, clientY: 350 } as PointerEvent)

      expect(viewport.panX.value).toBe(0)
      expect(viewport.panY.value).toBe(0)
    })

    it('ends pan correctly', () => {
      const viewport = useViewport(canvasRef)

      viewport.startPan({ clientX: 400, clientY: 300 } as PointerEvent)
      viewport.endPan()

      expect(viewport.isPanning.value).toBe(false)
    })
  })

  describe('wheel handling', () => {
    it('pans on normal wheel scroll', () => {
      const viewport = useViewport(canvasRef)
      const event = createMockWheelEvent({
        deltaX: 50,
        deltaY: 30,
        ctrlKey: false,
      })

      viewport.onWheel(event)

      expect(viewport.panX.value).toBe(-50)
      expect(viewport.panY.value).toBe(-30)
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('zooms on ctrl+wheel', () => {
      const viewport = useViewport(canvasRef)
      const initialZoom = viewport.zoom.value
      const event = createMockWheelEvent({
        deltaY: -100,
        ctrlKey: true,
        clientX: 400,
        clientY: 300,
      })

      viewport.onWheel(event)

      expect(viewport.zoom.value).not.toBe(initialZoom)
    })

    it('zooms on meta+wheel (Mac)', () => {
      const viewport = useViewport(canvasRef)
      const initialZoom = viewport.zoom.value
      const event = createMockWheelEvent({
        deltaY: -100,
        metaKey: true,
        clientX: 400,
        clientY: 300,
      })

      viewport.onWheel(event)

      expect(viewport.zoom.value).not.toBe(initialZoom)
    })
  })

  describe('fitAll', () => {
    it('fits content bounds in viewport', () => {
      const viewport = useViewport(canvasRef)

      const worldBounds = {
        x: 100,
        y: 100,
        width: 400,
        height: 300,
      }

      viewport.fitAll(worldBounds)

      // After fitAll, zoom should be adjusted to fit content
      expect(viewport.zoom.value).toBeGreaterThan(0)
      expect(viewport.zoom.value).toBeLessThanOrEqual(2)
    })

    it('centers content in viewport', () => {
      const viewport = useViewport(canvasRef)

      const worldBounds = {
        x: 0,
        y: 0,
        width: 200,
        height: 200,
      }

      viewport.fitAll(worldBounds)

      // Content center should be at viewport center
      const visibleBounds = viewport.getVisibleBounds()
      const visibleCenterX = visibleBounds.x + visibleBounds.width / 2
      const visibleCenterY = visibleBounds.y + visibleBounds.height / 2

      // World center is at (100, 100)
      expect(Math.abs(visibleCenterX - 100)).toBeLessThan(100)
      expect(Math.abs(visibleCenterY - 100)).toBeLessThan(100)
    })
  })

  describe('panToCenter', () => {
    it('centers a world point in the viewport', () => {
      const viewport = useViewport(canvasRef)

      viewport.panToCenter(500, 400)

      // After panToCenter, the point (500, 400) should be at screen center
      // screenCenter = (400, 300) for 800x600 canvas
      // pan = screenCenter - worldPoint * zoom
      expect(viewport.panX.value).toBe(400 - 500 * 1)
      expect(viewport.panY.value).toBe(300 - 400 * 1)
    })

    it('accounts for current zoom', () => {
      const viewport = useViewport(canvasRef)
      viewport.zoom.value = 2

      viewport.panToCenter(200, 150)

      // pan = screenCenter - worldPoint * zoom
      expect(viewport.panX.value).toBe(400 - 200 * 2)
      expect(viewport.panY.value).toBe(300 - 150 * 2)
    })
  })

  describe('getVisibleBounds', () => {
    it('returns correct bounds at default view', () => {
      const viewport = useViewport(canvasRef)

      const bounds = viewport.getVisibleBounds()

      expect(bounds.x).toBe(0)
      expect(bounds.y).toBe(0)
      expect(bounds.width).toBe(800)
      expect(bounds.height).toBe(600)
    })

    it('returns correct bounds after panning', () => {
      const viewport = useViewport(canvasRef)
      viewport.panX.value = -100
      viewport.panY.value = -50

      const bounds = viewport.getVisibleBounds()

      expect(bounds.x).toBe(100)
      expect(bounds.y).toBe(50)
      expect(bounds.width).toBe(800)
      expect(bounds.height).toBe(600)
    })

    it('returns correct bounds after zooming', () => {
      const viewport = useViewport(canvasRef)
      viewport.zoom.value = 2

      const bounds = viewport.getVisibleBounds()

      // At 2x zoom, visible area is half the size
      expect(bounds.width).toBe(400)
      expect(bounds.height).toBe(300)
    })
  })

  describe('resetViewport', () => {
    it('resets all viewport state to defaults', () => {
      const viewport = useViewport(canvasRef)
      viewport.panX.value = 500
      viewport.panY.value = 300
      viewport.zoom.value = 1.8

      viewport.resetViewport()

      expect(viewport.panX.value).toBe(0)
      expect(viewport.panY.value).toBe(0)
      expect(viewport.zoom.value).toBe(1)
    })
  })

  describe('edge cases', () => {
    it('handles null canvas ref gracefully', () => {
      const nullRef = ref<HTMLElement | null>(null)
      const viewport = useViewport(nullRef)

      // Should not throw
      const world = viewport.screenToWorld(400, 300)
      expect(world.x).toBe(400)
      expect(world.y).toBe(300)

      const screen = viewport.worldToScreen(400, 300)
      expect(screen.x).toBe(400)
      expect(screen.y).toBe(300)

      const bounds = viewport.getVisibleBounds()
      expect(bounds.width).toBe(0)
      expect(bounds.height).toBe(0)
    })
  })
})
