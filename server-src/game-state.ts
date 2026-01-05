import type { CardState, GameState, HandState, StackState, ZoneState } from '../shared/types'

const STACK_OFFSET_Y = -1

/**
 * Creates the initial game state with a full 52-card deck stacked in the center
 */
export function createInitialGameState(): GameState {
  const cards: CardState[] = []

  // Create 52 cards in a single stack, face-down
  for (let i = 0; i < 52; i++) {
    const col = i % 13
    const row = Math.floor(i / 13)

    cards.push({
      id: i,
      col,
      row,
      x: 400, // Center position
      y: 300 + i * STACK_OFFSET_Y, // Stacked with offset
      z: i,
      faceUp: false,
      stackId: 0, // All cards start in stack 0
      ownerId: null,
      lockedBy: null,
    })
  }

  // Create initial stack with all cards
  const initialStack: StackState = {
    id: 0,
    cardIds: cards.map((c) => c.id),
    anchorX: 400,
    anchorY: 300,
    kind: 'free',
    lockedBy: null,
  }

  return {
    cards,
    stacks: [initialStack],
    zones: [],
    hands: [],
    nextStackId: 1,
    nextZoneId: 1,
    zCounter: 52,
  }
}

/**
 * Manages the authoritative game state for a room
 */
export class GameStateManager {
  private state: GameState

  constructor(initialState?: GameState) {
    this.state = initialState ?? createInitialGameState()
  }

  getState(): GameState {
    return this.state
  }

  // ============================================================================
  // Card Operations
  // ============================================================================

  getCard(cardId: number): CardState | undefined {
    return this.state.cards.find((c) => c.id === cardId)
  }

  moveCard(cardId: number, x: number, y: number): { card: CardState; z: number } | null {
    const card = this.getCard(cardId)
    if (!card) return null

    card.x = x
    card.y = y
    card.z = ++this.state.zCounter

    return { card, z: card.z }
  }

  flipCard(cardId: number): CardState | null {
    const card = this.getCard(cardId)
    if (!card) return null

    card.faceUp = !card.faceUp
    return card
  }

  setCardLock(cardId: number, playerId: string | null): boolean {
    const card = this.getCard(cardId)
    if (!card) return false

    card.lockedBy = playerId
    return true
  }

  // ============================================================================
  // Stack Operations
  // ============================================================================

  getStack(stackId: number): StackState | undefined {
    return this.state.stacks.find((s) => s.id === stackId)
  }

  createStack(
    cardIds: number[],
    anchorX: number,
    anchorY: number,
    kind: 'zone' | 'free' = 'free',
    zoneId?: number,
  ): { stack: StackState; cardUpdates: { cardId: number; x: number; y: number; z: number }[] } {
    const stackId = this.state.nextStackId++

    const stack: StackState = {
      id: stackId,
      cardIds: [...cardIds],
      anchorX,
      anchorY,
      kind,
      zoneId,
      lockedBy: null,
    }

    this.state.stacks.push(stack)

    // Update card positions
    const cardUpdates: { cardId: number; x: number; y: number; z: number }[] = []
    for (let i = 0; i < cardIds.length; i++) {
      const card = this.getCard(cardIds[i])
      if (card) {
        // Remove from old stack if any
        if (card.stackId !== null) {
          this.removeCardFromStack(card.id)
        }

        card.stackId = stackId
        card.x = anchorX
        card.y = anchorY + i * STACK_OFFSET_Y
        card.z = ++this.state.zCounter

        cardUpdates.push({ cardId: card.id, x: card.x, y: card.y, z: card.z })
      }
    }

    return { stack, cardUpdates }
  }

  moveStack(
    stackId: number,
    anchorX: number,
    anchorY: number,
    detachFromZone?: boolean,
  ): {
    stack: StackState
    cardUpdates: { cardId: number; x: number; y: number }[]
    zoneDetached?: { zoneId: number }
  } | null {
    const stack = this.getStack(stackId)
    if (!stack) return null

    let zoneDetached: { zoneId: number } | undefined

    // Detach from zone if requested
    if (detachFromZone && stack.kind === 'zone' && stack.zoneId !== undefined) {
      const zone = this.getZone(stack.zoneId)
      if (zone && zone.stackId === stackId) {
        zoneDetached = { zoneId: zone.id }
        zone.stackId = null
      }
      stack.zoneId = undefined
      stack.kind = 'free'
    }

    stack.anchorX = anchorX
    stack.anchorY = anchorY

    const cardUpdates: { cardId: number; x: number; y: number }[] = []
    for (let i = 0; i < stack.cardIds.length; i++) {
      const card = this.getCard(stack.cardIds[i])
      if (card) {
        card.x = anchorX
        card.y = anchorY + i * STACK_OFFSET_Y
        cardUpdates.push({ cardId: card.id, x: card.x, y: card.y })
      }
    }

    return { stack, cardUpdates, zoneDetached }
  }

