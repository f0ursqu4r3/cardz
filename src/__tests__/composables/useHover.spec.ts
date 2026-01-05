import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useHover, cardAtPoint } from '@/composables/useHover'
import { CARD_W, CARD_H, STACK_HOVER_MS } from '@/types'
import type { CardData } from '@/types'
import { setupPerformanceMock, createMockCard, resetIdCounters } from '../test-utils'

describe('useHover', () => {
  let performanceMock: ReturnType<typeof setupPerformanceMock>

  beforeEach(() => {
    resetIdCounters()
    performanceMock = setupPerformanceMock()
    performanceMock.setTime(0)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('initialization', () => {
    it('initializes with default state', () => {
      const hover = useHover()

      expect(hover.state.cardId).toBe(null)
      expect(hover.state.startedAt).toBe(0)
      expect(hover.state.ready).toBe(false)
    })
  })

  describe('reset', () => {
    it('resets all state to initial values', () => {
      const hover = useHover()
      const cards: CardData[] = [createMockCard({ id: 1, x: 0, y: 0 })]

      hover.update(10, 10, cards, [], () => 100)

      hover.reset()

      expect(hover.state.cardId).toBe(null)
      expect(hover.state.startedAt).toBe(0)
      expect(hover.state.ready).toBe(false)
    })
  })

  describe('update', () => {
    it('sets cardId when hovering over a card', () => {
      const hover = useHover()
      const cards: CardData[] = [createMockCard({ id: 1, x: 0, y: 0 })]

      hover.update(10, 10, cards, [], () => 100)

      expect(hover.state.cardId).toBe(1)
    })

    it('resets when not hovering over any card', () => {
      const hover = useHover()
      const cards: CardData[] = [createMockCard({ id: 1, x: 0, y: 0 })]

      hover.update(10, 10, cards, [], () => 100)
      expect(hover.state.cardId).toBe(1)

      // Move away from card
      hover.update(CARD_W + 50, CARD_H + 50, cards, [], () => 100)

      expect(hover.state.cardId).toBe(null)
    })

    it('updates cardId when moving to different card', () => {
      const hover = useHover()
      const cards: CardData[] = [
        createMockCard({ id: 1, x: 0, y: 0 }),
        createMockCard({ id: 2, x: 100, y: 0 }),
      ]

      hover.update(10, 10, cards, [], () => 100)
      expect(hover.state.cardId).toBe(1)

      hover.update(110, 10, cards, [], () => 100)
      expect(hover.state.cardId).toBe(2)
    })

    it('records start time when first hovering', () => {
      const hover = useHover()
      const cards: CardData[] = [createMockCard({ id: 1, x: 0, y: 0 })]

      performanceMock.setTime(1000)
      hover.update(10, 10, cards, [], () => 100)

      expect(hover.state.startedAt).toBe(1000)
    })

    it('becomes ready immediately if card is in a stack', () => {
      const hover = useHover()
      const cards: CardData[] = [createMockCard({ id: 1, x: 0, y: 0, stackId: 5 })]

      hover.update(10, 10, cards, [], () => 100)

      expect(hover.state.ready).toBe(true)
    })

    it('becomes ready after hover timeout for non-stacked cards', () => {
      const hover = useHover()
      const cards: CardData[] = [createMockCard({ id: 1, x: 0, y: 0, stackId: null })]

      hover.update(10, 10, cards, [], () => 100)
      expect(hover.state.ready).toBe(false)

      performanceMock.advanceTime(STACK_HOVER_MS + 10)
      hover.update(10, 10, cards, [], () => 100)

      expect(hover.state.ready).toBe(true)
    })

    it('respects exclude IDs (single ID)', () => {
      const hover = useHover()
      const cards: CardData[] = [createMockCard({ id: 1, x: 0, y: 0 })]

      hover.update(10, 10, cards, 1, () => 100)

      expect(hover.state.cardId).toBe(null)
    })

    it('respects exclude IDs (array)', () => {
      const hover = useHover()
      const cards: CardData[] = [
        createMockCard({ id: 1, x: 0, y: 0 }),
        createMockCard({ id: 2, x: 0, y: 0 }),
      ]

      hover.update(10, 10, cards, [1, 2], (card) => card.z)

      expect(hover.state.cardId).toBe(null)
    })
  })
})

describe('cardAtPoint', () => {
  beforeEach(() => {
    resetIdCounters()
  })

  it('returns null when no cards at point', () => {
    const cards: CardData[] = [createMockCard({ id: 1, x: 100, y: 100 })]

    const result = cardAtPoint(0, 0, cards, undefined, () => 100)

    expect(result).toBe(null)
  })

  it('returns card at point', () => {
    const cards: CardData[] = [createMockCard({ id: 1, x: 0, y: 0 })]

    const result = cardAtPoint(10, 10, cards, undefined, () => 100)

    expect(result).not.toBe(null)
    expect(result?.card.id).toBe(1)
  })

  it('returns topmost card when multiple cards overlap', () => {
    const cards: CardData[] = [
      createMockCard({ id: 1, x: 0, y: 0, z: 10 }),
      createMockCard({ id: 2, x: 0, y: 0, z: 20 }),
      createMockCard({ id: 3, x: 0, y: 0, z: 15 }),
    ]

    const result = cardAtPoint(10, 10, cards, undefined, (card) => card.z)

    expect(result?.card.id).toBe(2) // Highest z-index
  })

  it('excludes cards by ID', () => {
    const cards: CardData[] = [
      createMockCard({ id: 1, x: 0, y: 0, z: 20 }),
      createMockCard({ id: 2, x: 0, y: 0, z: 10 }),
    ]

    const result = cardAtPoint(10, 10, cards, 1, (card) => card.z)

    expect(result?.card.id).toBe(2)
  })

  it('excludes multiple cards by ID array', () => {
    const cards: CardData[] = [
      createMockCard({ id: 1, x: 0, y: 0, z: 30 }),
      createMockCard({ id: 2, x: 0, y: 0, z: 20 }),
      createMockCard({ id: 3, x: 0, y: 0, z: 10 }),
    ]

    const result = cardAtPoint(10, 10, cards, [1, 2], (card) => card.z)

    expect(result?.card.id).toBe(3)
  })

  it('returns correct card index', () => {
    const cards: CardData[] = [
      createMockCard({ id: 1, x: 100, y: 100 }),
      createMockCard({ id: 2, x: 0, y: 0 }),
    ]

    const result = cardAtPoint(10, 10, cards, undefined, () => 100)

    expect(result?.index).toBe(1) // Second card in array
  })

  it('returns z value from getCardZ function', () => {
    const cards: CardData[] = [createMockCard({ id: 1, x: 0, y: 0 })]

    const result = cardAtPoint(10, 10, cards, undefined, () => 500)

    expect(result?.z).toBe(500)
  })

  it('checks card bounds correctly', () => {
    const card = createMockCard({ id: 1, x: 100, y: 100 })
    const cards: CardData[] = [card]

    // Just inside bounds
    expect(cardAtPoint(100, 100, cards, undefined, () => 100)).not.toBe(null)
    expect(cardAtPoint(100 + CARD_W, 100 + CARD_H, cards, undefined, () => 100)).not.toBe(null)

    // Just outside bounds
    expect(cardAtPoint(99, 100, cards, undefined, () => 100)).toBe(null)
    expect(cardAtPoint(100, 99, cards, undefined, () => 100)).toBe(null)
    expect(cardAtPoint(100 + CARD_W + 1, 100, cards, undefined, () => 100)).toBe(null)
    expect(cardAtPoint(100, 100 + CARD_H + 1, cards, undefined, () => 100)).toBe(null)
  })

  it('handles empty cards array', () => {
    const result = cardAtPoint(10, 10, [], undefined, () => 100)

    expect(result).toBe(null)
  })
})
