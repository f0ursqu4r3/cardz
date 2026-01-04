import type { Player, TableSettings, TableBackground } from '../shared/types'
import { PLAYER_COLORS } from '../shared/types'
import { GameStateManager, createInitialGameState } from './game-state'
import { LockManager } from './utils/locks'
import type { ClientData, GenericWebSocket } from './utils/broadcast'
import {
  saveTable,
  loadTable,
  deleteTable,
  startAutoSave,
  stopAutoSave,
  cleanupOldTables,
  getDefaultSettings,
  type TableMetadata,
} from './persistence'

/**
 * Generate a random 6-character room code
 */
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Avoid ambiguous chars
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export type CursorState = 'default' | 'grab' | 'grabbing'

export interface CursorPosition {
  x: number
  y: number
  state: CursorState
}

export interface Room {
  code: string
  name: string
  isPublic: boolean
  maxPlayers: number
  players: Map<string, Player>
  gameState: GameStateManager
  locks: LockManager
  cursors: Map<string, CursorPosition>
  createdAt: number
  createdBy: string
  settings: TableSettings
}

/**
 * Manages all active rooms
 */
export class RoomManager {
  private rooms = new Map<string, Room>()
  private clients = new Map<string, GenericWebSocket>()
  private sessionToPlayer = new Map<string, { roomCode: string; playerId: string }>()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null
  private persistenceCleanupInterval: ReturnType<typeof setInterval> | null = null
  private emptyRoomCleanups = new Map<string, ReturnType<typeof setTimeout>>()

  // How long to wait before cleaning up an empty room (1 minute)
  private static readonly EMPTY_ROOM_CLEANUP_DELAY = 60_000

  constructor() {
    // Clean up empty rooms every minute
    this.cleanupInterval = setInterval(() => this.cleanupEmptyRooms(), 60_000)
    // Clean up old persisted tables every hour
    this.persistenceCleanupInterval = setInterval(() => cleanupOldTables(), 60 * 60 * 1000)
  }

  /**
   * Register a client connection
   */
  addClient(id: string, ws: GenericWebSocket): void {
    this.clients.set(id, ws)
  }

  /**
   * Remove a client connection
   */
  removeClient(id: string): void {
    this.clients.delete(id)
  }

  /**
   * Get all clients map (for broadcasting)
   */
  getClients(): Map<string, GenericWebSocket> {
    return this.clients
  }

  /**
   * Create a new room
   */
  createRoom(
    playerId: string,
    playerName: string,
    sessionId?: string,
    tableName?: string,
    isPublic?: boolean,
  ): Room {
    // Generate unique code
    let code: string
    do {
      code = generateRoomCode()
    } while (this.rooms.has(code))

    const player: Player = {
      id: playerId,
      name: playerName,
      connected: true,
      color: PLAYER_COLORS[0],
      sessionId,
    }

    const settings: TableSettings = { background: 'green-felt' }

    const room: Room = {
      code,
      name: tableName || `${playerName}'s Table`,
      isPublic: isPublic ?? false,
      maxPlayers: 8,
      players: new Map([[playerId, player]]),
      gameState: new GameStateManager(),
      locks: new LockManager(),
      cursors: new Map(),
      createdAt: Date.now(),
      createdBy: playerName,
      settings,
    }

    this.rooms.set(code, room)

    // Track session for reconnection
    if (sessionId) {
      this.sessionToPlayer.set(sessionId, { roomCode: code, playerId })
    }

    // Start auto-saving this room
    startAutoSave(code, () => {
      const r = this.rooms.get(code)
      if (!r) return null
      return {
        metadata: {
          code: r.code,
          name: r.name,
          isPublic: r.isPublic,
          maxPlayers: r.maxPlayers,
          createdAt: r.createdAt,
          updatedAt: Date.now(),
          createdBy: r.createdBy,
          settings: r.settings,
        },
        gameState: r.gameState.getState(),
      }
    })

    return room
  }

