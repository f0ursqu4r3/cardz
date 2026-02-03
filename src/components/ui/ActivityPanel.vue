<script setup lang="ts">
import { ref, nextTick, watch, onMounted, onUnmounted, computed } from 'vue'
import { Activity, X, ChevronDown } from 'lucide-vue-next'
import type { ActivityLogEntry } from '../../../shared/types'

const props = withDefaults(
  defineProps<{
    entries: ActivityLogEntry[]
    isOpen: boolean
    canModerate?: boolean
  }>(),
  { canModerate: false },
)

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
}>()

const entriesRef = ref<HTMLDivElement | null>(null)
const unreadCount = ref(0)
const isAtBottom = ref(true)
const showModerationOnly = ref(false)

const moderationTypes = new Set([
  'player_kicked',
  'player_banned',
  'player_promoted',
  'player_demoted',
])

const filteredEntries = computed(() => {
  if (!showModerationOnly.value) return props.entries
  return props.entries.filter((entry) => moderationTypes.has(entry.actionType))
})

// Track unread entries when panel is closed
watch(
  () => props.entries.length,
  (newLen, oldLen) => {
    if (!props.isOpen && newLen > oldLen) {
      unreadCount.value += newLen - oldLen
    }
    // Auto-scroll if at bottom
    if (props.isOpen && isAtBottom.value) {
      nextTick(scrollToBottom)
    }
  },
)

// Clear unread count when opening
watch(
  () => props.isOpen,
  (isOpen) => {
    if (isOpen) {
      unreadCount.value = 0
      nextTick(scrollToBottom)
    }
  },
)

const scrollToBottom = () => {
  if (entriesRef.value) {
    entriesRef.value.scrollTop = entriesRef.value.scrollHeight
  }
}

const handleScroll = () => {
  if (entriesRef.value) {
    const { scrollTop, scrollHeight, clientHeight } = entriesRef.value
    isAtBottom.value = scrollHeight - scrollTop - clientHeight < 50
  }
}

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const togglePanel = () => {
  emit('update:isOpen', !props.isOpen)
}

// Format activity message based on action type
const formatActivity = (entry: ActivityLogEntry): string => {
  const name = entry.playerName || 'Someone'
  const data = entry.actionData || {}

  switch (entry.actionType) {
    case 'player_joined':
      return `${name} joined the table`
    case 'player_left':
      return `${name} left the table`
    case 'player_spectating':
      return `${name} is now spectating`
    case 'card_placed':
      const cardCount = (data.count as number) || 1
      return `${name} placed ${cardCount} card${cardCount > 1 ? 's' : ''}`
    case 'stack_created':
      return `${name} created a stack of ${data.cardCount || '?'} cards`
    case 'stack_shuffled':
      return `${name} shuffled a deck (${data.cardCount || '?'} cards)`
    case 'stack_flipped':
      return `${name} flipped a stack (${data.cardCount || '?'} cards)`
    case 'zone_created':
      return `${name} created zone "${data.name || 'Untitled'}"`
    case 'zone_deleted':
      return `${name} deleted zone "${data.name || 'Untitled'}"`
    case 'die_rolled':
      return `${name} rolled a d${data.sides || 6} and got ${data.value}`
    case 'counter_changed':
      return `${name} changed ${data.name || 'counter'}: ${data.from} → ${data.to}`
    case 'timer_started':
      return `${name} started ${data.name || 'timer'}`
    case 'timer_stopped':
      return `${name} stopped ${data.name || 'timer'}`
    case 'table_reset':
      return `${name} reset the table`
    case 'settings_changed':
      return `${name} changed settings (${data.setting || 'unknown'})`
    case 'player_kicked':
      return `${name} kicked ${data.target || 'a player'}`
    case 'player_banned':
      return `${name} banned ${data.target || 'a player'}`
    case 'player_promoted':
      return `${name} promoted ${data.target || 'a player'}`
    case 'player_demoted':
      return `${name} demoted ${data.target || 'a player'}`
    default:
      return `${name} performed an action`
  }
}

// Get color for activity type
const getActivityColor = (actionType: string): string => {
  switch (actionType) {
    case 'player_joined':
    case 'player_spectating':
      return '#4ade80' // green
    case 'player_left':
      return '#f87171' // red
    case 'player_kicked':
    case 'player_banned':
    case 'player_promoted':
    case 'player_demoted':
      return '#ef4444' // bright red for moderation actions
    case 'die_rolled':
      return '#fbbf24' // yellow
    case 'stack_shuffled':
    case 'stack_flipped':
      return '#60a5fa' // blue
    case 'table_reset':
      return '#f97316' // orange
    case 'counter_changed':
      return '#a78bfa' // purple
    case 'timer_started':
    case 'timer_stopped':
      return '#2dd4bf' // teal
    default:
      return '#a0a0b0' // gray
  }
}

