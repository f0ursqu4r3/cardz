import { ref, computed } from 'vue'
import type { RadialMenuItem } from '@/components/ui/RadialMenu.vue'

export type RadialMenuTarget =
  | { type: 'card'; cardId: number; isInStack: boolean; isFaceUp: boolean }
  | { type: 'stack'; stackId: number; cardCount: number }
  | { type: 'zone'; zoneId: number }
  | { type: 'selection'; cardIds: number[] }
  | { type: 'hand-card'; cardId: number; isFaceUp: boolean }
  | { type: 'hand-selection'; cardIds: number[] }
  | { type: 'canvas'; worldX: number; worldY: number }

export function useRadialMenu() {
  const visible = ref(false)
  const position = ref({ x: 0, y: 0 })
  const target = ref<RadialMenuTarget | null>(null)

  // Menu items based on current target
  const items = computed<RadialMenuItem[]>(() => {
    if (!target.value) return []

    switch (target.value.type) {
      case 'card':
        return getCardMenuItems(target.value)
      case 'stack':
        return getStackMenuItems(target.value)
      case 'zone':
        return getZoneMenuItems(target.value)
      case 'selection':
        return getSelectionMenuItems(target.value)
      case 'hand-card':
        return getHandCardMenuItems(target.value)
      case 'hand-selection':
        return getHandSelectionMenuItems(target.value)
      case 'canvas':
        return getCanvasMenuItems()
      default:
        return []
    }
  })

  function getCardMenuItems(t: Extract<RadialMenuTarget, { type: 'card' }>): RadialMenuItem[] {
    const items: RadialMenuItem[] = [
      {
        id: 'flip',
        label: t.isFaceUp ? 'Flip face down' : 'Flip face up',
        icon: 'rotate-cw',
      },
    ]

    if (!t.isInStack) {
      items.push({
        id: 'to-hand',
        label: 'Add to hand',
        icon: 'hand',
      })
    }

    if (t.isInStack) {
      items.push({
        id: 'pick-up',
        label: 'Pick up from stack',
        icon: 'arrow-up',
      })
    }

    return items
  }

  function getStackMenuItems(t: Extract<RadialMenuTarget, { type: 'stack' }>): RadialMenuItem[] {
    return [
      {
        id: 'flip-stack',
        label: 'Flip stack',
        icon: 'rotate-cw',
      },
      {
        id: 'shuffle',
        label: 'Shuffle',
        icon: 'shuffle',
      },
      {
        id: 'spread',
        label: 'Spread cards',
        icon: 'arrow-up-from-line',
      },
      {
        id: 'flip-all',
        label: 'Flip all cards',
        icon: 'layers',
      },
      {
        id: 'draw-top',
        label: 'Draw top card',
        icon: 'arrow-up',
      },
      {
        id: 'all-to-hand',
        label: 'Add all to hand',
        icon: 'hand',
      },
    ]
  }

  function getZoneMenuItems(_t: Extract<RadialMenuTarget, { type: 'zone' }>): RadialMenuItem[] {
    return [
      {
        id: 'zone-settings',
        label: 'Zone settings',
        icon: 'settings',
      },
      {
        id: 'zone-lock',
        label: 'Toggle lock',
        icon: 'lock',
      },
      {
        id: 'zone-flip-all',
        label: 'Flip all cards',
        icon: 'rotate-cw',
      },
      {
        id: 'zone-shuffle',
        label: 'Shuffle zone',
        icon: 'shuffle',
      },
      {
        id: 'zone-delete',
        label: 'Delete zone',
        icon: 'trash',
        danger: true,
      },
    ]
  }

  function getSelectionMenuItems(
    t: Extract<RadialMenuTarget, { type: 'selection' }>,
  ): RadialMenuItem[] {
    return [
      {
        id: 'stack-selection',
        label: 'Stack selected',
        icon: 'layers',
        disabled: t.cardIds.length < 2,
      },
      {
        id: 'flip-selection',
        label: 'Flip selected',
        icon: 'rotate-cw',
      },
      {
        id: 'to-hand',
        label: 'Add to hand',
        icon: 'hand',
      },
      {
        id: 'deselect',
        label: 'Deselect all',
        icon: 'x',
      },
    ]
  }

  function getHandCardMenuItems(
    _t: Extract<RadialMenuTarget, { type: 'hand-card' }>,
  ): RadialMenuItem[] {
    return [
      {
        id: 'play-to-table',
        label: 'Play face up',
        icon: 'arrow-up-from-line',
      },
      {
        id: 'play-face-down',
        label: 'Play face down',
        icon: 'eye-off',
      },
    ]
  }

  function getHandSelectionMenuItems(
    t: Extract<RadialMenuTarget, { type: 'hand-selection' }>,
  ): RadialMenuItem[] {
    return [
      {
        id: 'play-all-to-table',
        label: 'Play all to table',
        icon: 'arrow-up-from-line',
      },
      {
        id: 'stack-and-play',
        label: 'Stack & play',
        icon: 'layers',
        disabled: t.cardIds.length < 2,
      },
      {
        id: 'flip-selection',
        label: 'Flip selected',
        icon: 'rotate-cw',
      },
      {
        id: 'deselect',
        label: 'Deselect all',
        icon: 'x',
      },
    ]
  }

  function getCanvasMenuItems(): RadialMenuItem[] {
    return [
      {
        id: 'create-zone',
        label: 'Create zone',
        icon: 'square',
      },
      {
        id: 'deal-card',
        label: 'Deal a card',
        icon: 'layers',
      },
      {
        id: 'reset-view',
        label: 'Reset view',
        icon: 'search',
      },
    ]
  }

  function open(x: number, y: number, menuTarget: RadialMenuTarget) {
    position.value = { x, y }
    target.value = menuTarget
    visible.value = true
  }

  function close() {
    visible.value = false
    target.value = null
  }

  return {
    visible,
    position,
    target,
    items,
    open,
    close,
  }
}
