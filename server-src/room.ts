import type { Player } from '../shared/types'
import { PLAYER_COLORS } from '../shared/types'
import { GameStateManager } from './game-state'
import { LockManager } from './utils/locks'
import type { ClientData, GenericWebSocket } from './utils/broadcast'

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

export interface Room {
  code: string
  players: Map<string, Player>
  gameState: GameStateManager
  locks: LockManager
  createdAt: number
}

/**
 * Manages all active rooms
 */
export class RoomManager {
  private rooms = new Map<string, Room>()
  private clients = new Map<string, GenericWebSocket>()
  private sessionToPlayer = new Map<string, { roomCode: string; playerId: string }>()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    // Clean up empty rooms every minute
    this.cleanupInterval = setInterval(() => this.cleanupEmptyRooms(), 60_000)
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
  createRoom(playerId: string, playerName: string, sessionId?: string): Room {
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

    const room: Room = {
      code,
      players: new Map([[playerId, player]]),
      gameState: new GameStateManager(),
      locks: new LockManager(),
      createdAt: Date.now(),
    }

    this.rooms.set(code, room)

    // Track session for reconnection
    if (sessionId) {
      this.sessionToPlayer.set(sessionId, { roomCode: code, playerId })
    }

    return room
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

    // Remove player
    room.players.delete(playerId)

    // Delete room if empty
    if (room.players.size === 0) {
      room.locks.dispose()
      this.rooms.delete(roomCode)
      return null
    }

    return room
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
   * Clean up empty or old rooms
   */
  private cleanupEmptyRooms(): void {
    const now = Date.now()
    const maxAge = 24 * 60 * 60 * 1000 // 24 hours

    for (const [code, room] of this.rooms) {
      // Remove empty rooms
      if (room.players.size === 0) {
        room.locks.dispose()
        this.rooms.delete(code)
        continue
      }

      // Remove old rooms with no connected players
      const hasConnected = [...room.players.values()].some((p) => p.connected)
      if (!hasConnected && now - room.createdAt > maxAge) {
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
    for (const room of this.rooms.values()) {
      room.locks.dispose()
    }
    this.rooms.clear()
  }
}
