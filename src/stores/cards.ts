import { STACK_MAX_VISUAL_DEPTH } from './../types/index'
import { computed, ref, type Ref } from 'vue'
import { defineStore } from 'pinia'
import type { CardData, Stack, Zone, Counter, Token, Die, DieValue, Timer, TimerMode, TimerStatus } from '@/types'
import {
  CARD_W,
  CARD_H,
  STACK_OFFSET_X,
  STACK_OFFSET_Y,
  ZONE_DEFAULT_WIDTH,
  ZONE_DEFAULT_HEIGHT,
  ZONE_MIN_WIDTH,
  ZONE_MIN_HEIGHT,
  FLIP_ANIMATION_MS,
  FLIP_MIDPOINT_MS,
} from '@/types'
import type { GameState, CardState, StackState, ZoneState, CounterState, TokenState, DieState, TimerState } from '../../shared/types'
import { getCardPositionInZone } from '@/utils/zoneLayouts'

export const useCardStore = defineStore('cards', () => {
  const cards = ref<CardData[]>([])
  const stacks = ref<Stack[]>([])
  const zones = ref<Zone[]>([])
  const counters = ref<Counter[]>([])
  const tokens = ref<Token[]>([])
  const dice = ref<Die[]>([])
  const timers = ref<Timer[]>([])
  const selectedIds = ref<Set<number>>(new Set())
  // Remote player selections: Map<playerId, { cardIds: Set<number>, color: string }>
  const remoteSelections = ref<Map<string, { cardIds: Set<number>; color: string }>>(new Map())
  // Dice selection
  const selectedDieIds = ref<Set<number>>(new Set())
  const handCardIds = ref<number[]>([])
  const shufflingStackId = ref<number | null>(null)
  // Cards currently playing flip animation
  const flippingCardIds = ref<Set<number>>(new Set())

  let nextStackId = 1
  let nextZoneId = 1
  let nextCounterId = 1
  let nextTokenId = 1
  let nextDieId = 1
  let nextTimerId = 1
  let zCounter = 100

  // O(1) lookup Maps - avoids O(n) array.find() calls
  const cardById = computed(() => {
    const map = new Map<number, CardData>()
    for (const card of cards.value) {
      map.set(card.id, card)
    }
    return map
  })

  const stackById = computed(() => {
    const map = new Map<number, Stack>()
    for (const stack of stacks.value) {
      map.set(stack.id, stack)
    }
    return map
  })

  const zoneById = computed(() => {
    const map = new Map<number, Zone>()
    for (const zone of zones.value) {
      map.set(zone.id, zone)
    }
    return map
  })

  const counterById = computed(() => {
    const map = new Map<number, Counter>()
    for (const counter of counters.value) {
      map.set(counter.id, counter)
    }
    return map
  })

  const tokenById = computed(() => {
    const map = new Map<number, Token>()
    for (const token of tokens.value) {
      map.set(token.id, token)
    }
    return map
  })

  const dieById = computed(() => {
    const map = new Map<number, Die>()
    for (const die of dice.value) {
      map.set(die.id, die)
    }
    return map
  })

  const timerById = computed(() => {
    const map = new Map<number, Timer>()
    for (const timer of timers.value) {
      map.set(timer.id, timer)
    }
    return map
  })

  // Helper functions for O(1) lookups
  const getCardById = (id: number): CardData | undefined => cardById.value.get(id)
  const getStackById = (id: number): Stack | undefined => stackById.value.get(id)
  const getZoneById = (id: number): Zone | undefined => zoneById.value.get(id)
  const getCounterById = (id: number): Counter | undefined => counterById.value.get(id)
  const getTokenById = (id: number): Token | undefined => tokenById.value.get(id)
  const getDieById = (id: number): Die | undefined => dieById.value.get(id)
  const getTimerById = (id: number): Timer | undefined => timerById.value.get(id)

  // Hand helpers
  const handCards = computed(
    () =>
      handCardIds.value
        .map((id) => cardById.value.get(id))
        .filter(Boolean) as CardData[],
  )
  const handCount = computed(() => handCardIds.value.length)

  // Zone helpers
  const getZoneStack = (zoneId: number) => {
    const zone = zoneById.value.get(zoneId)
    if (!zone || zone.stackId === null) return null
    return stackById.value.get(zone.stackId) ?? null
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
      const zone = zoneById.value.get(stack.zoneId)
      if (zone) {
        const layout = zone.layout || 'stack'
        const cardCount = stack.cardIds.length
        const settings = zone.cardSettings || { cardScale: 1.0, cardSpacing: 0.5 }
        const spacing = settings.cardSpacing // 0 to 1 range
        const randomOffset = settings.randomOffset ?? 0
        const randomRotation = settings.randomRotation ?? 0

        // Spacing interpretation:
        // 0.0 = maximum overlap (cards stacked tightly, ~30% visible)
        // 0.5 = edge-to-edge (no gap, no overlap)
        // 1.0 = maximum spread (gaps between cards)
        // This maps spacing to a multiplier: 0->0.3, 0.5->1.0, 1.0->1.7
        const spacingMultiplier = spacing < 0.5 ? 0.3 + spacing * 1.4 : 1.0 + (spacing - 0.5) * 1.4

        // Helper to apply random offset and rotation to a card
        const applyRandomization = (
          card: CardData,
          baseX: number,
          baseY: number,
          baseRot: number,
        ) => {
          // Use card ID as seed for consistent randomization
          const seed = card.id * 1000
          const pseudoRandom1 = Math.sin(seed) * 10000
          const pseudoRandom2 = Math.sin(seed + 1) * 10000
          const pseudoRandom3 = Math.sin(seed + 2) * 10000

          const offsetX =
            randomOffset > 0 ? (pseudoRandom1 % 1) * randomOffset * 2 - randomOffset : 0
          const offsetY =
            randomOffset > 0 ? (pseudoRandom2 % 1) * randomOffset * 2 - randomOffset : 0
          const rotOffset =
            randomRotation > 0 ? (pseudoRandom3 % 1) * randomRotation * 2 - randomRotation : 0

          card.x = baseX + offsetX
          card.y = baseY + offsetY
          card.rotation = baseRot + rotOffset
        }

        if (layout === 'stack') {
          // Stack layout - center the stack visually in the zone
          const stackCardCount = stack.cardIds.length
          // Stack grows upward (negative Y offset), so calculate total visual height
          const totalOffsetY = Math.max(0, stackCardCount - 1) * Math.abs(STACK_OFFSET_Y)
          // Center the card (not the anchor) in the zone
          const centerX = zone.x + (zone.width - CARD_W) / 2
          const centerY = zone.y + (zone.height - CARD_H) / 2
          // Anchor is at the bottom card, offset upward by half the stack's visual depth
          stack.anchorX = centerX
          stack.anchorY = centerY + totalOffsetY / 2

          stack.cardIds.forEach((id, idx) => {
            const card = cardById.value.get(id)
            if (!card) return
            card.stackId = stack.id
            card.isInDeck = true
            card.x = stack.anchorX + idx * STACK_OFFSET_X
            card.y = stack.anchorY + idx * STACK_OFFSET_Y
            card.rotation = 0
          })
        } else if (layout === 'row') {
          // Arrange cards horizontally
          // At spacingMultiplier=1.0, step=CARD_W (edge-to-edge)
          const step = CARD_W * spacingMultiplier
          const totalWidth = CARD_W + Math.max(0, cardCount - 1) * step
          const startX = zone.x + (zone.width - totalWidth) / 2
          const startY = zone.y + (zone.height - CARD_H) / 2

          stack.anchorX = startX
          stack.anchorY = startY

          stack.cardIds.forEach((id, idx) => {
            const card = cardById.value.get(id)
            if (!card) return
            card.stackId = stack.id
            card.isInDeck = true
            const baseX = startX + idx * step
            applyRandomization(card, baseX, startY, 0)
          })
        } else if (layout === 'column') {
          // Arrange cards vertically
          // At spacingMultiplier=1.0, step=CARD_H (edge-to-edge)
          const step = CARD_H * spacingMultiplier
          const totalHeight = CARD_H + Math.max(0, cardCount - 1) * step
          const startX = zone.x + (zone.width - CARD_W) / 2
          const startY = zone.y + (zone.height - totalHeight) / 2

          stack.anchorX = startX
          stack.anchorY = startY

          stack.cardIds.forEach((id, idx) => {
            const card = cardById.value.get(id)
            if (!card) return
            card.stackId = stack.id
            card.isInDeck = true
            const baseY = startY + idx * step
            applyRandomization(card, startX, baseY, 0)
          })
        } else if (layout === 'grid') {
          // Arrange cards in a grid, keeping it as square as possible
          // At spacingMultiplier=1.0, gaps equal card dimensions (edge-to-edge)
          const gapX = CARD_W * spacingMultiplier
          const gapY = CARD_H * spacingMultiplier

          // Calculate ideal square grid dimensions
          const sqrtCount = Math.sqrt(cardCount)
          let cols = Math.ceil(sqrtCount)
          let rows = Math.ceil(cardCount / cols)

          // Adjust to fit within zone bounds if needed
          const maxCols = Math.max(1, Math.floor((zone.width + gapX - CARD_W) / gapX))
          const maxRows = Math.max(1, Math.floor((zone.height + gapY - CARD_H) / gapY))

          if (cols > maxCols) {
            cols = maxCols
            rows = Math.ceil(cardCount / cols)
          }
          if (rows > maxRows) {
            rows = maxRows
            cols = Math.ceil(cardCount / rows)
          }

          // Ensure at least 1 column
          cols = Math.max(1, cols)
          rows = Math.ceil(cardCount / cols)

          const totalWidth = CARD_W + Math.max(0, cols - 1) * gapX
          const totalHeight = CARD_H + Math.max(0, rows - 1) * gapY
          const startX = zone.x + (zone.width - totalWidth) / 2
          const startY = zone.y + (zone.height - totalHeight) / 2

          stack.anchorX = startX
          stack.anchorY = startY

          stack.cardIds.forEach((id, idx) => {
            const card = cardById.value.get(id)
            if (!card) return
            card.stackId = stack.id
            card.isInDeck = true
            const col = idx % cols
            const row = Math.floor(idx / cols)
            const baseX = startX + col * gapX
            const baseY = startY + row * gapY
            applyRandomization(card, baseX, baseY, 0)
          })
        } else if (layout === 'fan') {
          // Arrange cards in a fan/arc pattern (like holding cards in hand)
          // Arc center is below the visible area so cards fan upward
          const zoneCenterX = zone.x + zone.width / 2
          const zoneCenterY = zone.y + zone.height / 2
          const radius = Math.max(150, zone.height * 1.5)
          // Arc span scales with spacing: tight=narrow fan, spread=wide fan
          const baseArcSpan = Math.PI * 0.3 * spacingMultiplier
          const arcSpan = Math.min(baseArcSpan, cardCount * 0.12) // Cap based on card count
          const startAngle = Math.PI / 2 + arcSpan / 2 // Start from left side
          const angleStep = cardCount > 1 ? arcSpan / (cardCount - 1) : 0

          // Position arc center below the zone center so the top of the arc is centered
          const arcCenterX = zoneCenterX
          const arcCenterY = zoneCenterY + radius - CARD_H / 2

          stack.anchorX = zoneCenterX
          stack.anchorY = zoneCenterY

          stack.cardIds.forEach((id, idx) => {
            const card = cardById.value.get(id)
            if (!card) return
            card.stackId = stack.id
            card.isInDeck = true
            const angle = startAngle - idx * angleStep
            const baseX = arcCenterX + Math.cos(angle) * radius - CARD_W / 2
            const baseY = arcCenterY - Math.sin(angle) * radius - CARD_H / 2
            // Fan cards rotate to follow the arc (perpendicular to radius)
            // At angle PI/2 (top), rotation should be 0
            // Cards to the left rotate clockwise (negative), cards to the right rotate counter-clockwise (positive)
            const fanRotation = (Math.PI / 2 - angle) * (180 / Math.PI)
            applyRandomization(card, baseX, baseY, fanRotation)
          })
        } else if (layout === 'circle') {
          // Arrange cards in a circle pattern with a gap at the bottom
          const centerX = zone.x + zone.width / 2
          const centerY = zone.y + zone.height / 2
          // Spacing affects radius - tighter = smaller circle, spread = larger circle
          const baseRadius = Math.min(zone.width, zone.height) / 2 - CARD_W / 2 - 10
          const radius = baseRadius * spacingMultiplier
          // Use ~330 degrees (11/12 of circle) to leave a gap at the bottom
          const arcSpan = Math.PI * 2 * (11 / 12)
          const angleStep = cardCount > 1 ? arcSpan / (cardCount - 1) : 0
          const startAngle = -Math.PI / 2 - arcSpan / 2 // Center the arc at top

          stack.anchorX = centerX
          stack.anchorY = centerY

          stack.cardIds.forEach((id, idx) => {
            const card = cardById.value.get(id)
            if (!card) return
            card.stackId = stack.id
            card.isInDeck = true
            const angle = startAngle + idx * angleStep
            const baseX = centerX + Math.cos(angle) * radius - CARD_W / 2
            const baseY = centerY + Math.sin(angle) * radius - CARD_H / 2
            // Circle cards can optionally rotate to face outward
            const circleRotation = (angle + Math.PI / 2) * (180 / Math.PI)
            applyRandomization(card, baseX, baseY, circleRotation)
          })
        }
        return
      }
    }

    // Default free stack behavior
    stack.cardIds.forEach((id, idx) => {
      const card = cardById.value.get(id)
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
      if (zone.stackId !== null && !stackById.value.get(zone.stackId!)) {
        zone.stackId = null
      }
    })
    stacks.value.forEach((stack) => updateStackPositions(stack))
  }

  // Calculate position for a card at a given index in a zone layout (for ghost card)
  const getZoneCardPosition = (
    zoneId: number,
    cardIndex: number,
    cardCount: number,
  ): { x: number; y: number; rotation: number } | null => {
    const zone = zoneById.value.get(zoneId)
    if (!zone) return null
    return getCardPositionInZone(zone, cardIndex, cardCount)
  }

  // Stack operations
  const removeFromStack = (cardId: number): void => {
    const card = cardById.value.get(cardId)
    if (!card || card.stackId === null) return

    const stack = stackById.value.get(card.stackId)
    card.stackId = null
    card.isInDeck = false
    card.rotation = 0 // Clear any layout rotation

    if (!stack) return

    stack.cardIds = stack.cardIds.filter((value) => value !== cardId)
    if (stack.cardIds.length === 0) {
      // Clear zone reference if this was a zone stack
      if (stack.zoneId !== undefined) {
        const zone = zoneById.value.get(stack.zoneId!)
        if (zone) zone.stackId = null
      }
      stacks.value = stacks.value.filter((item) => item.id !== stack.id)
    } else {
      // Update remaining cards positions
      updateStackPositions(stack)
    }
  }

  const addCardToStack = (cardId: number, stack: Stack) => {
    removeFromStack(cardId)

    const card = cardById.value.get(cardId)
    if (!card) return

    // If stack belongs to a zone, always use zone's faceUp setting
    if (stack.zoneId !== undefined) {
      const zone = zoneById.value.get(stack.zoneId!)
      if (zone) {
        card.faceUp = zone.faceUp
      }
    }
    // For non-zone stacks, preserve the card's current faceUp state (allow mixed)

    if (!stack.cardIds.includes(cardId)) {
      stack.cardIds.push(cardId)
    }
    updateStackPositions(stack)
  }

  // Bulk add cards to a stack - more efficient than calling addCardToStack repeatedly
  const addCardsToStack = (cardIds: number[], stack: Stack) => {
    // Build a map for faster card lookups
    const cardMap = new Map(cards.value.map((c) => [c.id, c]))

    // Get zone faceUp setting if applicable
    let zoneFaceUp: boolean | undefined
    if (stack.zoneId !== undefined) {
      const zone = zoneById.value.get(stack.zoneId!)
      if (zone) {
        zoneFaceUp = zone.faceUp
      }
    }

    // Remove all cards from their current stacks first
    for (const cardId of cardIds) {
      const card = cardMap.get(cardId)
      if (card && card.stackId !== null) {
        const oldStack = stackById.value.get(card.stackId)
        if (oldStack) {
          oldStack.cardIds = oldStack.cardIds.filter((id) => id !== cardId)
          card.stackId = null
          card.isInDeck = false
          // Clean up empty stacks
          if (oldStack.cardIds.length === 0) {
            if (oldStack.zoneId !== undefined) {
              const oldZone = zoneById.value.get(oldStack.zoneId)
              if (oldZone) oldZone.stackId = null
            }
            stacks.value = stacks.value.filter((s) => s.id !== oldStack.id)
          }
        }
      }
    }

    // Add all cards to the target stack
    for (const cardId of cardIds) {
      const card = cardMap.get(cardId)
      if (!card) continue

      if (zoneFaceUp !== undefined) {
        card.faceUp = zoneFaceUp
      }

      if (!stack.cardIds.includes(cardId)) {
        stack.cardIds.push(cardId)
      }
    }

    // Update positions once at the end
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
    cardSettings: Zone['cardSettings'] = {
      cardScale: 1.0,
      cardSpacing: 0.5,
      randomOffset: 0,
      randomRotation: 0,
    },
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
    const zone = zoneById.value.get(zoneId)
    if (!zone) return

    // Remove associated stack and scatter cards
    if (zone.stackId !== null) {
      const stack = stackById.value.get(zone.stackId!)
      if (stack) {
        stack.cardIds.forEach((cardId) => {
          const card = cardById.value.get(cardId)
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
    const zone = zoneById.value.get(zoneId)
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
      const stack = stackById.value.get(zone.stackId!)
      if (stack) {
        updateStackPositions(stack)
      }
    }
  }

  const ensureZoneStack = (zoneId: number): Stack | null => {
    const zone = zoneById.value.get(zoneId)
    if (!zone) return null

    if (zone.stackId !== null) {
      return stackById.value.get(zone.stackId!) ?? null
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

  // Bulk add multiple cards to a zone - much more efficient for large stacks
  const addManyToZone = (cardIds: number[], zoneId: number): boolean => {
    const stack = ensureZoneStack(zoneId)
    if (!stack) return false
    addCardsToStack(cardIds, stack)
    return true
  }

  const stackCardOnTarget = (sourceId: number, targetId: number): boolean => {
    if (sourceId === targetId) return false

    const source = cardById.value.get(sourceId)
    const target = cardById.value.get(targetId)
    if (!source || !target) return false

    let stack =
      target.stackId !== null ? stackById.value.get(target.stackId) ?? null : null

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
    playerId: string | null = null,
  ): number => {
    // Dragging stack cards: highest priority
    if (draggingStackId !== null && draggingStackId === card.stackId) {
      const stack = stackById.value.get(draggingStackId)
      const pos = stack ? stack.cardIds.indexOf(card.id) : 0
      return 12000 + pos
    }

    // Active single card being dragged
    if (activeIndex === index) {
      return 11000
    }

    // Check if card is locked by another player (card-level or stack-level lock)
    const isLockedByOther =
      (card.lockedBy && card.lockedBy !== playerId) ||
      (card.stackId !== null &&
        stackById.value.get(card.stackId)?.lockedBy !== undefined &&
        stackById.value.get(card.stackId)?.lockedBy !== playerId)

    if (isLockedByOther) {
      const stack =
        card.stackId !== null ? stackById.value.get(card.stackId) ?? null : null
      const pos = stack ? stack.cardIds.indexOf(card.id) : 0
      return 10000 + pos
    }

    // Cards in stacks: use stack id + position within stack
    const stack =
      card.stackId !== null ? stackById.value.get(card.stackId) ?? null : null

    if (stack) {
      const pos = stack.cardIds.indexOf(card.id)
      // Stack id provides inter-stack ordering, pos for intra-stack
      return 1000 + stack.id + pos
    }

    // Free cards: use card's z property
    return 100 + card.z
  }

  const bumpCardZ = (cardId: number) => {
    const card = cardById.value.get(cardId)
    if (card) {
      card.z = ++zCounter
    }
  }

  // Flip a single card
  const flipCard = (cardId: number) => {
    const card = cardById.value.get(cardId)
    if (card) {
      card.faceUp = !card.faceUp
    }
  }

  // Flip the top card in a stack
  const flipStack = (stackId: number) => {
    const stack = stackById.value.get(stackId)
    if (!stack || stack.cardIds.length === 0) return
    // Top card is the last one in the array
    const topCardId = stack.cardIds[stack.cardIds.length - 1]
    if (topCardId === undefined) return
    const card = cardById.value.get(topCardId)
    if (card) {
      card.faceUp = !card.faceUp
    }
  }

  // Check if a card is currently playing flip animation
  const isFlipping = (cardId: number) => flippingCardIds.value.has(cardId)

  // Start flip animation for a card (swaps sprite at midpoint)
  const startFlipAnimation = (cardId: number) => {
    const card = cardById.value.get(cardId)
    if (!card || flippingCardIds.value.has(cardId)) return

    flippingCardIds.value.add(cardId)

    // At midpoint (90 degrees), swap the faceUp state to change sprite
    setTimeout(() => {
      const c = cardById.value.get(cardId)
      if (c) c.faceUp = !c.faceUp
    }, FLIP_MIDPOINT_MS)

    // After animation completes, remove from flipping set
    setTimeout(() => {
      flippingCardIds.value.delete(cardId)
    }, FLIP_ANIMATION_MS)
  }

  // Flip a card with animation (for local user actions)
  const flipCardAnimated = (cardId: number) => {
    startFlipAnimation(cardId)
  }

  // Flip top card in stack with animation
  const flipStackAnimated = (stackId: number) => {
    const stack = stackById.value.get(stackId)
    if (!stack || stack.cardIds.length === 0) return
    const topCardId = stack.cardIds[stack.cardIds.length - 1]
    if (topCardId !== undefined) {
      startFlipAnimation(topCardId)
    }
  }

  // Handle remote flip event (animate to target state)
  const handleRemoteFlip = (cardId: number, newFaceUp: boolean) => {
    const card = cardById.value.get(cardId)
    if (!card) return

    // If the card state is already correct, no animation needed
    if (card.faceUp === newFaceUp) return

    // If already flipping, just update the target state
    if (flippingCardIds.value.has(cardId)) {
      // The animation will handle it - just ensure final state is correct
      setTimeout(() => {
        const c = cardById.value.get(cardId)
        if (c) c.faceUp = newFaceUp
      }, FLIP_ANIMATION_MS)
      return
    }

    flippingCardIds.value.add(cardId)

    // At midpoint, set to target state
    setTimeout(() => {
      const c = cardById.value.get(cardId)
      if (c) c.faceUp = newFaceUp
    }, FLIP_MIDPOINT_MS)

    // After animation completes, remove from flipping set
    setTimeout(() => {
      flippingCardIds.value.delete(cardId)
    }, FLIP_ANIMATION_MS)
  }

  // Selection management
  const isSelected = (cardId: number) => selectedIds.value.has(cardId)

  const toggleSelect = (cardId: number) => {
    if (selectedIds.value.has(cardId)) {
      selectedIds.value.delete(cardId)
    } else {
      // Only allow selecting free cards (not in stacks)
      const card = cardById.value.get(cardId)
      if (card && card.stackId === null) {
        selectedIds.value.add(cardId)
      }
    }
  }

  const clearSelection = () => {
    selectedIds.value.clear()
  }

  // Remote selection management
  const updateRemoteSelection = (playerId: string, playerColor: string, cardIds: number[]) => {
    if (cardIds.length === 0) {
      remoteSelections.value.delete(playerId)
    } else {
      remoteSelections.value.set(playerId, {
        cardIds: new Set(cardIds),
        color: playerColor,
      })
    }
  }

  const getRemoteSelectionColor = (cardId: number): string | null => {
    for (const [, selection] of remoteSelections.value) {
      if (selection.cardIds.has(cardId)) {
        return selection.color
      }
    }
    return null
  }

  const clearRemoteSelection = (playerId: string) => {
    remoteSelections.value.delete(playerId)
  }

  const hasSelection = computed(() => selectedIds.value.size > 0)

  const selectionCount = computed(() => selectedIds.value.size)

  // Move all selected cards by delta
  const moveSelection = (deltaX: number, deltaY: number) => {
    selectedIds.value.forEach((id) => {
      const card = cardById.value.get(id)
      if (card) {
        card.x += deltaX
        card.y += deltaY
      }
    })
  }

  // Bump z-index of all selected cards
  const bumpSelectionZ = () => {
    selectedIds.value.forEach((id) => {
      const card = cardById.value.get(id)
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
      const card = cardById.value.get(id)
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

  // Dice selection management
  const isDieSelected = (dieId: number) => selectedDieIds.value.has(dieId)

  const toggleDieSelect = (dieId: number) => {
    if (selectedDieIds.value.has(dieId)) {
      selectedDieIds.value.delete(dieId)
    } else {
      selectedDieIds.value.add(dieId)
    }
  }

  const clearDieSelection = () => {
    selectedDieIds.value.clear()
  }

  const hasDieSelection = computed(() => selectedDieIds.value.size > 0)

  const dieSelectionCount = computed(() => selectedDieIds.value.size)

  const getSelectedDieIds = () => Array.from(selectedDieIds.value)

  // Merge source stack into target stack
  const mergeStacks = (sourceStackId: number, targetStackId: number): boolean => {
    if (sourceStackId === targetStackId) return false

    const sourceStack = stackById.value.get(sourceStackId)
    const targetStack = stackById.value.get(targetStackId)
    if (!sourceStack || !targetStack) return false

    // Move all cards from source to target
    const cardIdsToMove = [...sourceStack.cardIds]
    cardIdsToMove.forEach((id) => {
      const card = cardById.value.get(id)
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
    const stack = stackById.value.get(stackId)
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

  // Reorder cards within a stack (for zone card reordering)
  const reorderStack = (stackId: number, fromIndex: number, toIndex: number) => {
    const stack = stackById.value.get(stackId)
    if (!stack) return
    if (fromIndex < 0 || fromIndex >= stack.cardIds.length) return
    if (toIndex < 0 || toIndex >= stack.cardIds.length) return

    const [cardId] = stack.cardIds.splice(fromIndex, 1)
    if (cardId !== undefined) {
      stack.cardIds.splice(toIndex, 0, cardId)
    }

    updateStackPositions(stack)
  }

  // Hand operations
  const addToHand = (cardId: number) => {
    const card = cardById.value.get(cardId)
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
    const card = cardById.value.get(cardId)
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
    const stack = stackById.value.get(stackId)
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
    counters.value = (state.counters ?? []).map(counterStateToCounter)
    tokens.value = (state.tokens ?? []).map(tokenStateToToken)
    dice.value = (state.dice ?? []).map(dieStateToDie)
    timers.value = (state.timers ?? []).map(timerStateToTimer)

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
    nextCounterId = state.nextCounterId ?? 1
    nextTokenId = state.nextTokenId ?? 1
    nextDieId = state.nextDieId ?? 1
    nextTimerId = state.nextTimerId ?? 1
    zCounter = state.zCounter

    // Recalculate card positions based on zone layouts
    // (server stores simple stack positions, client applies zone layouts)
    updateAllStacks()
  }

  // Update a single card from server
  const updateCardFromServer = (cardId: number, updates: Partial<CardState>) => {
    const card = cardById.value.get(cardId)
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
    const stack = stackById.value.get(stackId)
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
    const zone = zoneById.value.get(zoneId)
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

  // Convert server CounterState to local Counter
  const counterStateToCounter = (state: CounterState): Counter => ({
    id: state.id,
    x: state.x,
    y: state.y,
    z: state.z ?? 0,
    label: state.label,
    value: state.value,
    min: state.min,
    max: state.max,
    step: state.step,
    color: state.color,
    lockedBy: state.lockedBy,
  })

  // Update a single counter from server
  const updateCounterFromServer = (counterId: number, updates: Partial<CounterState>) => {
    const counter = counterById.value.get(counterId)
    if (!counter) return

    if (updates.x !== undefined) counter.x = updates.x
    if (updates.y !== undefined) counter.y = updates.y
    if (updates.z !== undefined) counter.z = updates.z
    if (updates.label !== undefined) counter.label = updates.label
    if (updates.value !== undefined) counter.value = updates.value
    if (updates.min !== undefined) counter.min = updates.min
    if (updates.max !== undefined) counter.max = updates.max
    if (updates.step !== undefined) counter.step = updates.step
    if (updates.color !== undefined) counter.color = updates.color
    if (updates.lockedBy !== undefined) counter.lockedBy = updates.lockedBy
  }

  // Add a counter from server
  const addCounterFromServer = (state: CounterState) => {
    const existing = counters.value.find((c) => c.id === state.id)
    if (existing) {
      Object.assign(existing, counterStateToCounter(state))
    } else {
      counters.value.push(counterStateToCounter(state))
    }
  }

  // Remove a counter
  const removeCounter = (counterId: number) => {
    counters.value = counters.value.filter((c) => c.id !== counterId)
  }

  const tokenStateToToken = (state: TokenState): Token => ({
    id: state.id,
    x: state.x,
    y: state.y,
    z: state.z ?? 0,
    kind: state.kind,
    shape: state.shape,
    color: state.color,
    label: state.label,
    sprite: state.sprite,
    size: state.size,
    lockedBy: state.lockedBy,
  })

  // Update a single token from server
  const updateTokenFromServer = (tokenId: number, updates: Partial<TokenState>) => {
    const token = tokenById.value.get(tokenId)
    if (!token) return

    if (updates.x !== undefined) token.x = updates.x
    if (updates.y !== undefined) token.y = updates.y
    if (updates.z !== undefined) token.z = updates.z
    if (updates.shape !== undefined) token.shape = updates.shape
    if (updates.color !== undefined) token.color = updates.color
    if (updates.label !== undefined) token.label = updates.label
    if (updates.sprite !== undefined) token.sprite = updates.sprite
    if (updates.size !== undefined) token.size = updates.size
    if (updates.lockedBy !== undefined) token.lockedBy = updates.lockedBy
  }

  // Add a token from server
  const addTokenFromServer = (state: TokenState) => {
    const existing = tokens.value.find((t) => t.id === state.id)
    if (existing) {
      Object.assign(existing, tokenStateToToken(state))
    } else {
      tokens.value.push(tokenStateToToken(state))
    }
  }

  // Remove a token
  const removeToken = (tokenId: number) => {
    tokens.value = tokens.value.filter((t) => t.id !== tokenId)
  }

  const dieStateToDie = (state: DieState): Die => ({
    id: state.id,
    x: state.x,
    y: state.y,
    z: state.z ?? 0,
    value: state.value as DieValue,
    isRolling: state.isRolling,
    color: state.color,
    lockedBy: state.lockedBy,
  })

  // Update a single die from server
  const updateDieFromServer = (dieId: number, updates: Partial<DieState>) => {
    const die = dieById.value.get(dieId)
    if (!die) return

    if (updates.x !== undefined) die.x = updates.x
    if (updates.y !== undefined) die.y = updates.y
    if (updates.z !== undefined) die.z = updates.z
    if (updates.value !== undefined) die.value = updates.value as DieValue
    if (updates.isRolling !== undefined) die.isRolling = updates.isRolling
    if (updates.color !== undefined) die.color = updates.color
    if (updates.lockedBy !== undefined) die.lockedBy = updates.lockedBy
  }

  // Add a die from server
  const addDieFromServer = (state: DieState) => {
    const existing = dice.value.find((d) => d.id === state.id)
    if (existing) {
      Object.assign(existing, dieStateToDie(state))
    } else {
      dice.value.push(dieStateToDie(state))
    }
  }

  // Remove a die
  const removeDie = (dieId: number) => {
    dice.value = dice.value.filter((d) => d.id !== dieId)
  }

  // Set die rolling state (for animation)
  const setDieRolling = (dieId: number, isRolling: boolean) => {
    const die = dieById.value.get(dieId)
    if (die) {
      die.isRolling = isRolling
    }
  }

  const timerStateToTimer = (state: TimerState): Timer => ({
    id: state.id,
    x: state.x,
    y: state.y,
    z: state.z ?? 0,
    mode: state.mode as TimerMode,
    durationMs: state.durationMs,
    elapsedMs: state.elapsedMs,
    status: state.status as TimerStatus,
    startedAt: state.startedAt,
    label: state.label,
    lockedBy: state.lockedBy,
  })

  // Update a single timer from server
  const updateTimerFromServer = (timerId: number, updates: Partial<TimerState>) => {
    const timer = timerById.value.get(timerId)
    if (!timer) return

    if (updates.x !== undefined) timer.x = updates.x
    if (updates.y !== undefined) timer.y = updates.y
    if (updates.z !== undefined) timer.z = updates.z
    if (updates.mode !== undefined) timer.mode = updates.mode as TimerMode
    if (updates.durationMs !== undefined) timer.durationMs = updates.durationMs
    if (updates.elapsedMs !== undefined) timer.elapsedMs = updates.elapsedMs
    if (updates.status !== undefined) timer.status = updates.status as TimerStatus
    if (updates.startedAt !== undefined) timer.startedAt = updates.startedAt
    if (updates.label !== undefined) timer.label = updates.label
    if (updates.lockedBy !== undefined) timer.lockedBy = updates.lockedBy
  }

  // Add a timer from server
  const addTimerFromServer = (state: TimerState) => {
    const existing = timers.value.find((t) => t.id === state.id)
    if (existing) {
      Object.assign(existing, timerStateToTimer(state))
    } else {
      timers.value.push(timerStateToTimer(state))
    }
  }

  // Remove a timer
  const removeTimer = (timerId: number) => {
    timers.value = timers.value.filter((t) => t.id !== timerId)
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
    counters,
    tokens,
    dice,
    timers,
    selectedIds,
    // O(1) lookup helpers
    getCardById,
    getStackById,
    getZoneById,
    getCounterById,
    getTokenById,
    getDieById,
    getTimerById,
    createCards,
    updateStackPositions,
    updateAllStacks,
    removeFromStack,
    addCardToStack,
    addCardsToStack,
    createStackAt,
    stackCardOnTarget,
    // Zone operations
    getZoneStack,
    getZoneCardCount,
    getZoneCardPosition,
    createZone,
    deleteZone,
    updateZone,
    ensureZoneStack,
    addToZone,
    addManyToZone,
    // Card operations
    cardZ,
    bumpCardZ,
    flipCard,
    flipStack,
    // Animated flip operations
    isFlipping,
    flipCardAnimated,
    flipStackAnimated,
    handleRemoteFlip,
    isSelected,
    toggleSelect,
    clearSelection,
    updateRemoteSelection,
    getRemoteSelectionColor,
    clearRemoteSelection,
    hasSelection,
    selectionCount,
    moveSelection,
    bumpSelectionZ,
    getSelectedIds,
    stackSelection,
    // Dice selection
    selectedDieIds,
    isDieSelected,
    toggleDieSelect,
    clearDieSelection,
    hasDieSelection,
    dieSelectionCount,
    getSelectedDieIds,
    mergeStacks,
    shuffleStack,
    reorderStack,
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
    // Counter sync operations
    updateCounterFromServer,
    addCounterFromServer,
    removeCounter,
    // Token sync operations
    updateTokenFromServer,
    addTokenFromServer,
    removeToken,
    // Die sync operations
    updateDieFromServer,
    addDieFromServer,
    removeDie,
    setDieRolling,
    // Timer sync operations
    updateTimerFromServer,
    addTimerFromServer,
    removeTimer,
    setHandCardIds,
  }
})
