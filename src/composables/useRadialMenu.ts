import { ref, computed } from 'vue'
import type { RadialMenuItem } from '@/components/ui/RadialMenu.vue'

export type RadialMenuTarget =
  | { type: 'card'; cardId: number; isInStack: boolean; isInZone: boolean; isFaceUp: boolean }
  | { type: 'stack'; stackId: number; cardCount: number }
  | { type: 'zone'; zoneId: number; locked: boolean }
  | { type: 'selection'; cardIds: number[] }
  | { type: 'hand-card'; cardId: number; isFaceUp: boolean }
  | { type: 'hand-selection'; cardIds: number[] }
  | { type: 'canvas'; worldX: number; worldY: number }
  | { type: 'counter'; counterId: number; value: number }
  | { type: 'token'; tokenId: number; kind: 'color' | 'sprite' }
  | { type: 'die'; dieId: number; value: number }
  | { type: 'timer'; timerId: number; status: 'stopped' | 'running' | 'paused' | 'finished'; mode: 'countdown' | 'stopwatch' }

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
        return getStackMenuItems()
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
      case 'counter':
        return getCounterMenuItems(target.value)
      case 'token':
        return getTokenMenuItems(target.value)
      case 'die':
        return getDieMenuItems(target.value)
      case 'timer':
        return getTimerMenuItems(target.value)
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
      {
        id: 'to-hand',
        label: 'Add to hand',
        icon: 'hand',
      },
    ]

    if (t.isInStack && !t.isInZone) {
      items.push({
        id: 'pick-up',
        label: 'Pick up from stack',
        icon: 'arrow-up',
      })
    }

    return items
  }

  function getStackMenuItems(): RadialMenuItem[] {
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
        id: 'all-face-up',
        label: 'All face up',
        icon: 'eye',
      },
      {
        id: 'all-face-down',
        label: 'All face down',
        icon: 'eye-off',
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

  function getZoneMenuItems(t: Extract<RadialMenuTarget, { type: 'zone' }>): RadialMenuItem[] {
    const items: RadialMenuItem[] = [
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
    ]
    if (!t.locked) {
      items.push(
        {
          id: 'zone-settings',
          label: 'Zone settings',
          icon: 'settings',
        },
        {
          id: 'zone-delete',
          label: 'Delete zone',
          icon: 'trash',
          danger: true,
        },
      )
    }
    return items
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
        icon: 'square-plus',
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

  function getCounterMenuItems(
    _t: Extract<RadialMenuTarget, { type: 'counter' }>,
  ): RadialMenuItem[] {
    return [
      {
        id: 'counter-reset',
        label: 'Reset to zero',
        icon: 'rotate-ccw',
      },
      {
        id: 'counter-settings',
        label: 'Edit counter',
        icon: 'settings',
      },
      {
        id: 'counter-delete',
        label: 'Delete counter',
        icon: 'trash',
        danger: true,
      },
    ]
  }

  function getTokenMenuItems(
    _t: Extract<RadialMenuTarget, { type: 'token' }>,
  ): RadialMenuItem[] {
    return [
      {
        id: 'token-duplicate',
        label: 'Duplicate',
        icon: 'copy',
      },
      {
        id: 'token-settings',
        label: 'Edit token',
        icon: 'settings',
      },
      {
        id: 'token-delete',
        label: 'Delete token',
        icon: 'trash',
        danger: true,
      },
    ]
  }

  function getDieMenuItems(
    _t: Extract<RadialMenuTarget, { type: 'die' }>,
  ): RadialMenuItem[] {
    return [
      {
        id: 'die-roll',
        label: 'Roll die',
        icon: 'dices',
      },
      {
        id: 'die-settings',
        label: 'Edit die',
        icon: 'settings',
      },
      {
        id: 'die-delete',
        label: 'Delete die',
        icon: 'trash',
        danger: true,
      },
    ]
  }

  function getTimerMenuItems(
    t: Extract<RadialMenuTarget, { type: 'timer' }>,
  ): RadialMenuItem[] {
    const items: RadialMenuItem[] = []

    // Play/pause based on current status
    if (t.status === 'running') {
      items.push({
        id: 'timer-pause',
        label: 'Pause',
        icon: 'pause',
      })
    } else if (t.status !== 'finished') {
      items.push({
        id: 'timer-start',
        label: 'Start',
        icon: 'play',
      })
    }

    items.push(
      {
        id: 'timer-reset',
        label: 'Reset',
        icon: 'rotate-ccw',
      },
      {
        id: 'timer-settings',
        label: 'Edit timer',
        icon: 'settings',
      },
      {
        id: 'timer-delete',
        label: 'Delete timer',
        icon: 'trash',
        danger: true,
      },
    )

    return items
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
