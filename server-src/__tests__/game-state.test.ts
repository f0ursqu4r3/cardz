import { describe, test, expect, beforeEach } from 'bun:test'
import { GameStateManager, createInitialGameState } from '../game-state'

describe('createInitialGameState', () => {
  test('creates 52 cards', () => {
    const state = createInitialGameState()
    expect(state.cards).toHaveLength(52)
  })

  test('all cards start in a single stack', () => {
    const state = createInitialGameState()
    expect(state.stacks).toHaveLength(1)
    expect(state.stacks[0].cardIds).toHaveLength(52)
  })

  test('all cards are face down initially', () => {
    const state = createInitialGameState()
    expect(state.cards.every((c) => c.faceUp === false)).toBe(true)
  })

  test('cards have correct col/row values for a standard deck', () => {
    const state = createInitialGameState()
    // Card 0 should be col=0, row=0 (Ace of first suit)
    expect(state.cards[0].col).toBe(0)
    expect(state.cards[0].row).toBe(0)
    // Card 13 should be col=0, row=1 (Ace of second suit)
    expect(state.cards[13].col).toBe(0)
    expect(state.cards[13].row).toBe(1)
  })

  test('initializes with stateVersion 0', () => {
    const state = createInitialGameState()
    expect(state.stateVersion).toBe(0)
  })
})

