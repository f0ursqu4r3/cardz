import { ref, shallowRef, computed, onUnmounted, type Ref } from 'vue'
import type {
  ClientMessage,
  ServerMessage,
  GameState,
  Player,
  CardState,
  StackState,
  ZoneState,
  TableSettings,
  TableBackground,
  ChatMessage,
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
  cursors: Ref<Map<string, { x: number; y: number; state: 'default' | 'grab' | 'grabbing' }>>
  chatMessages: Ref<ChatMessage[]>

  // Table settings
  tableSettings: Ref<TableSettings>
  tableName: Ref<string>
  tableIsPublic: Ref<boolean>

  // Actions
  connect: () => void
  disconnect: () => void
  createRoom: (playerName: string, options?: { tableName?: string; isPublic?: boolean }) => void
  joinRoom: (roomCode: string, playerName: string) => void
  leaveRoom: () => void
  send: (message: ClientMessage) => void

  // Table management
  resetTable: () => void
  updateTableSettings: (settings: Partial<TableSettings>) => void
  updateTableVisibility: (isPublic: boolean) => void
  updateTableName: (name: string) => void

  // Chat
  sendChat: (message: string) => void

  // Event handlers
  onMessage: (handler: (message: ServerMessage) => void) => void
  offMessage: (handler: (message: ServerMessage) => void) => void
}

/**
 * Get the WebSocket URL, auto-detecting protocol based on page protocol
 */
function getDefaultWsUrl(): string {
  // Use environment variable if set
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL
  }
  // Auto-detect: use wss:// for HTTPS, ws:// for HTTP
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // In production (HTTPS), connect to same host; in dev, use port 9001
  const host = window.location.hostname
  const port = window.location.protocol === 'https:' ? '' : ':9001'
  return `${protocol}//${host}${port}`
}

const DEFAULT_WS_URL = getDefaultWsUrl()
const SESSION_ID_KEY = 'cardz_session_id'

/**
 * Generate a UUID-like string (fallback for non-secure contexts)
 */
