<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Users, RefreshCw, Globe, Search, Clock } from 'lucide-vue-next'
import type { ServerMessage, PublicRoomInfo } from '../../shared/types'

const router = useRouter()
const tables = ref<PublicRoomInfo[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const playerName = ref('')
const searchQuery = ref('')
const sortBy = ref<'players' | 'newest' | 'oldest'>('players')

// WebSocket connection for fetching public rooms
let ws: WebSocket | null = null

/**
 * Get the WebSocket URL, auto-detecting protocol based on page protocol
 */
function getWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.hostname
  const port = window.location.protocol === 'https:' ? '' : ':9001'
  return `${protocol}//${host}${port}`
}

const wsUrl = getWsUrl()

// Filtered and sorted tables
const filteredTables = computed(() => {
  let result = [...tables.value]

  // Apply search filter
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim()
    result = result.filter(
      (table) =>
        table.name.toLowerCase().includes(query) || table.code.toLowerCase().includes(query),
    )
  }

  // Apply sorting
  switch (sortBy.value) {
    case 'players':
      result.sort((a, b) => b.playerCount - a.playerCount)
      break
    case 'newest':
      result.sort((a, b) => b.createdAt - a.createdAt)
      break
    case 'oldest':
      result.sort((a, b) => a.createdAt - b.createdAt)
      break
  }

  return result
})

const connectWebSocket = () => {
  if (ws?.readyState === WebSocket.OPEN) {
    requestRoomList()
    return
  }

  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    console.log('[browser] WebSocket connected')
    requestRoomList()
  }

  ws.onmessage = (event) => {
    try {
      const msg: ServerMessage = JSON.parse(event.data)
      if (msg.type === 'room:list') {
        tables.value = msg.rooms
        loading.value = false
        error.value = null
      }
    } catch (e) {
      console.error('[browser] Failed to parse message:', e)
    }
  }

  ws.onerror = () => {
    console.error('[browser] WebSocket error')
    error.value = 'Failed to connect to server'
    loading.value = false
  }

  ws.onclose = () => {
    console.log('[browser] WebSocket closed')
  }
}

const requestRoomList = () => {
  if (ws?.readyState === WebSocket.OPEN) {
    loading.value = true
    error.value = null
    ws.send(JSON.stringify({ type: 'room:list' }))
  } else {
    error.value = 'Not connected to server'
    loading.value = false
  }
}

const fetchTables = () => {
  if (ws?.readyState === WebSocket.OPEN) {
    requestRoomList()
  } else {
    connectWebSocket()
  }
}

const joinTable = (code: string) => {
  const name = playerName.value.trim() || 'Player'
  router.push({
    name: 'table',
    params: { code },
    query: { name },
  })
}

const goBack = () => {
  router.push({ name: 'landing' })
}

const formatTimeAgo = (timestamp: number): string => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// Background colors for table cards based on table background setting
const getTableCardBackground = (bg?: string): string => {
  const backgrounds: Record<string, string> = {
    'green-felt': 'linear-gradient(135deg, #1f7a3a 0%, #0f4f27 100%)',
    'blue-felt': 'linear-gradient(135deg, #1a5a8a 0%, #0f3a5a 100%)',
    'red-felt': 'linear-gradient(135deg, #8a1a1a 0%, #5a0f0f 100%)',
    'wood-oak': 'linear-gradient(135deg, #8b6b4e 0%, #5c4033 100%)',
    'wood-dark': 'linear-gradient(135deg, #3d2817 0%, #1a0f0a 100%)',
    slate: 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)',
  }
  return backgrounds[bg ?? 'green-felt'] ?? backgrounds['green-felt']!
}

onMounted(() => {
  connectWebSocket()
})

onUnmounted(() => {
  if (ws) {
    ws.close()
    ws = null
  }
})
</script>

