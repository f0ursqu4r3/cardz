import { reactive } from 'vue'
import { SHAKE_THRESHOLD, SHAKE_REVERSALS, SHAKE_WINDOW_MS } from '@/types'

type Direction = 'left' | 'right' | 'up' | 'down' | null

interface ShakeEntry {
  x: number
  y: number
  time: number
}

export function useShake() {
  const state = reactive({
    history: [] as ShakeEntry[],
    lastDirection: null as Direction,
    reversalCount: 0,
    triggered: false,
  })

  const reset = () => {
    state.history = []
    state.lastDirection = null
    state.reversalCount = 0
    state.triggered = false
  }

  const getDirection = (dx: number, dy: number): Direction => {
    // Use horizontal direction primarily (most natural shake)
    if (Math.abs(dx) >= SHAKE_THRESHOLD) {
      return dx > 0 ? 'right' : 'left'
    }
    if (Math.abs(dy) >= SHAKE_THRESHOLD) {
      return dy > 0 ? 'down' : 'up'
    }
    return null
  }

  const isReversal = (dir1: Direction, dir2: Direction): boolean => {
    if (!dir1 || !dir2) return false
    return (
      (dir1 === 'left' && dir2 === 'right') ||
      (dir1 === 'right' && dir2 === 'left') ||
      (dir1 === 'up' && dir2 === 'down') ||
      (dir1 === 'down' && dir2 === 'up')
    )
  }

  const update = (x: number, y: number): boolean => {
    if (state.triggered) return true

    const now = performance.now()

    // Prune old entries outside the time window
    state.history = state.history.filter((entry) => now - entry.time < SHAKE_WINDOW_MS)

    // Need at least one previous point to compute direction
    if (state.history.length === 0) {
      state.history.push({ x, y, time: now })
      return false
    }

    const last = state.history[state.history.length - 1]
    if (!last) {
      state.history.push({ x, y, time: now })
      return false
    }

    const dx = x - last.x
    const dy = y - last.y

    const currentDirection = getDirection(dx, dy)

    if (currentDirection) {
      // Check for direction reversal
      if (isReversal(state.lastDirection, currentDirection)) {
        state.reversalCount++

        if (state.reversalCount >= SHAKE_REVERSALS) {
          state.triggered = true
          return true
        }
      }

      state.lastDirection = currentDirection
      state.history.push({ x, y, time: now })
    }

    return false
  }

  return {
    state,
    reset,
    update,
  }
}
