import { ref, shallowRef, computed, onUnmounted, type Ref } from 'vue'
import type {
  ClientMessage,
  ServerMessage,
  GameState,
  Player,
  CardState,
  StackState,
  ZoneState,
} from '../../shared/types'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface WebSocketOptions {
  url?: string
  autoReconnect?: boolean
  reconnectDelay?: number
  maxReconnectAttempts?: number
}

export interface UseWebSocketReturn {
  // Connection state
  state: Ref<ConnectionState>
  isConnected: Ref<boolean>
  error: Ref<string | null>

  // Room state
  roomCode: Ref<string | null>
  playerId: Ref<string | null>
  players: Ref<Player[]>

  // Game state
  gameState: Ref<GameState | null>
  handCardIds: Ref<number[]>
  handCounts: Ref<Map<string, number>>
  cursors: Ref<Map<string, { x: number; y: number }>>

  // Actions
  connect: () => void
  disconnect: () => void
  createRoom: (playerName: string) => void
  joinRoom: (roomCode: string, playerName: string) => void
  leaveRoom: () => void
  send: (message: ClientMessage) => void

  // Event handlers
  onMessage: (handler: (message: ServerMessage) => void) => void
  offMessage: (handler: (message: ServerMessage) => void) => void
}

const DEFAULT_WS_URL = `ws://${window.location.hostname}:9001`
const SESSION_ID_KEY = 'cardz_session_id'

/**
 * Get or create a persistent session ID for reconnection
 */
function getSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_ID_KEY)
  if (!sessionId) {
    sessionId = crypto.randomUUID()
    localStorage.setItem(SESSION_ID_KEY, sessionId)
  }
  return sessionId
}

