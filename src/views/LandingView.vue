<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { PlayCircle, Users, Sparkles, Globe } from 'lucide-vue-next'

const router = useRouter()
const joinCode = ref('')
const playerName = ref('')
const tableName = ref('')
const isPublic = ref(false)

const createTable = () => {
  if (!playerName.value.trim()) {
    playerName.value = 'Player'
  }
  const query: Record<string, string> = { name: playerName.value }
  if (isPublic.value) {
    query.public = 'true'
  }
  if (tableName.value.trim()) {
    query.tableName = tableName.value.trim()
  }
  router.push({
    name: 'table-new',
    query,
  })
}

const joinTable = () => {
  if (!joinCode.value.trim()) return
  if (!playerName.value.trim()) {
    playerName.value = 'Player'
  }
  router.push({
    name: 'table',
    params: { code: joinCode.value.toUpperCase() },
    query: { name: playerName.value },
  })
}

const browseTables = () => {
  router.push({ name: 'browser' })
}
</script>

<template>
  <div class="landing">
    <div class="landing__hero">
      <div class="landing__logo">
        <span class="landing__logo-icon">🃏</span>
        <h1 class="landing__title">Dekkard</h1>
      </div>
      <p class="landing__subtitle">A multiplayer virtual tabletop for card games</p>
    </div>

    <div class="landing__content">
      <div class="landing__card">
        <h2 class="landing__card-title">
          <PlayCircle :size="24" />
          Play Now
        </h2>

        <div class="landing__form">
          <div class="landing__field">
            <label for="playerName">Your Name</label>
            <input
              id="playerName"
              v-model="playerName"
              type="text"
              placeholder="Enter your name"
              maxlength="20"
            />
          </div>

          <div class="landing__field">
            <label for="tableName"
              >Table Name <span class="landing__optional">(optional)</span></label
            >
            <input
              id="tableName"
              v-model="tableName"
              type="text"
              placeholder="My Card Table"
              maxlength="50"
            />
          </div>

          <div class="landing__checkbox">
            <input id="isPublic" v-model="isPublic" type="checkbox" />
            <label for="isPublic">
              <Globe :size="16" />
              Make table public
            </label>
          </div>

          <div class="landing__actions">
            <button class="landing__btn landing__btn--primary" @click="createTable">
              <Sparkles :size="18" />
              Create New Table
            </button>

            <div class="landing__divider">
              <span>or join existing</span>
            </div>

            <div class="landing__join">
              <input
                v-model="joinCode"
                type="text"
                placeholder="Room Code"
                maxlength="6"
                class="landing__code-input"
                @keyup.enter="joinTable"
              />
              <button
                class="landing__btn landing__btn--secondary"
                :disabled="!joinCode.trim()"
                @click="joinTable"
              >
                Join
              </button>
            </div>
          </div>
        </div>
      </div>

      <button class="landing__browse" @click="browseTables">
        <Users :size="20" />
        Browse Public Tables
      </button>
    </div>

    <footer class="landing__footer">
      <p>Drag cards, create stacks, and play with friends in real-time</p>
    </footer>
  </div>
</template>

<style scoped>
.landing {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  color: #fff;
}

.landing__hero {
  text-align: center;
  margin-bottom: 2rem;
}

.landing__logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.landing__logo-icon {
  font-size: 3.5rem;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
}

.landing__title {
  font-size: 3.5rem;
  font-weight: 800;
  margin: 0;
  background: linear-gradient(135deg, #e94560 0%, #ff6b6b 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 4px 16px rgba(233, 69, 96, 0.3);
}

.landing__subtitle {
  font-size: 1.125rem;
  color: #a0a0b0;
  margin: 0;
}

.landing__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  width: 100%;
  max-width: 400px;
}

.landing__card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 2rem;
  width: 100%;
}

.landing__card-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 1.5rem;
  color: #fff;
}

.landing__form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.landing__field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.landing__field label {
  font-size: 0.875rem;
  color: #a0a0b0;
}

.landing__field input {
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 1rem;
  transition: all 0.2s;
}

.landing__field input:focus {
  outline: none;
  border-color: #e94560;
  background: rgba(255, 255, 255, 0.12);
}

.landing__field input::placeholder {
  color: #666;
}

.landing__optional {
  color: #666;
  font-weight: 400;
}

.landing__checkbox {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.landing__checkbox input[type='checkbox'] {
  width: 18px;
  height: 18px;
  accent-color: #e94560;
  cursor: pointer;
}

.landing__checkbox label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: #a0a0b0;
  cursor: pointer;
  user-select: none;
}

.landing__checkbox input:checked + label {
  color: #fff;
}

.landing__actions {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.landing__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.875rem 1.5rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.landing__btn--primary {
  background: linear-gradient(135deg, #e94560 0%, #d63447 100%);
  color: #fff;
  box-shadow: 0 4px 16px rgba(233, 69, 96, 0.3);
}

.landing__btn--primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(233, 69, 96, 0.4);
}

.landing__btn--secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.landing__btn--secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
}

.landing__btn--secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.landing__divider {
  display: flex;
  align-items: center;
  gap: 1rem;
  color: #666;
  font-size: 0.875rem;
}

.landing__divider::before,
.landing__divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
}

.landing__join {
  display: flex;
  gap: 0.75rem;
}

.landing__code-input {
  flex: 1;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.landing__code-input:focus {
  outline: none;
  border-color: #e94560;
  background: rgba(255, 255, 255, 0.12);
}

.landing__code-input::placeholder {
  color: #666;
  text-transform: none;
  letter-spacing: normal;
}

.landing__browse {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #a0a0b0;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.landing__browse:hover {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.4);
}

.landing__footer {
  margin-top: 3rem;
  text-align: center;
}

.landing__footer p {
  color: #666;
  font-size: 0.875rem;
  margin: 0;
}
</style>