describe('GameStateManager', () => {
  let manager: GameStateManager

  beforeEach(() => {
    manager = new GameStateManager()
  })

  describe('Card Operations', () => {
    test('getCard returns card by id', () => {
      const card = manager.getCard(0)
      expect(card).toBeDefined()
      expect(card?.id).toBe(0)
    })

    test('getCard returns undefined for invalid id', () => {
      const card = manager.getCard(999)
      expect(card).toBeUndefined()
    })

    test('moveCard updates position and increments z', () => {
      const initialZ = manager.getCard(0)?.z
      const result = manager.moveCard(0, 100, 200)

      expect(result).not.toBeNull()
      expect(result?.card.x).toBe(100)
      expect(result?.card.y).toBe(200)
      expect(result?.z).toBeGreaterThan(initialZ!)
    })

    test('moveCard increments state version', () => {
      const initialVersion = manager.getVersion()
      manager.moveCard(0, 100, 200)
      expect(manager.getVersion()).toBe(initialVersion + 1)
    })

    test('flipCard toggles faceUp', () => {
      const card = manager.getCard(0)
      expect(card?.faceUp).toBe(false)

      manager.flipCard(0)
      expect(manager.getCard(0)?.faceUp).toBe(true)

      manager.flipCard(0)
      expect(manager.getCard(0)?.faceUp).toBe(false)
    })

    test('setCardLock sets lockedBy', () => {
      manager.setCardLock(0, 'player1')
      expect(manager.getCard(0)?.lockedBy).toBe('player1')

      manager.setCardLock(0, null)
      expect(manager.getCard(0)?.lockedBy).toBeNull()
    })
  })

  describe('Stack Operations', () => {
    test('getStack returns stack by id', () => {
      const stack = manager.getStack(0)
      expect(stack).toBeDefined()
      expect(stack?.id).toBe(0)
    })

    test('createStack creates new stack with cards', () => {
      // First, remove some cards from the initial stack
      manager.removeCardFromStack(0)
      manager.removeCardFromStack(1)

      const result = manager.createStack([0, 1], 500, 400)

      expect(result.stack.cardIds).toEqual([0, 1])
      expect(result.stack.anchorX).toBe(500)
      expect(result.stack.anchorY).toBe(400)
      expect(result.cardUpdates).toHaveLength(2)
    })

    test('createStack removes cards from old stacks', () => {
      const initialStack = manager.getStack(0)
      const initialCardCount = initialStack?.cardIds.length ?? 0

      const result = manager.createStack([0, 1], 500, 400)

      // Original stack should have 2 fewer cards
      const updatedStack = manager.getStack(0)
      expect(updatedStack?.cardIds.length).toBe(initialCardCount - 2)
    })

    test('moveStack updates position', () => {
      const result = manager.moveStack(0, 600, 500)

      expect(result).not.toBeNull()
      expect(result?.stack.anchorX).toBe(600)
      expect(result?.stack.anchorY).toBe(500)
    })

    test('addCardToStack adds card to stack', () => {
      // Remove card from initial stack first
      manager.removeCardFromStack(0)

      const stack = manager.getStack(0)
      const initialCount = stack?.cardIds.length ?? 0

      const result = manager.addCardToStack(0, 0)

      expect(result).not.toBeNull()
      expect(manager.getStack(0)?.cardIds.length).toBe(initialCount + 1)
      expect(manager.getCard(0)?.stackId).toBe(0)
    })

    test('removeCardFromStack removes card and deletes empty stack', () => {
      // Create a single-card stack
      manager.removeCardFromStack(0)
      const { stack } = manager.createStack([0], 100, 100)

      const result = manager.removeCardFromStack(0)

      expect(result?.stackDeleted).toBe(true)
      expect(manager.getStack(stack.id)).toBeUndefined()
    })

    test('mergeStacks combines two stacks', () => {
      // Create two separate stacks
      manager.removeCardFromStack(0)
      manager.removeCardFromStack(1)
      const stack1 = manager.createStack([0], 100, 100)
      const stack2 = manager.createStack([1], 200, 200)

      const result = manager.mergeStacks(stack1.stack.id, stack2.stack.id)

      expect(result).not.toBeNull()
      expect(result?.targetStack.cardIds).toContain(0)
      expect(result?.targetStack.cardIds).toContain(1)
      expect(manager.getStack(stack1.stack.id)).toBeUndefined()
    })

    test('shuffleStack randomizes card order', () => {
      const stack = manager.getStack(0)
      const originalOrder = [...(stack?.cardIds ?? [])]

      // Shuffle multiple times to increase chance of different order
      let different = false
      for (let i = 0; i < 10; i++) {
        const result = manager.shuffleStack(0)
        if (result && JSON.stringify(result.newOrder) !== JSON.stringify(originalOrder)) {
          different = true
          break
        }
      }

      // With 52 cards, probability of same order after 10 shuffles is essentially 0
      expect(different).toBe(true)
    })

    test('flipStack flips only the top card', () => {
      const stack = manager.getStack(0)!
      const topCardId = stack.cardIds[stack.cardIds.length - 1]

      // All cards start face down
      expect(manager.getCard(topCardId)?.faceUp).toBe(false)

      manager.flipStack(0)

      expect(manager.getCard(topCardId)?.faceUp).toBe(true)
      // Other cards should remain face down
      expect(manager.getCard(stack.cardIds[0])?.faceUp).toBe(false)
    })

    test('setStackFaces sets all cards to specified orientation', () => {
      manager.setStackFaces(0, true)

      const stack = manager.getStack(0)!
      for (const cardId of stack.cardIds) {
        expect(manager.getCard(cardId)?.faceUp).toBe(true)
      }
    })

    test('reorderStack moves card within stack', () => {
      const stack = manager.getStack(0)!
      const originalOrder = [...stack.cardIds]

      const result = manager.reorderStack(0, 0, 5)

      expect(result).not.toBeNull()
      expect(result?.newOrder[5]).toBe(originalOrder[0])
    })
  })

  describe('Zone Operations', () => {
    test('createZone creates new zone', () => {
      const zone = manager.createZone(100, 100, 200, 150, 'Test Zone', true)

      expect(zone.label).toBe('Test Zone')
      expect(zone.faceUp).toBe(true)
      expect(zone.width).toBe(200)
      expect(zone.height).toBe(150)
    })

    test('updateZone modifies zone properties', () => {
      const zone = manager.createZone(100, 100, 200, 150, 'Test Zone', true)

      const result = manager.updateZone(zone.id, { label: 'Updated Zone', locked: true })

      expect(result?.zone.label).toBe('Updated Zone')
      expect(result?.zone.locked).toBe(true)
    })

    test('deleteZone removes zone', () => {
      const zone = manager.createZone(100, 100, 200, 150, 'Test Zone', true)

      const result = manager.deleteZone(zone.id)

      expect(result).not.toBeNull()
      expect(manager.getZone(zone.id)).toBeUndefined()
    })

    test('addCardToZone creates stack in zone', () => {
      const zone = manager.createZone(100, 100, 200, 150, 'Test Zone', true)
      manager.removeCardFromStack(0)

      const result = manager.addCardToZone(zone.id, 0)

      expect(result?.stackCreated).toBe(true)
      expect(manager.getCard(0)?.faceUp).toBe(true) // Zone is faceUp
    })

    test('addCardsToZone adds multiple cards', () => {
      const zone = manager.createZone(100, 100, 200, 150, 'Test Zone', false)
      manager.removeCardFromStack(0)
      manager.removeCardFromStack(1)
      manager.removeCardFromStack(2)

      const result = manager.addCardsToZone(zone.id, [0, 1, 2])

      expect(result?.cardStates).toHaveLength(3)
      expect(result?.stackCreated).toBe(true)
      // All cards should be face down (zone.faceUp = false)
      for (const cardState of result?.cardStates ?? []) {
        expect(cardState.faceUp).toBe(false)
      }
    })

    test('deleteZone converts stack to free stack', () => {
      const zone = manager.createZone(100, 100, 200, 150, 'Test Zone', true)
      manager.removeCardFromStack(0)
      manager.addCardToZone(zone.id, 0)

      const result = manager.deleteZone(zone.id)

      expect(result?.convertedStack).not.toBeNull()
      const stack = manager.getStack(result!.convertedStack!.stackId)
      expect(stack?.kind).toBe('free')
    })
  })

  describe('Hand Operations', () => {
    test('addCardToHand adds card to player hand', () => {
      const result = manager.addCardToHand('player1', 0)

      expect(result).not.toBeNull()
      expect(result?.ownerId).toBe('player1')
      expect(manager.getHand('player1')?.cardIds).toContain(0)
    })

    test('addCardToHand removes card from stack', () => {
      const stack = manager.getStack(0)!
      expect(stack.cardIds).toContain(0)

      manager.addCardToHand('player1', 0)

      expect(manager.getStack(0)?.cardIds).not.toContain(0)
    })

    test('removeCardFromHand returns card to table', () => {
      manager.addCardToHand('player1', 0)

      const result = manager.removeCardFromHand('player1', 0, 300, 400, true)

      expect(result).not.toBeNull()
      expect(result?.ownerId).toBeNull()
      expect(result?.x).toBe(300)
      expect(result?.y).toBe(400)
      expect(result?.faceUp).toBe(true)
    })

    test('reorderHand moves card within hand', () => {
      manager.addCardToHand('player1', 0)
      manager.addCardToHand('player1', 1)
      manager.addCardToHand('player1', 2)

      const result = manager.reorderHand('player1', 0, 2)

      expect(result).toEqual([1, 2, 0])
    })

    test('addStackToHand adds all stack cards to hand', () => {
      // Create a small stack
      manager.removeCardFromStack(0)
      manager.removeCardFromStack(1)
      const { stack } = manager.createStack([0, 1], 100, 100)

      const result = manager.addStackToHand('player1', stack.id)

      expect(result?.cardIds).toEqual([0, 1])
      expect(manager.getHand('player1')?.cardIds).toContain(0)
      expect(manager.getHand('player1')?.cardIds).toContain(1)
      expect(manager.getStack(stack.id)).toBeUndefined()
    })

    test('getHandCount returns correct count', () => {
      expect(manager.getHandCount('player1')).toBe(0)

      manager.addCardToHand('player1', 0)
      manager.addCardToHand('player1', 1)

      expect(manager.getHandCount('player1')).toBe(2)
    })
  })

  describe('Player Management', () => {
    test('transferHandOwnership moves hand to new player', () => {
      manager.addCardToHand('oldPlayer', 0)
      manager.addCardToHand('oldPlayer', 1)

      manager.transferHandOwnership('oldPlayer', 'newPlayer')

      expect(manager.getHand('oldPlayer')).toBeUndefined()
      expect(manager.getHand('newPlayer')?.cardIds).toContain(0)
      expect(manager.getCard(0)?.ownerId).toBe('newPlayer')
    })

    test('removePlayer returns cards to table', () => {
      manager.addCardToHand('player1', 0)
      manager.addCardToHand('player1', 1)

      const returnedCards = manager.removePlayer('player1')

      expect(returnedCards).toContain(0)
      expect(returnedCards).toContain(1)
      expect(manager.getCard(0)?.ownerId).toBeNull()
      expect(manager.getHand('player1')).toBeUndefined()
    })
  })

  describe('State Version Tracking', () => {
    test('version increments on mutations', () => {
      const v0 = manager.getVersion()

      manager.moveCard(0, 100, 100)
      expect(manager.getVersion()).toBe(v0 + 1)

      manager.flipCard(0)
      expect(manager.getVersion()).toBe(v0 + 2)

      manager.createZone(0, 0, 100, 100, 'Zone', true)
      expect(manager.getVersion()).toBe(v0 + 3)
    })

    test('version does not increment on reads', () => {
      const version = manager.getVersion()

      manager.getCard(0)
      manager.getStack(0)
      manager.getHand('player1')
      manager.getHandCount('player1')

      expect(manager.getVersion()).toBe(version)
    })
  })
})
