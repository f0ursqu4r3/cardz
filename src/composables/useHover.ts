import { ref, reactive } from 'vue'
import type { CardData } from '@/types'
import { CARD_W, CARD_H, STACK_HOVER_MS } from '@/types'

export function useHover() {
  const state = reactive({
    cardId: null as number | null,
    startedAt: 0,
    ready: false,
  })

  const reset = () => {
    state.cardId = null
    state.startedAt = 0
    state.ready = false
  }

  const update = (
    x: number,
    y: number,
    cards: CardData[],
    excludeId: number,
    getCardZ: (card: CardData, index: number) => number,
  ) => {
    const hit = cardAtPoint(x, y, cards, excludeId, getCardZ)

    if (!hit) {
      reset()
      return
    }

    if (state.cardId !== hit.card.id) {
      state.cardId = hit.card.id
      state.startedAt = performance.now()
      // Instant ready if target is already in a stack, otherwise wait for timer
      state.ready = hit.card.stackId !== null
      return
    }

    if (!state.ready && performance.now() - state.startedAt >= STACK_HOVER_MS) {
      state.ready = true
    }
  }

  return {
    state,
    reset,
    update,
  }
}

// Helper to find card at a point
export function cardAtPoint(
  x: number,
  y: number,
  cards: CardData[],
  excludeId: number | undefined,
  getCardZ: (card: CardData, index: number) => number,
): { card: CardData; index: number; z: number } | null {
  let best: { card: CardData; index: number; z: number } | null = null

  cards.forEach((card, index) => {
    if (card.id === excludeId) return

    const withinX = x >= card.x && x <= card.x + CARD_W
    const withinY = y >= card.y && y <= card.y + CARD_H
    if (!withinX || !withinY) return

    const z = getCardZ(card, index)
    if (!best || z > best.z) {
      best = { card, index, z }
    }
  })

  return best
}
