import { computed, ref, type Ref } from 'vue'
import { defineStore } from 'pinia'
import type { CardData, Stack } from '@/types'
import { STACK_OFFSET_X, STACK_OFFSET_Y } from '@/types'

export const useCardStore = defineStore('cards', () => {
  const cards = ref<CardData[]>([])
  const stacks = ref<Stack[]>([])
  const deckStackId = ref<number | null>(null)
  const selectedIds = ref<Set<number>>(new Set())

  let nextStackId = 1
  let zCounter = 100

  // Deck stack helper
  const deckStack = computed(() => {
    if (deckStackId.value === null) return null
    return stacks.value.find((stack) => stack.id === deckStackId.value) ?? null
  })

  const deckCount = computed(() => deckStack.value?.cardIds.length ?? 0)

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
    }))
  }

  // Stack position management
  const updateStackPositions = (
    stack: Stack,
    getDeckAnchor?: () => { x: number; y: number } | null,
  ) => {
    if (stack.kind === 'zone' && getDeckAnchor) {
      const anchor = getDeckAnchor()
      if (anchor) {
        stack.anchorX = anchor.x
        stack.anchorY = anchor.y
      }
    }

    stack.cardIds.forEach((id, idx) => {
      const card = cards.value.find((item) => item.id === id)
      if (!card) return
      card.stackId = stack.id
      card.isInDeck = true
      card.x = stack.anchorX + idx * STACK_OFFSET_X
      card.y = stack.anchorY + idx * STACK_OFFSET_Y
    })
  }

  const updateAllStacks = (getDeckAnchor?: () => { x: number; y: number } | null) => {
    stacks.value = stacks.value.filter((stack) => stack.cardIds.length > 0)
    stacks.value.forEach((stack) => updateStackPositions(stack, getDeckAnchor))
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
      if (deckStackId.value === stack.id) {
        deckStackId.value = null
      }
      stacks.value = stacks.value.filter((item) => item.id !== stack.id)
    }
  }

  const addCardToStack = (
    cardId: number,
    stack: Stack,
    getDeckAnchor?: () => { x: number; y: number } | null,
  ) => {
    removeFromStack(cardId)
    if (!stack.cardIds.includes(cardId)) {
      stack.cardIds.push(cardId)
    }
    updateStackPositions(stack, getDeckAnchor)
  }

  const createStackAt = (anchorX: number, anchorY: number, kind: Stack['kind'] = 'free'): Stack => {
    const stack: Stack = { id: nextStackId++, anchorX, anchorY, cardIds: [], kind }
    stacks.value.push(stack)
    return stack
  }

  const ensureDeckStack = (getDeckAnchor: () => { x: number; y: number } | null): Stack | null => {
    const anchor = getDeckAnchor()
    if (!anchor) return null

    let stack = deckStack.value
    if (!stack) {
      stack = {
        id: nextStackId++,
        anchorX: anchor.x,
        anchorY: anchor.y,
        cardIds: [],
        kind: 'zone',
      }
      stacks.value.push(stack)
      deckStackId.value = stack.id
    } else {
      stack.anchorX = anchor.x
      stack.anchorY = anchor.y
    }

    return stack
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

  const addToDeckZone = (
    cardId: number,
    getDeckAnchor: () => { x: number; y: number } | null,
  ): boolean => {
    const stack = ensureDeckStack(getDeckAnchor)
    if (!stack) return false
    addCardToStack(cardId, stack, getDeckAnchor)
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

  return {
    cards,
    stacks,
    deckStackId,
    deckStack,
    deckCount,
    selectedIds,
    createCards,
    updateStackPositions,
    updateAllStacks,
    removeFromStack,
    addCardToStack,
    createStackAt,
    ensureDeckStack,
    stackCardOnTarget,
    addToDeckZone,
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
  }
})
