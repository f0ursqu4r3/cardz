import type { Ref } from 'vue'
import type { RadialMenuItem } from '@/components/ui/RadialMenu.vue'
import type { useCardStore } from '@/stores/cards'
import type { useViewport } from './useViewport'
import type { useRadialMenu } from './useRadialMenu'
import type { ClientMessage } from '../../shared/types'
import type HandComp from '@/components/HandComp.vue'
import type CounterComp from '@/components/CounterComp.vue'
import type TokenComp from '@/components/TokenComp.vue'
import type DieComp from '@/components/DieComp.vue'
import type TimerComp from '@/components/TimerComp.vue'
import { CARD_W, CARD_H, ZONE_DEFAULT_WIDTH, ZONE_DEFAULT_HEIGHT } from '@/types'

/**
 * Configuration for the radial menu actions composable
 */
export interface RadialMenuActionsConfig {
  /** Card store instance */
  cardStore: ReturnType<typeof useCardStore>
  /** Function to send WebSocket messages */
  sendMessage: (msg: ClientMessage) => void
  /** Viewport composable for coordinate conversion */
  viewport: ReturnType<typeof useViewport>
  /** Radial menu composable instance */
  radialMenu: ReturnType<typeof useRadialMenu>
  /** Hand component ref */
  handCompRef: Ref<InstanceType<typeof HandComp> | null>
  /** Ref for editing zone ID (for zone settings) */
  editingZoneId: Ref<number | null>
  /** Entity component refs for opening modals */
  entityRefs: {
    counters: Ref<Map<number, InstanceType<typeof CounterComp>>>
    tokens: Ref<Map<number, InstanceType<typeof TokenComp>>>
    dice: Ref<Map<number, InstanceType<typeof DieComp>>>
    timers: Ref<Map<number, InstanceType<typeof TimerComp>>>
  }
  /** Function to track user activity */
  trackActivity: () => void
  /** Function to set die rolling state */
  setDieRolling: (dieId: number, rolling: boolean) => void
}

/**
 * Composable providing action handlers for radial menu selections.
 * Handles all the logic for cards, stacks, zones, counters, tokens, dice, and timers.
 */
