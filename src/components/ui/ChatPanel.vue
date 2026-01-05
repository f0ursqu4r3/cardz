<script setup lang="ts">
import { ref, nextTick, watch, onMounted, onUnmounted, computed } from 'vue'
import { MessageCircle, Send, X, ChevronDown } from 'lucide-vue-next'
import type { ChatMessage } from '../../../shared/types'

const props = defineProps<{
  messages: ChatMessage[]
  isOpen: boolean
  typingPlayers?: Map<string, string> // playerId -> playerName
}>()

const emit = defineEmits<{
  send: [message: string]
  typing: [isTyping: boolean]
  'update:isOpen': [value: boolean]
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const messagesRef = ref<HTMLDivElement | null>(null)
const messageText = ref('')
const unreadCount = ref(0)
const isAtBottom = ref(true)

// Track unread messages when panel is closed
watch(
  () => props.messages.length,
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
      nextTick(() => {
        scrollToBottom()
        inputRef.value?.focus()
      })
    }
  },
)

const scrollToBottom = () => {
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

const handleScroll = () => {
  if (messagesRef.value) {
    const { scrollTop, scrollHeight, clientHeight } = messagesRef.value
    isAtBottom.value = scrollHeight - scrollTop - clientHeight < 50
  }
}

const sendMessage = () => {
  const text = messageText.value.trim()
  if (!text) return
  emit('send', text)
  messageText.value = ''
  emit('typing', false) // Stop typing indicator when message sent
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

// Typing indicator logic
let typingTimeout: number | null = null
const isTyping = ref(false)

const handleInput = () => {
  const hasText = messageText.value.trim().length > 0

  if (hasText && !isTyping.value) {
    isTyping.value = true
    emit('typing', true)
  }

  // Clear existing timeout
  if (typingTimeout) {
    window.clearTimeout(typingTimeout)
  }

  // Set timeout to stop typing indicator after 2 seconds of no input
  if (hasText) {
    typingTimeout = window.setTimeout(() => {
      isTyping.value = false
      emit('typing', false)
    }, 2000)
  } else if (isTyping.value) {
    isTyping.value = false
    emit('typing', false)
  }
}

// Computed typing indicator text
const typingIndicatorText = computed(() => {
  if (!props.typingPlayers || props.typingPlayers.size === 0) return ''
  const names = Array.from(props.typingPlayers.values())
  if (names.length === 1) return `${names[0]} is typing...`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more are typing...`
})

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const togglePanel = () => {
  emit('update:isOpen', !props.isOpen)
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
  <div class="chat" :class="{ 'chat--open': isOpen }">
    <!-- Toggle Button -->
    <button
      class="chat__toggle"
      :class="{ 'chat__toggle--has-unread': unreadCount > 0 }"
      @click="togglePanel"
      :title="isOpen ? 'Close chat' : 'Open chat'"
    >
      <MessageCircle :size="20" />
      <span v-if="unreadCount > 0" class="chat__badge">{{
        unreadCount > 9 ? '9+' : unreadCount
      }}</span>
    </button>

    <!-- Chat Panel -->
    <div v-if="isOpen" class="chat__panel">
      <div class="chat__header">
        <MessageCircle :size="16" />
        <span>Chat</span>
        <button class="chat__close" @click="togglePanel">
          <X :size="16" />
        </button>
      </div>

      <div ref="messagesRef" class="chat__messages" @scroll="handleScroll">
        <div v-if="messages.length === 0" class="chat__empty">No messages yet. Say hello!</div>
        <div v-for="msg in messages" :key="msg.id" class="chat__message">
          <div class="chat__message-header">
            <span class="chat__message-author" :style="{ color: msg.playerColor }">
              {{ msg.playerName }}
            </span>
            <span class="chat__message-time">{{ formatTime(msg.timestamp) }}</span>
          </div>
          <div class="chat__message-content">{{ msg.message }}</div>
        </div>
      </div>

      <!-- Scroll to bottom button -->
      <button
        v-if="!isAtBottom && messages.length > 0"
        class="chat__scroll-bottom"
        @click="scrollToBottom"
      >
        <ChevronDown :size="16" />
      </button>

      <!-- Typing indicator -->
      <div v-if="typingIndicatorText" class="chat__typing">
        {{ typingIndicatorText }}
      </div>

      <div class="chat__input-area">
        <input
          ref="inputRef"
          v-model="messageText"
          type="text"
          class="chat__input"
          placeholder="Type a message..."
          maxlength="500"
          @keydown="handleKeydown"
          @input="handleInput"
        />
        <button class="chat__send" :disabled="!messageText.trim()" @click="sendMessage">
          <Send :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  z-index: 100;
}

.chat__toggle {
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

.chat__toggle:hover {
  background: rgba(40, 40, 55, 0.95);
  color: #fff;
  transform: scale(1.05);
}

.chat__toggle--has-unread {
  color: #e94560;
}

.chat__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: #e94560;
  border-radius: 9px;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chat--open .chat__toggle {
  display: none;
}

.chat__panel {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 320px;
  max-height: 450px;
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

.chat__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  font-weight: 600;
  font-size: 0.875rem;
}

.chat__close {
  margin-left: auto;
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

.chat__close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.chat__messages {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
  min-height: 200px;
  max-height: 300px;
}

.chat__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
  font-size: 0.875rem;
  text-align: center;
  padding: 2rem;
}

.chat__message {
  margin-bottom: 0.75rem;
}

.chat__message:last-child {
  margin-bottom: 0;
}

.chat__message-header {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.125rem;
}

.chat__message-author {
  font-weight: 600;
  font-size: 0.8125rem;
}

.chat__message-time {
  font-size: 0.6875rem;
  color: #666;
}

.chat__message-content {
  color: #e0e0e8;
  font-size: 0.875rem;
  line-height: 1.4;
  word-wrap: break-word;
}

.chat__scroll-bottom {
  position: absolute;
  bottom: 70px;
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

.chat__scroll-bottom:hover {
  background: rgba(60, 60, 75, 0.95);
  color: #fff;
}

.chat__typing {
  padding: 0.25rem 0.75rem;
  font-size: 0.75rem;
  color: #888;
  font-style: italic;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

.chat__input-area {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.chat__input {
  flex: 1;
  height: 36px;
  padding: 0 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #fff;
  font-size: 0.875rem;
  outline: none;
  transition: all 0.2s;
}

.chat__input::placeholder {
  color: #666;
}

.chat__input:focus {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(233, 69, 96, 0.5);
}

.chat__send {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: #e94560;
  border: none;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
}

.chat__send:hover:not(:disabled) {
  background: #d63447;
}

.chat__send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