  /**
   * Load a persisted room or create a new one if not found
   */
  loadOrCreateRoom(
    roomCode: string,
    playerId: string,
    playerName: string,
    sessionId?: string,
  ):
    | { room: Room; player: Player; isReconnect: boolean; loaded: boolean }
    | { error: 'NOT_FOUND' | 'FULL' } {
    // Check if room is already in memory
    const existingRoom = this.rooms.get(roomCode)
    if (existingRoom) {
      // Use normal join flow
      const result = this.joinRoom(roomCode, playerId, playerName, sessionId)
      if ('error' in result) return result
      return { ...result, loaded: false }
    }

    // Try to load from persistence
    const persisted = loadTable(roomCode)
    if (!persisted) {
      return { error: 'NOT_FOUND' }
    }

    // Recreate the room from persisted data
    const player: Player = {
      id: playerId,
      name: playerName,
      connected: true,
      color: PLAYER_COLORS[0],
      sessionId,
    }

    const room: Room = {
      code: persisted.metadata.code,
      name: persisted.metadata.name,
      isPublic: persisted.metadata.isPublic,
      maxPlayers: persisted.metadata.maxPlayers,
      players: new Map([[playerId, player]]),
      gameState: new GameStateManager(persisted.gameState),
      locks: new LockManager(),
      cursors: new Map(),
      createdAt: persisted.metadata.createdAt,
      createdBy: persisted.metadata.createdBy,
      settings: persisted.metadata.settings || { background: 'green-felt' },
    }

    this.rooms.set(roomCode, room)

    // Create hand for the player
    room.gameState.getOrCreateHand(playerId)

    // Track session for reconnection
    if (sessionId) {
      this.sessionToPlayer.set(sessionId, { roomCode, playerId })
    }

    // Start auto-saving
    startAutoSave(roomCode, () => {
      const r = this.rooms.get(roomCode)
      if (!r) return null
      return {
        metadata: {
          code: r.code,
          name: r.name,
          isPublic: r.isPublic,
          maxPlayers: r.maxPlayers,
          createdAt: r.createdAt,
          updatedAt: Date.now(),
          createdBy: r.createdBy,
          settings: r.settings,
        },
        gameState: r.gameState.getState(),
      }
    })

    console.log(`[room:load] Loaded persisted table ${roomCode}`)
    return { room, player, isReconnect: false, loaded: true }
  }

  /**
   * Join an existing room
   */
  joinRoom(
    roomCode: string,
    playerId: string,
    playerName: string,
    sessionId?: string,
  ): { room: Room; player: Player; isReconnect: boolean } | { error: 'NOT_FOUND' | 'FULL' } {
    const room = this.rooms.get(roomCode)
    if (!room) {
      return { error: 'NOT_FOUND' }
    }

    // Cancel any pending cleanup since someone is joining
    this.cancelEmptyRoomCleanup(roomCode)

    // Check if this is a reconnection via sessionId
    if (sessionId) {
      const existingPlayer = [...room.players.values()].find((p) => p.sessionId === sessionId)
      if (existingPlayer) {
        // Reconnect existing player with new socket ID
        const oldId = existingPlayer.id
        existingPlayer.id = playerId
        existingPlayer.connected = true
        existingPlayer.name = playerName

        // Update the players map with new ID
        room.players.delete(oldId)
        room.players.set(playerId, existingPlayer)

        // Update session mapping
        this.sessionToPlayer.set(sessionId, { roomCode, playerId })

        // Transfer hand ownership
        room.gameState.transferHandOwnership(oldId, playerId)

        return { room, player: existingPlayer, isReconnect: true }
      }
    }

    // Check if room is full (8 players max)
    if (room.players.size >= 8) {
      return { error: 'FULL' }
    }

    // Assign next available color
    const usedColors = new Set([...room.players.values()].map((p) => p.color))
    const availableColor = PLAYER_COLORS.find((c) => !usedColors.has(c)) ?? PLAYER_COLORS[0]

    const player: Player = {
      id: playerId,
      name: playerName,
      connected: true,
      color: availableColor,
      sessionId,
    }

    room.players.set(playerId, player)

    // Create hand for new player
    room.gameState.getOrCreateHand(playerId)

    // Track session for reconnection
    if (sessionId) {
      this.sessionToPlayer.set(sessionId, { roomCode, playerId })
    }

    return { room, player, isReconnect: false }
  }