export function useRadialMenuActions(config: RadialMenuActionsConfig) {
  const {
    cardStore,
    sendMessage,
    viewport,
    radialMenu,
    handCompRef,
    editingZoneId,
    entityRefs,
    trackActivity,
    setDieRolling,
  } = config

  /**
   * Handle card actions from the radial menu
   */
  const handleCardAction = (action: string, cardId: number) => {
    const card = cardStore.getCardById(cardId)
    if (!card) return

    switch (action) {
      case 'flip':
        cardStore.flipCardAnimated(cardId)
        sendMessage({ type: 'card:flip', cardId })
        break
      case 'to-hand':
        if (cardStore.addToHand(cardId)) {
          sendMessage({ type: 'hand:add', cardId })
        }
        break
      case 'pick-up':
        cardStore.removeFromStack(cardId)
        sendMessage({ type: 'stack:remove_card', cardId })
        break
    }
  }

  /**
   * Handle stack actions from the radial menu
   */
  const handleStackAction = (action: string, stackId: number) => {
    const stack = cardStore.stacks.find((s) => s.id === stackId)
    if (!stack) return

    switch (action) {
      case 'flip-stack':
        cardStore.flipStackAnimated(stackId)
        sendMessage({ type: 'stack:flip', stackId })
        break
      case 'shuffle':
        cardStore.shuffleStack(stackId)
        sendMessage({ type: 'stack:shuffle', stackId })
        break
      case 'spread': {
        // Spread cards out in a row from the stack position
        const spacing = CARD_W + 10
        const startX = stack.anchorX - ((stack.cardIds.length - 1) * spacing) / 2
        stack.cardIds.forEach((cardId, i) => {
          const card = cardStore.getCardById(cardId)
          if (card) {
            cardStore.removeFromStack(cardId)
            card.x = startX + i * spacing
            card.y = stack.anchorY
            sendMessage({ type: 'card:move', cardId, x: card.x, y: card.y })
          }
        })
        break
      }
      case 'all-face-up':
        // Set all cards in stack to face up
        stack.cardIds.forEach((cardId) => {
          const card = cardStore.getCardById(cardId)
          if (card) card.faceUp = true
        })
        sendMessage({ type: 'stack:set_faces', stackId, faceUp: true })
        break
      case 'all-face-down':
        // Set all cards in stack to face down
        stack.cardIds.forEach((cardId) => {
          const card = cardStore.getCardById(cardId)
          if (card) card.faceUp = false
        })
        sendMessage({ type: 'stack:set_faces', stackId, faceUp: false })
        break
      case 'draw-top': {
        // Draw just the top card from stack
        const topCardId = stack.cardIds[stack.cardIds.length - 1]
        if (topCardId !== undefined) {
          cardStore.addToHand(topCardId)
          sendMessage({ type: 'hand:add', cardId: topCardId })
        }
        break
      }
      case 'all-to-hand':
        cardStore.addStackToHand(stackId)
        sendMessage({ type: 'hand:add_stack', stackId })
        break
    }
  }

  /**
   * Handle zone actions from the radial menu
   */
  const handleZoneAction = (action: string, zoneId: number) => {
    const zone = cardStore.zones.find((z) => z.id === zoneId)
    if (!zone) return

    switch (action) {
      case 'zone-settings':
        editingZoneId.value = zoneId
        break
      case 'zone-lock':
        sendMessage({ type: 'zone:update', zoneId, updates: { locked: !zone.locked } })
        break
      case 'zone-flip-all':
        if (zone.stackId !== null) {
          const stack = cardStore.stacks.find((s) => s.id === zone.stackId)
          if (stack) {
            stack.cardIds.forEach((cardId) => {
              cardStore.flipCardAnimated(cardId)
              sendMessage({ type: 'card:flip', cardId })
            })
          }
        }
        break
      case 'zone-shuffle':
        if (zone.stackId !== null) {
          cardStore.shuffleStack(zone.stackId)
          sendMessage({ type: 'stack:shuffle', stackId: zone.stackId })
        }
        break
      case 'zone-delete':
        sendMessage({ type: 'zone:delete', zoneId })
        break
    }
  }

  /**
   * Handle selection actions from the radial menu
   */
  const handleSelectionAction = (action: string, cardIds: number[]) => {
    switch (action) {
      case 'stack-selection': {
        // Find center of selection
        let sumX = 0,
          sumY = 0,
          count = 0
        cardIds.forEach((id) => {
          const card = cardStore.getCardById(id)
          if (card) {
            sumX += card.x
            sumY += card.y
            count++
          }
        })
        if (count > 0) {
          const newStack = cardStore.stackSelection(sumX / count, sumY / count)
          if (newStack) {
            sendMessage({
              type: 'stack:create',
              cardIds: newStack.cardIds,
              anchorX: newStack.anchorX,
              anchorY: newStack.anchorY,
            })
          }
        }
        break
      }
      case 'flip-selection':
        cardIds.forEach((cardId) => {
          cardStore.flipCardAnimated(cardId)
          sendMessage({ type: 'card:flip', cardId })
        })
        break
      case 'to-hand':
        cardIds.forEach((cardId) => {
          if (cardStore.addToHand(cardId)) {
            sendMessage({ type: 'hand:add', cardId })
          }
        })
        cardStore.clearSelection()
        break
      case 'deselect':
        cardStore.clearSelection()
        break
    }
  }

  /**
   * Handle canvas actions from the radial menu
   */
  const handleCanvasAction = (action: string, worldX: number, worldY: number) => {
    switch (action) {
      case 'create-zone': {
        // Create zone centered on the click position
        const x = worldX - ZONE_DEFAULT_WIDTH / 2
        const y = worldY - ZONE_DEFAULT_HEIGHT / 2
        sendMessage({
          type: 'zone:create',
          x,
          y,
          width: ZONE_DEFAULT_WIDTH,
          height: ZONE_DEFAULT_HEIGHT,
          label: 'New Zone',
          faceUp: false,
        })
        break
      }
      case 'deal-card':
        // TODO: Deal from a deck
        break
      case 'reset-view':
        viewport.resetViewport()
        break
    }
  }

  /**
   * Handle hand card actions from the radial menu
   */
  const handleHandCardAction = (action: string, cardId: number) => {
    const card = cardStore.getCardById(cardId)
    if (!card) return

    switch (action) {
      case 'play-to-table': {
        // Remove from hand and place on table face-up at center of viewport
        const bounds = viewport.getVisibleBounds()
        const x = bounds.x + bounds.width / 2 - CARD_W / 2
        const y = bounds.y + bounds.height / 2 - CARD_H / 2
        cardStore.removeFromHand(cardId)
        card.x = x
        card.y = y
        card.faceUp = true
        sendMessage({ type: 'hand:remove', cardId, x, y, faceUp: true })
        break
      }
      case 'play-face-down': {
        // Remove from hand and place on table face-down at center of viewport
        const bounds = viewport.getVisibleBounds()
        const x = bounds.x + bounds.width / 2 - CARD_W / 2
        const y = bounds.y + bounds.height / 2 - CARD_H / 2
        cardStore.removeFromHand(cardId)
        card.x = x
        card.y = y
        card.faceUp = false
        sendMessage({ type: 'hand:remove', cardId, x, y, faceUp: false })
        break
      }
    }
  }

  /**
   * Handle hand selection actions from the radial menu
   */
  const handleHandSelectionAction = (action: string, cardIds: number[]) => {
    switch (action) {
      case 'play-all-to-table': {
        // Play all selected cards to table, spread out
        const bounds = viewport.getVisibleBounds()
        const startX = bounds.x + bounds.width / 2 - ((cardIds.length - 1) * (CARD_W + 10)) / 2
        const centerY = bounds.y + bounds.height / 2 - CARD_H / 2

        cardIds.forEach((cardId, i) => {
          const card = cardStore.getCardById(cardId)
          if (card) {
            const x = startX + i * (CARD_W + 10)
            const y = centerY
            cardStore.removeFromHand(cardId)
            card.x = x
            card.y = y
            sendMessage({ type: 'hand:remove', cardId, x, y, faceUp: card.faceUp })
          }
        })
        handCompRef.value?.clearHandSelection()
        break
      }
      case 'stack-and-play': {
        // Create a stack from selected cards and play to table
        const bounds = viewport.getVisibleBounds()
        const centerX = bounds.x + bounds.width / 2 - CARD_W / 2
        const centerY = bounds.y + bounds.height / 2 - CARD_H / 2

        // Remove all from hand first
        cardIds.forEach((cardId) => {
          const card = cardStore.getCardById(cardId)
          if (card) {
            cardStore.removeFromHand(cardId)
            sendMessage({ type: 'hand:remove', cardId, x: centerX, y: centerY, faceUp: card.faceUp })
          }
        })

        // Create stack
        const newStack = cardStore.createStackAt(centerX, centerY, 'free')
        cardIds.forEach((cardId) => {
          const card = cardStore.getCardById(cardId)
          if (card) {
            newStack.cardIds.push(cardId)
            card.stackId = newStack.id
            card.isInDeck = true
          }
        })
        cardStore.updateStackPositions(newStack)

        sendMessage({
          type: 'stack:create',
          cardIds: newStack.cardIds,
          anchorX: newStack.anchorX,
          anchorY: newStack.anchorY,
        })
        handCompRef.value?.clearHandSelection()
        break
      }
      case 'flip-selection':
        cardIds.forEach((cardId) => {
          cardStore.flipCardAnimated(cardId)
        })
        break
      case 'deselect':
        handCompRef.value?.clearHandSelection()
        break
    }
  }

  /**
   * Handle counter actions from the radial menu
   */
  const handleCounterAction = (action: string, counterId: number) => {
    const counter = cardStore.getCounterById(counterId)
    if (!counter) return

    switch (action) {
      case 'counter-reset': {
        // Reset counter to zero (or min if set)
        const resetValue = counter.min !== undefined ? counter.min : 0
        sendMessage({
          type: 'counter:update',
          counterId,
          updates: { value: resetValue },
        })
        break
      }
      case 'counter-settings':
        entityRefs.counters.value.get(counterId)?.openModal()
        break
      case 'counter-delete':
        sendMessage({ type: 'counter:delete', counterId })
        break
    }
  }

  /**
   * Handle token actions from the radial menu
   */
  const handleTokenAction = (action: string, tokenId: number) => {
    const token = cardStore.getTokenById(tokenId)
    if (!token) return

    switch (action) {
      case 'token-duplicate': {
        // Create a copy of the token slightly offset
        sendMessage({
          type: 'token:create',
          x: token.x + 20,
          y: token.y + 20,
          kind: token.kind,
          shape: token.shape,
          color: token.color,
          label: token.label,
          sprite: token.sprite,
          size: token.size,
        })
        break
      }
      case 'token-settings':
        entityRefs.tokens.value.get(tokenId)?.openModal()
        break
      case 'token-delete':
        sendMessage({ type: 'token:delete', tokenId })
        break
    }
  }

  /**
   * Handle die actions from the radial menu
   */
  const handleDieAction = (action: string, dieId: number) => {
    const die = cardStore.getDieById(dieId)
    if (!die) return

    switch (action) {
      case 'die-roll':
        setDieRolling(dieId, true)
        sendMessage({ type: 'die:roll', dieId })
        break
      case 'die-settings':
        entityRefs.dice.value.get(dieId)?.openModal()
        break
      case 'die-delete':
        sendMessage({ type: 'die:delete', dieId })
        break
    }
  }

  /**
   * Handle timer actions from the radial menu
   */
  const handleTimerAction = (action: string, timerId: number) => {
    const timer = cardStore.getTimerById(timerId)
    if (!timer) return

    switch (action) {
      case 'timer-start':
        sendMessage({ type: 'timer:start', timerId })
        break
      case 'timer-pause':
        sendMessage({ type: 'timer:pause', timerId })
        break
      case 'timer-reset':
        sendMessage({ type: 'timer:reset', timerId })
        break
      case 'timer-settings':
        entityRefs.timers.value.get(timerId)?.openModal()
        break
      case 'timer-delete':
        sendMessage({ type: 'timer:delete', timerId })
        break
    }
  }

  /**
   * Main handler for radial menu item selection
   */
  const onRadialMenuSelect = (item: RadialMenuItem) => {
    const target = radialMenu.target.value
    if (!target) return

    trackActivity()

    switch (target.type) {
      case 'card':
        handleCardAction(item.id, target.cardId)
        break
      case 'stack':
        handleStackAction(item.id, target.stackId)
        break
      case 'zone':
        handleZoneAction(item.id, target.zoneId)
        break
      case 'selection':
        handleSelectionAction(item.id, target.cardIds)
        break
      case 'hand-card':
        handleHandCardAction(item.id, target.cardId)
        break
      case 'hand-selection':
        handleHandSelectionAction(item.id, target.cardIds)
        break
      case 'canvas':
        handleCanvasAction(item.id, target.worldX, target.worldY)
        break
      case 'counter':
        handleCounterAction(item.id, target.counterId)
        break
      case 'token':
        handleTokenAction(item.id, target.tokenId)
        break
      case 'die':
        handleDieAction(item.id, target.dieId)
        break
      case 'timer':
        handleTimerAction(item.id, target.timerId)
        break
    }
  }

  return {
    onRadialMenuSelect,
  }
}
