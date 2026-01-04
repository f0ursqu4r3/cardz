import { ref } from 'vue'
import type { CardData } from '@/types'

// Physics constants (same as useCardPhysics)
const THROW_FRICTION = 0.92
const THROW_MIN_VELOCITY = 0.5

interface ActiveThrow {
  cardId: number
  vx: number
  vy: number
  rafId: number
}

export function useRemoteThrow(getCard: (id: number) => CardData | undefined) {
  const activeThrows = ref<Map<number, ActiveThrow>>(new Map())

  const startThrow = (cardId: number, startX: number, startY: number, vx: number, vy: number) => {
    // Cancel any existing throw for this card
    const existing = activeThrows.value.get(cardId)
    if (existing) {
      cancelAnimationFrame(existing.rafId)
      activeThrows.value.delete(cardId)
    }

    let throwVelX = vx
    let throwVelY = vy
    let x = startX
    let y = startY

    const animate = () => {
      const card = getCard(cardId)
      if (!card) {
        activeThrows.value.delete(cardId)
        return
      }

      // Apply friction
      throwVelX *= THROW_FRICTION
      throwVelY *= THROW_FRICTION

      // Update position
      x += throwVelX
      y += throwVelY
      card.x = x
      card.y = y

      // Check if still moving
      const speed = Math.sqrt(throwVelX * throwVelX + throwVelY * throwVelY)
      if (speed < THROW_MIN_VELOCITY) {
        activeThrows.value.delete(cardId)
        return
      }

      const rafId = requestAnimationFrame(animate)
      const throwData = activeThrows.value.get(cardId)
      if (throwData) {
        throwData.rafId = rafId
      }
    }

    const rafId = requestAnimationFrame(animate)
    activeThrows.value.set(cardId, { cardId, vx, vy, rafId })
  }

  const cancelThrow = (cardId: number) => {
    const existing = activeThrows.value.get(cardId)
    if (existing) {
      cancelAnimationFrame(existing.rafId)
      activeThrows.value.delete(cardId)
    }
  }

  const cancelAll = () => {
    for (const [, throwData] of activeThrows.value) {
      cancelAnimationFrame(throwData.rafId)
    }
    activeThrows.value.clear()
  }

  return {
    activeThrows,
    startThrow,
    cancelThrow,
    cancelAll,
  }
}
