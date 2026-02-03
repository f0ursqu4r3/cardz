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
  TableSnapshotInfo,
  ChatMessage,
  ActivityLogEntry,
} from '../../../../shared/types'

export interface RoomStateRefs {
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
  snapshots: Ref<TableSnapshotInfo[]>
  lastAutosaveAt: Ref<number | null>
  chatMessages: Ref<ChatMessage[]>
  typingPlayers: Ref<Map<string, string>>
  activityLog: Ref<ActivityLogEntry[]>
  kickedReason: Ref<string | null> // Set when current player is kicked/banned
}

export interface RoomHandlerCallbacks {
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
      handCounts.value.clear()
      for (const hand of message.state.hands) {
        handCounts.value.set(hand.playerId, hand.cardIds.length)
      }
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
      handCounts.value.clear()
      for (const hand of message.state.hands) {
        handCounts.value.set(hand.playerId, hand.cardIds.length)
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

    case 'room:player_reconnected': {
      // Update existing player instead of add/remove
      const existingIdx = players.value.findIndex((p) => p.id === message.player.id)
      if (existingIdx >= 0) {
        // Update existing player entry
        const newPlayers = [...players.value]
        newPlayers[existingIdx] = message.player
        players.value = newPlayers
      } else {
        // Player not found (shouldn't happen), add them
        players.value = [...players.value, message.player]
      }
      console.log('[ws] player reconnected:', message.player.name)
      return true
    }

    case 'room:player_disconnected': {
      players.value = players.value.map((p) =>
        p.id === message.playerId ? { ...p, connected: false } : p,
      )
      const newCursors = new Map(cursors.value)
      newCursors.delete(message.playerId)
      cursors.value = newCursors
      console.log('[ws] player disconnected:', message.playerId)
      return true
    }

    case 'room:player_left': {
      players.value = players.value.filter((p) => p.id !== message.playerId)
      const newCursors = new Map(cursors.value)
      newCursors.delete(message.playerId)
      cursors.value = newCursors
      handCounts.value.delete(message.playerId)
      console.log('[ws] player left:', message.playerId)
      return true
    }

    case 'room:player_kicked': {
      // Check if this is the current player being kicked
      if (message.playerId === playerId.value) {
        refs.kickedReason.value = `You were kicked from the table by ${message.kickedBy}`
        console.log('[ws] you were kicked by:', message.kickedBy)
        return true
      }
      // Remove the kicked player from the players list
      players.value = players.value.filter((p) => p.id !== message.playerId)
      const newCursors = new Map(cursors.value)
      newCursors.delete(message.playerId)
      cursors.value = newCursors
      handCounts.value.delete(message.playerId)
      console.log('[ws] player kicked:', message.playerName, 'by', message.kickedBy)
      return true
    }

    case 'room:player_banned': {
      // Check if this is the current player being banned
      if (message.playerId === playerId.value) {
        refs.kickedReason.value = `You were banned from the table by ${message.bannedBy}`
        console.log('[ws] you were banned by:', message.bannedBy)
        return true
      }
      // Remove the banned player from the players list
      players.value = players.value.filter((p) => p.id !== message.playerId)
      const newCursors = new Map(cursors.value)
      newCursors.delete(message.playerId)
      cursors.value = newCursors
      handCounts.value.delete(message.playerId)
      console.log('[ws] player banned:', message.playerName, 'by', message.bannedBy)
      return true
    }

    case 'room:player_role_changed': {
      // Update the player's role in the players list
      const existingPlayer = players.value.find((p) => p.id === message.playerId)
      if (existingPlayer) {
        players.value = players.value.map((p) =>
          p.id === message.playerId ? { ...p, role: message.newRole } : p
        )
      }
      console.log('[ws] player role changed:', message.playerName, 'to', message.newRole, 'by', message.changedBy)
      return true
    }

    case 'room:player_updated': {
      // Update the player's name and/or color
      players.value = players.value.map((p) => {
        if (p.id !== message.playerId) return p
        return {
          ...p,
          ...(message.name !== undefined && { name: message.name }),
          ...(message.color !== undefined && { color: message.color }),
        }
      })
      console.log('[ws] player updated:', message.playerId, message.name, message.color)
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
  const {
    gameState,
    handCardIds,
    tableSettings,
    tableName,
    tableIsPublic,
    snapshots,
    lastAutosaveAt,
  } = refs

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

    case 'table:snapshot_list':
      snapshots.value = message.snapshots
      return true

    case 'table:snapshot_created':
      if (!snapshots.value.find((s) => s.id === message.snapshot.id)) {
        snapshots.value = [message.snapshot, ...snapshots.value]
      }
      return true

    case 'table:snapshot_restored':
      return true

    case 'table:autosave':
      lastAutosaveAt.value = message.timestamp
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
  const { gameState, handCardIds, handCounts } = refs

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

/**
 * Handle activity log messages
 */
export function handleActivityMessage(
  message: ServerMessage,
  refs: RoomStateRefs,
): boolean {
  const { activityLog } = refs

  switch (message.type) {
    case 'activity:logged':
      activityLog.value = [...activityLog.value, message.entry]
      return true

    case 'activity:history': {
      // Load activity history (prepend to any existing entries, avoiding duplicates)
      const existingIds = new Set(activityLog.value.map((e) => e.id))
      const newEntries = message.entries.filter((e) => !existingIds.has(e.id))
      activityLog.value = [...newEntries, ...activityLog.value]
      return true
    }

    default:
      return false
  }
}
