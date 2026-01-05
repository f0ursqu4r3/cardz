<script setup lang="ts">
import { computed } from 'vue'
import { Users, Hand } from 'lucide-vue-next'
import type { Player } from '../../../shared/types'

const props = defineProps<{
  players: Player[]
  handCounts: Map<string, number>
  currentPlayerId: string | null
  ownHandCount: number
}>()

defineEmits<{
  close: []
}>()

// Sort players: current player first, then others by name
const sortedPlayers = computed(() => {
  return [...props.players].sort((a, b) => {
    // Current player first
    if (a.id === props.currentPlayerId) return -1
    if (b.id === props.currentPlayerId) return 1
    // Then alphabetically by name
    return a.name.localeCompare(b.name)
  })
})

const getHandCount = (player: Player): number => {
  if (player.id === props.currentPlayerId) {
    return props.ownHandCount
  }
  return props.handCounts.get(player.id) ?? 0
}
</script>

<template>
  <div class="players-panel" @click.stop>
    <div class="players-panel__header">
      <Users :size="16" />
      <span>Players ({{ players.length }})</span>
    </div>
    <ul class="players-panel__list">
      <li
        v-for="player in sortedPlayers"
        :key="player.id"
        class="players-panel__player"
        :class="{
          'players-panel__player--current': player.id === currentPlayerId,
          'players-panel__player--disconnected': !player.connected,
        }"
      >
        <span class="players-panel__color" :style="{ backgroundColor: player.color }"></span>
        <span class="players-panel__name">
          {{ player.name }}
          <span v-if="player.id === currentPlayerId" class="players-panel__you">(you)</span>
        </span>
        <span class="players-panel__hand" :title="`${getHandCount(player)} cards in hand`">
          <Hand :size="14" />
          <span>{{ getHandCount(player) }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.players-panel {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.5rem;
  background: rgba(30, 30, 40, 0.95);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  min-width: 200px;
  max-width: 280px;
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  z-index: 1000;
  overflow: hidden;
}

.players-panel__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  font-weight: 600;
  font-size: 0.875rem;
}

.players-panel__list {
  list-style: none;
  margin: 0;
  padding: 0.5rem 0;
}

.players-panel__player {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 1rem;
  transition: background 0.15s;
}

.players-panel__player:hover {
  background: rgba(255, 255, 255, 0.05);
}

.players-panel__player--current {
  background: rgba(255, 255, 255, 0.03);
}

.players-panel__player--disconnected {
  opacity: 0.5;
}

.players-panel__color {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 6px currentColor;
}

.players-panel__name {
  flex: 1;
  font-size: 0.875rem;
  color: #e0e0e8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.players-panel__you {
  color: #a0a0b0;
  font-size: 0.75rem;
  margin-left: 0.25rem;
}

.players-panel__hand {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: #a0a0b0;
  font-size: 0.8125rem;
  padding: 0.125rem 0.375rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}
</style>
