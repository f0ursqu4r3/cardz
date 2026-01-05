import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useCardStore } from '@/stores/cards'
import {
  setupPinia,
  createMockCard,
  createMockStack,
  createMockZone,
  resetIdCounters,
} from '../test-utils'
import { CARD_W, CARD_H, ZONE_MIN_WIDTH, ZONE_MIN_HEIGHT } from '@/types'

describe('cards store', () => {
  beforeEach(() => {
    setupPinia()
    resetIdCounters()
  })

  describe('card creation', () => {
    it('creates the specified number of cards', () => {
      const store = useCardStore()
      store.createCards(5, 800, 600)

      expect(store.cards.length).toBe(5)
      expect(store.cards.map((c) => c.id)).toEqual([1, 2, 3, 4, 5])
    })

    it('creates cards with random positions within bounds', () => {
      const store = useCardStore()
      store.createCards(10, 800, 600)

      store.cards.forEach((card) => {
        expect(card.x).toBeGreaterThanOrEqual(0)
        expect(card.x).toBeLessThanOrEqual(800 - 100)
        expect(card.y).toBeGreaterThanOrEqual(0)
        expect(card.y).toBeLessThanOrEqual(600 - 150)
      })
    })

    it('creates cards with default face up state', () => {
      const store = useCardStore()
      store.createCards(3)

      store.cards.forEach((card) => {
        expect(card.faceUp).toBe(true)
        expect(card.isInDeck).toBe(false)
        expect(card.inHand).toBe(false)
        expect(card.stackId).toBe(null)
      })
    })
  })

  describe('stack operations', () => {
    it('creates a stack at given position', () => {
      const store = useCardStore()
      const stack = store.createStackAt(200, 300, 'free')

      expect(stack.anchorX).toBe(200)
      expect(stack.anchorY).toBe(300)
      expect(stack.kind).toBe('free')
      expect(stack.cardIds).toEqual([])
      expect(store.stacks).toContainEqual(stack)
    })

    it('adds a card to a stack', () => {
      const store = useCardStore()
      store.createCards(2)
      const stack = store.createStackAt(100, 100)

      store.addCardToStack(1, stack)

      expect(stack.cardIds).toContain(1)
      const card = store.cards.find((c) => c.id === 1)
      expect(card?.stackId).toBe(stack.id)
      expect(card?.isInDeck).toBe(true)
    })

    it('removes a card from its stack', () => {
      const store = useCardStore()
      store.createCards(2)
      const stack = store.createStackAt(100, 100)
      store.addCardToStack(1, stack)
      store.addCardToStack(2, stack)

      store.removeFromStack(1)

      expect(stack.cardIds).not.toContain(1)
      const card = store.cards.find((c) => c.id === 1)
      expect(card?.stackId).toBe(null)
      expect(card?.isInDeck).toBe(false)
    })

    it('removes empty stacks automatically', () => {
      const store = useCardStore()
      store.createCards(1)
      const stack = store.createStackAt(100, 100)
      const stackId = stack.id
      store.addCardToStack(1, stack)

      store.removeFromStack(1)

      expect(store.stacks.find((s) => s.id === stackId)).toBeUndefined()
    })

    it('stacks one card on another creating a new stack', () => {
      const store = useCardStore()
      store.createCards(2)

      // Position cards
      const card1 = store.cards.find((c) => c.id === 1)!
      const card2 = store.cards.find((c) => c.id === 2)!
      card1.x = 100
      card1.y = 100
      card2.x = 200
      card2.y = 200

      store.stackCardOnTarget(1, 2)

      expect(card1.stackId).toBe(card2.stackId)
      expect(card1.stackId).not.toBe(null)
    })

    it('merges two stacks correctly', () => {
      const store = useCardStore()
      store.createCards(4)

      const stack1 = store.createStackAt(100, 100)
      const stack2 = store.createStackAt(200, 200)

      store.addCardToStack(1, stack1)
      store.addCardToStack(2, stack1)
      store.addCardToStack(3, stack2)
      store.addCardToStack(4, stack2)

      const result = store.mergeStacks(stack1.id, stack2.id)

      expect(result).toBe(true)
      expect(stack2.cardIds).toEqual([3, 4, 1, 2])
      expect(store.stacks.find((s) => s.id === stack1.id)).toBeUndefined()
    })

    it('shuffles cards in a stack', () => {
      const store = useCardStore()
      store.createCards(10)
      const stack = store.createStackAt(100, 100)

      for (let i = 1; i <= 10; i++) {
        store.addCardToStack(i, stack)
      }

      const originalOrder = [...stack.cardIds]

      // Mock random to make shuffle deterministic
      vi.spyOn(Math, 'random').mockReturnValue(0.3)

      store.shuffleStack(stack.id)

      vi.restoreAllMocks()

      // Just verify the stack still has all cards (shuffle is random)
      expect(stack.cardIds.length).toBe(10)
      expect(stack.cardIds.sort()).toEqual(originalOrder.sort())
    })

    it('reorders cards within a stack', () => {
      const store = useCardStore()
      store.createCards(3)
      const stack = store.createStackAt(100, 100)

      store.addCardToStack(1, stack)
      store.addCardToStack(2, stack)
      store.addCardToStack(3, stack)

      store.reorderStack(stack.id, 0, 2)

      expect(stack.cardIds).toEqual([2, 3, 1])
    })
  })

  describe('zone operations', () => {
    it('creates a zone with default settings', () => {
      const store = useCardStore()
      const zone = store.createZone(100, 200, 'Test Zone')

      expect(zone.x).toBe(100)
      expect(zone.y).toBe(200)
      expect(zone.label).toBe('Test Zone')
      expect(zone.faceUp).toBe(false)
      expect(zone.locked).toBe(false)
      expect(zone.layout).toBe('stack')
      expect(zone.visibility).toBe('public')
      expect(store.zones).toContainEqual(zone)
    })

    it('creates a zone with custom settings', () => {
      const store = useCardStore()
      const zone = store.createZone(
        100,
        200,
        'Hand Zone',
        true,
        300,
        200,
        'owner',
        'player-1',
        'row',
      )

      expect(zone.faceUp).toBe(true)
      expect(zone.width).toBe(300)
      expect(zone.height).toBe(200)
      expect(zone.visibility).toBe('owner')
      expect(zone.ownerId).toBe('player-1')
      expect(zone.layout).toBe('row')
    })

    it('adds cards to a zone', () => {
      const store = useCardStore()
      store.createCards(2)
      const zone = store.createZone(100, 100)

      const result = store.addToZone(1, zone.id)

      expect(result).toBe(true)
      expect(zone.stackId).not.toBe(null)

      const stack = store.stacks.find((s) => s.id === zone.stackId)
      expect(stack?.cardIds).toContain(1)
    })

    it('adds multiple cards to a zone efficiently', () => {
      const store = useCardStore()
      store.createCards(5)
      const zone = store.createZone(100, 100)

      const result = store.addManyToZone([1, 2, 3, 4, 5], zone.id)

      expect(result).toBe(true)
      const stack = store.stacks.find((s) => s.id === zone.stackId)
      expect(stack?.cardIds).toEqual([1, 2, 3, 4, 5])
    })

    it('updates zone properties', () => {
      const store = useCardStore()
      const zone = store.createZone(100, 100, 'Original')

      store.updateZone(zone.id, {
        x: 200,
        y: 300,
        label: 'Updated',
        layout: 'grid',
        faceUp: true,
      })

      expect(zone.x).toBe(200)
      expect(zone.y).toBe(300)
      expect(zone.label).toBe('Updated')
      expect(zone.layout).toBe('grid')
      expect(zone.faceUp).toBe(true)
    })

    it('enforces minimum zone dimensions', () => {
      const store = useCardStore()
      const zone = store.createZone(100, 100)

      store.updateZone(zone.id, { width: 10, height: 10 })

      expect(zone.width).toBe(ZONE_MIN_WIDTH)
      expect(zone.height).toBe(ZONE_MIN_HEIGHT)
    })

    it('deletes a zone and scatters its cards', () => {
      const store = useCardStore()
      store.createCards(3)
      const zone = store.createZone(100, 100)
      store.addManyToZone([1, 2, 3], zone.id)
      const zoneId = zone.id

      store.deleteZone(zoneId)

      expect(store.zones.find((z) => z.id === zoneId)).toBeUndefined()
      // Cards should be removed from the stack
      store.cards.forEach((card) => {
        expect(card.stackId).toBe(null)
        expect(card.isInDeck).toBe(false)
      })
    })

    it('returns zone stack correctly', () => {
      const store = useCardStore()
      store.createCards(2)
      const zone = store.createZone(100, 100)
      store.addToZone(1, zone.id)

      const stack = store.getZoneStack(zone.id)

      expect(stack).not.toBe(null)
      expect(stack?.id).toBe(zone.stackId)
    })

    it('returns correct zone card count', () => {
      const store = useCardStore()
      store.createCards(5)
      const zone = store.createZone(100, 100)
      store.addManyToZone([1, 2, 3], zone.id)

      expect(store.getZoneCardCount(zone.id)).toBe(3)
    })
  })

  describe('hand operations', () => {
    it('adds a card to hand', () => {
      const store = useCardStore()
      store.createCards(1)

      const result = store.addToHand(1)

      expect(result).toBe(true)
      expect(store.handCardIds).toContain(1)
      expect(store.handCards).toHaveLength(1)

      const card = store.cards.find((c) => c.id === 1)
      expect(card?.inHand).toBe(true)
      expect(card?.faceUp).toBe(true)
    })

    it('removes card from stack when adding to hand', () => {
      const store = useCardStore()
      store.createCards(2)
      const stack = store.createStackAt(100, 100)
      store.addCardToStack(1, stack)

      store.addToHand(1)

      expect(stack.cardIds).not.toContain(1)
    })

    it('removes a card from hand', () => {
      const store = useCardStore()
      store.createCards(1)
      store.addToHand(1)

      const result = store.removeFromHand(1)

      expect(result).toBe(true)
      expect(store.handCardIds).not.toContain(1)
      const card = store.cards.find((c) => c.id === 1)
      expect(card?.inHand).toBe(false)
    })

    it('reorders cards in hand', () => {
      const store = useCardStore()
      store.createCards(3)
      store.addToHand(1)
      store.addToHand(2)
      store.addToHand(3)

      store.reorderHand(0, 2)

      expect(store.handCardIds).toEqual([2, 3, 1])
    })

    it('computes hand count correctly', () => {
      const store = useCardStore()
      store.createCards(3)
      store.addToHand(1)
      store.addToHand(2)

      expect(store.handCount).toBe(2)
    })

    it('adds entire stack to hand', () => {
      const store = useCardStore()
      store.createCards(3)
      const stack = store.createStackAt(100, 100)
      store.addCardToStack(1, stack)
      store.addCardToStack(2, stack)
      store.addCardToStack(3, stack)

      store.addStackToHand(stack.id)

      expect(store.handCardIds).toEqual([1, 2, 3])
      expect(store.handCount).toBe(3)
    })
  })

  describe('selection operations', () => {
    it('toggles card selection', () => {
      const store = useCardStore()
      store.createCards(1)

      store.toggleSelect(1)
      expect(store.isSelected(1)).toBe(true)

      store.toggleSelect(1)
      expect(store.isSelected(1)).toBe(false)
    })

    it('only selects free cards (not in stacks)', () => {
      const store = useCardStore()
      store.createCards(2)
      const stack = store.createStackAt(100, 100)
      store.addCardToStack(1, stack)

      store.toggleSelect(1) // In stack - should not select
      store.toggleSelect(2) // Free - should select

      expect(store.isSelected(1)).toBe(false)
      expect(store.isSelected(2)).toBe(true)
    })

    it('clears selection', () => {
      const store = useCardStore()
      store.createCards(3)
      store.toggleSelect(1)
      store.toggleSelect(2)

      store.clearSelection()

      expect(store.hasSelection).toBe(false)
      expect(store.selectionCount).toBe(0)
    })

    it('moves selected cards', () => {
      const store = useCardStore()
      store.createCards(2)
      store.cards[0]!.x = 100
      store.cards[0]!.y = 100
      store.cards[1]!.x = 200
      store.cards[1]!.y = 200
      store.toggleSelect(1)
      store.toggleSelect(2)

      store.moveSelection(50, 25)

      expect(store.cards[0]!.x).toBe(150)
      expect(store.cards[0]!.y).toBe(125)
      expect(store.cards[1]!.x).toBe(250)
      expect(store.cards[1]!.y).toBe(225)
    })

    it('stacks selection at position', () => {
      const store = useCardStore()
      store.createCards(3)
      store.toggleSelect(1)
      store.toggleSelect(2)
      store.toggleSelect(3)

      const stack = store.stackSelection(300, 300)

      expect(stack).not.toBe(null)
      expect(stack?.cardIds).toEqual([1, 2, 3])
      expect(store.hasSelection).toBe(false)
    })

    it('returns null when stacking fewer than 2 cards', () => {
      const store = useCardStore()
      store.createCards(1)
      store.toggleSelect(1)

      const stack = store.stackSelection(300, 300)

      expect(stack).toBe(null)
    })
  })

  describe('card flipping', () => {
    it('flips a single card', () => {
      const store = useCardStore()
      store.createCards(1)

      expect(store.cards[0]!.faceUp).toBe(true)

      store.flipCard(1)
      expect(store.cards[0]!.faceUp).toBe(false)

      store.flipCard(1)
      expect(store.cards[0]!.faceUp).toBe(true)
    })

    it('flips top card in a stack', () => {
      const store = useCardStore()
      store.createCards(3)
      const stack = store.createStackAt(100, 100)
      store.addCardToStack(1, stack)
      store.addCardToStack(2, stack)
      store.addCardToStack(3, stack)

      // Top card is the last one (id: 3)
      store.flipStack(stack.id)

      expect(store.cards.find((c) => c.id === 3)?.faceUp).toBe(false)
      expect(store.cards.find((c) => c.id === 1)?.faceUp).toBe(true)
      expect(store.cards.find((c) => c.id === 2)?.faceUp).toBe(true)
    })
  })

  describe('z-index management', () => {
    it('bumps card z-index', () => {
      const store = useCardStore()
      store.createCards(2)
      const initialZ = store.cards[0]!.z

      store.bumpCardZ(1)

      expect(store.cards[0]!.z).toBeGreaterThan(initialZ)
    })

    it('calculates card z correctly for active card', () => {
      const store = useCardStore()
      store.createCards(3)

      const z = store.cardZ(store.cards[0]!, 0, 0, null)

      expect(z).toBe(1900)
    })

    it('calculates card z correctly for dragging stack', () => {
      const store = useCardStore()
      store.createCards(2)
      const stack = store.createStackAt(100, 100)
      store.addCardToStack(1, stack)
      store.addCardToStack(2, stack)

      const card = store.cards.find((c) => c.id === 2)!
      const z = store.cardZ(card, 1, null, stack.id)

      expect(z).toBe(2001) // 2000 + position in stack
    })
  })

  describe('zone card positioning', () => {
    it('calculates stack layout positions', () => {
      const store = useCardStore()
      const zone = store.createZone(
        100,
        100,
        'Stack Zone',
        false,
        200,
        200,
        'public',
        null,
        'stack',
      )

      const pos = store.getZoneCardPosition(zone.id, 0, 3)

      expect(pos).not.toBe(null)
      expect(pos?.rotation).toBe(0)
    })

    it('calculates row layout positions', () => {
      const store = useCardStore()
      const zone = store.createZone(100, 100, 'Row Zone', false, 300, 150, 'public', null, 'row')

      const pos0 = store.getZoneCardPosition(zone.id, 0, 3)
      const pos1 = store.getZoneCardPosition(zone.id, 1, 3)

      expect(pos0).not.toBe(null)
      expect(pos1).not.toBe(null)
      expect(pos1!.x).toBeGreaterThan(pos0!.x)
      expect(pos1!.y).toBe(pos0!.y)
    })

    it('calculates column layout positions', () => {
      const store = useCardStore()
      const zone = store.createZone(
        100,
        100,
        'Column Zone',
        false,
        150,
        300,
        'public',
        null,
        'column',
      )

      const pos0 = store.getZoneCardPosition(zone.id, 0, 3)
      const pos1 = store.getZoneCardPosition(zone.id, 1, 3)

      expect(pos0).not.toBe(null)
      expect(pos1).not.toBe(null)
      expect(pos1!.y).toBeGreaterThan(pos0!.y)
      expect(pos1!.x).toBe(pos0!.x)
    })

    it('calculates grid layout positions', () => {
      const store = useCardStore()
      const zone = store.createZone(100, 100, 'Grid Zone', false, 300, 300, 'public', null, 'grid')

      const pos0 = store.getZoneCardPosition(zone.id, 0, 4)
      const pos1 = store.getZoneCardPosition(zone.id, 1, 4)
      const pos2 = store.getZoneCardPosition(zone.id, 2, 4)

      expect(pos0).not.toBe(null)
      expect(pos1).not.toBe(null)
      expect(pos2).not.toBe(null)
    })

    it('calculates fan layout positions with rotation', () => {
      const store = useCardStore()
      const zone = store.createZone(100, 100, 'Fan Zone', false, 300, 200, 'public', null, 'fan')

      const pos0 = store.getZoneCardPosition(zone.id, 0, 5)
      const pos2 = store.getZoneCardPosition(zone.id, 2, 5)
      const pos4 = store.getZoneCardPosition(zone.id, 4, 5)

      expect(pos0).not.toBe(null)
      expect(pos2).not.toBe(null)
      expect(pos4).not.toBe(null)
      // Fan cards should have different rotations
      expect(pos0!.rotation).not.toBe(pos4!.rotation)
    })

    it('calculates circle layout positions', () => {
      const store = useCardStore()
      const zone = store.createZone(
        100,
        100,
        'Circle Zone',
        false,
        300,
        300,
        'public',
        null,
        'circle',
      )

      const pos0 = store.getZoneCardPosition(zone.id, 0, 6)
      const pos3 = store.getZoneCardPosition(zone.id, 3, 6)

      expect(pos0).not.toBe(null)
      expect(pos3).not.toBe(null)
      expect(pos0!.rotation).not.toBe(pos3!.rotation)
    })
  })

  describe('server state sync', () => {
    it('syncs full game state from server', () => {
      const store = useCardStore()

      const serverState = {
        cards: [
          {
            id: 1,
            col: 0,
            row: 0,
            x: 100,
            y: 100,
            z: 50,
            faceUp: true,
            stackId: null,
            ownerId: null,
            lockedBy: null,
          },
          {
            id: 2,
            col: 1,
            row: 0,
            x: 200,
            y: 100,
            z: 51,
            faceUp: false,
            stackId: 1,
            ownerId: null,
            lockedBy: 'player-1',
          },
        ],
        stacks: [
          {
            id: 1,
            cardIds: [2],
            anchorX: 200,
            anchorY: 100,
            kind: 'free' as const,
            lockedBy: null,
          },
        ],
        zones: [],
        hands: [],
        nextStackId: 2,
        nextZoneId: 1,
        zCounter: 52,
      }

      store.syncFromServer(serverState, [])

      expect(store.cards.length).toBe(2)
      expect(store.stacks.length).toBe(1)
      expect(store.cards.find((c) => c.id === 2)?.lockedBy).toBe('player-1')
    })

    it('updates single card from server', () => {
      const store = useCardStore()
      store.createCards(1)

      store.updateCardFromServer(1, { x: 500, y: 300, faceUp: false })

      const card = store.cards.find((c) => c.id === 1)
      expect(card?.x).toBe(500)
      expect(card?.y).toBe(300)
      expect(card?.faceUp).toBe(false)
    })

    it('updates single stack from server', () => {
      const store = useCardStore()
      store.createCards(3)
      const stack = store.createStackAt(100, 100)
      store.addCardToStack(1, stack)

      store.updateStackFromServer(stack.id, { cardIds: [1, 2, 3], anchorX: 200 })

      expect(stack.cardIds).toEqual([1, 2, 3])
      expect(stack.anchorX).toBe(200)
    })
  })
})
