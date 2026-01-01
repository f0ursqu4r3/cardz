<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Card from '@/components/CardComp.vue'

type CardData = {
  id: number
  col: number
  row: number
  x: number
  y: number
}

const canvasRef = ref<HTMLElement | null>(null)
const cards = ref<CardData[]>([])
const activeIndex = ref<number | null>(null)
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
  }))
}

const getCanvasPoint = (event: PointerEvent) => {
  const rect = canvasRef.value?.getBoundingClientRect()
  const x = rect ? event.clientX - rect.left : event.clientX
  const y = rect ? event.clientY - rect.top : event.clientY

  return { x, y }
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
  activeIndex.value = null
  dragState.pointerId = null

  if (dragState.rafId) {
    window.cancelAnimationFrame(dragState.rafId)
    dragState.rafId = 0
  }
}

onMounted(() => {
  createCards()
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
      :class="{ dragging: activeIndex === index }"
      :style="{
        '--col': card.col,
        '--row': card.row,
        transform: `translate3d(${card.x}px, ${card.y}px, 0)`,
      }"
      @pointerdown="onCardPointerDown($event, index)"
      @pointermove="onCardPointerMove"
      @pointerup="onCardPointerUp"
      @pointercancel="onCardPointerUp"
    />
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
</style>