  setStackLock(stackId: number, playerId: string | null): boolean {
    const stack = this.getStack(stackId)
    if (!stack) return false

    stack.lockedBy = playerId
    return true
  }

  addCardToStack(
    stackId: number,
    cardId: number,
    faceUp?: boolean,
  ): { x: number; y: number; z: number; faceUp: boolean } | null {
    const stack = this.getStack(stackId)
    const card = this.getCard(cardId)
    if (!stack || !card) return null

    // Remove from old stack if any
    if (card.stackId !== null) {
      this.removeCardFromStack(cardId)
    }

    stack.cardIds.push(cardId)
    card.stackId = stackId
    card.x = stack.anchorX
    card.y = stack.anchorY + (stack.cardIds.length - 1) * STACK_OFFSET_Y
    card.z = ++this.state.zCounter

    // If faceUp is specified (e.g., from zone), use that
    if (faceUp !== undefined) {
      card.faceUp = faceUp
    }

    return { x: card.x, y: card.y, z: card.z, faceUp: card.faceUp }
  }

  removeCardFromStack(cardId: number): { stackId: number; stackDeleted: boolean } | null {
    const card = this.getCard(cardId)
    if (!card || card.stackId === null) return null

    const stack = this.getStack(card.stackId)
    if (!stack) return null

    const stackId = stack.id

    stack.cardIds = stack.cardIds.filter((id) => id !== cardId)
    card.stackId = null

    // Delete empty stacks
    if (stack.cardIds.length === 0) {
      // Clear zone association if stack belonged to a zone
      if (stack.kind === 'zone' && stack.zoneId !== undefined) {
        const zone = this.getZone(stack.zoneId)
        if (zone && zone.stackId === stackId) {
          zone.stackId = null
        }
      }
      this.state.stacks = this.state.stacks.filter((s) => s.id !== stackId)
      return { stackId, stackDeleted: true }
    }

    return { stackId, stackDeleted: false }
  }

  mergeStacks(
    sourceStackId: number,
    targetStackId: number,
  ): {
    targetStack: StackState
    cardUpdates: { cardId: number; x: number; y: number; z: number }[]
  } | null {
    const sourceStack = this.getStack(sourceStackId)
    const targetStack = this.getStack(targetStackId)
    if (!sourceStack || !targetStack) return null

    const cardUpdates: { cardId: number; x: number; y: number; z: number }[] = []

    // Move all cards from source to target
    for (const cardId of sourceStack.cardIds) {
      const card = this.getCard(cardId)
      if (card) {
        targetStack.cardIds.push(cardId)
        card.stackId = targetStackId
        card.x = targetStack.anchorX
        card.y = targetStack.anchorY + (targetStack.cardIds.length - 1) * STACK_OFFSET_Y
        card.z = ++this.state.zCounter
        cardUpdates.push({ cardId: card.id, x: card.x, y: card.y, z: card.z })
      }
    }

    // Clear zone association if source stack belonged to a zone
    if (sourceStack.kind === 'zone' && sourceStack.zoneId !== undefined) {
      const zone = this.getZone(sourceStack.zoneId)
      if (zone && zone.stackId === sourceStackId) {
        zone.stackId = null
      }
    }

    // Delete source stack
    this.state.stacks = this.state.stacks.filter((s) => s.id !== sourceStackId)

    return { targetStack, cardUpdates }
  }

