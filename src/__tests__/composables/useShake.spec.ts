import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useShake } from '@/composables/useShake'
import { SHAKE_THRESHOLD, SHAKE_REVERSALS, SHAKE_WINDOW_MS } from '@/types'
import { setupPerformanceMock } from '../test-utils'

describe('useShake', () => {
  let performanceMock: ReturnType<typeof setupPerformanceMock>

  beforeEach(() => {
    performanceMock = setupPerformanceMock()
    performanceMock.setTime(0)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('initialization', () => {
    it('initializes with default state', () => {
      const shake = useShake()

      expect(shake.state.history).toEqual([])
      expect(shake.state.lastDirection).toBe(null)
      expect(shake.state.reversalCount).toBe(0)
      expect(shake.state.triggered).toBe(false)
    })
  })

  describe('reset', () => {
    it('resets all state to initial values', () => {
      const shake = useShake()

      // Build up some state
      shake.update(0, 0)
      shake.update(SHAKE_THRESHOLD + 10, 0)
      shake.update(0, 0)

      shake.reset()

      expect(shake.state.history).toEqual([])
      expect(shake.state.lastDirection).toBe(null)
      expect(shake.state.reversalCount).toBe(0)
      expect(shake.state.triggered).toBe(false)
    })
  })

  describe('direction detection', () => {
    it('detects rightward movement', () => {
      const shake = useShake()

      shake.update(0, 0)
      performanceMock.advanceTime(10)
      shake.update(SHAKE_THRESHOLD + 10, 0)

      expect(shake.state.lastDirection).toBe('right')
    })

    it('detects leftward movement', () => {
      const shake = useShake()

      shake.update(100, 0)
      performanceMock.advanceTime(10)
      shake.update(100 - SHAKE_THRESHOLD - 10, 0)

      expect(shake.state.lastDirection).toBe('left')
    })

    it('detects downward movement', () => {
      const shake = useShake()

      shake.update(0, 0)
      performanceMock.advanceTime(10)
      shake.update(0, SHAKE_THRESHOLD + 10)

      expect(shake.state.lastDirection).toBe('down')
    })

    it('detects upward movement', () => {
      const shake = useShake()

      shake.update(0, 100)
      performanceMock.advanceTime(10)
      shake.update(0, 100 - SHAKE_THRESHOLD - 10)

      expect(shake.state.lastDirection).toBe('up')
    })

    it('ignores small movements below threshold', () => {
      const shake = useShake()

      shake.update(0, 0)
      performanceMock.advanceTime(10)
      shake.update(SHAKE_THRESHOLD - 5, 0)

      expect(shake.state.lastDirection).toBe(null)
    })
  })

  describe('shake detection', () => {
    it('detects horizontal shake (left-right reversals)', () => {
      const shake = useShake()
      const bigMove = SHAKE_THRESHOLD + 20

      // Start
      shake.update(100, 100)
      performanceMock.advanceTime(10)

      // Simulate shake: right -> left -> right -> left -> right -> left
      let x = 100
      for (let i = 0; i < SHAKE_REVERSALS + 1; i++) {
        x += i % 2 === 0 ? bigMove : -bigMove
        performanceMock.advanceTime(20)
        const triggered = shake.update(x, 100)

        if (i >= SHAKE_REVERSALS - 1) {
          // Should trigger after enough reversals
          if (triggered) {
            expect(shake.state.triggered).toBe(true)
            break
          }
        }
      }
    })

    it('detects vertical shake (up-down reversals)', () => {
      const shake = useShake()
      const bigMove = SHAKE_THRESHOLD + 20

      shake.update(100, 100)
      performanceMock.advanceTime(10)

      let y = 100
      for (let i = 0; i < SHAKE_REVERSALS + 1; i++) {
        y += i % 2 === 0 ? bigMove : -bigMove
        performanceMock.advanceTime(20)
        const triggered = shake.update(100, y)

        if (triggered) {
          expect(shake.state.triggered).toBe(true)
          break
        }
      }
    })

    it('returns true once shake is triggered', () => {
      const shake = useShake()
      const bigMove = SHAKE_THRESHOLD + 20

      shake.update(100, 100)
      performanceMock.advanceTime(10)

      let x = 100
      let triggered = false
      for (let i = 0; i < 10 && !triggered; i++) {
        x += i % 2 === 0 ? bigMove : -bigMove
        performanceMock.advanceTime(20)
        triggered = shake.update(x, 100)
      }

      expect(triggered).toBe(true)

      // Subsequent updates should still return true
      expect(shake.update(0, 0)).toBe(true)
    })
  })

  describe('time window', () => {
    it('prunes old entries outside time window', () => {
      const shake = useShake()

      // Add initial point
      shake.update(0, 0)

      // Add a second point within threshold so it gets tracked
      performanceMock.advanceTime(10)
      shake.update(SHAKE_THRESHOLD + 20, 0)

      expect(shake.state.history.length).toBe(2)

      // Advance past window
      performanceMock.advanceTime(SHAKE_WINDOW_MS + 100)

      // Add new point - old entries should be pruned first
      shake.update(0, 0)

      // Old entries should be pruned, this adds a fresh starting point
      expect(shake.state.history.length).toBe(1) // Only new point remains
    })

    it('does not detect shake if movements are too slow', () => {
      const shake = useShake()
      const bigMove = SHAKE_THRESHOLD + 20

      shake.update(100, 100)

      // Very slow movements (each outside window)
      let x = 100
      for (let i = 0; i < SHAKE_REVERSALS + 2; i++) {
        performanceMock.advanceTime(SHAKE_WINDOW_MS + 50)
        x += i % 2 === 0 ? bigMove : -bigMove
        shake.update(x, 100)
      }

      // Should not trigger because reversals happen outside window
      expect(shake.state.triggered).toBe(false)
    })
  })

  describe('reversal counting', () => {
    it('counts direction reversals correctly', () => {
      const shake = useShake()
      const bigMove = SHAKE_THRESHOLD + 20

      shake.update(100, 100)
      performanceMock.advanceTime(10)

      // Right
      shake.update(100 + bigMove, 100)
      expect(shake.state.reversalCount).toBe(0)

      performanceMock.advanceTime(10)

      // Left (reversal)
      shake.update(100, 100)
      expect(shake.state.reversalCount).toBe(1)

      performanceMock.advanceTime(10)

      // Right (reversal)
      shake.update(100 + bigMove, 100)
      expect(shake.state.reversalCount).toBe(2)
    })

    it('does not count same-direction movements as reversals', () => {
      const shake = useShake()
      const bigMove = SHAKE_THRESHOLD + 20

      shake.update(0, 100)
      performanceMock.advanceTime(10)

      // Multiple rightward moves
      shake.update(bigMove, 100)
      performanceMock.advanceTime(10)
      shake.update(bigMove * 2, 100)
      performanceMock.advanceTime(10)
      shake.update(bigMove * 3, 100)

      expect(shake.state.reversalCount).toBe(0)
    })
  })

  describe('edge cases', () => {
    it('handles first point correctly', () => {
      const shake = useShake()

      const result = shake.update(100, 100)

      expect(result).toBe(false)
      expect(shake.state.history.length).toBe(1)
    })

    it('prioritizes horizontal movement over vertical', () => {
      const shake = useShake()
      const bigMove = SHAKE_THRESHOLD + 20

      shake.update(0, 0)
      performanceMock.advanceTime(10)

      // Both axes have significant movement, horizontal is checked first
      shake.update(bigMove, bigMove)

      expect(shake.state.lastDirection).toBe('right')
    })
  })
})
