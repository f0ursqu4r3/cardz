import { computed, ref, type Ref } from 'vue'
import { defineStore } from 'pinia'
import type { CardData, Stack, Zone } from '@/types'
import {
  CARD_W,
  CARD_H,
  STACK_OFFSET_X,
  STACK_OFFSET_Y,
  ZONE_DEFAULT_WIDTH,
  ZONE_DEFAULT_HEIGHT,
  ZONE_MIN_WIDTH,
  ZONE_MIN_HEIGHT,
} from '@/types'
import type { GameState, CardState, StackState, ZoneState } from '../../shared/types'

export const useCardStore = defineStore('cards', () => {
  const cards = ref<CardData[]>([])
  const stacks = ref<Stack[]>([])
  const zones = ref<Zone[]>([])
  const selectedIds = ref<Set<number>>(new Set())
  const handCardIds = ref<number[]>([])
  const shufflingStackId = ref<number | null>(null)

  let nextStackId = 1
  let nextZoneId = 1
  let zCounter = 100

  // Hand helpers
  const handCards = computed(
    () =>
      handCardIds.value
        .map((id) => cards.value.find((c) => c.id === id))
        .filter(Boolean) as CardData[],
  )
  const handCount = computed(() => handCardIds.value.length)

  // Zone helpers
  const getZoneStack = (zoneId: number) => {
    const zone = zones.value.find((z) => z.id === zoneId)
    if (!zone || zone.stackId === null) return null
    return stacks.value.find((s) => s.id === zone.stackId) ?? null
  }

  const getZoneCardCount = (zoneId: number) => {
    const stack = getZoneStack(zoneId)
    return stack?.cardIds.length ?? 0
  }

  // Card creation
  const createCards = (count = 10, canvasWidth?: number, canvasHeight?: number) => {
    const maxLeft = Math.max(0, (canvasWidth ?? window.innerWidth) - 100)
    const maxTop = Math.max(0, (canvasHeight ?? window.innerHeight) - 150)

    cards.value = Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      col: Math.floor(Math.random() * 5),
      row: Math.floor(Math.random() * 5),
      x: Math.random() * maxLeft,
      y: Math.random() * maxTop,
      isInDeck: false,
      stackId: null,
      z: zCounter++,
      faceUp: true,
      inHand: false,
      lockedBy: null,
    }))
  }

  // Stack position management
  const updateStackPositions = (stack: Stack) => {
    // If stack belongs to a zone, position cards based on zone layout
    if (stack.kind === 'zone' && stack.zoneId !== undefined) {
      const zone = zones.value.find((z) => z.id === stack.zoneId)
      if (zone) {
        const layout = zone.layout || 'stack'
        const cardCount = stack.cardIds.length
        const settings = zone.cardSettings || { cardScale: 1.0, cardSpacing: 0.5 }
        const spacing = settings.cardSpacing // 0 to 1 range

        if (layout === 'stack') {
          // Original stack behavior - center cards
          const stackWidth = CARD_W + Math.max(0, cardCount - 1) * STACK_OFFSET_X
          const stackHeight = CARD_H + Math.max(0, cardCount - 1) * Math.abs(STACK_OFFSET_Y)
          stack.anchorX = zone.x + (zone.width - stackWidth) / 2
          stack.anchorY = zone.y + (zone.height - stackHeight) / 2

          stack.cardIds.forEach((id, idx) => {
            const card = cards.value.find((item) => item.id === id)
            if (!card) return
            card.stackId = stack.id
            card.isInDeck = true
            card.x = stack.anchorX + idx * STACK_OFFSET_X
            card.y = stack.anchorY + idx * STACK_OFFSET_Y
          })
        } else if (layout === 'row') {
          // Arrange cards horizontally with overlap (spacing controls overlap)
          const overlap = CARD_W * (1 - spacing) // Higher spacing = less overlap
          const totalWidth = CARD_W + Math.max(0, cardCount - 1) * overlap
          const startX = zone.x + (zone.width - totalWidth) / 2
          const startY = zone.y + (zone.height - CARD_H) / 2

          stack.anchorX = startX
          stack.anchorY = startY

          stack.cardIds.forEach((id, idx) => {
            const card = cards.value.find((item) => item.id === id)
            if (!card) return
            card.stackId = stack.id
            card.isInDeck = true
            card.x = startX + idx * overlap
            card.y = startY
          })
        } else if (layout === 'column') {
          // Arrange cards vertically with overlap (spacing controls overlap)
          const overlap = CARD_H * (0.15 + spacing * 0.5) // Range from 15% to 65%
          const totalHeight = CARD_H + Math.max(0, cardCount - 1) * overlap
          const startX = zone.x + (zone.width - CARD_W) / 2
          const startY = zone.y + (zone.height - totalHeight) / 2

          stack.anchorX = startX
          stack.anchorY = startY

          stack.cardIds.forEach((id, idx) => {
            const card = cards.value.find((item) => item.id === id)
            if (!card) return
            card.stackId = stack.id
            card.isInDeck = true
            card.x = startX
            card.y = startY + idx * overlap
          })
        } else if (layout === 'grid') {
          // Arrange cards in a grid (spacing controls gap)
          const gapX = CARD_W * (0.3 + spacing * 0.7) // Range from 30% to 100%
          const gapY = CARD_H * (0.2 + spacing * 0.6) // Range from 20% to 80%
          const cols = Math.max(1, Math.floor(zone.width / (CARD_W * 0.5 + gapX * 0.5)))
          const rows = Math.ceil(cardCount / cols)
          const totalWidth = CARD_W + Math.max(0, cols - 1) * gapX
          const totalHeight = CARD_H + Math.max(0, rows - 1) * gapY
          const startX = zone.x + (zone.width - totalWidth) / 2
          const startY = zone.y + (zone.height - totalHeight) / 2

          stack.anchorX = startX
          stack.anchorY = startY

          stack.cardIds.forEach((id, idx) => {
            const card = cards.value.find((item) => item.id === id)
            if (!card) return
            card.stackId = stack.id
            card.isInDeck = true
            const col = idx % cols
            const row = Math.floor(idx / cols)
            card.x = startX + col * gapX
            card.y = startY + row * gapY
          })
        } else if (layout === 'fan') {
          // Arrange cards in a fan/arc pattern (spacing controls arc width)
          const centerX = zone.x + zone.width / 2
          const centerY = zone.y + zone.height + 50 // Center below the zone
          const radius = Math.max(80, zone.height * 0.8)
          const arcSpan = Math.min(Math.PI * (0.3 + spacing * 0.5), cardCount * 0.15) // Spacing affects arc width
          const startAngle = Math.PI / 2 + arcSpan / 2 // Start from left side
          const angleStep = cardCount > 1 ? arcSpan / (cardCount - 1) : 0

          stack.anchorX = centerX
          stack.anchorY = zone.y + zone.height / 2

          stack.cardIds.forEach((id, idx) => {
            const card = cards.value.find((item) => item.id === id)
            if (!card) return
            card.stackId = stack.id
            card.isInDeck = true
            const angle = startAngle - idx * angleStep
            card.x = centerX + Math.cos(angle) * radius - CARD_W / 2
            card.y = centerY - Math.sin(angle) * radius - CARD_H / 2
          })
        }
        return
      }
    }

    // Default free stack behavior
    stack.cardIds.forEach((id, idx) => {
      const card = cards.value.find((item) => item.id === id)
      if (!card) return
      card.stackId = stack.id
      card.isInDeck = true
      card.x = stack.anchorX + idx * STACK_OFFSET_X
      card.y = stack.anchorY + idx * STACK_OFFSET_Y
    })
  }

  const updateAllStacks = () => {
    stacks.value = stacks.value.filter((stack) => stack.cardIds.length > 0)
    // Update zone stackId references for empty stacks
    zones.value.forEach((zone) => {
      if (zone.stackId !== null && !stacks.value.find((s) => s.id === zone.stackId)) {
        zone.stackId = null
      }
    })
    stacks.value.forEach((stack) => updateStackPositions(stack))
  }

  // Stack operations
  const removeFromStack = (cardId: number) => {
    const card = cards.value.find((item) => item.id === cardId)
    if (!card || card.stackId === null) return

    const stack = stacks.value.find((item) => item.id === card.stackId)
    card.stackId = null
    card.isInDeck = false

    if (!stack) return

    stack.cardIds = stack.cardIds.filter((value) => value !== cardId)
    if (stack.cardIds.length === 0) {
      // Clear zone reference if this was a zone stack
      if (stack.zoneId !== undefined) {
        const zone = zones.value.find((z) => z.id === stack.zoneId)
        if (zone) zone.stackId = null
      }
      stacks.value = stacks.value.filter((item) => item.id !== stack.id)
    }
  }

  const addCardToStack = (cardId: number, stack: Stack) => {
    removeFromStack(cardId)

    const card = cards.value.find((c) => c.id === cardId)
    if (!card) return

    // If stack belongs to a zone, always use zone's faceUp setting
    if (stack.zoneId !== undefined) {
      const zone = zones.value.find((z) => z.id === stack.zoneId)
      if (zone) {
        card.faceUp = zone.faceUp
      }
    } else if (stack.cardIds.length > 0) {
      // Match faceUp value of existing cards in stack
      const firstCardInStack = cards.value.find((c) => c.id === stack.cardIds[0])
      if (firstCardInStack) {
        card.faceUp = firstCardInStack.faceUp
      }
    }

    if (!stack.cardIds.includes(cardId)) {
      stack.cardIds.push(cardId)
    }
    updateStackPositions(stack)
  }

  const createStackAt = (
    anchorX: number,
    anchorY: number,
    kind: Stack['kind'] = 'free',
    zoneId?: number,
  ): Stack => {
    const stack: Stack = {
      id: nextStackId++,
      anchorX,
      anchorY,
      cardIds: [],
      kind,
      zoneId,
      lockedBy: null,
    }
    stacks.value.push(stack)
    return stack
  }

  // Zone operations
  const createZone = (
    x: number,
    y: number,
    label = 'Deck',
    faceUp = false,
    width = ZONE_DEFAULT_WIDTH,
    height = ZONE_DEFAULT_HEIGHT,
    visibility: Zone['visibility'] = 'public',
    ownerId: string | null = null,
    layout: Zone['layout'] = 'stack',
    cardSettings: Zone['cardSettings'] = { cardScale: 1.0, cardSpacing: 0.5 },
  ): Zone => {
    const zone: Zone = {
      id: nextZoneId++,
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
    zones.value.push(zone)
    return zone
  }

  const deleteZone = (zoneId: number) => {
    const zone = zones.value.find((z) => z.id === zoneId)
    if (!zone) return

    // Remove associated stack and scatter cards
    if (zone.stackId !== null) {
      const stack = stacks.value.find((s) => s.id === zone.stackId)
      if (stack) {
        stack.cardIds.forEach((cardId) => {
          const card = cards.value.find((c) => c.id === cardId)
          if (card) {
            card.stackId = null
            card.isInDeck = false
          }
        })
        stacks.value = stacks.value.filter((s) => s.id !== zone.stackId)
      }
    }

    zones.value = zones.value.filter((z) => z.id !== zoneId)
  }

  const updateZone = (zoneId: number, updates: Partial<Omit<Zone, 'id' | 'stackId'>>) => {
    const zone = zones.value.find((z) => z.id === zoneId)
    if (!zone) return

    if (updates.x !== undefined) zone.x = updates.x
    if (updates.y !== undefined) zone.y = updates.y
    if (updates.width !== undefined) zone.width = Math.max(ZONE_MIN_WIDTH, updates.width)
    if (updates.height !== undefined) zone.height = Math.max(ZONE_MIN_HEIGHT, updates.height)
    if (updates.label !== undefined) zone.label = updates.label
    if (updates.faceUp !== undefined) zone.faceUp = updates.faceUp
    if (updates.locked !== undefined) zone.locked = updates.locked
    if (updates.visibility !== undefined) zone.visibility = updates.visibility
    if (updates.ownerId !== undefined) zone.ownerId = updates.ownerId
    if (updates.layout !== undefined) zone.layout = updates.layout
    if (updates.cardSettings !== undefined) zone.cardSettings = updates.cardSettings

    // Update stack positions if zone moved or layout/settings changed
    if (zone.stackId !== null) {
      const stack = stacks.value.find((s) => s.id === zone.stackId)
      if (stack) {
        updateStackPositions(stack)
      }
    }
  }

  const ensureZoneStack = (zoneId: number): Stack | null => {
    const zone = zones.value.find((z) => z.id === zoneId)
    if (!zone) return null

    if (zone.stackId !== null) {
      return stacks.value.find((s) => s.id === zone.stackId) ?? null
    }

    // Create new stack for zone
    const stack = createStackAt(zone.x + 8, zone.y + 8, 'zone', zoneId)
    zone.stackId = stack.id
    return stack
  }

  const addToZone = (cardId: number, zoneId: number): boolean => {
    const stack = ensureZoneStack(zoneId)
    if (!stack) return false
    addCardToStack(cardId, stack)
    return true
  }

  const stackCardOnTarget = (sourceId: number, targetId: number): boolean => {
    if (sourceId === targetId) return false

    const source = cards.value.find((item) => item.id === sourceId)
    const target = cards.value.find((item) => item.id === targetId)
    if (!source || !target) return false

    let stack =
      target.stackId !== null ? stacks.value.find((item) => item.id === target.stackId) : null

    if (!stack) {
      stack = createStackAt(target.x, target.y, 'free')
      stack.cardIds.push(target.id)
      target.stackId = stack.id
      target.isInDeck = true
    }

    addCardToStack(source.id, stack)
    return true
  }

  // Card z-index calculation
  const cardZ = (
    card: CardData,
    index: number,
    activeIndex: number | null,
    draggingStackId: number | null,
  ): number => {
    if (draggingStackId !== null && draggingStackId === card.stackId) {
      const stack = stacks.value.find((item) => item.id === draggingStackId)
      const pos = stack ? stack.cardIds.indexOf(card.id) : 0
      return 2000 + pos
    }

    if (activeIndex === index) {
      return 1900
    }

    const stack =
      card.stackId !== null ? stacks.value.find((item) => item.id === card.stackId) : null

    if (stack) {
      const stackIdx = stacks.value.findIndex((item) => item.id === stack.id)
      const pos = stack.cardIds.indexOf(card.id)
      return 1000 + stackIdx * 100 + pos
    }

    return 10 + card.z
  }

  const bumpCardZ = (cardId: number) => {
    const card = cards.value.find((c) => c.id === cardId)
    if (card) {
      card.z = ++zCounter
    }
  }

  // Flip a single card
  const flipCard = (cardId: number) => {
    const card = cards.value.find((c) => c.id === cardId)
    if (card) {
      card.faceUp = !card.faceUp
    }
  }

  // Flip all cards in a stack
  const flipStack = (stackId: number) => {
    const stack = stacks.value.find((s) => s.id === stackId)
    if (!stack) return
    stack.cardIds.forEach((id) => {
      const card = cards.value.find((c) => c.id === id)
      if (card) {
        card.faceUp = !card.faceUp
      }
    })
  }

  // Selection management
  const isSelected = (cardId: number) => selectedIds.value.has(cardId)

  const toggleSelect = (cardId: number) => {
    if (selectedIds.value.has(cardId)) {
      selectedIds.value.delete(cardId)
    } else {
      // Only allow selecting free cards (not in stacks)
      const card = cards.value.find((c) => c.id === cardId)
      if (card && card.stackId === null) {
        selectedIds.value.add(cardId)
      }
    }
  }

  const clearSelection = () => {
    selectedIds.value.clear()
  }

  const hasSelection = computed(() => selectedIds.value.size > 0)

  const selectionCount = computed(() => selectedIds.value.size)

  // Move all selected cards by delta
  const moveSelection = (deltaX: number, deltaY: number) => {
    selectedIds.value.forEach((id) => {
      const card = cards.value.find((c) => c.id === id)
      if (card) {
        card.x += deltaX
        card.y += deltaY
      }
    })
  }

  // Bump z-index of all selected cards
  const bumpSelectionZ = () => {
    selectedIds.value.forEach((id) => {
      const card = cards.value.find((c) => c.id === id)
      if (card) {
        card.z = ++zCounter
      }
    })
  }

  // Get selected card IDs as array
  const getSelectedIds = () => Array.from(selectedIds.value)

  // Stack all selected cards at a position
  const stackSelection = (anchorX: number, anchorY: number) => {
    if (selectedIds.value.size < 2) return null

    const stack = createStackAt(anchorX, anchorY, 'free')
    const ids = Array.from(selectedIds.value)

    ids.forEach((id) => {
      const card = cards.value.find((c) => c.id === id)
      if (card) {
        stack.cardIds.push(id)
        card.stackId = stack.id
        card.isInDeck = true
      }
    })

    updateStackPositions(stack)
    clearSelection()
    return stack
  }

  // Merge source stack into target stack
  const mergeStacks = (sourceStackId: number, targetStackId: number): boolean => {
    if (sourceStackId === targetStackId) return false

    const sourceStack = stacks.value.find((s) => s.id === sourceStackId)
    const targetStack = stacks.value.find((s) => s.id === targetStackId)
    if (!sourceStack || !targetStack) return false

    // Move all cards from source to target
    const cardIdsToMove = [...sourceStack.cardIds]
    cardIdsToMove.forEach((id) => {
      const card = cards.value.find((c) => c.id === id)
      if (card) {
        card.stackId = targetStack.id
        targetStack.cardIds.push(id)
      }
    })

    // Remove source stack
    sourceStack.cardIds = []
    stacks.value = stacks.value.filter((s) => s.id !== sourceStackId)

    updateStackPositions(targetStack)
    return true
  }

  // Shuffle cards in a stack (Fisher-Yates)
  const shuffleStack = (stackId: number) => {
    const stack = stacks.value.find((s) => s.id === stackId)
    if (!stack || stack.cardIds.length < 2) return

    // Set shuffling state for animation
    shufflingStackId.value = stackId

    const arr = stack.cardIds
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const temp = arr[i]
      arr[i] = arr[j]!
      arr[j] = temp!
    }

    updateStackPositions(stack)

    // Clear shuffling state after animation completes
    setTimeout(() => {
      shufflingStackId.value = null
    }, 300)
  }

  // Hand operations
  const addToHand = (cardId: number) => {
    const card = cards.value.find((c) => c.id === cardId)
    if (!card) return false

    // Remove from stack if in one
    removeFromStack(cardId)

    // Remove from selection if selected
    selectedIds.value.delete(cardId)

    // Add to hand if not already there
    if (!handCardIds.value.includes(cardId)) {
      handCardIds.value.push(cardId)
      card.inHand = true
      card.faceUp = true // Cards in hand are always face up to the player
    }
    return true
  }

  const removeFromHand = (cardId: number) => {
    const idx = handCardIds.value.indexOf(cardId)
    if (idx === -1) return false

    handCardIds.value.splice(idx, 1)
    const card = cards.value.find((c) => c.id === cardId)
    if (card) {
      card.inHand = false
    }
    return true
  }

  const reorderHand = (fromIndex: number, toIndex: number) => {
    if (fromIndex < 0 || fromIndex >= handCardIds.value.length) return
    if (toIndex < 0 || toIndex >= handCardIds.value.length) return

    const [cardId] = handCardIds.value.splice(fromIndex, 1)
    if (cardId !== undefined) {
      handCardIds.value.splice(toIndex, 0, cardId)
    }
  }

  // Add all cards from a stack to hand
  const addStackToHand = (stackId: number) => {
    const stack = stacks.value.find((s) => s.id === stackId)
    if (!stack) return false

    // Get all card IDs from the stack (copy to avoid mutation issues)
    const cardIdsToAdd = [...stack.cardIds]

    // Add each card to hand (addToHand handles removing from stack)
    cardIdsToAdd.forEach((id) => addToHand(id))

    return true
  }

  // ============================================================================
  // Server State Sync
  // ============================================================================

  // Convert server CardState to local CardData
  const cardStateToCardData = (state: CardState): CardData => ({
    id: state.id,
    col: state.col,
    row: state.row,
    x: state.x,
    y: state.y,
    z: state.z,
    faceUp: state.faceUp,
    stackId: state.stackId,
    isInDeck: state.stackId !== null,
    inHand: state.ownerId !== null,
    lockedBy: state.lockedBy,
  })

  // Convert server StackState to local Stack
  const stackStateToStack = (state: StackState): Stack => ({
    id: state.id,
    cardIds: state.cardIds,
    anchorX: state.anchorX,
    anchorY: state.anchorY,
    kind: state.kind,
    zoneId: state.zoneId,
    lockedBy: state.lockedBy,
  })

  // Convert server ZoneState to local Zone
  const zoneStateToZone = (state: ZoneState): Zone => ({
    id: state.id,
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    label: state.label,
    faceUp: state.faceUp,
    locked: state.locked,
    stackId: state.stackId,
    visibility: state.visibility ?? 'public',
    ownerId: state.ownerId ?? null,
    layout: state.layout ?? 'stack',
    cardSettings: state.cardSettings ?? { cardScale: 1.0, cardSpacing: 0.5 },
  })

  // Sync entire game state from server
  const syncFromServer = (state: GameState, myHandCardIds: number[]) => {
    cards.value = state.cards.map(cardStateToCardData)
    stacks.value = state.stacks.map(stackStateToStack)
    zones.value = state.zones.map(zoneStateToZone)

    // Preserve local hand order if the same cards exist (just reordered)
    // Only update if cards have actually been added/removed
    const currentSet = new Set(handCardIds.value)
    const serverSet = new Set(myHandCardIds)
    const sameCards =
      currentSet.size === serverSet.size && [...currentSet].every((id) => serverSet.has(id))

    if (!sameCards) {
      // Cards changed - use server's order
      handCardIds.value = myHandCardIds
    }
    // If same cards, keep local order to preserve recent reordering

    // Update counters to prevent ID conflicts
    nextStackId = state.nextStackId
    nextZoneId = state.nextZoneId
    zCounter = state.zCounter
  }

  // Update a single card from server
  const updateCardFromServer = (cardId: number, updates: Partial<CardState>) => {
    const card = cards.value.find((c) => c.id === cardId)
    if (!card) return

    if (updates.x !== undefined) card.x = updates.x
    if (updates.y !== undefined) card.y = updates.y
    if (updates.z !== undefined) card.z = updates.z
    if (updates.faceUp !== undefined) card.faceUp = updates.faceUp
    if (updates.stackId !== undefined) {
      card.stackId = updates.stackId
      card.isInDeck = updates.stackId !== null
    }
    if (updates.ownerId !== undefined) {
      card.inHand = updates.ownerId !== null
    }
    if (updates.lockedBy !== undefined) {
      card.lockedBy = updates.lockedBy
    }
  }

  // Update a single stack from server
  const updateStackFromServer = (stackId: number, updates: Partial<StackState>) => {
    const stack = stacks.value.find((s) => s.id === stackId)
    if (!stack) return

    if (updates.cardIds !== undefined) stack.cardIds = updates.cardIds
    if (updates.anchorX !== undefined) stack.anchorX = updates.anchorX
    if (updates.anchorY !== undefined) stack.anchorY = updates.anchorY
    if (updates.kind !== undefined) stack.kind = updates.kind
    if (updates.zoneId !== undefined) stack.zoneId = updates.zoneId
    if (updates.lockedBy !== undefined) stack.lockedBy = updates.lockedBy
  }

  // Add a stack from server
  const addStackFromServer = (state: StackState) => {
    const existing = stacks.value.find((s) => s.id === state.id)
    if (existing) {
      Object.assign(existing, stackStateToStack(state))
    } else {
      stacks.value.push(stackStateToStack(state))
    }
  }

  // Remove a stack
  const removeStack = (stackId: number) => {
    stacks.value = stacks.value.filter((s) => s.id !== stackId)
  }

  // Update a single zone from server
  const updateZoneFromServer = (zoneId: number, updates: Partial<ZoneState>) => {
    const zone = zones.value.find((z) => z.id === zoneId)
    if (!zone) return

    if (updates.x !== undefined) zone.x = updates.x
    if (updates.y !== undefined) zone.y = updates.y
    if (updates.width !== undefined) zone.width = updates.width
    if (updates.height !== undefined) zone.height = updates.height
    if (updates.label !== undefined) zone.label = updates.label
    if (updates.faceUp !== undefined) zone.faceUp = updates.faceUp
    if (updates.locked !== undefined) zone.locked = updates.locked
    if (updates.stackId !== undefined) zone.stackId = updates.stackId
    if (updates.visibility !== undefined) zone.visibility = updates.visibility
    if (updates.ownerId !== undefined) zone.ownerId = updates.ownerId
    if (updates.layout !== undefined) zone.layout = updates.layout
    if (updates.cardSettings !== undefined) zone.cardSettings = updates.cardSettings
  }

  // Add a zone from server
  const addZoneFromServer = (state: ZoneState) => {
    const existing = zones.value.find((z) => z.id === state.id)
    if (existing) {
      Object.assign(existing, zoneStateToZone(state))
    } else {
      zones.value.push(zoneStateToZone(state))
    }
  }

  // Remove a zone (without local side effects)
  const removeZone = (zoneId: number) => {
    zones.value = zones.value.filter((z) => z.id !== zoneId)
  }

  // Set hand card IDs from server (only updates OUR hand, doesn't touch other players' cards)
  const setHandCardIds = (ids: number[]) => {
    const prevIds = new Set(handCardIds.value)
    const newIds = new Set(ids)

    handCardIds.value = ids

    // Only update inHand for cards that moved in/out of OUR hand
    // Cards that were in our hand but aren't anymore -> inHand = false
    cards.value.forEach((card) => {
      if (prevIds.has(card.id) && !newIds.has(card.id)) {
        card.inHand = false
      } else if (!prevIds.has(card.id) && newIds.has(card.id)) {
        card.inHand = true
      }
    })
  }

  return {
    cards,
    stacks,
    zones,
    selectedIds,
    createCards,
    updateStackPositions,
    updateAllStacks,
    removeFromStack,
    addCardToStack,
    createStackAt,
    stackCardOnTarget,
    // Zone operations
    getZoneStack,
    getZoneCardCount,
    createZone,
    deleteZone,
    updateZone,
    ensureZoneStack,
    addToZone,
    // Card operations
    cardZ,
    bumpCardZ,
    flipCard,
    flipStack,
    isSelected,
    toggleSelect,
    clearSelection,
    hasSelection,
    selectionCount,
    moveSelection,
    bumpSelectionZ,
    getSelectedIds,
    stackSelection,
    mergeStacks,
    shuffleStack,
    shufflingStackId,
    handCardIds,
    handCards,
    handCount,
    addToHand,
    removeFromHand,
    reorderHand,
    addStackToHand,
    // Server sync operations
    syncFromServer,
    updateCardFromServer,
    updateStackFromServer,
    addStackFromServer,
    removeStack,
    updateZoneFromServer,
    addZoneFromServer,
    removeZone,
    setHandCardIds,
  }
})
