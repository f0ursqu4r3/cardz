import { ref, computed } from 'vue'
import { CARD_W } from '@/types'

const MAX_TILT = 18 // Maximum rotation in degrees
const VELOCITY_SCALE = 0.25 // How much velocity affects tilt
const HOLD_TILT_SCALE = 0.3 // How much grab offset affects base tilt
const DAMPING = 0.85 // How quickly tilt settles (0-1, lower = faster settle)
const SETTLE_THRESHOLD = 0.1 // When to snap to zero

// Throw physics constants
const THROW_FRICTION = 0.92 // How quickly throw velocity decays
const THROW_MIN_VELOCITY = 0.5 // Minimum velocity to continue throw
const THROW_VELOCITY_SCALE = 12 // Scale velocity for throw distance

export function useCardPhysics() {
  // Track velocity for tilt calculation
  const velocityX = ref(0)
  const velocityY = ref(0)
  const lastX = ref(0)
  const lastY = ref(0)
  const lastTime = ref(0)
  const tilt = ref(0)
  const isDragging = ref(false)
  const grabOffsetX = ref(0) // Where on card user grabbed (-1 to 1, 0 = center)

  // Throw state
  const isThrowing = ref(false)
  const throwingCardId = ref<number | null>(null)
  const throwX = ref(0)
  const throwY = ref(0)

  let rafId: number | null = null
  let throwRafId: number | null = null
  let throwOnComplete: (() => void) | null = null

  const startSettleLoop = () => {
    if (rafId) return

    const animate = () => {
      // Dampen velocity
      velocityX.value *= DAMPING

      // Calculate target tilt: velocity + slight bias away from grab position
      const velocityTilt = velocityX.value * VELOCITY_SCALE * 100
      const holdBias = isDragging.value ? -grabOffsetX.value * MAX_TILT * HOLD_TILT_SCALE : 0
      const targetTilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, velocityTilt + holdBias))

      // Smoothly approach target
      tilt.value = tilt.value * 0.7 + targetTilt * 0.3

      // Snap to zero when settled and not dragging
      if (
        !isDragging.value &&
        Math.abs(tilt.value) < SETTLE_THRESHOLD &&
        Math.abs(velocityX.value) < 0.01
      ) {
        tilt.value = 0
        velocityX.value = 0
        rafId = null
        return
      }

      rafId = requestAnimationFrame(animate)
    }

    rafId = requestAnimationFrame(animate)
  }

  const updateVelocity = (x: number, y: number) => {
    const now = performance.now()
    const dt = now - lastTime.value

    if (dt > 0 && lastTime.value > 0) {
      const newVelX = (x - lastX.value) / dt
      const newVelY = (y - lastY.value) / dt
      // Smooth velocity with previous value
      velocityX.value = velocityX.value * 0.4 + newVelX * 0.4
      velocityY.value = velocityY.value * 0.4 + newVelY * 0.4
    }

    lastX.value = x
    lastY.value = y
    lastTime.value = now
  }

  const startDrag = (x: number, y: number, offsetX: number) => {
    // Cancel any ongoing throw and notify completion
    if (throwRafId) {
      cancelAnimationFrame(throwRafId)
      throwRafId = null
      // Call onComplete so final position is sent to server
      if (throwOnComplete) {
        throwOnComplete()
        throwOnComplete = null
      }
    }
    isThrowing.value = false
    throwingCardId.value = null

    isDragging.value = true
    lastX.value = x
    lastY.value = y
    lastTime.value = performance.now()
    velocityX.value = 0
    velocityY.value = 0
    // Calculate grab offset as -1 to 1 (left edge to right edge)
    grabOffsetX.value = (offsetX - CARD_W / 2) / (CARD_W / 2)
    startSettleLoop()
  }

  const endDrag = (): { vx: number; vy: number } => {
    isDragging.value = false
    grabOffsetX.value = 0
    // Return velocity for throw calculation
    return {
      vx: velocityX.value * THROW_VELOCITY_SCALE,
      vy: velocityY.value * THROW_VELOCITY_SCALE,
    }
  }

  // Start throw animation - returns cleanup function
  const startThrow = (
    cardId: number,
    startX: number,
    startY: number,
    vx: number,
    vy: number,
    onUpdate: (x: number, y: number) => void,
    onComplete: () => void,
  ) => {
    // Cancel any existing throw and notify completion
    if (throwRafId) {
      cancelAnimationFrame(throwRafId)
      if (throwOnComplete) {
        throwOnComplete()
      }
    }

    isThrowing.value = true
    throwingCardId.value = cardId
    throwX.value = startX
    throwY.value = startY
    throwOnComplete = onComplete
    let throwVelX = vx
    let throwVelY = vy

    const animate = () => {
      // Apply friction
      throwVelX *= THROW_FRICTION
      throwVelY *= THROW_FRICTION

      // Update position
      throwX.value += throwVelX
      throwY.value += throwVelY

      // Update tilt based on horizontal velocity
      const targetTilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, throwVelX * 0.5))
      tilt.value = tilt.value * 0.8 + targetTilt * 0.2

      onUpdate(throwX.value, throwY.value)

      // Check if still moving
      const speed = Math.sqrt(throwVelX * throwVelX + throwVelY * throwVelY)
      if (speed < THROW_MIN_VELOCITY) {
        isThrowing.value = false
        throwingCardId.value = null
        throwRafId = null
        throwOnComplete = null
        tilt.value = 0
        onComplete()
        return
      }

      throwRafId = requestAnimationFrame(animate)
    }

    throwRafId = requestAnimationFrame(animate)
  }

  const reset = () => {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    if (throwRafId) {
      cancelAnimationFrame(throwRafId)
      throwRafId = null
      // Call onComplete so final position is sent to server
      if (throwOnComplete) {
        throwOnComplete()
        throwOnComplete = null
      }
    }
    velocityX.value = 0
    velocityY.value = 0
    tilt.value = 0
    isDragging.value = false
    isThrowing.value = false
    throwingCardId.value = null
    grabOffsetX.value = 0
  }

  return {
    tilt: computed(() => tilt.value),
    isDragging: computed(() => isDragging.value),
    isThrowing: computed(() => isThrowing.value),
    throwingCardId: computed(() => throwingCardId.value),
    updateVelocity,
    startDrag,
    endDrag,
    startThrow,
    reset,
  }
}
