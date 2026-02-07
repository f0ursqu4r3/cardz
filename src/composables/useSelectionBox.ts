import { ref, computed } from 'vue'
import type { useViewport } from './useViewport'
import type { useCardStore } from '@/stores/cards'
import type { ClientMessage } from '../../shared/types'
import { CARD_W, CARD_H } from '@/types'

const TOKEN_SIZES: Record<string, number> = { small: 24, medium: 36, large: 48 }
const DIE_SIZE = 40
const TIMER_W = 160
const TIMER_H = 60
const COUNTER_W = 80
const COUNTER_H = 50
const MIN_DRAG_DISTANCE = 5

interface SelectionBoxConfig {
  viewport: ReturnType<typeof useViewport>
  cardStore: ReturnType<typeof useCardStore>
  sendMessage: (msg: ClientMessage) => void
}

export interface BoxRect {
  x: number
  y: number
  width: number
  height: number
}

function rectsIntersect(
  a: BoxRect,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return a.x < bx + bw && a.x + a.width > bx && a.y < by + bh && a.y + a.height > by
}

export function useSelectionBox(config: SelectionBoxConfig) {
  const { viewport, cardStore, sendMessage } = config

  const isActive = ref(false)
  const isTracking = ref(false)
  const startWorld = ref({ x: 0, y: 0 })
  const currentWorld = ref({ x: 0, y: 0 })
  const startScreen = ref({ x: 0, y: 0 })
  const shiftHeld = ref(false)

  let lastBroadcast = 0
  let broadcastTimer: number | null = null

  const boxRect = computed<BoxRect | null>(() => {
    if (!isActive.value) return null
    const sx = startWorld.value.x
    const sy = startWorld.value.y
    const cx = currentWorld.value.x
    const cy = currentWorld.value.y
    return {
      x: Math.min(sx, cx),
      y: Math.min(sy, cy),
      width: Math.abs(cx - sx),
      height: Math.abs(cy - sy),
    }
  })

  const broadcastBox = (box: BoxRect | null) => {
    sendMessage({
      type: 'selection:box_update',
      box,
    })
  }

  const throttledBroadcast = () => {
    const now = Date.now()
    if (now - lastBroadcast >= 50) {
      lastBroadcast = now
      broadcastBox(boxRect.value)
    } else if (!broadcastTimer) {
      broadcastTimer = window.setTimeout(() => {
        broadcastTimer = null
        lastBroadcast = Date.now()
        broadcastBox(boxRect.value)
      }, 50 - (now - lastBroadcast))
    }
  }

  const start = (event: PointerEvent) => {
    const world = viewport.screenToWorld(event.clientX, event.clientY)
    startWorld.value = { x: world.x, y: world.y }
    currentWorld.value = { x: world.x, y: world.y }
    startScreen.value = { x: event.clientX, y: event.clientY }
    shiftHeld.value = event.shiftKey
    isTracking.value = true
    isActive.value = false
  }

  const update = (event: PointerEvent) => {
    if (!isTracking.value) return

    // Check min drag distance before activating
    if (!isActive.value) {
      const dx = event.clientX - startScreen.value.x
      const dy = event.clientY - startScreen.value.y
      if (Math.sqrt(dx * dx + dy * dy) < MIN_DRAG_DISTANCE) return

      isActive.value = true
      // Clear existing selections if not Shift
      if (!shiftHeld.value) {
        cardStore.clearAllSelections()
      }
    }

    const world = viewport.screenToWorld(event.clientX, event.clientY)
    currentWorld.value = { x: world.x, y: world.y }
    throttledBroadcast()
  }

  const end = () => {
    if (!isTracking.value) return

    if (isActive.value && boxRect.value) {
      applySelection(boxRect.value)
    }

    // Broadcast null to clear remote box
    broadcastBox(null)

    if (broadcastTimer) {
      clearTimeout(broadcastTimer)
      broadcastTimer = null
    }

    isActive.value = false
    isTracking.value = false
  }

  const cancel = () => {
    if (broadcastTimer) {
      clearTimeout(broadcastTimer)
      broadcastTimer = null
    }
    if (isTracking.value) {
      broadcastBox(null)
    }
    isActive.value = false
    isTracking.value = false
  }

  const applySelection = (rect: BoxRect) => {
    const cardIds: number[] = []
    const dieIds: number[] = []
    const tokenIds: number[] = []
    const counterIds: number[] = []
    const timerIds: number[] = []

    // Cards: top-left origin, CARD_W x CARD_H — only free cards
    for (const card of cardStore.cards) {
      if (card.stackId !== null || card.inHand) continue
      if (rectsIntersect(rect, card.x, card.y, CARD_W, CARD_H)) {
        cardIds.push(card.id)
      }
    }

    // Dice: center origin, DIE_SIZE x DIE_SIZE
    for (const die of cardStore.dice) {
      if (rectsIntersect(rect, die.x - DIE_SIZE / 2, die.y - DIE_SIZE / 2, DIE_SIZE, DIE_SIZE)) {
        dieIds.push(die.id)
      }
    }

    // Tokens: center origin, size varies
    for (const token of cardStore.tokens) {
      const size = TOKEN_SIZES[token.size] || 36
      if (rectsIntersect(rect, token.x - size / 2, token.y - size / 2, size, size)) {
        tokenIds.push(token.id)
      }
    }

    // Counters: top-left origin via translate3d, min-width 80, estimated height 50
    for (const counter of cardStore.counters) {
      if (rectsIntersect(rect, counter.x, counter.y, COUNTER_W, COUNTER_H)) {
        counterIds.push(counter.id)
      }
    }

    // Timers: center origin (translate3d(x-70, y-30)), 160 x 60
    for (const timer of cardStore.timers) {
      if (
        rectsIntersect(rect, timer.x - TIMER_W / 2, timer.y - TIMER_H / 2, TIMER_W, TIMER_H)
      ) {
        timerIds.push(timer.id)
      }
    }

    // Apply selections
    if (cardIds.length) cardStore.selectCardIds(cardIds)
    if (dieIds.length) cardStore.selectDieIds(dieIds)
    if (tokenIds.length) cardStore.selectTokenIds(tokenIds)
    if (counterIds.length) cardStore.selectCounterIds(counterIds)
    if (timerIds.length) cardStore.selectTimerIds(timerIds)
  }

  return {
    isActive,
    isTracking,
    boxRect,
    start,
    update,
    end,
    cancel,
  }
}
