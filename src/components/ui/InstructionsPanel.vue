<script setup lang="ts">
import { ref } from 'vue'
import { HelpCircle, X, Mouse, Hand, Keyboard, Smartphone } from 'lucide-vue-next'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
}>()

type Tab = 'mouse' | 'touch' | 'keyboard'
const activeTab = ref<Tab>('mouse')

const togglePanel = () => {
  emit('update:isOpen', !props.isOpen)
}

const closePanel = () => {
  emit('update:isOpen', false)
}
</script>

<template>
  <div class="instructions">
    <!-- Toggle Button -->
    <button
      class="instructions__toggle"
      @click="togglePanel"
      :title="isOpen ? 'Close instructions' : 'Show instructions'"
    >
      <HelpCircle :size="20" />
    </button>

    <!-- Instructions Panel -->
    <div v-if="isOpen" class="instructions__panel">
      <div class="instructions__header">
        <HelpCircle :size="16" />
        <span>Controls</span>
        <button class="instructions__close" @click="closePanel">
          <X :size="16" />
        </button>
      </div>

      <!-- Tabs -->
      <div class="instructions__tabs">
        <button
          class="instructions__tab"
          :class="{ 'instructions__tab--active': activeTab === 'mouse' }"
          @click="activeTab = 'mouse'"
        >
          <Mouse :size="14" />
          Mouse
        </button>
        <button
          class="instructions__tab"
          :class="{ 'instructions__tab--active': activeTab === 'touch' }"
          @click="activeTab = 'touch'"
        >
          <Smartphone :size="14" />
          Touch
        </button>
        <button
          class="instructions__tab"
          :class="{ 'instructions__tab--active': activeTab === 'keyboard' }"
          @click="activeTab = 'keyboard'"
        >
          <Keyboard :size="14" />
          Keyboard
        </button>
      </div>

      <!-- Content -->
      <div class="instructions__content">
        <!-- Mouse Controls -->
        <div v-if="activeTab === 'mouse'" class="instructions__section">
          <h4>Cards</h4>
          <ul class="instructions__list">
            <li><kbd>Left-click</kbd> + drag — Move card</li>
            <li><kbd>Right-click</kbd> + drag — Move entire stack</li>
            <li><kbd>Double-click</kbd> — Flip card/stack</li>
            <li><kbd>Ctrl</kbd> + click — Select multiple cards</li>
            <li>Hover over card <span class="instructions__time">250ms</span> — Stack cards</li>
          </ul>

          <h4>Stacks</h4>
          <ul class="instructions__list">
            <li>Shake while dragging — Shuffle stack</li>
            <li>Drop on another stack — Merge stacks</li>
            <li>Drag top card — Pull from stack</li>
          </ul>

          <h4>Hand</h4>
          <ul class="instructions__list">
            <li>Drop card on hand zone — Add to hand</li>
            <li>Drag card out of hand — Play card</li>
            <li><kbd>Ctrl</kbd> + click — Select multiple in hand</li>
          </ul>

          <h4>Zones</h4>
          <ul class="instructions__list">
            <li>Drop card on zone — Add to zone</li>
            <li>Drag zone header — Move zone</li>
            <li>Drag corner handle — Resize zone</li>
          </ul>

          <h4>Viewport</h4>
          <ul class="instructions__list">
            <li><kbd>Middle-click</kbd> + drag — Pan view</li>
            <li><kbd>Scroll wheel</kbd> — Zoom in/out</li>
          </ul>
        </div>

        <!-- Touch Controls -->
        <div v-if="activeTab === 'touch'" class="instructions__section">
          <h4>Cards</h4>
          <ul class="instructions__list">
            <li>Tap + drag — Move card</li>
            <li>Long press <span class="instructions__time">500ms</span> + drag — Move stack</li>
            <li>Double-tap — Flip card/stack</li>
            <li>Two-finger tap — Toggle selection</li>
            <li>Hold over card <span class="instructions__time">250ms</span> — Stack cards</li>
          </ul>

          <h4>Stacks</h4>
          <ul class="instructions__list">
            <li>Shake while dragging — Shuffle stack</li>
            <li>Drop on another stack — Merge stacks</li>
          </ul>

          <h4>Hand</h4>
          <ul class="instructions__list">
            <li>Drop card on hand zone — Add to hand</li>
            <li>Drag card out of hand — Play card</li>
          </ul>

          <h4>Viewport</h4>
          <ul class="instructions__list">
            <li>Two-finger drag — Pan view</li>
            <li>Pinch — Zoom in/out</li>
          </ul>
        </div>

        <!-- Keyboard Controls -->
        <div v-if="activeTab === 'keyboard'" class="instructions__section">
          <h4>Navigation</h4>
          <ul class="instructions__list">
            <li><kbd>Space</kbd> + drag — Pan view</li>
            <li><kbd>Home</kbd> — Reset viewport</li>
          </ul>

          <h4>Selection</h4>
          <ul class="instructions__list">
            <li><kbd>Ctrl</kbd> + click — Toggle card selection</li>
            <li>Click empty area — Clear selection</li>
          </ul>

          <h4>Chat</h4>
          <ul class="instructions__list">
            <li><kbd>Enter</kbd> — Send message</li>
            <li><kbd>Escape</kbd> — Close chat panel</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.instructions {
  position: fixed;
  bottom: 1rem;
  left: 1rem;
  z-index: 100;
}

.instructions__toggle {
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

.instructions__toggle:hover {
  background: rgba(40, 40, 55, 0.95);
  color: #fff;
  transform: scale(1.05);
}

.instructions__panel {
  position: absolute;
  bottom: 60px;
  left: 0;
  width: 320px;
  max-height: 70vh;
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

.instructions__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  font-weight: 600;
  font-size: 0.9375rem;
}

.instructions__close {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: transparent;
  border: none;
  color: #a0a0b0;
  cursor: pointer;
  transition: all 0.15s;
}

.instructions__close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.instructions__tabs {
  display: flex;
  padding: 0.5rem;
  gap: 0.25rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.instructions__tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.5rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #a0a0b0;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.instructions__tab:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #c0c0d0;
}

.instructions__tab--active {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.instructions__content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.instructions__section h4 {
  margin: 0 0 0.5rem 0;
  padding-bottom: 0.375rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: #e0e0e8;
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.instructions__section h4:not(:first-child) {
  margin-top: 1rem;
}

.instructions__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.instructions__list li {
  padding: 0.375rem 0;
  color: #b0b0c0;
  font-size: 0.8125rem;
  line-height: 1.4;
}

.instructions__list kbd {
  display: inline-block;
  padding: 0.125rem 0.375rem;
  margin-right: 0.125rem;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  font-family: inherit;
  font-size: 0.75rem;
  color: #e0e0e8;
}

.instructions__time {
  color: #808090;
  font-size: 0.75rem;
}

/* Scrollbar styling */
.instructions__content::-webkit-scrollbar {
  width: 6px;
}

.instructions__content::-webkit-scrollbar-track {
  background: transparent;
}

.instructions__content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.instructions__content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