  shuffleStack(
    stackId: number,
  ): { newOrder: number[]; cardUpdates: { cardId: number; x: number; y: number }[] } | null {
    const stack = this.getStack(stackId)
    if (!stack) return null

    // Fisher-Yates shuffle
    const cardIds = [...stack.cardIds]
    for (let i = cardIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[cardIds[i], cardIds[j]] = [cardIds[j], cardIds[i]]
    }

    stack.cardIds = cardIds

    // Update card positions
    const cardUpdates: { cardId: number; x: number; y: number }[] = []
    for (let i = 0; i < cardIds.length; i++) {
      const card = this.getCard(cardIds[i])
      if (card) {
        card.x = stack.anchorX
        card.y = stack.anchorY + i * STACK_OFFSET_Y
        cardUpdates.push({ cardId: card.id, x: card.x, y: card.y })
      }
    }

    return { newOrder: cardIds, cardUpdates }
  }

  flipStack(stackId: number): { cardUpdates: { cardId: number; faceUp: boolean }[] } | null {
    const stack = this.getStack(stackId)
    if (!stack || stack.cardIds.length === 0) return null

    // Only flip the top card (last in array)
    const topCardId = stack.cardIds[stack.cardIds.length - 1]
    const card = this.getCard(topCardId)
    if (!card) return null

    card.faceUp = !card.faceUp
    const cardUpdates = [{ cardId: card.id, faceUp: card.faceUp }]

    return { cardUpdates }
  }

  reorderStack(
    stackId: number,
    fromIndex: number,
    toIndex: number,
  ): { newOrder: number[]; cardUpdates: { cardId: number; x: number; y: number }[] } | null {
    const stack = this.getStack(stackId)
    if (!stack) return null
    if (fromIndex < 0 || fromIndex >= stack.cardIds.length) return null
    if (toIndex < 0 || toIndex >= stack.cardIds.length) return null

    // Move card from fromIndex to toIndex
    const [cardId] = stack.cardIds.splice(fromIndex, 1)
    stack.cardIds.splice(toIndex, 0, cardId)

    // Update card positions based on new order
    // (Client will recalculate based on zone layout, but we update server state)
    const cardUpdates: { cardId: number; x: number; y: number }[] = []
    for (let i = 0; i < stack.cardIds.length; i++) {
      const card = this.getCard(stack.cardIds[i])
      if (card) {
        // Basic stack position - client will override with zone layout
        card.x = stack.anchorX
        card.y = stack.anchorY + i * STACK_OFFSET_Y
        cardUpdates.push({ cardId: card.id, x: card.x, y: card.y })
      }
    }

    return { newOrder: stack.cardIds, cardUpdates }
  }

  // ============================================================================
  // Zone Operations
  // ============================================================================

  getZone(zoneId: number): ZoneState | undefined {
    return this.state.zones.find((z) => z.id === zoneId)
  }

  createZone(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    faceUp: boolean,
    visibility: 'public' | 'owner' | 'hidden' = 'public',
    ownerId: string | null = null,
    layout: 'stack' | 'row' | 'column' | 'grid' | 'fan' | 'circle' = 'stack',
    cardSettings: {
      cardScale: number
      cardSpacing: number
      randomOffset?: number
      randomRotation?: number
    } = { cardScale: 1.0, cardSpacing: 0.5 },
  ): ZoneState {
    const zone: ZoneState = {
      id: this.state.nextZoneId++,
      x,
      y,
      width,
      height,
      label,
      faceUp,
      locked: false,
      stackId: null,
      visibility,
      ownerId,
      layout,
      cardSettings,
    }

    this.state.zones.push(zone)
    return zone
  }

  updateZone(
    zoneId: number,
    updates: Partial<
      Pick<
        ZoneState,
        | 'x'
        | 'y'
        | 'width'
        | 'height'
        | 'label'
        | 'faceUp'
        | 'locked'
        | 'visibility'
        | 'ownerId'
        | 'layout'
        | 'cardSettings'
      >
    >,
  ): {
    zone: ZoneState
    stackUpdate?: { stackId: number; anchorX: number; anchorY: number }
    cardUpdates?: { cardId: number; x: number; y: number }[]
  } | null {
    const zone = this.getZone(zoneId)
    if (!zone) return null

    Object.assign(zone, updates)

    // If position changed and zone has a stack, update stack position
    let stackUpdate: { stackId: number; anchorX: number; anchorY: number } | undefined
    let cardUpdates: { cardId: number; x: number; y: number }[] | undefined

    if ((updates.x !== undefined || updates.y !== undefined) && zone.stackId !== null) {
      const centerX = zone.x + zone.width / 2
      const centerY = zone.y + zone.height / 2

      const result = this.moveStack(zone.stackId, centerX, centerY)
      if (result) {
        stackUpdate = { stackId: zone.stackId, anchorX: centerX, anchorY: centerY }
        cardUpdates = result.cardUpdates
      }
    }

    return { zone, stackUpdate, cardUpdates }
  }

