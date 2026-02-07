import { ref, shallowRef, computed, onUnmounted, type Ref } from 'vue'
import type {
  ClientMessage,
  ServerMessage,
  GameState,
  Player,
  TableSettings,
  TableSnapshotInfo,
  ChatMessage,
  ActivityLogEntry,
  Pong,
} from '../../shared/types'
import {
  handleCardMessage,
  handleStackMessage,
  handleZoneMessage,
  handleHandMessage,
  handleRoomMessage,
  handleTableMessage,
  handleCursorMessage,
  handleSelectionBoxMessage,
  handleStateSyncMessage,
  handleChatMessage,
  handleErrorMessage,
  handleActivityMessage,
  type GameStateRefs,
  type RoomStateRefs,
} from './websocket/handlers'

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
  isReconnecting: Ref<boolean>
  reconnectAttempts: Ref<number>
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
  selectionBoxes: Ref<
    Map<string, { box: { x: number; y: number; width: number; height: number }; color: string }>
  >
  chatMessages: Ref<ChatMessage[]>
  typingPlayers: Ref<Map<string, string>> // playerId -> playerName
  activityLog: Ref<ActivityLogEntry[]>

  // Table settings
  tableSettings: Ref<TableSettings>
  tableName: Ref<string>
  tableIsPublic: Ref<boolean>
  snapshots: Ref<TableSnapshotInfo[]>
  lastAutosaveAt: Ref<number | null>
  inviteToken: Ref<string | null>

  // Moderation
  kickedReason: Ref<string | null>

  // Actions
  connect: () => void
  disconnect: () => void
  createRoom: (playerName: string, options?: { tableName?: string; isPublic?: boolean; preferredColor?: string }) => void
  joinRoom: (
    roomCode: string,
    playerName: string,
    preferredColor?: string,
    inviteToken?: string,
  ) => void
  leaveRoom: () => void
  send: (message: ClientMessage) => void

  // Table management
  resetTable: () => void
  updateTableSettings: (settings: Partial<TableSettings>) => void
  updateTableVisibility: (isPublic: boolean) => void
  updateTableName: (name: string) => void
  createSnapshot: (name?: string) => void
  listSnapshots: () => void
  restoreSnapshot: (snapshotId: number) => void
  undoTable: () => void
  redoTable: () => void
  regenerateInviteToken: () => void

  // Player moderation (creator or moderator)
  kickPlayer: (targetPlayerId: string) => void
  banPlayer: (targetPlayerId: string) => void
  promotePlayer: (targetPlayerId: string) => void
  demotePlayer: (targetPlayerId: string) => void

  // Player profile
  updatePlayer: (updates: { name?: string; color?: string }) => void

  // Chat
  sendChat: (message: string) => void
  sendTyping: (isTyping: boolean) => void
  deleteChatMessage: (messageId: string) => void

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
const DEVICE_ID_KEY = 'cardz_device_id'

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
 * Get stored session token for reconnection (HMAC-signed by server)
 * Returns undefined if no token is stored
 */
function getSessionToken(): string | undefined {
  return localStorage.getItem(SESSION_ID_KEY) || undefined
}

/**
 * Store a session token from the server (HMAC-signed)
 */
function storeSessionToken(token: string): void {
  localStorage.setItem(SESSION_ID_KEY, token)
}

/**
 * Clear stored session token (on leave or error)
 */
function clearSessionToken(): void {
  localStorage.removeItem(SESSION_ID_KEY)
}

/**
 * Get or create a persistent device identifier
 * This persists across sessions and rooms to identify the same browser/device
 */
