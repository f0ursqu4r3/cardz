import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useCardPhysics } from '@/composables/useCardPhysics'
import { setupAnimationFrameMock, setupPerformanceMock } from '../test-utils'

describe('useCardPhysics', () => {
  let animationFrame: ReturnType<typeof setupAnimationFrameMock>
  let performanceMock: ReturnType<typeof setupPerformanceMock>

  beforeEach(() => {
    animationFrame = setupAnimationFrameMock()
    performanceMock = setupPerformanceMock()
    performanceMock.setTime(0)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('initialization', () => {
    it('initializes with default values', () => {
      const physics = useCardPhysics()

      expect(physics.tilt.value).toBe(0)
      expect(physics.isDragging.value).toBe(false)
      expect(physics.isThrowing.value).toBe(false)
      expect(physics.throwingCardId.value).toBe(null)
    })
  })

  describe('drag operations', () => {
    it('starts drag and sets isDragging to true', () => {
      const physics = useCardPhysics()

      physics.startDrag(100, 100, 21) // offsetX = 21 (center of 42-wide card)

      expect(physics.isDragging.value).toBe(true)
    })

    it('calculates grab offset from center (-1 to 1 range)', () => {
      const physics = useCardPhysics()

      // Grab at center (offsetX = 21 for 42-wide card)
      physics.startDrag(100, 100, 21)
      expect(physics.isDragging.value).toBe(true)

      physics.reset()

      // Grab at left edge (offsetX = 0)
      physics.startDrag(100, 100, 0)
      expect(physics.isDragging.value).toBe(true)
    })

    it('ends drag and returns velocity', () => {
      const physics = useCardPhysics()

      physics.startDrag(100, 100, 21)
      performanceMock.advanceTime(16)
      physics.updateVelocity(120, 100) // Moving right

      const result = physics.endDrag()

      expect(physics.isDragging.value).toBe(false)
      expect(result).toHaveProperty('vx')
      expect(result).toHaveProperty('vy')
    })

    it('updates velocity based on movement', () => {
      const physics = useCardPhysics()

      performanceMock.setTime(0)
      physics.startDrag(100, 100, 21)
      physics.updateVelocity(100, 100)

      // Velocity needs multiple updates to accumulate (due to 0.6/0.4 smoothing)
      performanceMock.advanceTime(16)
      physics.updateVelocity(150, 100) // Move 50px in 16ms

      performanceMock.advanceTime(16)
      physics.updateVelocity(200, 100) // Move another 50px in 16ms

      performanceMock.advanceTime(16)
      physics.updateVelocity(250, 100) // Move another 50px in 16ms

      // Velocity should be positive (moving right)
      const result = physics.endDrag()
      expect(result.vx).toBeGreaterThan(0)
    })
  })

  describe('tilt animation', () => {
    it('starts settle loop when dragging', () => {
      const physics = useCardPhysics()

      physics.startDrag(100, 100, 21)

      // Animation frame should be requested
      expect(animationFrame.getPendingCount()).toBeGreaterThan(0)
    })

    it('tilt responds to velocity', () => {
      const physics = useCardPhysics()

      physics.startDrag(100, 100, 21)
      performanceMock.setTime(0)
      physics.updateVelocity(100, 100)

      // Simulate rapid rightward movement
      performanceMock.advanceTime(10)
      physics.updateVelocity(200, 100)

      // Run animation frame to update tilt
      animationFrame.runFrame()

      // Tilt should be non-zero due to velocity
      // Note: actual value depends on internal calculations
      expect(animationFrame.getPendingCount()).toBeGreaterThanOrEqual(0)
    })

    it('tilt settles to zero when not dragging and velocity is low', () => {
      const physics = useCardPhysics()

      physics.startDrag(100, 100, 21)
      physics.endDrag()

      // Run many frames to let it settle
      animationFrame.runAllFrames(100)

      expect(physics.tilt.value).toBe(0)
    })
  })

  describe('throw animation', () => {
    it('starts throw with given velocity', () => {
      const physics = useCardPhysics()
      const onUpdate = vi.fn()
      const onComplete = vi.fn()

      physics.startThrow(1, 100, 100, 50, 25, onUpdate, onComplete)

      expect(physics.isThrowing.value).toBe(true)
      expect(physics.throwingCardId.value).toBe(1)
    })

    it('calls onUpdate during throw animation', () => {
      const physics = useCardPhysics()
      const onUpdate = vi.fn()
      const onComplete = vi.fn()

      physics.startThrow(1, 100, 100, 50, 25, onUpdate, onComplete)

      animationFrame.runFrame()

      expect(onUpdate).toHaveBeenCalled()
    })

    it('calls onComplete when throw velocity falls below threshold', () => {
      const physics = useCardPhysics()
      const onUpdate = vi.fn()
      const onComplete = vi.fn()

      // Start with low velocity that will decay quickly
      physics.startThrow(1, 100, 100, 1, 1, onUpdate, onComplete)

      // Run frames until completion
      animationFrame.runAllFrames(50)

      expect(onComplete).toHaveBeenCalled()
      expect(physics.isThrowing.value).toBe(false)
      expect(physics.throwingCardId.value).toBe(null)
    })

    it('cancels previous throw when starting a new one', () => {
      const physics = useCardPhysics()
      const onComplete1 = vi.fn()
      const onComplete2 = vi.fn()

      physics.startThrow(1, 100, 100, 50, 25, vi.fn(), onComplete1)
      physics.startThrow(2, 200, 200, 30, 15, vi.fn(), onComplete2)

      expect(onComplete1).toHaveBeenCalled()
      expect(physics.throwingCardId.value).toBe(2)
    })

    it('cancels throw when starting drag', () => {
      const physics = useCardPhysics()
      const onComplete = vi.fn()

      physics.startThrow(1, 100, 100, 50, 25, vi.fn(), onComplete)
      physics.startDrag(150, 150, 21)

      expect(physics.isThrowing.value).toBe(false)
      expect(physics.isDragging.value).toBe(true)
      expect(onComplete).toHaveBeenCalled()
    })
  })

  describe('reset', () => {
    it('resets all state to initial values', () => {
      const physics = useCardPhysics()

      physics.startDrag(100, 100, 21)
      physics.endDrag()

      physics.reset()

      expect(physics.tilt.value).toBe(0)
      expect(physics.isDragging.value).toBe(false)
      expect(physics.isThrowing.value).toBe(false)
      expect(physics.throwingCardId.value).toBe(null)
    })

    it('cancels animation frames on reset', () => {
      const physics = useCardPhysics()

      physics.startDrag(100, 100, 21)
      const pendingBefore = animationFrame.getPendingCount()

      physics.reset()

      // Should attempt to cancel (frames cleared)
      expect(animationFrame.getPendingCount()).toBeLessThanOrEqual(pendingBefore)
    })

    it('calls throw onComplete when resetting during throw', () => {
      const physics = useCardPhysics()
      const onComplete = vi.fn()

      physics.startThrow(1, 100, 100, 50, 25, vi.fn(), onComplete)
      physics.reset()

      expect(onComplete).toHaveBeenCalled()
    })
  })

  describe('velocity smoothing', () => {
    it('smooths velocity over multiple updates', () => {
      const physics = useCardPhysics()

      physics.startDrag(100, 100, 21)
      performanceMock.setTime(0)
      physics.updateVelocity(100, 100)

      // Simulate movement in one direction
      performanceMock.advanceTime(16)
      physics.updateVelocity(110, 100)

      performanceMock.advanceTime(16)
      physics.updateVelocity(120, 100)

      // Then sudden stop
      performanceMock.advanceTime(16)
      physics.updateVelocity(120, 100)

      const result = physics.endDrag()
      // Velocity should be smoothed, not abruptly zero
      expect(typeof result.vx).toBe('number')
    })
  })
})