<template>
  <div class="browser">
    <header class="browser__header">
      <button class="browser__back" @click="goBack">
        <ArrowLeft :size="20" />
        Back
      </button>
      <h1 class="browser__title">
        <Globe :size="28" />
        Public Tables
      </h1>
      <button
        class="browser__refresh"
        :class="{ 'browser__refresh--loading': loading }"
        @click="fetchTables"
      >
        <RefreshCw :size="20" />
      </button>
    </header>

    <div class="browser__content">
      <!-- Search and Filters -->
      <div class="browser__controls">
        <div class="browser__search">
          <Search :size="18" class="browser__search-icon" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search tables by name or code..."
            class="browser__search-input"
          />
        </div>

        <div class="browser__filter-row">
          <div class="browser__name-field">
            <label for="browserPlayerName">Your Name</label>
            <input
              id="browserPlayerName"
              v-model="playerName"
              type="text"
              placeholder="Enter your name"
              maxlength="20"
            />
          </div>

          <div class="browser__sort">
            <label>Sort by</label>
            <div class="browser__sort-buttons">
              <button
                :class="{ active: sortBy === 'players' }"
                @click="sortBy = 'players'"
                title="Sort by player count"
              >
                <Users :size="14" />
                Popular
              </button>
              <button
                :class="{ active: sortBy === 'newest' }"
                @click="sortBy = 'newest'"
                title="Sort by newest"
              >
                <Clock :size="14" />
                Newest
              </button>
              <button
                :class="{ active: sortBy === 'oldest' }"
                @click="sortBy = 'oldest'"
                title="Sort by oldest"
              >
                <Clock :size="14" />
                Oldest
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Results count -->
      <div v-if="!loading && !error && tables.length > 0" class="browser__results-info">
        <span v-if="searchQuery"> {{ filteredTables.length }} of {{ tables.length }} tables </span>
        <span v-else> {{ tables.length }} public table{{ tables.length === 1 ? '' : 's' }} </span>
      </div>

      <div v-if="loading" class="browser__loading">
        <RefreshCw :size="32" class="browser__spinner" />
        <p>Loading tables...</p>
      </div>

      <div v-else-if="error" class="browser__error">
        <p>{{ error }}</p>
        <button class="browser__btn" @click="fetchTables">Try Again</button>
      </div>

      <div v-else-if="tables.length === 0" class="browser__empty">
        <Users :size="48" />
        <h3>No Public Tables</h3>
        <p>There are no public tables available right now.</p>
        <button class="browser__btn browser__btn--primary" @click="goBack">Create Your Own</button>
      </div>

      <div v-else-if="filteredTables.length === 0" class="browser__empty">
        <Search :size="48" />
        <h3>No Results</h3>
        <p>No tables match your search "{{ searchQuery }}"</p>
        <button class="browser__btn" @click="searchQuery = ''">Clear Search</button>
      </div>

      <div v-else class="browser__list">
        <div
          v-for="table in filteredTables"
          :key="table.code"
          class="browser__table"
          @click="joinTable(table.code)"
        >
          <div
            class="browser__table-preview"
            :style="{ background: getTableCardBackground(table.background) }"
          >
            <div class="browser__table-cards">🃏</div>
          </div>
          <div class="browser__table-info">
            <h3 class="browser__table-name">
              {{ table.name }}
            </h3>
            <div class="browser__table-meta">
              <span class="browser__table-code">{{ table.code }}</span>
              <span class="browser__table-time">{{ formatTimeAgo(table.createdAt) }}</span>
            </div>
          </div>
          <div class="browser__table-players">
            <Users :size="16" />
            <span>{{ table.playerCount }}/{{ table.maxPlayers }}</span>
          </div>
          <button class="browser__join-btn">Join</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.browser {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  color: #fff;
}

.browser__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem 2rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.browser__back {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #a0a0b0;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.browser__back:hover {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.4);
}

.browser__title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}

.browser__refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 8px;
  color: #a0a0b0;
  cursor: pointer;
  transition: all 0.2s;
}

.browser__refresh:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.15);
}

.browser__refresh--loading svg {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.browser__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 2rem;
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
  gap: 1.5rem;
}

.browser__controls {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.browser__search {
  position: relative;
  display: flex;
  align-items: center;
}

.browser__search-icon {
  position: absolute;
  left: 1rem;
  color: #666;
  pointer-events: none;
}

.browser__search-input {
  width: 100%;
  padding: 0.875rem 1rem 0.875rem 2.75rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 1rem;
  transition: all 0.2s;
}

.browser__search-input:focus {
  outline: none;
  border-color: #e94560;
  background: rgba(255, 255, 255, 0.12);
}

.browser__search-input::placeholder {
  color: #666;
}

.browser__filter-row {
  display: flex;
  gap: 1.5rem;
  align-items: flex-end;
}

.browser__name-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
}

.browser__name-field label {
  font-size: 0.875rem;
  color: #a0a0b0;
}

.browser__name-field input {
  padding: 0.625rem 1rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.browser__name-field input:focus {
  outline: none;
  border-color: #e94560;
  background: rgba(255, 255, 255, 0.12);
}

.browser__name-field input::placeholder {
  color: #666;
}

.browser__sort {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.browser__sort label {
  font-size: 0.875rem;
  color: #a0a0b0;
}

.browser__sort-buttons {
  display: flex;
  gap: 0.25rem;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 3px;
}

.browser__sort-buttons button {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #888;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.browser__sort-buttons button:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.browser__sort-buttons button.active {
  color: #fff;
  background: rgba(233, 69, 96, 0.3);
}

.browser__results-info {
  font-size: 0.875rem;
  color: #888;
}

.browser__loading,
.browser__error,
.browser__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 1rem;
  color: #a0a0b0;
  padding: 3rem 0;
}

.browser__spinner {
  animation: spin 1s linear infinite;
}

.browser__empty h3 {
  margin: 0;
  color: #fff;
  font-size: 1.25rem;
}

.browser__empty p {
  margin: 0;
}

.browser__btn {
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
}

.browser__btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.browser__btn--primary {
  background: linear-gradient(135deg, #e94560 0%, #d63447 100%);
  border: none;
  box-shadow: 0 4px 16px rgba(233, 69, 96, 0.3);
}

.browser__btn--primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(233, 69, 96, 0.4);
}

.browser__list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.browser__table {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.browser__table:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

.browser__table-preview {
  width: 64px;
  height: 48px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  flex-shrink: 0;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
}

.browser__table-cards {
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

.browser__table-info {
  flex: 1;
  min-width: 0;
}

.browser__table-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.browser__table-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.browser__table-code {
  font-size: 0.75rem;
  color: #e94560;
  font-family: monospace;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.browser__table-time {
  font-size: 0.75rem;
  color: #666;
}

.browser__table-players {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: #a0a0b0;
  font-size: 0.85rem;
  white-space: nowrap;
}

.browser__join-btn {
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #e94560 0%, #d63447 100%);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.browser__join-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(233, 69, 96, 0.4);
}

@media (max-width: 640px) {
  .browser__filter-row {
    flex-direction: column;
    gap: 1rem;
  }

  .browser__sort {
    width: 100%;
  }

  .browser__sort-buttons {
    width: 100%;
  }

  .browser__sort-buttons button {
    flex: 1;
    justify-content: center;
  }
}
</style>