function generateUUID(): string {
  // Use crypto.randomUUID if available (secure contexts)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for non-secure contexts (HTTP with IP address)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Get or create a persistent session ID for reconnection
 */
function getSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_ID_KEY)
  if (!sessionId) {
    sessionId = generateUUID()
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
  const cursors = ref<
    Map<string, { x: number; y: number; state: 'default' | 'grab' | 'grabbing' }>
  >(new Map())
  const chatMessages = ref<ChatMessage[]>([])

  // Table settings
  const tableSettings = ref<TableSettings>({ background: 'green-felt' })
  const tableName = ref<string>('')
  const tableIsPublic = ref<boolean>(false)

  // Message handlers
  const messageHandlers = new Set<(message: ServerMessage) => void>()

  const isConnected = computed(() => state.value === 'connected')

  // WebSocket setup
  const connect = () => {
    if (ws.value?.readyState === WebSocket.OPEN) return

    state.value = 'connecting'
    error.value = null

    // Store room info for potential rejoin after reconnect
    const pendingRoomCode = roomCode.value
    const pendingPlayerName = players.value.find((p) => p.id === playerId.value)?.name || ''

    try {
      ws.value = new WebSocket(url)

      ws.value.onopen = () => {
        console.log('[ws] connected')
        state.value = 'connected'
        reconnectAttempts.value = 0

        // Auto-rejoin room after reconnect
        if (pendingRoomCode && pendingPlayerName) {
          console.log('[ws] auto-rejoining room:', pendingRoomCode)
          const sessionId = getSessionId()
          send({
            type: 'room:join',
            roomCode: pendingRoomCode,
            playerName: pendingPlayerName,
            sessionId,
          })
        }
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
    chatMessages.value = []
    tableSettings.value = { background: 'green-felt' }
    tableName.value = ''
    tableIsPublic.value = false
  }

  const send = (message: ClientMessage) => {
    if (ws.value?.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify(message))
    } else {
      console.warn('[ws] cannot send, not connected')
    }
  }

  // Room actions
  const createRoom = (playerName: string, options?: { tableName?: string; isPublic?: boolean }) => {
    const sessionId = getSessionId()
    console.log('[ws] creating room for:', playerName, options?.isPublic ? '(public)' : '(private)')
    send({
      type: 'room:create',
      playerName,
      sessionId,
      tableName: options?.tableName,
      isPublic: options?.isPublic,
    })
  }

  const joinRoom = (code: string, playerName: string) => {
    const sessionId = getSessionId()
    console.log('[ws] joining room:', code)
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
    chatMessages.value = []
    tableSettings.value = { background: 'green-felt' }
    tableName.value = ''
    tableIsPublic.value = false
  }

  // Table management actions
  const resetTable = () => {
    send({ type: 'table:reset' })
  }

  const updateTableSettings = (settings: Partial<TableSettings>) => {
    send({ type: 'table:update_settings', settings })
  }

  const updateTableVisibility = (isPublic: boolean) => {
    send({ type: 'table:update_visibility', isPublic })
  }

  const updateTableName = (name: string) => {
    send({ type: 'table:update_name', name })
  }

  // Chat
  const sendChat = (message: string) => {
    if (message.trim()) {
      send({ type: 'chat:send', message: message.trim() })
    }
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
        // Restore cursor positions from other players
        if (message.cursors) {
          const newCursors = new Map<
            string,
            { x: number; y: number; state: 'default' | 'grab' | 'grabbing' }
          >()
          for (const cursor of message.cursors) {
            newCursors.set(cursor.playerId, { x: cursor.x, y: cursor.y, state: cursor.state })
          }
          cursors.value = newCursors
        }
        console.log('[ws] joined room:', message.roomCode)
        break

      case 'room:player_joined':
        players.value = [...players.value, message.player]
        console.log('[ws] player joined:', message.player.name)
        break

      case 'room:player_left': {
        players.value = players.value.filter((p) => p.id !== message.playerId)
        const newCursors = new Map(cursors.value)
        newCursors.delete(message.playerId)
        cursors.value = newCursors
        handCounts.value.delete(message.playerId)
        console.log('[ws] player left:', message.playerId)
        break
      }

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
          // Handle zone detachment
          if (message.zoneDetached) {
            const zone = gameState.value.zones.find((z) => z.id === message.zoneDetached!.zoneId)
            if (zone) {
              zone.stackId = null
            }
            if (stack) {
              stack.zoneId = undefined
              stack.kind = 'free'
            }
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
        // Update card state so it's hidden from view (owned by another player)
        if (gameState.value) {
          const card = gameState.value.cards.find((c) => c.id === message.cardId)
          if (card) {
            card.ownerId = message.playerId
          }
        }
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
          // Mark cards as owned so they're hidden from view
          for (const cardId of message.cardIds) {
            const card = gameState.value.cards.find((c) => c.id === cardId)
            if (card) {
              card.ownerId = message.playerId
              card.stackId = null
            }
          }
        }
        break

      // Cursor events
      case 'cursor:updated': {
        const newCursors = new Map(cursors.value)
        newCursors.set(message.playerId, { x: message.x, y: message.y, state: message.state })
        cursors.value = newCursors
        break
      }

      // State sync
      case 'state:sync': {
        gameState.value = message.state
        // Preserve local hand order if the same cards exist (just reordered)
        // Only update if cards have actually been added/removed
        const currentSet = new Set(handCardIds.value)
        const serverSet = new Set(message.yourHand)
        const sameCards =
          currentSet.size === serverSet.size && [...currentSet].every((id) => serverSet.has(id))

        if (!sameCards) {
          // Cards changed - use server's order
          handCardIds.value = message.yourHand
        }
        // If same cards, keep local order to preserve recent reordering

        handCounts.value.clear()
        message.handCounts.forEach(({ playerId: pid, count }) => {
          handCounts.value.set(pid, count)
        })
        break
      }

      // Table management
      case 'table:reset':
        gameState.value = message.state
        handCardIds.value = []
        console.log('[ws] table reset')
        break

      case 'table:settings_updated':
        tableSettings.value = message.settings
        console.log('[ws] table settings updated')
        break

      case 'table:visibility_updated':
        tableIsPublic.value = message.isPublic
        console.log('[ws] table visibility updated:', message.isPublic ? 'public' : 'private')
        break

      case 'table:name_updated':
        tableName.value = message.name
        console.log('[ws] table name updated:', message.name)
        break

      case 'table:info':
        tableName.value = message.name
        tableIsPublic.value = message.isPublic
        tableSettings.value = message.settings
        break

      // Chat
      case 'chat:message':
        chatMessages.value = [...chatMessages.value, message]
        break

      case 'chat:history':
        // Load chat history (prepend to any existing messages, avoiding duplicates)
        const existingIds = new Set(chatMessages.value.map((m) => m.id))
        const newMessages = message.messages
          .filter((m) => !existingIds.has(m.id))
          .map((m) => ({ ...m, type: 'chat:message' as const }))
        chatMessages.value = [...newMessages, ...chatMessages.value]
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
    chatMessages,
    tableSettings,
    tableName,
    tableIsPublic,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    leaveRoom,
    send,
    resetTable,
    updateTableSettings,
    updateTableVisibility,
    updateTableName,
    sendChat,
    onMessage,
    offMessage,
  }
}