export function useWebSocket(options: WebSocketOptions = {}): UseWebSocketReturn {
  const {
    url = DEFAULT_WS_URL,
    autoReconnect = true,
    reconnectDelay = 1000,
    maxReconnectAttempts = 5,
  } = options

  // Connection state
  const state = ref<ConnectionState>('disconnected')
  const error = ref<string | null>(null)
  const ws = shallowRef<WebSocket | null>(null)
  const reconnectAttempts = ref(0)
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  // Room state
  const roomCode = ref<string | null>(null)
  const playerId = ref<string | null>(null)
  const players = ref<Player[]>([])

  // Game state
  const gameState = ref<GameState | null>(null)
  const handCardIds = ref<number[]>([])
  const handCounts = ref<Map<string, number>>(new Map())
  const cursors = ref<Map<string, { x: number; y: number }>>(new Map())

  // Message handlers
  const messageHandlers = new Set<(message: ServerMessage) => void>()

  const isConnected = computed(() => state.value === 'connected')

  // WebSocket setup
  const connect = () => {
    if (ws.value?.readyState === WebSocket.OPEN) return

    state.value = 'connecting'
    error.value = null

    try {
      ws.value = new WebSocket(url)

      ws.value.onopen = () => {
        console.log('[ws] connected')
        state.value = 'connected'
        reconnectAttempts.value = 0
      }

      ws.value.onclose = (event) => {
        console.log('[ws] closed', event.code, event.reason)
        state.value = 'disconnected'
        ws.value = null

        // Attempt reconnect if was connected to a room
        if (autoReconnect && roomCode.value && reconnectAttempts.value < maxReconnectAttempts) {
          reconnectAttempts.value++
          console.log(
            `[ws] reconnecting (attempt ${reconnectAttempts.value}/${maxReconnectAttempts})`,
          )
          reconnectTimeout = setTimeout(connect, reconnectDelay * reconnectAttempts.value)
        }
      }

      ws.value.onerror = () => {
        console.error('[ws] error')
        state.value = 'error'
        error.value = 'Connection failed'
      }

      ws.value.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ServerMessage
          handleMessage(message)
        } catch (e) {
          console.error('[ws] failed to parse message', e)
        }
      }
    } catch (e) {
      console.error('[ws] failed to connect', e)
      state.value = 'error'
      error.value = 'Failed to connect'
    }
  }

  const disconnect = () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
    reconnectAttempts.value = maxReconnectAttempts // Prevent auto-reconnect
    ws.value?.close()
    ws.value = null
    state.value = 'disconnected'
    roomCode.value = null
    playerId.value = null
    players.value = []
    gameState.value = null
    handCardIds.value = []
    handCounts.value.clear()
    cursors.value.clear()
  }

  const send = (message: ClientMessage) => {
    if (ws.value?.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify(message))
    } else {
      console.warn('[ws] cannot send, not connected')
    }
  }

  // Room actions
  const createRoom = (playerName: string) => {
    const sessionId = getSessionId()
    send({ type: 'room:create', playerName, sessionId })
  }

  const joinRoom = (code: string, playerName: string) => {
    const sessionId = getSessionId()
    send({ type: 'room:join', roomCode: code.toUpperCase(), playerName, sessionId })
  }

  const leaveRoom = () => {
    send({ type: 'room:leave' })
    roomCode.value = null
    playerId.value = null
    players.value = []
    gameState.value = null
    handCardIds.value = []
    handCounts.value.clear()
    cursors.value.clear()
  }

  // Message handling
  const handleMessage = (message: ServerMessage) => {
    // Notify all registered handlers
    messageHandlers.forEach((handler) => handler(message))

    switch (message.type) {
      // Room events
      case 'room:created':
        roomCode.value = message.roomCode
        playerId.value = message.playerId
        gameState.value = message.state
        players.value = [{ id: message.playerId, name: '', connected: true, color: '#ef4444' }]
        console.log('[ws] room created:', message.roomCode)
        break

      case 'room:joined':
        roomCode.value = message.roomCode
        playerId.value = message.playerId
        players.value = message.players
        gameState.value = message.state
        // Find our hand in the state
        const ourHand = message.state.hands.find((h) => h.playerId === message.playerId)
        if (ourHand) {
          handCardIds.value = ourHand.cardIds
        }
        console.log('[ws] joined room:', message.roomCode)
        break

      case 'room:player_joined':
        players.value = [...players.value, message.player]
        console.log('[ws] player joined:', message.player.name)
        break

      case 'room:player_left':
        players.value = players.value.filter((p) => p.id !== message.playerId)
        cursors.value.delete(message.playerId)
        handCounts.value.delete(message.playerId)
        console.log('[ws] player left:', message.playerId)
        break

      case 'room:error':
        error.value = message.message
        console.error('[ws] room error:', message.code, message.message)
        break

      // Card events - update local game state
      case 'card:moved':
        if (gameState.value) {
          const card = gameState.value.cards.find((c) => c.id === message.cardId)
          if (card) {
            card.x = message.x
            card.y = message.y
            card.z = message.z
          }
        }
        break

      case 'card:locked':
        if (gameState.value) {
          const card = gameState.value.cards.find((c) => c.id === message.cardId)
          if (card) card.lockedBy = message.playerId
        }
        break

      case 'card:unlocked':
        if (gameState.value) {
          const card = gameState.value.cards.find((c) => c.id === message.cardId)
          if (card) card.lockedBy = null
        }
        break

      case 'card:flipped':
        if (gameState.value) {
          const card = gameState.value.cards.find((c) => c.id === message.cardId)
          if (card) card.faceUp = message.faceUp
        }
        break

      // Stack events
      case 'stack:created':
        if (gameState.value) {
          gameState.value.stacks.push(message.stack)
          message.cardUpdates.forEach((update) => {
            const card = gameState.value!.cards.find((c) => c.id === update.cardId)
            if (card) {
              card.x = update.x
              card.y = update.y
              card.z = update.z
              card.stackId = message.stack.id
            }
          })
        }
        break

      case 'stack:moved':
        if (gameState.value) {
          const stack = gameState.value.stacks.find((s) => s.id === message.stackId)
          if (stack) {
            stack.anchorX = message.anchorX
            stack.anchorY = message.anchorY
          }
          message.cardUpdates.forEach((update) => {
            const card = gameState.value!.cards.find((c) => c.id === update.cardId)
            if (card) {
              card.x = update.x
              card.y = update.y
            }
          })
        }
        break

      case 'stack:locked':
        if (gameState.value) {
          const stack = gameState.value.stacks.find((s) => s.id === message.stackId)
          if (stack) stack.lockedBy = message.playerId
        }
        break

      case 'stack:unlocked':
        if (gameState.value) {
          const stack = gameState.value.stacks.find((s) => s.id === message.stackId)
          if (stack) stack.lockedBy = null
        }
        break

      case 'stack:card_added':
        if (gameState.value) {
          const stack = gameState.value.stacks.find((s) => s.id === message.stackId)
          const card = gameState.value.cards.find((c) => c.id === message.cardId)
          if (stack && card) {
            if (!stack.cardIds.includes(message.cardId)) {
              stack.cardIds.push(message.cardId)
            }
            card.stackId = message.stackId
            card.x = message.cardState.x
            card.y = message.cardState.y
            card.z = message.cardState.z
            card.faceUp = message.cardState.faceUp
          }
        }
        break

      case 'stack:card_removed':
        if (gameState.value) {
          const stack = gameState.value.stacks.find((s) => s.id === message.stackId)
          const card = gameState.value.cards.find((c) => c.id === message.cardId)
          if (stack) {
            stack.cardIds = stack.cardIds.filter((id) => id !== message.cardId)
          }
          if (card) {
            card.stackId = null
          }
          if (message.stackDeleted) {
            gameState.value.stacks = gameState.value.stacks.filter((s) => s.id !== message.stackId)
          }
        }
        break

      case 'stack:merged':
        if (gameState.value) {
          // Remove source stack
          gameState.value.stacks = gameState.value.stacks.filter(
            (s) => s.id !== message.sourceStackId,
          )
          // Update target stack
          const targetStack = gameState.value.stacks.find((s) => s.id === message.targetStackId)
          if (targetStack) {
            Object.assign(targetStack, message.targetStack)
          }
          // Update cards
          message.cardUpdates.forEach((update) => {
            const card = gameState.value!.cards.find((c) => c.id === update.cardId)
            if (card) {
              card.x = update.x
              card.y = update.y
              card.z = update.z
              card.stackId = message.targetStackId
            }
          })
        }
        break

      case 'stack:shuffled':
        if (gameState.value) {
          const stack = gameState.value.stacks.find((s) => s.id === message.stackId)
          if (stack) {
            stack.cardIds = message.newOrder
          }
          message.cardUpdates.forEach((update) => {
            const card = gameState.value!.cards.find((c) => c.id === update.cardId)
            if (card) {
              card.x = update.x
              card.y = update.y
            }
          })
        }
        break

      case 'stack:flipped':
        if (gameState.value) {
          message.cardUpdates.forEach((update) => {
            const card = gameState.value!.cards.find((c) => c.id === update.cardId)
            if (card) {
              card.faceUp = update.faceUp
            }
          })
        }
        break

      // Zone events
      case 'zone:created':
        if (gameState.value) {
          gameState.value.zones.push(message.zone)
        }
        break

      case 'zone:updated':
        if (gameState.value) {
          const zoneIdx = gameState.value.zones.findIndex((z) => z.id === message.zoneId)
          if (zoneIdx !== -1) {
            gameState.value.zones[zoneIdx] = message.zone
          }
          if (message.stackUpdate) {
            const stack = gameState.value.stacks.find((s) => s.id === message.stackUpdate!.stackId)
            if (stack) {
              stack.anchorX = message.stackUpdate.anchorX
              stack.anchorY = message.stackUpdate.anchorY
            }
          }
          if (message.cardUpdates) {
            message.cardUpdates.forEach((update) => {
              const card = gameState.value!.cards.find((c) => c.id === update.cardId)
              if (card) {
                card.x = update.x
                card.y = update.y
              }
            })
          }
        }
        break

      case 'zone:deleted':
        if (gameState.value) {
          gameState.value.zones = gameState.value.zones.filter((z) => z.id !== message.zoneId)
          if (message.stackDeleted !== null) {
            gameState.value.stacks = gameState.value.stacks.filter(
              (s) => s.id !== message.stackDeleted,
            )
          }
          message.scatteredCards.forEach((update) => {
            const card = gameState.value!.cards.find((c) => c.id === update.cardId)
            if (card) {
              card.x = update.x
              card.y = update.y
              card.stackId = null
            }
          })
        }
        break

      case 'zone:card_added':
        if (gameState.value) {
          const zone = gameState.value.zones.find((z) => z.id === message.zoneId)
          if (zone && message.stackCreated) {
            // Stack was created, add it
            gameState.value.stacks.push({
              id: message.stackId,
              cardIds: [message.cardState.cardId],
              anchorX: message.cardState.x,
              anchorY: message.cardState.y,
              kind: 'zone',
              zoneId: message.zoneId,
              lockedBy: null,
            })
            zone.stackId = message.stackId
          } else if (zone) {
            // Add to existing stack
            const stack = gameState.value.stacks.find((s) => s.id === message.stackId)
            if (stack && !stack.cardIds.includes(message.cardState.cardId)) {
              stack.cardIds.push(message.cardState.cardId)
            }
          }
          const card = gameState.value.cards.find((c) => c.id === message.cardState.cardId)
          if (card) {
            card.x = message.cardState.x
            card.y = message.cardState.y
            card.z = message.cardState.z
            card.faceUp = message.cardState.faceUp
            card.stackId = message.stackId
          }
        }
        break

      // Hand events
      case 'hand:card_added':
        if (gameState.value) {
          const card = gameState.value.cards.find((c) => c.id === message.cardId)
          if (card) {
            Object.assign(card, message.cardState)
          }
          if (!handCardIds.value.includes(message.cardId)) {
            handCardIds.value.push(message.cardId)
          }
        }
        break

      case 'hand:card_added_other':
        handCounts.value.set(message.playerId, message.handCount)
        break

      case 'hand:card_removed':
        if (gameState.value) {
          const card = gameState.value.cards.find((c) => c.id === message.cardState.id)
          if (card) {
            Object.assign(card, message.cardState)
          }
          // If it's our card being removed (returned from hand)
          if (message.playerId === playerId.value) {
            handCardIds.value = handCardIds.value.filter((id) => id !== message.cardState.id)
          }
        }
        break

      case 'hand:reordered':
        handCardIds.value = message.newOrder
        break

      case 'hand:stack_added':
        handCardIds.value = message.newHand
        break

      case 'hand:stack_added_other':
        handCounts.value.set(message.playerId, message.handCount)
        if (gameState.value) {
          gameState.value.stacks = gameState.value.stacks.filter(
            (s) => s.id !== message.stackDeleted,
          )
        }
        break

      // Cursor events
      case 'cursor:updated':
        cursors.value.set(message.playerId, { x: message.x, y: message.y })
        break

      // State sync
      case 'state:sync':
        gameState.value = message.state
        handCardIds.value = message.yourHand
        handCounts.value.clear()
        message.handCounts.forEach(({ playerId: pid, count }) => {
          handCounts.value.set(pid, count)
        })
        break

      // Errors
      case 'error':
        console.error('[ws] error:', message.code, message.message)
        error.value = message.message
        break
    }
  }

  const onMessage = (handler: (message: ServerMessage) => void) => {
    messageHandlers.add(handler)
  }

  const offMessage = (handler: (message: ServerMessage) => void) => {
    messageHandlers.delete(handler)
  }

  // Cleanup on unmount
  onUnmounted(() => {
    disconnect()
  })

  return {
    state,
    isConnected,
    error,
    roomCode,
    playerId,
    players,
    gameState,
    handCardIds,
    handCounts,
    cursors,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    leaveRoom,
    send,
    onMessage,
    offMessage,
  }
}
