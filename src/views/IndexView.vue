<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Card from '@/components/CardComp.vue'

type CardData = {
  id: number
  col: number
  row: number
  x: number
  y: number
  isInDeck: boolean
}

const canvasRef = ref<HTMLElement | null>(null)
const deckRef = ref<HTMLElement | null>(null)
const cards = ref<CardData[]>([])
const activeIndex = ref<number | null>(null)
const deckOrder = ref<number[]>([])
const dragState = {
  pointerId: null as number | null,
  offsetX: 0,
  offsetY: 0,
  pendingX: 0,
  pendingY: 0,
  rafId: 0,
}

const createCards = (count = 10) => {
  const rect = canvasRef.value?.getBoundingClientRect()
  const maxLeft = Math.max(0, (rect?.width ?? window.innerWidth) - 100)
  const maxTop = Math.max(0, (rect?.height ?? window.innerHeight) - 150)

  cards.value = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    col: Math.floor(Math.random() * 5),
    row: Math.floor(Math.random() * 5),
    x: Math.random() * maxLeft,
    y: Math.random() * maxTop,
    isInDeck: false,
  }))
}

const getCanvasPoint = (event: PointerEvent) => {
  const rect = canvasRef.value?.getBoundingClientRect()
  const x = rect ? event.clientX - rect.left : event.clientX
  const y = rect ? event.clientY - rect.top : event.clientY

  return { x, y }
}

const deckAnchor = () => {
  const deckRect = deckRef.value?.getBoundingClientRect()
  const canvasRect = canvasRef.value?.getBoundingClientRect()
  if (!deckRect || !canvasRect) {
    return null
  }

  return {
    x: deckRect.left - canvasRect.left + 8,
    y: deckRect.top - canvasRect.top + 8,
  }
}

const updateDeckPositions = () => {
  const anchor = deckAnchor()
  if (!anchor) {
    return
  }

  deckOrder.value.forEach((id, idx) => {
    const card = cards.value.find((item) => item.id === id)
    if (!card) {
      return
    }

    card.isInDeck = true
    card.x = anchor.x + idx * 1.5
    card.y = anchor.y + idx * 2
  })
}

const removeFromDeck = (id: number) => {
  const card = cards.value.find((item) => item.id === id)
  if (card) {
    card.isInDeck = false
  }

  deckOrder.value = deckOrder.value.filter((value) => value !== id)
  updateDeckPositions()
}

const addToDeck = (id: number) => {
  removeFromDeck(id)
  deckOrder.value.push(id)
  updateDeckPositions()
}

const isInDeckArea = (event: PointerEvent) => {
  const rect = deckRef.value?.getBoundingClientRect()
  if (!rect) {
    return false
  }

  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  )
}

const deckLayer = (id: number) => {
  const idx = deckOrder.value.indexOf(id)
  return idx === -1 ? 10 : 500 + idx
}

const applyPendingPosition = () => {
  const index = activeIndex.value
  if (index === null) {
    return
  }

  const card = cards.value[index]
  if (!card) {
    return
  }

  card.x = dragState.pendingX - dragState.offsetX
  card.y = dragState.pendingY - dragState.offsetY
}

const schedulePositionUpdate = () => {
  if (dragState.rafId) {
    return
  }

  dragState.rafId = window.requestAnimationFrame(() => {
    dragState.rafId = 0
    applyPendingPosition()
  })
}

const onCardPointerDown = (event: PointerEvent, index: number) => {
  if (event.button !== 0) {
    return
  }

  event.preventDefault()
  const target = event.currentTarget as HTMLElement | null
  target?.setPointerCapture(event.pointerId)

  const card = cards.value[index]
  if (!card) {
    return
  }

  if (card.isInDeck) {
    const deckIdx = deckOrder.value.indexOf(card.id)
    if (deckIdx !== deckOrder.value.length - 1) {
      return
    }

    removeFromDeck(card.id)
  }

  const { x, y } = getCanvasPoint(event)
  activeIndex.value = index
  dragState.pointerId = event.pointerId
  dragState.offsetX = x - card.x
  dragState.offsetY = y - card.y
  dragState.pendingX = x
  dragState.pendingY = y
  schedulePositionUpdate()
}

const onCardPointerMove = (event: PointerEvent) => {
  if (event.pointerId !== dragState.pointerId || activeIndex.value === null) {
    return
  }

  const { x, y } = getCanvasPoint(event)
  dragState.pendingX = x
  dragState.pendingY = y
  schedulePositionUpdate()
}

const onCardPointerUp = (event: PointerEvent) => {
  if (event.pointerId !== dragState.pointerId) {
    return
  }

  const target = event.currentTarget as HTMLElement | null
  target?.releasePointerCapture(event.pointerId)

  applyPendingPosition()
  if (activeIndex.value !== null) {
    const card = cards.value[activeIndex.value]
    if (card && isInDeckArea(event)) {
      addToDeck(card.id)
    }
  }

  activeIndex.value = null
  dragState.pointerId = null

  if (dragState.rafId) {
    window.cancelAnimationFrame(dragState.rafId)
    dragState.rafId = 0
  }
}

onMounted(() => {
  createCards()
  updateDeckPositions()
})

onBeforeUnmount(() => {
  if (dragState.rafId) {
    window.cancelAnimationFrame(dragState.rafId)
  }
})
</script>

<template>
  <div ref="canvasRef" class="canvas">
    <Card
      v-for="(card, index) in cards"
      :key="card.id"
      :class="{ dragging: activeIndex === index, 'in-deck': card.isInDeck }"
      :style="{
        '--col': card.col,
        '--row': card.row,
        transform: `translate3d(${card.x}px, ${card.y}px, 0)`,
        zIndex: activeIndex === index ? 1200 : deckLayer(card.id),
      }"
      @pointerdown="onCardPointerDown($event, index)"
      @pointermove="onCardPointerMove"
      @pointerup="onCardPointerUp"
      @pointercancel="onCardPointerUp"
    />

    <div ref="deckRef" class="deck" aria-hidden="true">
      <span class="deck__label">Deck</span>
      <span class="deck__count">{{ deckOrder.length }}</span>
    </div>
  </div>
</template>

<style scoped>
.canvas {
  width: 100%;
  height: 100%;
  background-color: green;
  position: relative;
  overflow: hidden;
  user-select: none;
  touch-action: none;
}

.deck {
  position: absolute;
  right: 24px;
  bottom: 24px;
  width: calc(var(--tile-w) + 24px);
  height: calc(var(--tile-h) + 24px);
  border: 2px dashed rgba(255, 255, 255, 0.7);
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 10px;
  color: #f0f0f0;
  background-color: rgba(0, 0, 0, 0.15);
  pointer-events: none;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2) inset;
}

.deck__label {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.deck__count {
  font-weight: 700;
  font-size: 14px;
}
</style>