// Handle Escape key to close panel
const handleGlobalKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.isOpen) {
    emit('update:isOpen', false)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <div class="activity" :class="{ 'activity--open': isOpen }">
    <!-- Toggle Button -->
    <button
      class="activity__toggle"
      :class="{ 'activity__toggle--has-unread': unreadCount > 0 }"
      @click="togglePanel"
      :title="isOpen ? 'Close activity log' : 'Open activity log'"
    >
      <Activity :size="20" />
      <span v-if="unreadCount > 0" class="activity__badge">{{
        unreadCount > 9 ? '9+' : unreadCount
      }}</span>
    </button>

    <!-- Activity Panel -->
    <div v-if="isOpen" class="activity__panel">
      <div class="activity__header">
        <Activity :size="16" />
        <span>Activity Log</span>
        <div class="activity__header-right">
          <div v-if="props.canModerate" class="activity__filters">
            <button
              class="activity__filter"
              :class="{ 'activity__filter--active': !showModerationOnly }"
              @click="showModerationOnly = false"
            >
              All
            </button>
            <button
              class="activity__filter"
              :class="{ 'activity__filter--active': showModerationOnly }"
              @click="showModerationOnly = true"
            >
              Mod
            </button>
          </div>
          <button class="activity__close" @click="togglePanel">
            <X :size="16" />
          </button>
        </div>
      </div>

      <div ref="entriesRef" class="activity__entries" @scroll="handleScroll">
        <div v-if="filteredEntries.length === 0" class="activity__empty">No activity yet</div>
        <div
          v-for="entry in filteredEntries"
          :key="entry.id"
          class="activity__entry"
          :style="{ '--activity-color': getActivityColor(entry.actionType) }"
        >
          <span class="activity__dot"></span>
          <div class="activity__content">
            <span class="activity__text">{{ formatActivity(entry) }}</span>
            <span class="activity__time">{{ formatTime(entry.timestamp) }}</span>
          </div>
        </div>
      </div>

      <!-- Scroll to bottom button -->
      <button
        v-if="!isAtBottom && entries.length > 0"
        class="activity__scroll-bottom"
        @click="scrollToBottom"
      >
        <ChevronDown :size="16" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.activity {
  position: relative;
}

.activity__toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(30, 30, 40, 0.95);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #a0a0b0;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.activity__toggle:hover {
  background: rgba(40, 40, 55, 0.95);
  color: #fff;
  transform: scale(1.05);
}

.activity__toggle--has-unread {
  color: #60a5fa;
}

.activity__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: #60a5fa;
  border-radius: 9px;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.activity--open .activity__toggle {
  display: none;
}

.activity__panel {
  width: 300px;
  max-height: 400px;
  background: rgba(30, 30, 40, 0.95);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.activity__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  font-weight: 600;
  font-size: 0.875rem;
}

.activity__header-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.activity__filters {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.activity__filter {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.15s;
}

.activity__filter--active {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.activity__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #a0a0b0;
  cursor: pointer;
  transition: all 0.15s;
}

.activity__close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.activity__entries {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
  min-height: 150px;
  max-height: 300px;
}

.activity__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
  font-size: 0.875rem;
  text-align: center;
  padding: 2rem;
}

.activity__entry {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 0.625rem;
  padding-left: 0.25rem;
}

.activity__entry:last-child {
  margin-bottom: 0;
}

.activity__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--activity-color, #a0a0b0);
  margin-top: 0.375rem;
  flex-shrink: 0;
}

.activity__content {
  flex: 1;
  min-width: 0;
}

.activity__text {
  display: block;
  color: #e0e0e8;
  font-size: 0.8125rem;
  line-height: 1.4;
  word-wrap: break-word;
}

.activity__time {
  display: block;
  font-size: 0.6875rem;
  color: #666;
  margin-top: 0.125rem;
}

.activity__scroll-bottom {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: rgba(50, 50, 65, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  color: #a0a0b0;
  cursor: pointer;
  transition: all 0.2s;
}

.activity__scroll-bottom:hover {
  background: rgba(60, 60, 75, 0.95);
  color: #fff;
}
</style>