  deleteZone(zoneId: number): {
    stackDeleted: number | null
    scatteredCards: { cardId: number; x: number; y: number }[]
  } | null {
    const zone = this.getZone(zoneId)
    if (!zone) return null

    let stackDeleted: number | null = null
    const scatteredCards: { cardId: number; x: number; y: number }[] = []

    // Handle stack in zone
    if (zone.stackId !== null) {
      const stack = this.getStack(zone.stackId)
      if (stack) {
        // Scatter cards around zone center
        for (let i = 0; i < stack.cardIds.length; i++) {
          const card = this.getCard(stack.cardIds[i])
          if (card) {
            card.stackId = null
            // Scatter with some offset
            card.x = zone.x + zone.width / 2 + (Math.random() - 0.5) * 50
            card.y = zone.y + zone.height / 2 + (Math.random() - 0.5) * 50
            card.z = ++this.state.zCounter
            scatteredCards.push({ cardId: card.id, x: card.x, y: card.y })
          }
        }
        stackDeleted = zone.stackId
        this.state.stacks = this.state.stacks.filter((s) => s.id !== zone.stackId)
      }
    }

    this.state.zones = this.state.zones.filter((z) => z.id !== zoneId)

    return { stackDeleted, scatteredCards }
  }

  addCardToZone(
    zoneId: number,
    cardId: number,
  ): {
    stackId: number
    stackCreated: boolean
    cardState: { cardId: number; x: number; y: number; z: number; faceUp: boolean }
  } | null {
    const zone = this.getZone(zoneId)
    const card = this.getCard(cardId)
    if (!zone || !card) return null

    const centerX = zone.x + zone.width / 2
    const centerY = zone.y + zone.height / 2

    let stackCreated = false

    // Create or add to zone stack
    if (zone.stackId === null) {
      const { stack } = this.createStack([cardId], centerX, centerY, 'zone', zoneId)
      zone.stackId = stack.id
      stackCreated = true
    } else {
      this.addCardToStack(zone.stackId, cardId, zone.faceUp)
    }

    // Apply zone's faceUp setting
    card.faceUp = zone.faceUp

    return {
      stackId: zone.stackId!,
      stackCreated,
      cardState: { cardId: card.id, x: card.x, y: card.y, z: card.z, faceUp: card.faceUp },
    }
  }

  // Bulk add cards to zone - more efficient than adding one at a time
  addCardsToZone(
    zoneId: number,
    cardIds: number[],
  ): {
    stackId: number
    stackCreated: boolean
    cardStates: { cardId: number; x: number; y: number; z: number; faceUp: boolean }[]
  } | null {
    const zone = this.getZone(zoneId)
    if (!zone) return null

    const centerX = zone.x + zone.width / 2
    const centerY = zone.y + zone.height / 2

    let stackCreated = false
    const cardStates: { cardId: number; x: number; y: number; z: number; faceUp: boolean }[] = []

    // Create zone stack if needed
    if (zone.stackId === null) {
      // Create stack with all cards at once
      const { stack, cardUpdates } = this.createStack(cardIds, centerX, centerY, 'zone', zoneId)
      zone.stackId = stack.id
      stackCreated = true

      // Apply zone's faceUp setting and collect card states
      for (const cardId of cardIds) {
        const card = this.getCard(cardId)
        if (card) {
          card.faceUp = zone.faceUp
          cardStates.push({ cardId: card.id, x: card.x, y: card.y, z: card.z, faceUp: card.faceUp })
        }
      }
    } else {
      // Add to existing stack
      const stack = this.getStack(zone.stackId)
      if (!stack) return null

      for (const cardId of cardIds) {
        const card = this.getCard(cardId)
        if (!card) continue

        // Remove from old stack if any
        if (card.stackId !== null) {
          this.removeCardFromStack(cardId)
        }

        // Add to zone stack
        stack.cardIds.push(cardId)
        card.stackId = stack.id
        card.x = stack.anchorX
        card.y = stack.anchorY + (stack.cardIds.length - 1) * STACK_OFFSET_Y
        card.z = ++this.state.zCounter
        card.faceUp = zone.faceUp

        cardStates.push({ cardId: card.id, x: card.x, y: card.y, z: card.z, faceUp: card.faceUp })
      }
    }

    return {
      stackId: zone.stackId!,
      stackCreated,
      cardStates,
    }
  }