function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY)
  if (!deviceId) {
    deviceId = generateUUID()
    localStorage.setItem(DEVICE_ID_KEY, deviceId)
  }
  return deviceId
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
  const isReconnecting = ref(false)
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
  const selectionBoxes = ref<
    Map<string, { box: { x: number; y: number; width: number; height: number }; color: string }>
  >(new Map())
  const chatMessages = ref<ChatMessage[]>([])
  const typingPlayers = ref<Map<string, string>>(new Map())
  const activityLog = ref<ActivityLogEntry[]>([])

  // Table settings
  const tableSettings = ref<TableSettings>({
    background: 'green-felt',
    joinPolicy: 'open',
    permissionsPreset: 'standard',
  })
  const tableName = ref<string>('')
  const tableIsPublic = ref<boolean>(false)
  const snapshots = ref<TableSnapshotInfo[]>([])
  const lastAutosaveAt = ref<number | null>(null)
  const inviteToken = ref<string | null>(null)

  // Moderation - set when current player is kicked/banned
  const kickedReason = ref<string | null>(null)

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
        error.value = null

        // Auto-rejoin room after reconnect
        if (pendingRoomCode && pendingPlayerName) {
          console.log('[ws] auto-rejoining room:', pendingRoomCode)
          const sessionId = getSessionToken() // Use stored HMAC token for reconnection
          send({
            type: 'room:join',
            roomCode: pendingRoomCode,
            playerName: pendingPlayerName,
            sessionId,
            deviceId: getOrCreateDeviceId(),
          })
        }
      }

      ws.value.onclose = (event) => {
        console.log('[ws] closed', event.code, event.reason)
        state.value = 'disconnected'
        ws.value = null
        if (playerId.value) {
          players.value = players.value.map((p) =>
            p.id === playerId.value ? { ...p, connected: false } : p,
          )
        }

        // Attempt reconnect if was connected to a room
        if (autoReconnect && roomCode.value && reconnectAttempts.value < maxReconnectAttempts) {
          reconnectAttempts.value++
          isReconnecting.value = true
          console.log(
            `[ws] reconnecting (attempt ${reconnectAttempts.value}/${maxReconnectAttempts})`,
          )
          reconnectTimeout = setTimeout(connect, reconnectDelay * reconnectAttempts.value)
        } else if (roomCode.value) {
          isReconnecting.value = false
          error.value = 'Connection lost. Unable to reconnect.'
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
    isReconnecting.value = false
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
    selectionBoxes.value.clear()
    chatMessages.value = []
    typingPlayers.value.clear()
    activityLog.value = []
    inviteToken.value = null
    tableSettings.value = {
      background: 'green-felt',
      joinPolicy: 'open',
      permissionsPreset: 'standard',
    }
    tableName.value = ''
    tableIsPublic.value = false
    snapshots.value = []
    lastAutosaveAt.value = null
    // Clear message handlers to prevent memory leaks from stale closures
    messageHandlers.clear()
  }

  const send = (message: ClientMessage) => {
    if (ws.value?.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify(message))
    } else {
      console.warn('[ws] cannot send, not connected')
    }
  }

  // Room actions
  const createRoom = (playerName: string, options?: { tableName?: string; isPublic?: boolean; preferredColor?: string }) => {
    // Don't send session token when creating a new room - server will generate one
    console.log('[ws] creating room for:', playerName, options?.isPublic ? '(public)' : '(private)')
    send({
      type: 'room:create',
      playerName,
      preferredColor: options?.preferredColor,
      tableName: options?.tableName,
      isPublic: options?.isPublic,
      deviceId: getOrCreateDeviceId(),
    })
  }

  const joinRoom = (
    code: string,
    playerName: string,
    preferredColor?: string,
    inviteToken?: string,
  ) => {
    const sessionId = getSessionToken() // Use stored HMAC token if available
    console.log('[ws] joining room:', code, sessionId ? '(with session)' : '(new session)')
    send({
      type: 'room:join',
      roomCode: code.toUpperCase(),
      playerName,
      preferredColor,
      inviteToken,
      sessionId,
      deviceId: getOrCreateDeviceId(),
    })
  }

  const leaveRoom = () => {
    send({ type: 'room:leave' })
    clearSessionToken() // Clear stored session token when leaving
    roomCode.value = null
    playerId.value = null
    players.value = []
    gameState.value = null
    handCardIds.value = []
    handCounts.value.clear()
    cursors.value.clear()
    selectionBoxes.value.clear()
    chatMessages.value = []
    typingPlayers.value.clear()
    activityLog.value = []
    tableSettings.value = {
      background: 'green-felt',
      joinPolicy: 'open',
      permissionsPreset: 'standard',
    }
    tableName.value = ''
    tableIsPublic.value = false
    snapshots.value = []
    lastAutosaveAt.value = null
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

  const createSnapshot = (name?: string) => {
    send({ type: 'table:snapshot_create', name })
  }

  const listSnapshots = () => {
    send({ type: 'table:snapshot_list' })
  }

  const restoreSnapshot = (snapshotId: number) => {
    send({ type: 'table:snapshot_restore', snapshotId })
  }

  const undoTable = () => {
    send({ type: 'table:undo' })
  }

  const redoTable = () => {
    send({ type: 'table:redo' })
  }

  const regenerateInviteToken = () => {
    send({ type: 'table:invite_regenerate' })
  }

  // Chat
  const sendChat = (message: string) => {
    if (message.trim()) {
      send({ type: 'chat:send', message: message.trim() })
    }
  }

  const sendTyping = (isTyping: boolean) => {
    send({ type: 'chat:typing', isTyping })
  }

  const deleteChatMessage = (messageId: string) => {
    if (!messageId) return
    send({ type: 'chat:delete', messageId })
  }

  // Player moderation (creator or moderator)
  const kickPlayer = (targetPlayerId: string) => {
    send({ type: 'player:kick', targetPlayerId })
  }

  const banPlayer = (targetPlayerId: string) => {
    send({ type: 'player:ban', targetPlayerId })
  }

  const promotePlayer = (targetPlayerId: string) => {
    send({ type: 'player:promote', targetPlayerId })
  }

  const demotePlayer = (targetPlayerId: string) => {
    send({ type: 'player:demote', targetPlayerId })
  }

  // Player profile update
  const updatePlayer = (updates: { name?: string; color?: string }) => {
    send({ type: 'player:update', ...updates })
  }

  // Message handling
  const handleMessage = (message: ServerMessage) => {
    if (message.type === 'room:joined') {
      isReconnecting.value = false
    }
    if (message.type === 'room:created') {
      isReconnecting.value = false
    }
    if (message.type === 'room:error') {
      isReconnecting.value = false
    }

    // Notify all registered handlers
    messageHandlers.forEach((handler) => handler(message))

    // Heartbeat response - handle directly for minimal latency
    if (message.type === 'ping') {
      const pong: Pong = { type: 'pong', timestamp: message.timestamp }
      send(pong)
      return
    }

    // Create refs objects for handlers
    const gameStateRefs: GameStateRefs = {
      gameState,
      handCardIds,
      handCounts,
    }

    const roomStateRefs: RoomStateRefs = {
      roomCode,
      playerId,
      players,
      gameState,
      handCardIds,
      handCounts,
      cursors,
      selectionBoxes,
      error,
      tableSettings,
      tableName,
      tableIsPublic,
      snapshots,
      lastAutosaveAt,
      inviteToken,
      chatMessages,
      typingPlayers,
      activityLog,
      kickedReason,
    }

    const roomCallbacks = {
      storeSessionToken,
    }

    // Try each handler category in order
    // Room events (join, leave, errors)
    if (handleRoomMessage(message, roomStateRefs, roomCallbacks)) return

    // Table management (reset, settings, visibility, name)
    if (handleTableMessage(message, roomStateRefs)) return

    // Card events
    if (handleCardMessage(message, gameStateRefs)) return

    // Stack events
    if (handleStackMessage(message, gameStateRefs)) return

    // Zone events
    if (handleZoneMessage(message, gameStateRefs)) return

    // Hand events
    if (handleHandMessage(message, gameStateRefs, playerId.value)) return

    // Cursor events
    if (handleCursorMessage(message, roomStateRefs)) return

    // Selection box events
    if (handleSelectionBoxMessage(message, roomStateRefs)) return

    // State sync
    if (handleStateSyncMessage(message, roomStateRefs)) return

    // Chat
    if (handleChatMessage(message, roomStateRefs)) return

    // Activity log
    if (handleActivityMessage(message, roomStateRefs)) return

    // Errors
    if (handleErrorMessage(message, roomStateRefs)) return
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
    isReconnecting,
    reconnectAttempts,
    error,
    roomCode,
    playerId,
    players,
    gameState,
    handCardIds,
    handCounts,
    cursors,
    selectionBoxes,
    chatMessages,
    typingPlayers,
    activityLog,
    tableSettings,
    tableName,
    tableIsPublic,
    snapshots,
    lastAutosaveAt,
    inviteToken,
    kickedReason,
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
    createSnapshot,
    listSnapshots,
    restoreSnapshot,
    undoTable,
    redoTable,
    regenerateInviteToken,
    kickPlayer,
    banPlayer,
    promotePlayer,
    demotePlayer,
    updatePlayer,
    sendChat,
    sendTyping,
    deleteChatMessage,
    onMessage,
    offMessage,
  }
}