  /**
   * Remove a player from their room
   */
  leaveRoom(playerId: string, roomCode: string): Room | null {
    const room = this.rooms.get(roomCode)
    if (!room) return null

    const player = room.players.get(playerId)
    if (!player) return null

    // Release all locks held by this player
    const released = room.locks.releaseAllForPlayer(playerId)

    // Return cards from hand to table
    room.gameState.removePlayer(playerId)

    // Remove player and their cursor
    room.players.delete(playerId)
    room.cursors.delete(playerId)

    // Schedule cleanup if room is now empty
    if (room.players.size === 0) {
      this.scheduleEmptyRoomCleanup(roomCode)
      return null
    }

    return room
  }

  /**
   * Schedule cleanup of an empty room after a delay
   */
  private scheduleEmptyRoomCleanup(roomCode: string): void {
    // Clear any existing cleanup timer
    this.cancelEmptyRoomCleanup(roomCode)

    console.log(`[room] Scheduling cleanup for empty room ${roomCode} in 1 minute`)

    const timeout = setTimeout(() => {
      this.emptyRoomCleanups.delete(roomCode)
      const room = this.rooms.get(roomCode)

      // Only cleanup if room still exists and is still empty
      if (room && room.players.size === 0) {
        console.log(`[room] Cleaning up empty room ${roomCode}`)
        // Save final state before deletion
        saveTable(
          roomCode,
          {
            code: room.code,
            name: room.name,
            isPublic: room.isPublic,
            maxPlayers: room.maxPlayers,
            createdAt: room.createdAt,
            updatedAt: Date.now(),
            createdBy: room.createdBy,
            settings: room.settings,
          },
          room.gameState.getState(),
        )
        stopAutoSave(roomCode)
        room.locks.dispose()
        this.rooms.delete(roomCode)
      }
    }, RoomManager.EMPTY_ROOM_CLEANUP_DELAY)

    this.emptyRoomCleanups.set(roomCode, timeout)
  }

  /**
   * Cancel scheduled cleanup for a room (called when player joins)
   */
  private cancelEmptyRoomCleanup(roomCode: string): void {
    const timeout = this.emptyRoomCleanups.get(roomCode)
    if (timeout) {
      clearTimeout(timeout)
      this.emptyRoomCleanups.delete(roomCode)
      console.log(`[room] Cancelled cleanup for room ${roomCode} - player joined`)
    }
  }

  /**
   * Mark a player as disconnected (but keep their data for reconnection)
   */
  disconnectPlayer(playerId: string, roomCode: string): Room | null {
    const room = this.rooms.get(roomCode)
    if (!room) return null

    const player = room.players.get(playerId)
    if (player) {
      player.connected = false
      // Release locks but keep hand
      room.locks.releaseAllForPlayer(playerId)
      // Remove cursor position
      room.cursors.delete(playerId)
    }

    return room
  }

  /**
   * Reconnect a player
   */
  reconnectPlayer(playerId: string, roomCode: string): { room: Room; player: Player } | null {
    const room = this.rooms.get(roomCode)
    if (!room) return null

    const player = room.players.get(playerId)
    if (!player) return null

    player.connected = true
    return { room, player }
  }

