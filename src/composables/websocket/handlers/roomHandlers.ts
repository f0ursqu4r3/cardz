/**
 * Room state message handlers
 * Handles room events, player joins/leaves, errors, and table management
 */

import type { Ref } from 'vue'
import type {
  GameState,
  Player,
  ServerMessage,
  TableSettings,
  ChatMessage,
} from '../../../../shared/types'

interface RoomStateRefs {
  roomCode: Ref<string | null>
  playerId: Ref<string | null>
  players: Ref<Player[]>
  gameState: Ref<GameState | null>
  handCardIds: Ref<number[]>
  handCounts: Ref<Map<string, number>>
  cursors: Ref<Map<string, { x: number; y: number; state: 'default' | 'grab' | 'grabbing' }>>
  error: Ref<string | null>
  tableSettings: Ref<TableSettings>
  tableName: Ref<string>
  tableIsPublic: Ref<boolean>
  chatMessages: Ref<ChatMessage[]>
  typingPlayers: Ref<Map<string, string>>
}

interface RoomHandlerCallbacks {
  storeSessionToken: (token: string) => void
}

/**
 * Handle room-related messages (join, leave, errors)
 */
export function handleRoomMessage(
  message: ServerMessage,
  refs: RoomStateRefs,
  callbacks: RoomHandlerCallbacks,
): boolean {
  const {
    roomCode,
    playerId,
    players,
    gameState,
    handCardIds,
    handCounts,
    cursors,
    error,
  } = refs

  switch (message.type) {
    case 'room:created':
      roomCode.value = message.roomCode
      playerId.value = message.playerId
      gameState.value = message.state
      players.value = [{ id: message.playerId, name: '', connected: true, color: '#ef4444', role: 'creator' }]
      // Store HMAC-signed session token for secure reconnection
      callbacks.storeSessionToken(message.sessionToken)
      console.log('[ws] room created:', message.roomCode)
      return true

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
      // Store HMAC-signed session token for secure reconnection
      callbacks.storeSessionToken(message.sessionToken)
      console.log('[ws] joined room:', message.roomCode)
      return true

    case 'room:player_joined':
      players.value = [...players.value, message.player]
      console.log('[ws] player joined:', message.player.name)
      return true

    case 'room:player_left': {
      players.value = players.value.filter((p) => p.id !== message.playerId)
      const newCursors = new Map(cursors.value)
      newCursors.delete(message.playerId)
      cursors.value = newCursors
      handCounts.value.delete(message.playerId)
      console.log('[ws] player left:', message.playerId)
      return true
    }

    case 'room:error':
      error.value = message.message
      console.error('[ws] room error:', message.code, message.message)
      return true

    default:
      return false
  }
}

/**
 * Handle table management messages (settings, visibility, name, reset)
 */
export function handleTableMessage(
  message: ServerMessage,
  refs: RoomStateRefs,
): boolean {
  const { gameState, handCardIds, tableSettings, tableName, tableIsPublic } = refs

  switch (message.type) {
    case 'table:reset':
      gameState.value = message.state
      handCardIds.value = []
      console.log('[ws] table reset')
      return true

    case 'table:settings_updated':
      tableSettings.value = message.settings
      console.log('[ws] table settings updated')
      return true

    case 'table:visibility_updated':
      tableIsPublic.value = message.isPublic
      console.log('[ws] table visibility updated:', message.isPublic ? 'public' : 'private')
      return true

    case 'table:name_updated':
      tableName.value = message.name
      console.log('[ws] table name updated:', message.name)
      return true

    case 'table:info':
      tableName.value = message.name
      tableIsPublic.value = message.isPublic
      tableSettings.value = message.settings
      return true

    default:
      return false
  }
}

/**
 * Handle cursor update messages
 */
export function handleCursorMessage(
  message: ServerMessage,
  refs: RoomStateRefs,
): boolean {
  const { cursors } = refs

  switch (message.type) {
    case 'cursor:updated': {
      const newCursors = new Map(cursors.value)
      newCursors.set(message.playerId, { x: message.x, y: message.y, state: message.state })
      cursors.value = newCursors
      return true
    }

    default:
      return false
  }
}

/**
 * Handle state sync messages
 */
export function handleStateSyncMessage(
  message: ServerMessage,
  refs: RoomStateRefs,
): boolean {
  const { gameState, handCardIds, handCounts, playerId } = refs

  switch (message.type) {
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
      return true
    }

    default:
      return false
  }
}

/**
 * Handle chat messages
 */
export function handleChatMessage(
  message: ServerMessage,
  refs: RoomStateRefs,
): boolean {
  const { chatMessages, typingPlayers } = refs

  switch (message.type) {
    case 'chat:message':
      chatMessages.value = [...chatMessages.value, message]
      return true

    case 'chat:history': {
      // Load chat history (prepend to any existing messages, avoiding duplicates)
      const existingIds = new Set(chatMessages.value.map((m) => m.id))
      const newMessages = message.messages
        .filter((m) => !existingIds.has(m.id))
        .map((m) => ({ ...m, type: 'chat:message' as const }))
      chatMessages.value = [...newMessages, ...chatMessages.value]
      return true
    }

    case 'chat:typing_status':
      if (message.isTyping) {
        typingPlayers.value.set(message.playerId, message.playerName)
      } else {
        typingPlayers.value.delete(message.playerId)
      }
      // Trigger reactivity
      typingPlayers.value = new Map(typingPlayers.value)
      return true

    default:
      return false
  }
}

/**
 * Handle error messages
 */
export function handleErrorMessage(
  message: ServerMessage,
  refs: RoomStateRefs,
): boolean {
  const { error } = refs

  switch (message.type) {
    case 'error':
      error.value = message.message
      console.error('[ws] error:', message.originalAction, message.code, message.message)
      return true

    default:
      return false
  }
}
