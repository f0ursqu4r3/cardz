<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Users, RefreshCw, Globe, Lock } from 'lucide-vue-next'

interface TableInfo {
  code: string
  name: string
  playerCount: number
  maxPlayers: number
  isPublic: boolean
  createdAt: string
}

const router = useRouter()
const tables = ref<TableInfo[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const playerName = ref('')

// Mock data for now - will be replaced with WebSocket connection
const mockTables: TableInfo[] = [
  {
    code: 'ABC123',
    name: 'Poker Night',
    playerCount: 3,
    maxPlayers: 8,
    isPublic: true,
    createdAt: new Date().toISOString(),
  },
  {
    code: 'XYZ789',
    name: 'Card Club',
    playerCount: 5,
    maxPlayers: 6,
    isPublic: true,
    createdAt: new Date().toISOString(),
  },
  {
    code: 'DEF456',
    name: 'Casual Games',
    playerCount: 2,
    maxPlayers: 4,
    isPublic: true,
    createdAt: new Date().toISOString(),
  },
]

const fetchTables = async () => {
  loading.value = true
  error.value = null

  try {
    // TODO: Replace with actual WebSocket/API call
    await new Promise((resolve) => setTimeout(resolve, 500))
    tables.value = mockTables
  } catch {
    error.value = 'Failed to load tables. Please try again.'
  } finally {
    loading.value = false
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

onMounted(() => {
  fetchTables()
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
      <div class="browser__name-field">
        <label for="browserPlayerName">Your Name</label>
        <input
          id="browserPlayerName"
          v-model="playerName"
          type="text"
          placeholder="Enter your name to join"
          maxlength="20"
        />
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

      <div v-else class="browser__list">
        <div
          v-for="table in tables"
          :key="table.code"
          class="browser__table"
          @click="joinTable(table.code)"
        >
          <div class="browser__table-info">
            <h3 class="browser__table-name">
              {{ table.name }}
              <span v-if="!table.isPublic" class="browser__table-private">
                <Lock :size="14" />
              </span>
            </h3>
            <span class="browser__table-code">{{ table.code }}</span>
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
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
}

.browser__name-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.browser__name-field label {
  font-size: 0.875rem;
  color: #a0a0b0;
}

.browser__name-field input {
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 1rem;
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
  padding: 1rem 1.25rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.browser__table:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.browser__table-info {
  flex: 1;
}

.browser__table-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 0.25rem;
}

.browser__table-private {
  color: #a0a0b0;
}

.browser__table-code {
  font-size: 0.8rem;
  color: #666;
  font-family: monospace;
  letter-spacing: 0.05em;
}

.browser__table-players {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #a0a0b0;
  font-size: 0.9rem;
}

.browser__join-btn {
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #e94560 0%, #d63447 100%);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.browser__join-btn:hover {
  transform: translateY(-1px);
}
</style>