  /**
   * Get a room by code
   */
  getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode)
  }

  /**
   * Get room by player ID (searches all rooms)
   */
  getRoomByPlayer(playerId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.players.has(playerId)) {
        return room
      }
    }
    return undefined
  }

  /**
   * Get all public rooms for the browser
   */
  getPublicRooms(): {
    code: string
    name: string
    playerCount: number
    maxPlayers: number
    createdAt: number
    background?: TableBackground
  }[] {
    const publicRooms: {
      code: string
      name: string
      playerCount: number
      maxPlayers: number
      createdAt: number
      background?: TableBackground
    }[] = []

    for (const room of this.rooms.values()) {
      if (room.isPublic) {
        // Only include rooms with at least one connected player
        const connectedCount = [...room.players.values()].filter((p) => p.connected).length
        if (connectedCount > 0) {
          publicRooms.push({
            code: room.code,
            name: room.name,
            playerCount: connectedCount,
            maxPlayers: room.maxPlayers,
            createdAt: room.createdAt,
            background: room.settings.background,
          })
        }
      }
    }

    // Sort by player count descending, then by creation time
    return publicRooms.sort((a, b) => {
      if (b.playerCount !== a.playerCount) {
        return b.playerCount - a.playerCount
      }
      return b.createdAt - a.createdAt
    })
  }

  /**
   * Reset a room's game state to initial state
   */
  resetRoom(roomCode: string): GameState | null {
    const room = this.rooms.get(roomCode)
    if (!room) return null

    // Create fresh game state
    const newState = createInitialGameState()
    room.gameState = new GameStateManager(newState)

    // Clear all hands (players will need to draw cards again)
    for (const playerId of room.players.keys()) {
      room.gameState.getOrCreateHand(playerId)
    }

    // Release all locks
    room.locks.releaseAll()

    console.log(`[room:reset] Reset table ${roomCode}`)
    return room.gameState.getState()
  }

  /**
   * Update room settings
   */
  updateSettings(roomCode: string, settings: Partial<TableSettings>): TableSettings | null {
    const room = this.rooms.get(roomCode)
    if (!room) return null

    room.settings = { ...room.settings, ...settings }
    return room.settings
  }

  /**
   * Update room visibility
   */
  updateVisibility(roomCode: string, isPublic: boolean): boolean {
    const room = this.rooms.get(roomCode)
    if (!room) return false

    room.isPublic = isPublic
    return true
  }

  /**
   * Clean up empty or old rooms
   */
  private cleanupEmptyRooms(): void {
    const now = Date.now()
    const maxAge = 24 * 60 * 60 * 1000 // 24 hours

    for (const [code, room] of this.rooms) {
      // Remove empty rooms - but save them first!
      if (room.players.size === 0) {
        // Save before cleanup so tables can be restored
        saveTable(
          code,
          {
            code: room.code,
            name: room.name,
            isPublic: room.isPublic,
            maxPlayers: room.maxPlayers,
            createdAt: room.createdAt,
            updatedAt: Date.now(),
            createdBy: room.createdBy,
            settings: room.settings,
          },
          room.gameState.getState(),
        )
        stopAutoSave(code)
        room.locks.dispose()
        this.rooms.delete(code)
        continue
      }

      // Remove old rooms with no connected players
      const hasConnected = [...room.players.values()].some((p) => p.connected)
      if (!hasConnected && now - room.createdAt > maxAge) {
        stopAutoSave(code)
        room.locks.dispose()
        this.rooms.delete(code)
      }
    }
  }

  /**
   * Stop cleanup interval
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    if (this.persistenceCleanupInterval) {
      clearInterval(this.persistenceCleanupInterval)
      this.persistenceCleanupInterval = null
    }
    // Clear all pending empty room cleanup timers
    for (const timeout of this.emptyRoomCleanups.values()) {
      clearTimeout(timeout)
    }
    this.emptyRoomCleanups.clear()
    // Save all rooms before disposing
    for (const [code, room] of this.rooms) {
      saveTable(
        code,
        {
          code: room.code,
          name: room.name,
          isPublic: room.isPublic,
          maxPlayers: room.maxPlayers,
          createdAt: room.createdAt,
          updatedAt: Date.now(),
          createdBy: room.createdBy,
          settings: room.settings,
        },
        room.gameState.getState(),
      )
      stopAutoSave(code)
      room.locks.dispose()
    }
    this.rooms.clear()
  }
}
