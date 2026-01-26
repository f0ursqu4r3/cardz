import type { Ref } from 'vue'
import type { useCardStore } from '@/stores/cards'
import type { useViewport } from './useViewport'
import type { useRadialMenu } from './useRadialMenu'
import type HandComp from '@/components/HandComp.vue'

/**
 * Configuration for the context menu composable
 */
export interface ContextMenuConfig {
  /** Card store instance */
  cardStore: ReturnType<typeof useCardStore>
  /** Radial menu composable instance */
  radialMenu: ReturnType<typeof useRadialMenu>
  /** Viewport composable for coordinate conversion */
  viewport: ReturnType<typeof useViewport>
  /** Hand component ref for selection checks */
  handCompRef: Ref<InstanceType<typeof HandComp> | null>
}

/**
 * Composable providing right-click context menu handlers for all entity types.
 * Opens the radial menu with appropriate options based on what was clicked.
 */
export function useContextMenu(config: ContextMenuConfig) {
  const { cardStore, radialMenu, viewport, handCompRef } = config

  /**
   * Right-click handler for cards on the table
   */
  const onCardRightClick = (event: MouseEvent, index: number) => {
    event.preventDefault()
    event.stopPropagation()

    const card = cardStore.cards[index]
    if (!card) return

    // If card is part of a selection with multiple cards, use selection menu
    if (cardStore.isSelected(card.id) && cardStore.getSelectedIds().length > 1) {
      radialMenu.open(event.clientX, event.clientY, {
        type: 'selection',
        cardIds: cardStore.getSelectedIds(),
      })
      return
    }

    // If card is in a stack, check if it's in a zone with non-stack layout
    if (card.stackId !== null) {
      const stack = cardStore.stacks.find((s) => s.id === card.stackId)
      if (stack) {
        // Check if stack is in a zone with a non-stack layout
        const zone = cardStore.zones.find((z) => z.stackId === stack.id)
        if (zone && zone.layout !== 'stack') {
          // For non-stack zone layouts (grid, row, column, fan, circle),
          // show card menu since user clicked a specific visible card
          radialMenu.open(event.clientX, event.clientY, {
            type: 'card',
            cardId: card.id,
            isInStack: true,
            isInZone: true,
            isFaceUp: card.faceUp,
          })
          return
        }

        // Stack layout - show stack menu
        radialMenu.open(event.clientX, event.clientY, {
          type: 'stack',
          stackId: stack.id,
          cardCount: stack.cardIds.length,
        })
        return
      }
    }

    // Single free card
    radialMenu.open(event.clientX, event.clientY, {
      type: 'card',
      cardId: card.id,
      isInStack: false,
      isInZone: false,
      isFaceUp: card.faceUp,
    })
  }

  /**
   * Right-click handler for zones
   */
  const onZoneRightClick = (event: MouseEvent, zoneId: number) => {
    event.preventDefault()
    event.stopPropagation()

    const zone = cardStore.zones.find((z) => z.id === zoneId)
    radialMenu.open(event.clientX, event.clientY, {
      type: 'zone',
      zoneId,
      locked: zone?.locked ?? false,
    })
  }

  /**
   * Right-click on canvas (empty space)
   */
  const onCanvasRightClick = (event: MouseEvent) => {
    event.preventDefault()

    // Convert to world coordinates for zone creation position
    const worldPos = viewport.screenToWorld(event.clientX, event.clientY)
    radialMenu.open(event.clientX, event.clientY, {
      type: 'canvas',
      worldX: worldPos.x,
      worldY: worldPos.y,
    })
  }

  /**
   * Right-click handler for hand cards
   */
  const onHandCardRightClick = (event: MouseEvent, cardId: number) => {
    event.preventDefault()
    event.stopPropagation()

    const card = cardStore.getCardById(cardId)
    if (!card) return

    // If card is part of a hand selection with multiple cards, use hand-selection menu
    if (
      handCompRef.value?.isHandCardSelected(cardId) &&
      (handCompRef.value?.handSelectionCount ?? 0) > 1
    ) {
      radialMenu.open(event.clientX, event.clientY, {
        type: 'hand-selection',
        cardIds: [...(handCompRef.value?.selectedHandCardIds ?? [])],
      })
      return
    }

    // Single hand card
    radialMenu.open(event.clientX, event.clientY, {
      type: 'hand-card',
      cardId: card.id,
      isFaceUp: card.faceUp,
    })
  }

  /**
   * Right-click handler for counters
   */
  const onCounterRightClick = (event: MouseEvent, counterId: number) => {
    event.preventDefault()
    event.stopPropagation()

    const counter = cardStore.getCounterById(counterId)
    if (!counter) return

    radialMenu.open(event.clientX, event.clientY, {
      type: 'counter',
      counterId,
      value: counter.value,
    })
  }

  /**
   * Right-click handler for tokens
   */
  const onTokenRightClick = (event: MouseEvent, tokenId: number) => {
    event.preventDefault()
    event.stopPropagation()

    const token = cardStore.getTokenById(tokenId)
    if (!token) return

    radialMenu.open(event.clientX, event.clientY, {
      type: 'token',
      tokenId,
      kind: token.kind,
    })
  }

  /**
   * Right-click handler for dice
   */
  const onDieRightClick = (event: MouseEvent, dieId: number) => {
    event.preventDefault()
    event.stopPropagation()

    const die = cardStore.getDieById(dieId)
    if (!die) return

    radialMenu.open(event.clientX, event.clientY, {
      type: 'die',
      dieId,
      value: die.value,
    })
  }

  /**
   * Right-click handler for timers
   */
  const onTimerRightClick = (event: MouseEvent, timerId: number) => {
    event.preventDefault()
    event.stopPropagation()

    const timer = cardStore.getTimerById(timerId)
    if (!timer) return

    radialMenu.open(event.clientX, event.clientY, {
      type: 'timer',
      timerId,
      status: timer.status,
      mode: timer.mode,
    })
  }

  return {
    onCardRightClick,
    onZoneRightClick,
    onCanvasRightClick,
    onHandCardRightClick,
    onCounterRightClick,
    onTokenRightClick,
    onDieRightClick,
    onTimerRightClick,
  }
}
