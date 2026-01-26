import { computed, type ComputedRef, type Ref } from 'vue'
import type { useCardStore } from '@/stores/cards'
import type { useCardInteraction } from './useCardInteraction'
import type { Player } from '../../shared/types'
import { CARD_W, CARD_H, STACK_OFFSET_X, STACK_OFFSET_Y } from '@/types'

/**
 * Cursor state from WebSocket cursors
 */
interface CursorState {
  x: number
  y: number
  state: 'default' | 'grab' | 'grabbing'
}

/**
 * Configuration for the card display helpers composable
 */
export interface CardDisplayHelpersConfig {
  /** Card store instance */
  cardStore: ReturnType<typeof useCardStore>
  /** Current player ID */
  playerId: Ref<string | null>
  /** Players list for getting colors */
  players: Ref<Player[]>
  /** Remote player cursors */
  cursors: Ref<Map<string, CursorState>>
  /** Card interaction composable instance */
  interaction: ReturnType<typeof useCardInteraction>
}

/**
 * Composable providing helper functions for card display logic.
 * Handles lock detection, transform calculation, position helpers, etc.
 */
export function useCardDisplayHelpers(config: CardDisplayHelpersConfig) {
  const { cardStore, playerId, players, cursors, interaction } = config

  /**
   * Get a player's color by their ID
   */
  const getPlayerColor = (pid: string | null): string | null => {
    if (!pid) return null
    const player = players.value.find((p) => p.id === pid)
    return player?.color || null
  }

  // Zone reorder positions computed - calculates where cards should appear during zone reordering
  const zoneReorderPositions = computed(() => {
    const positions = new Map<number, { x: number; y: number; rotation: number }>()

    const isZoneReordering =
      interaction.drag.target.value?.type === 'hand-card' &&
      interaction.zoneDragSource.value !== null &&
      interaction.zoneDropTargetIndex.value !== null

    if (!isZoneReordering) return positions

    const source = interaction.zoneDragSource.value
    if (!source) return positions

    const targetIndex = interaction.zoneDropTargetIndex.value
    if (targetIndex === null) return positions

    const stack = cardStore.stacks.find((s) => s.id === source.stackId)
    if (!stack) return positions

    const fromIndex = source.cardIndex
    const toIndex = targetIndex

    // For each card in the zone stack, calculate where it should appear
    // The dragged card is hidden (handled separately), other cards shift
    stack.cardIds.forEach((cardId, currentIndex) => {
      // Skip the card being dragged - it follows the cursor
      if (currentIndex === fromIndex) return

      // Calculate the visual index this card should appear at
      let visualIndex = currentIndex

      if (fromIndex < toIndex) {
        // Dragging forward: cards between fromIndex and toIndex shift back one spot
        if (currentIndex > fromIndex && currentIndex <= toIndex) {
          visualIndex = currentIndex - 1
        }
      } else if (fromIndex > toIndex) {
        // Dragging backward: cards between toIndex and fromIndex shift forward one spot
        if (currentIndex >= toIndex && currentIndex < fromIndex) {
          visualIndex = currentIndex + 1
        }
      }

      // Only add to map if position changed
      if (visualIndex !== currentIndex) {
        const position = cardStore.getZoneCardPosition(
          source.zoneId,
          visualIndex,
          stack.cardIds.length,
        )
        if (position) {
          positions.set(cardId, position)
        }
      }
    })

    return positions
  })

  /**
   * Check if a card should show the lock glow (only bottom card for stack locks)
   */
  const shouldShowLockGlow = (card: (typeof cardStore.cards)[0]): boolean => {
    // Card-level lock always shows glow
    if (card.lockedBy && card.lockedBy !== playerId.value) return true
    // Stack-level lock only shows glow on bottom card
    if (card.stackId !== null) {
      const stack = cardStore.stacks.find((s) => s.id === card.stackId)
      if (stack?.lockedBy && stack.lockedBy !== playerId.value) {
        return stack.cardIds[0] === card.id // Only bottom card
      }
    }
    return false
  }

  /**
   * Get the lock color for a card (checks both card and stack locks)
   */
  const getCardLockColor = (card: (typeof cardStore.cards)[0]): string | null => {
    // Check card-level lock first
    if (card.lockedBy && card.lockedBy !== playerId.value) {
      return getPlayerColor(card.lockedBy) || '#888'
    }
    // Check stack-level lock (only return color for bottom card)
    if (card.stackId !== null) {
      const stack = cardStore.stacks.find((s) => s.id === card.stackId)
      if (stack?.lockedBy && stack.lockedBy !== playerId.value) {
        // Only return color for bottom card (where the glow shows)
        if (stack.cardIds[0] === card.id) {
          return getPlayerColor(stack.lockedBy) || '#888'
        }
      }
    }
    return null
  }

  /**
   * Get the lock holder's player ID for a card (checks both card and stack locks)
   */
  const getCardLockHolder = (card: (typeof cardStore.cards)[0]): string | null => {
    if (card.lockedBy && card.lockedBy !== playerId.value) {
      return card.lockedBy
    }
    if (card.stackId !== null) {
      const stack = cardStore.stacks.find((s) => s.id === card.stackId)
      if (stack?.lockedBy && stack.lockedBy !== playerId.value) {
        return stack.lockedBy
      }
    }
    return null
  }

  /**
   * Check if a card is the bottom card of its stack (for shadow rendering)
   */
  const isStackBottom = (card: (typeof cardStore.cards)[0]): boolean => {
    if (card.stackId === null) return false
    const stack = cardStore.stacks.find((s) => s.id === card.stackId)
    return stack ? stack.cardIds[0] === card.id : false
  }

  /**
   * Get the number of cards in a stack (for visual depth effect on bottom card)
   */
  const getStackSize = (card: (typeof cardStore.cards)[0]): number => {
    if (card.stackId === null) return 1
    const stack = cardStore.stacks.find((s) => s.id === card.stackId)
    return stack ? stack.cardIds.length : 1
  }

  /**
   * Check if a card should appear face-down (considering zone visibility)
   */
  const shouldShowFaceDown = (card: (typeof cardStore.cards)[0]): boolean => {
    // If card is already face-down, always show face-down
    if (!card.faceUp) return true

    // Check if card is in a zone with visibility restrictions
    if (card.stackId !== null) {
      const stack = cardStore.stacks.find((s) => s.id === card.stackId)
      if (stack?.zoneId !== undefined) {
        const zone = cardStore.zones.find((z) => z.id === stack.zoneId)
        if (zone) {
          // 'hidden' visibility: cards always appear face-down to everyone
          if (zone.visibility === 'hidden') return true
          // 'owner' visibility: cards appear face-down to non-owners
          if (zone.visibility === 'owner' && zone.ownerId !== playerId.value) return true
        }
      }
    }

    return false
  }

  /**
   * Get the transform for a card (combines drag tilt with zone layout rotation)
   */
  const getCardTransform = (card: (typeof cardStore.cards)[0], index: number): string | undefined => {
    const isDragging = interaction.drag.activeIndex.value === index
    const isThrowing = interaction.physics.throwingCardId.value === card.id

    if (isDragging || isThrowing) {
      // During drag/throw, use physics tilt
      return `rotate(${interaction.physics.tilt.value}deg)`
    }

    // Check for zone reorder position (has adjusted rotation)
    const reorderPos = zoneReorderPositions.value.get(card.id)
    if (reorderPos) {
      return `rotate(${reorderPos.rotation}deg)`
    }

    // Apply zone layout rotation if present
    if (card.rotation !== undefined && card.rotation !== 0) {
      return `rotate(${card.rotation}deg)`
    }

    return undefined
  }

  /**
   * Get the position for a card that's being held by another player.
   * Card follows the holder's cursor, centered under it.
   * For stack drags, maintains the card's offset within the stack.
   */
  const getLockedCardPosition = (
    card: (typeof cardStore.cards)[0],
  ): { x: number; y: number } | null => {
    const holderId = getCardLockHolder(card)
    if (!holderId) return null

    const cursor = cursors.value.get(holderId)
    if (!cursor) return null

    // Check if this is a stack lock (not a card lock)
    if (card.stackId !== null) {
      const stack = cardStore.stacks.find((s) => s.id === card.stackId)
      if (stack?.lockedBy && stack.lockedBy !== playerId.value) {
        // Find card's index in the stack to calculate offset
        const cardIndex = stack.cardIds.indexOf(card.id)
        if (cardIndex !== -1) {
          // Position relative to cursor with stack offset
          return {
            x: cursor.x - CARD_W / 2 + cardIndex * STACK_OFFSET_X,
            y: cursor.y - CARD_H / 2 + cardIndex * STACK_OFFSET_Y,
          }
        }
      }
    }

    // Single card drag - center under cursor
    return {
      x: cursor.x - CARD_W / 2,
      y: cursor.y - CARD_H / 2,
    }
  }

  /**
   * Get adjusted position for a card during zone reordering.
   * Returns the shifted position if this card needs to move, otherwise null.
   */
  const getZoneReorderPosition = (
    card: (typeof cardStore.cards)[0],
  ): { x: number; y: number; rotation: number } | null => {
    const adjusted = zoneReorderPositions.value.get(card.id)
    return adjusted ?? null
  }

  return {
    zoneReorderPositions,
    shouldShowLockGlow,
    getCardLockColor,
    getCardLockHolder,
    isStackBottom,
    getStackSize,
    shouldShowFaceDown,
    getCardTransform,
    getLockedCardPosition,
    getZoneReorderPosition,
    getPlayerColor,
  }
}
