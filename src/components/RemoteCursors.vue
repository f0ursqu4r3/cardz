<script setup lang="ts">
import { computed } from 'vue'
import { MousePointer2 } from 'lucide-vue-next'
import type { Player } from '../../shared/types'

const props = defineProps<{
  cursors: Map<string, { x: number; y: number }>
  players: Player[]
  currentPlayerId: string | null
}>()

// Get remote cursors with player info (excluding current player)
const remoteCursors = computed(() => {
  const result: { id: string; x: number; y: number; color: string; name: string }[] = []

  props.cursors.forEach((pos, playerId) => {
    if (playerId === props.currentPlayerId) return

    const player = props.players.find((p) => p.id === playerId)
    if (player) {
      result.push({
        id: playerId,
        x: pos.x,
        y: pos.y,
        color: player.color,
        name: player.name || 'Player',
      })
    }
  })

  return result
})
</script>

<template>
  <div
    v-for="cursor in remoteCursors"
    :key="cursor.id"
    class="remote-cursor"
    :style="{
      left: `${cursor.x}px`,
      top: `${cursor.y}px`,
      '--cursor-color': cursor.color,
    }"
  >
    <MousePointer2 class="remote-cursor__icon" :size="20" />
    <span class="remote-cursor__label">{{ cursor.name }}</span>
  </div>
</template>

<style scoped>
.remote-cursor {
  position: absolute;
  pointer-events: none;
  z-index: 9999;
  transform: translate(-2px, -2px);
  transition:
    left 0.05s linear,
    top 0.05s linear;
}

.remote-cursor__icon {
  color: var(--cursor-color);
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
}

.remote-cursor__label {
  position: absolute;
  left: 16px;
  top: 16px;
  background: var(--cursor-color);
  color: white;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
</style>