  // ============================================================================
  // Hand Operations
  // ============================================================================

  getHand(playerId: string): HandState | undefined {
    return this.state.hands.find((h) => h.playerId === playerId)
  }

  getOrCreateHand(playerId: string): HandState {
    let hand = this.getHand(playerId)
    if (!hand) {
      hand = { playerId, cardIds: [] }
      this.state.hands.push(hand)
    }
    return hand
  }

  addCardToHand(playerId: string, cardId: number): CardState | null {
    const card = this.getCard(cardId)
    if (!card) return null

    // Remove from stack if in one
    if (card.stackId !== null) {
      this.removeCardFromStack(cardId)
    }

    const hand = this.getOrCreateHand(playerId)
    hand.cardIds.push(cardId)

    card.ownerId = playerId
    // Card position doesn't matter when in hand (client renders it locally)

    return card
  }

  removeCardFromHand(
    playerId: string,
    cardId: number,
    x: number,
    y: number,
    faceUp: boolean,
  ): CardState | null {
    const hand = this.getHand(playerId)
    const card = this.getCard(cardId)
    if (!hand || !card || card.ownerId !== playerId) return null

    hand.cardIds = hand.cardIds.filter((id) => id !== cardId)
    card.ownerId = null
    card.x = x
    card.y = y
    card.z = ++this.state.zCounter
    card.faceUp = faceUp

    return card
  }

  reorderHand(playerId: string, fromIndex: number, toIndex: number): number[] | null {
    const hand = this.getHand(playerId)
    if (!hand) return null
    if (fromIndex < 0 || fromIndex >= hand.cardIds.length) return null
    if (toIndex < 0 || toIndex >= hand.cardIds.length) return null

    const [cardId] = hand.cardIds.splice(fromIndex, 1)
    hand.cardIds.splice(toIndex, 0, cardId)

    return hand.cardIds
  }

  addStackToHand(
    playerId: string,
    stackId: number,
  ): { cardIds: number[]; newHand: number[] } | null {
    const stack = this.getStack(stackId)
    if (!stack) return null

    const hand = this.getOrCreateHand(playerId)
    const cardIds = [...stack.cardIds]

    // Add all cards to hand
    for (const cardId of cardIds) {
      const card = this.getCard(cardId)
      if (card) {
        card.stackId = null
        card.ownerId = playerId
        hand.cardIds.push(cardId)
      }
    }

    // Delete the stack
    this.state.stacks = this.state.stacks.filter((s) => s.id !== stackId)

    return { cardIds, newHand: hand.cardIds }
  }

  getHandCount(playerId: string): number {
    const hand = this.getHand(playerId)
    return hand?.cardIds.length ?? 0
  }

  // ============================================================================
  // Player Management
  // ============================================================================

  /**
   * Transfer hand ownership from old player ID to new player ID (for reconnection)
   */
  transferHandOwnership(oldPlayerId: string, newPlayerId: string): void {
    const hand = this.getHand(oldPlayerId)
    if (hand) {
      hand.playerId = newPlayerId
      // Update ownerId on all cards in hand
      for (const cardId of hand.cardIds) {
        const card = this.getCard(cardId)
        if (card) {
          card.ownerId = newPlayerId
        }
      }
    }
  }

  removePlayer(playerId: string): number[] {
    const hand = this.getHand(playerId)
    const cardIds = hand?.cardIds ?? []

    // Return cards to table
    for (const cardId of cardIds) {
      const card = this.getCard(cardId)
      if (card) {
        card.ownerId = null
        // Scatter cards somewhere visible
        card.x = 400 + (Math.random() - 0.5) * 100
        card.y = 300 + (Math.random() - 0.5) * 100
        card.z = ++this.state.zCounter
      }
    }

    // Remove hand
    this.state.hands = this.state.hands.filter((h) => h.playerId !== playerId)

    return cardIds
  }
}
