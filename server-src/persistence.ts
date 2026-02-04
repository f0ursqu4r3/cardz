import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { GameState } from '../shared/types'
import { config } from './config'

// Database file path
const DB_PATH = join(config.dataDir, 'cardz.db')

// Table metadata stored alongside game state
export interface TableMetadata {
  code: string
  name: string
  isPublic: boolean
  maxPlayers: number
  createdAt: number
  updatedAt: number
  createdBy: string // Player name who created the table
  creatorPlayerId: string // Stable player ID of the creator (for role persistence)
  moderatorPlayerIds: string[] // Player IDs with moderator role (persisted across sessions)
  inviteToken?: string
  settings: TableSettings
}

export interface TableSettings {
  background: TableBackground
  joinPolicy: TableJoinPolicy
  permissionsPreset: TablePermissionsPreset
  music: TableMusic | null
}

export type TableJoinPolicy = 'open' | 'spectators-only' | 'invite-only'

export type TablePermissionsPreset = 'standard' | 'host-only'

export type TableBackground =
  | 'green-felt' // Default
  | 'blue-felt'
  | 'red-felt'
  | 'wood-oak'
  | 'wood-dark'
  | 'slate'
  | 'custom'

export interface TableMusic {
  enabled: boolean
  volume: number // 0-100
  track: 'jazz' | 'lofi' | 'classical' | 'none'
}

export interface PersistedTable {
  metadata: TableMetadata
  gameState: GameState
}

export interface TableSnapshotInfo {
  id: number
  roomCode: string
  name: string
  createdAt: number
  createdBy: string
}

export interface TableSnapshot extends TableSnapshotInfo {
  settings: TableSettings
  gameState: GameState
}

// Singleton database instance
let db: Database | null = null

/**
 * Get or create the database instance
 */
function getDb(): Database {
  if (db) return db

  // Ensure data directory exists
  if (!existsSync(config.dataDir)) {
    mkdirSync(config.dataDir, { recursive: true })
  }

  db = new Database(DB_PATH)

  // Enable WAL mode for better concurrent access
  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA synchronous = NORMAL')

  // Create tables table if it doesn't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS tables (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_public INTEGER NOT NULL DEFAULT 0,
      max_players INTEGER NOT NULL DEFAULT 8,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      creator_player_id TEXT,
      invite_token TEXT,
      settings TEXT NOT NULL,
      game_state TEXT NOT NULL
    )
  `)

  // Migration: add creator_player_id column if it doesn't exist
  try {
    db.run(`ALTER TABLE tables ADD COLUMN creator_player_id TEXT`)
  } catch {
    // Column already exists, ignore
  }

  // Migration: add moderator_player_ids column if it doesn't exist
  try {
    db.run(`ALTER TABLE tables ADD COLUMN moderator_player_ids TEXT`)
  } catch {
    // Column already exists, ignore
  }

  // Migration: add invite_token column if it doesn't exist
  try {
    db.run(`ALTER TABLE tables ADD COLUMN invite_token TEXT`)
  } catch {
    // Column already exists, ignore
  }

  // Create index for public tables listing
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_tables_public ON tables (is_public, updated_at DESC)
  `)

  // Create chat_messages table for persisting chat history
  db.run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      room_code TEXT NOT NULL,
      player_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      player_color TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (room_code) REFERENCES tables(code) ON DELETE CASCADE
    )
  `)

  // Create index for loading chat messages by room
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_chat_room_timestamp ON chat_messages (room_code, timestamp DESC)
  `)

  // Create analytics table for tracking server metrics
  db.run(`
    CREATE TABLE IF NOT EXISTS analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_name TEXT NOT NULL,
      metric_value INTEGER NOT NULL,
      recorded_at INTEGER NOT NULL
    )
  `)

  // Create index for querying metrics by name and time
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_analytics_name_time ON analytics (metric_name, recorded_at DESC)
  `)

  // Create activity_log table for recording player actions
  db.run(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT NOT NULL,
      player_id TEXT,
      player_name TEXT,
      action_type TEXT NOT NULL,
      action_data TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (room_code) REFERENCES tables(code) ON DELETE CASCADE
    )
  `)

  // Create index for loading activity by room
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_activity_room_time ON activity_log (room_code, timestamp DESC)
  `)

  // Create snapshots table for manual table snapshots
  db.run(`
    CREATE TABLE IF NOT EXISTS table_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      settings TEXT NOT NULL,
      game_state TEXT NOT NULL,
      FOREIGN KEY (room_code) REFERENCES tables(code) ON DELETE CASCADE
    )
  `)

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_snapshots_room_time ON table_snapshots (room_code, created_at DESC)
  `)

  console.log(`[persistence] SQLite database initialized at ${DB_PATH}`)

  return db
}

/**
 * Save a table to the database
 */
export function saveTable(code: string, metadata: TableMetadata, gameState: GameState): boolean {
  try {
    const database = getDb()
    const now = Date.now()

    const stmt = database.prepare(`
      INSERT INTO tables (code, name, is_public, max_players, created_at, updated_at, created_by, creator_player_id, invite_token, moderator_player_ids, settings, game_state)
      VALUES ($code, $name, $is_public, $max_players, $created_at, $updated_at, $created_by, $creator_player_id, $invite_token, $moderator_player_ids, $settings, $game_state)
      ON CONFLICT(code) DO UPDATE SET
        name = $name,
        is_public = $is_public,
        max_players = $max_players,
        updated_at = $updated_at,
        invite_token = $invite_token,
        moderator_player_ids = $moderator_player_ids,
        settings = $settings,
        game_state = $game_state
    `)

    stmt.run({
      $code: code,
      $name: metadata.name,
      $is_public: metadata.isPublic ? 1 : 0,
      $max_players: metadata.maxPlayers,
      $created_at: metadata.createdAt,
      $updated_at: now,
      $created_by: metadata.createdBy,
      $creator_player_id: metadata.creatorPlayerId,
      $invite_token: metadata.inviteToken ?? null,
      $moderator_player_ids: JSON.stringify(metadata.moderatorPlayerIds || []),
      $settings: JSON.stringify(metadata.settings),
      $game_state: JSON.stringify(gameState),
    })

    console.log(`[persistence] Saved table ${code}`)
    return true
  } catch (err) {
    console.error(`[persistence] Failed to save table ${code}:`, err)
    return false
  }
}

/**
 * Load a table from the database
 */
export function loadTable(code: string): PersistedTable | null {
  const database = getDb()

  const stmt = database.prepare(`
    SELECT code, name, is_public, max_players, created_at, updated_at, created_by, creator_player_id, invite_token, moderator_player_ids, settings, game_state
    FROM tables
    WHERE code = ?
  `)

  const row = stmt.get(code) as {
    code: string
    name: string
    is_public: number
    max_players: number
    created_at: number
    updated_at: number
    created_by: string
    creator_player_id: string | null
    invite_token: string | null
    moderator_player_ids: string | null
    settings: string
    game_state: string
  } | null

  if (!row) {
    return null
  }

  let settings: TableSettings
  try {
    settings = normalizeSettings(JSON.parse(row.settings))
  } catch (err) {
    console.warn(`[persistence] Failed to parse settings for table ${code}, using defaults:`, err)
    settings = getDefaultSettings()
  }

  let gameState: GameState
  try {
    gameState = JSON.parse(row.game_state)
  } catch (err) {
    console.error(`[persistence] Failed to parse game state for table ${code}:`, err)
    return null
  }

  let moderatorPlayerIds: string[] = []
  try {
    if (row.moderator_player_ids) {
      moderatorPlayerIds = JSON.parse(row.moderator_player_ids)
    }
  } catch {
    // Invalid JSON, use empty array
  }

  return {
    metadata: {
      code: row.code,
      name: row.name,
      isPublic: row.is_public === 1,
      maxPlayers: row.max_players,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      creatorPlayerId: row.creator_player_id ?? '', // Empty string for legacy tables
      inviteToken: row.invite_token ?? undefined,
      moderatorPlayerIds,
      settings,
    },
    gameState,
  }
}

/**
 * Create a manual snapshot for a table
 */
export function createSnapshot(
  roomCode: string,
  name: string,
  createdBy: string,
  settings: TableSettings,
  gameState: GameState,
): TableSnapshotInfo | null {
  try {
    const database = getDb()
    const createdAt = Date.now()

    const stmt = database.prepare(`
      INSERT INTO table_snapshots (room_code, name, created_at, created_by, settings, game_state)
      VALUES ($room_code, $name, $created_at, $created_by, $settings, $game_state)
    `)

    const result = stmt.run({
      $room_code: roomCode,
      $name: name,
      $created_at: createdAt,
      $created_by: createdBy,
      $settings: JSON.stringify(settings),
      $game_state: JSON.stringify(gameState),
    })

    const id = Number(result.lastInsertRowid)
    return { id, roomCode, name, createdAt, createdBy }
  } catch (err) {
    console.error(`[persistence] Failed to create snapshot for ${roomCode}:`, err)
    return null
  }
}

/**
 * List snapshots for a table
 */
export function listSnapshots(roomCode: string, limit: number = 20): TableSnapshotInfo[] {
  try {
    const database = getDb()
    const stmt = database.prepare(`
      SELECT id, room_code, name, created_at, created_by
      FROM table_snapshots
      WHERE room_code = ?
      ORDER BY created_at DESC
      LIMIT ?
    `)

    const rows = stmt.all(roomCode, limit) as Array<{
      id: number
      room_code: string
      name: string
      created_at: number
      created_by: string
    }>

    return rows.map((row) => ({
      id: row.id,
      roomCode: row.room_code,
      name: row.name,
      createdAt: row.created_at,
      createdBy: row.created_by,
    }))
  } catch (err) {
    console.error(`[persistence] Failed to list snapshots for ${roomCode}:`, err)
    return []
  }
}

/**
 * Load a snapshot by id for a table
 */
export function loadSnapshot(roomCode: string, snapshotId: number): TableSnapshot | null {
  try {
    const database = getDb()
    const stmt = database.prepare(`
      SELECT id, room_code, name, created_at, created_by, settings, game_state
      FROM table_snapshots
      WHERE room_code = ? AND id = ?
    `)

    const row = stmt.get(roomCode, snapshotId) as
      | {
          id: number
          room_code: string
          name: string
          created_at: number
          created_by: string
          settings: string
          game_state: string
        }
      | undefined

    if (!row) return null

    return {
      id: row.id,
      roomCode: row.room_code,
      name: row.name,
      createdAt: row.created_at,
      createdBy: row.created_by,
      settings: normalizeSettings(JSON.parse(row.settings)),
      gameState: JSON.parse(row.game_state) as GameState,
    }
  } catch (err) {
    console.error(`[persistence] Failed to load snapshot ${snapshotId} for ${roomCode}:`, err)
    return null
  }
}

/**
 * Delete a table from the database
 */
export function deleteTable(code: string): boolean {
  try {
    const database = getDb()

    const stmt = database.prepare('DELETE FROM tables WHERE code = ?')
    const result = stmt.run(code)

    if (result.changes > 0) {
      console.log(`[persistence] Deleted table ${code}`)
      return true
    }

    return false
  } catch (err) {
    console.error(`[persistence] Failed to delete table ${code}:`, err)
    return false
  }
}

/**
 * List all persisted tables (metadata only)
 */
export function listTables(): TableMetadata[] {
  const database = getDb()

  const stmt = database.prepare(`
    SELECT code, name, is_public, max_players, created_at, updated_at, created_by, creator_player_id, moderator_player_ids, settings
    FROM tables
    ORDER BY updated_at DESC
  `)

  const rows = stmt.all() as {
    code: string
    name: string
    is_public: number
    max_players: number
    created_at: number
    updated_at: number
    created_by: string
    creator_player_id: string | null
    moderator_player_ids: string | null
    settings: string
  }[]

  return rows.map((row) => {
    let settings: TableSettings
    try {
      settings = normalizeSettings(JSON.parse(row.settings))
    } catch (err) {
      console.warn(`[persistence] Failed to parse settings for table ${row.code}, using defaults:`, err)
      settings = getDefaultSettings()
    }

    let moderatorPlayerIds: string[] = []
    try {
      if (row.moderator_player_ids) {
        moderatorPlayerIds = JSON.parse(row.moderator_player_ids)
      }
    } catch {
      // Invalid JSON, use empty array
    }

    return {
      code: row.code,
      name: row.name,
      isPublic: row.is_public === 1,
      maxPlayers: row.max_players,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      creatorPlayerId: row.creator_player_id ?? '',
      moderatorPlayerIds,
      settings,
    }
  })
}

/**
 * Get default table settings
 */
export function getDefaultSettings(): TableSettings {
  return {
    background: 'green-felt',
    joinPolicy: 'open',
    permissionsPreset: 'standard',
    music: null,
  }
}

export function normalizeSettings(settings?: Partial<TableSettings> | null): TableSettings {
  return {
    ...getDefaultSettings(),
    ...(settings ?? {}),
  }
}

/**
 * Create default table metadata
 */
export function createTableMetadata(
  code: string,
  name: string,
  createdBy: string,
  creatorPlayerId: string,
  isPublic: boolean = false,
  inviteToken?: string,
): TableMetadata {
  return {
    code,
    name,
    isPublic,
    maxPlayers: 8,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdBy,
    creatorPlayerId,
    moderatorPlayerIds: [],
    inviteToken,
    settings: getDefaultSettings(),
  }
}

// Auto-save interval tracking
const saveIntervals = new Map<string, ReturnType<typeof setInterval>>()

/**
 * Start auto-saving a table every N seconds
 */
export function startAutoSave(
  code: string,
  getState: () => { metadata: TableMetadata; gameState: GameState } | null,
  intervalMs: number = 30_000,
  onSaved?: (timestamp: number) => void,
): void {
  // Clear existing interval if any
  stopAutoSave(code)

  const interval = setInterval(() => {
    const state = getState()
    if (state) {
      if (saveTable(code, state.metadata, state.gameState)) {
        onSaved?.(Date.now())
      }
    }
  }, intervalMs)

  saveIntervals.set(code, interval)
}

/**
 * Stop auto-saving a table
 */
export function stopAutoSave(code: string): void {
  const interval = saveIntervals.get(code)
  if (interval) {
    clearInterval(interval)
    saveIntervals.delete(code)
  }
}

// Debounced save tracking - saves shortly after changes occur
const debouncedSaves = new Map<
  string,
  {
    timeout: ReturnType<typeof setTimeout>
    getState: () => { metadata: TableMetadata; gameState: GameState } | null
    actionCount: number
    onSaved?: (timestamp: number) => void
  }
>()

// How long to wait after a change before saving (2 seconds)
const DEBOUNCE_DELAY_MS = 2000

// Save every N actions regardless of debounce
const ACTIONS_PER_SAVE = 20

/**
 * Schedule a debounced save for a table.
 * Call this whenever a change is made to the table.
 * Multiple calls within the debounce window will reset the timer.
 */
export function scheduleSave(
  code: string,
  getState: () => { metadata: TableMetadata; gameState: GameState } | null,
  onSaved?: (timestamp: number) => void,
): void {
  // Clear existing debounced save if any
  const existing = debouncedSaves.get(code)
  if (existing) {
    clearTimeout(existing.timeout)
  }

  // Track action count
  const actionCount = (existing?.actionCount ?? 0) + 1
  const savedCallback = onSaved ?? existing?.onSaved

  // If we've hit the action threshold, save immediately
  if (actionCount >= ACTIONS_PER_SAVE) {
    debouncedSaves.delete(code)
    const state = getState()
    if (state) {
      if (saveTable(code, state.metadata, state.gameState)) {
        savedCallback?.(Date.now())
      }
    }
    return
  }

  const timeout = setTimeout(() => {
    debouncedSaves.delete(code)
    const state = getState()
    if (state) {
      if (saveTable(code, state.metadata, state.gameState)) {
        savedCallback?.(Date.now())
      }
    }
  }, DEBOUNCE_DELAY_MS)

  debouncedSaves.set(code, { timeout, getState, actionCount, onSaved: savedCallback })
}

/**
 * Save a table immediately, bypassing the debounce.
 * Use for "hero" actions like zone create/delete, table reset, etc.
 */
export function saveNow(
  code: string,
  getState: () => { metadata: TableMetadata; gameState: GameState } | null,
  onSaved?: (timestamp: number) => void,
): void {
  // Cancel any pending debounced save
  const existing = debouncedSaves.get(code)
  if (existing) {
    clearTimeout(existing.timeout)
    debouncedSaves.delete(code)
  }

  // Save immediately
  const state = getState()
  if (state) {
    if (saveTable(code, state.metadata, state.gameState)) {
      onSaved?.(Date.now())
    }
  }
}

/**
 * Cancel any pending debounced save for a table
 */
export function cancelScheduledSave(code: string): void {
  const existing = debouncedSaves.get(code)
  if (existing) {
    clearTimeout(existing.timeout)
    debouncedSaves.delete(code)
  }
}

/**
 * Flush all pending debounced saves immediately (call on shutdown)
 */
export function flushPendingSaves(): void {
  for (const [code, { timeout, getState }] of debouncedSaves) {
    clearTimeout(timeout)
    const state = getState()
    if (state) {
      saveTable(code, state.metadata, state.gameState)
    }
  }
  debouncedSaves.clear()
}

/**
 * Clean up old tables (older than maxAge)
 */
export function cleanupOldTables(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
  try {
    const database = getDb()
    const cutoff = Date.now() - maxAgeMs

    const stmt = database.prepare('DELETE FROM tables WHERE updated_at < ?')
    const result = stmt.run(cutoff)

    if (result.changes > 0) {
      console.log(`[persistence] Cleaned up ${result.changes} old tables`)
    }

    return result.changes
  } catch (err) {
    console.error(`[persistence] Failed to cleanup old tables:`, err)
    return 0
  }
}

/**
 * Close the database connection (call on server shutdown)
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    console.log('[persistence] Database connection closed')
  }
}

/**
 * Search tables by name (case-insensitive)
 */
export function searchTables(query: string, publicOnly: boolean = true): TableMetadata[] {
  const database = getDb()

  const stmt = database.prepare(`
    SELECT code, name, is_public, max_players, created_at, updated_at, created_by, creator_player_id, moderator_player_ids, settings
    FROM tables
    WHERE name LIKE $query ${publicOnly ? 'AND is_public = 1' : ''}
    ORDER BY updated_at DESC
    LIMIT 50
  `)

  const rows = stmt.all({ $query: `%${query}%` }) as {
    code: string
    name: string
    is_public: number
    max_players: number
    created_at: number
    updated_at: number
    created_by: string
    creator_player_id: string | null
    moderator_player_ids: string | null
    settings: string
  }[]

  return rows.map((row) => {
    let settings: TableSettings
    try {
      settings = normalizeSettings(JSON.parse(row.settings))
    } catch (err) {
      console.warn(`[persistence] Failed to parse settings for table ${row.code}, using defaults:`, err)
      settings = getDefaultSettings()
    }

    let moderatorPlayerIds: string[] = []
    try {
      if (row.moderator_player_ids) {
        moderatorPlayerIds = JSON.parse(row.moderator_player_ids)
      }
    } catch {
      // Invalid JSON, use empty array
    }

    return {
      code: row.code,
      name: row.name,
      isPublic: row.is_public === 1,
      maxPlayers: row.max_players,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      creatorPlayerId: row.creator_player_id ?? '',
      moderatorPlayerIds,
      settings,
    }
  })
}
// ============================================================================
// Chat Message Persistence
// ============================================================================

export interface PersistedChatMessage {
  id: string
  roomCode: string
  playerId: string
  playerName: string
  playerColor: string
  message: string
  timestamp: number
}

/**
 * Save a chat message to the database
 */
export function saveChatMessage(msg: PersistedChatMessage): boolean {
  try {
    const database = getDb()

    const stmt = database.prepare(`
      INSERT INTO chat_messages (id, room_code, player_id, player_name, player_color, message, timestamp)
      VALUES ($id, $room_code, $player_id, $player_name, $player_color, $message, $timestamp)
    `)

    stmt.run({
      $id: msg.id,
      $room_code: msg.roomCode,
      $player_id: msg.playerId,
      $player_name: msg.playerName,
      $player_color: msg.playerColor,
      $message: msg.message,
      $timestamp: msg.timestamp,
    })
    return true
  } catch (err) {
    console.error(`[persistence] Failed to save chat message in room ${msg.roomCode}:`, err)
    return false
  }
}

/**
 * Load recent chat messages for a room
 * @param roomCode The room code
 * @param limit Maximum number of messages to load (default 100)
 */
export function loadChatMessages(roomCode: string, limit: number = 100): PersistedChatMessage[] {
  const database = getDb()

  const stmt = database.prepare(`
    SELECT id, room_code, player_id, player_name, player_color, message, timestamp
    FROM chat_messages
    WHERE room_code = $room_code
    ORDER BY timestamp DESC
    LIMIT $limit
  `)

  const rows = stmt.all({ $room_code: roomCode, $limit: limit }) as {
    id: string
    room_code: string
    player_id: string
    player_name: string
    player_color: string
    message: string
    timestamp: number
  }[]

  // Return in chronological order (oldest first)
  return rows
    .map((row) => ({
      id: row.id,
      roomCode: row.room_code,
      playerId: row.player_id,
      playerName: row.player_name,
      playerColor: row.player_color,
      message: row.message,
      timestamp: row.timestamp,
    }))
    .reverse()
}

/**
 * Delete a single chat message by id (returns the deleted message if found)
 */
export function deleteChatMessage(
  roomCode: string,
  messageId: string,
): PersistedChatMessage | null {
  const database = getDb()

  const selectStmt = database.prepare(`
    SELECT id, room_code, player_id, player_name, player_color, message, timestamp
    FROM chat_messages
    WHERE room_code = $room_code AND id = $id
    LIMIT 1
  `)

  const row = selectStmt.get({ $room_code: roomCode, $id: messageId }) as
    | {
        id: string
        room_code: string
        player_id: string
        player_name: string
        player_color: string
        message: string
        timestamp: number
      }
    | undefined

  if (!row) return null

  const deleteStmt = database.prepare(
    'DELETE FROM chat_messages WHERE room_code = $room_code AND id = $id',
  )
  deleteStmt.run({ $room_code: roomCode, $id: messageId })

  return {
    id: row.id,
    roomCode: row.room_code,
    playerId: row.player_id,
    playerName: row.player_name,
    playerColor: row.player_color,
    message: row.message,
    timestamp: row.timestamp,
  }
}

/**
 * Delete all chat messages for a room
 */
export function deleteChatMessages(roomCode: string): void {
  const database = getDb()
  const stmt = database.prepare('DELETE FROM chat_messages WHERE room_code = ?')
  stmt.run(roomCode)
}

// ============================================================================
// Analytics Persistence
// ============================================================================

/**
 * Record a metric value to the database
 */
export function recordMetric(name: string, value: number): boolean {
  try {
    const database = getDb()

    const stmt = database.prepare(`
      INSERT INTO analytics (metric_name, metric_value, recorded_at)
      VALUES ($name, $value, $recorded_at)
    `)

    stmt.run({
      $name: name,
      $value: value,
      $recorded_at: Date.now(),
    })
    return true
  } catch (err) {
    console.error(`[persistence] Failed to record metric ${name}:`, err)
    return false
  }
}

/**
 * Get recent metric values
 */
export function getMetricHistory(
  name: string,
  since: number,
  limit: number = 100,
): { value: number; recordedAt: number }[] {
  const database = getDb()

  const stmt = database.prepare(`
    SELECT metric_value, recorded_at
    FROM analytics
    WHERE metric_name = $name AND recorded_at >= $since
    ORDER BY recorded_at DESC
    LIMIT $limit
  `)

  const rows = stmt.all({ $name: name, $since: since, $limit: limit }) as {
    metric_value: number
    recorded_at: number
  }[]

  return rows.map((row) => ({
    value: row.metric_value,
    recordedAt: row.recorded_at,
  }))
}

/**
 * Get the sum of a metric since a given time
 */
export function getMetricSum(name: string, since: number): number {
  const database = getDb()

  const stmt = database.prepare(`
    SELECT COALESCE(SUM(metric_value), 0) as total
    FROM analytics
    WHERE metric_name = $name AND recorded_at >= $since
  `)

  const row = stmt.get({ $name: name, $since: since }) as { total: number }
  return row.total
}

/**
 * Get the count of a metric since a given time
 */
export function getMetricCount(name: string, since: number): number {
  const database = getDb()

  const stmt = database.prepare(`
    SELECT COUNT(*) as count
    FROM analytics
    WHERE metric_name = $name AND recorded_at >= $since
  `)

  const row = stmt.get({ $name: name, $since: since }) as { count: number }
  return row.count
}

/**
 * Get the total count of tables ever created
 */
export function getTotalTablesCreated(): number {
  const database = getDb()

  const stmt = database.prepare(`SELECT COUNT(*) as count FROM tables`)
  const row = stmt.get() as { count: number }
  return row.count
}

/**
 * Get total chat messages count
 */
export function getTotalChatMessages(): number {
  const database = getDb()

  const stmt = database.prepare(`SELECT COUNT(*) as count FROM chat_messages`)
  const row = stmt.get() as { count: number }
  return row.count
}

/**
 * Clean up old analytics data (older than maxAge)
 */
export function cleanupOldAnalytics(maxAgeMs: number = 30 * 24 * 60 * 60 * 1000): number {
  try {
    const database = getDb()
    const cutoff = Date.now() - maxAgeMs

    const stmt = database.prepare('DELETE FROM analytics WHERE recorded_at < ?')
    const result = stmt.run(cutoff)

    if (result.changes > 0) {
      console.log(`[persistence] Cleaned up ${result.changes} old analytics records`)
    }

    return result.changes
  } catch (err) {
    console.error(`[persistence] Failed to cleanup old analytics:`, err)
    return 0
  }
}

// ============================================================================
// Activity Log Persistence
// ============================================================================

import type { ActivityType, ActivityLogEntry } from '../shared/types'

export interface PersistedActivityEntry {
  roomCode: string
  playerId: string | null
  playerName: string | null
  actionType: ActivityType
  actionData?: Record<string, unknown>
  timestamp: number
}

/**
 * Save an activity log entry to the database
 */
export function saveActivityLog(entry: PersistedActivityEntry): number | null {
  try {
    const database = getDb()

    const stmt = database.prepare(`
      INSERT INTO activity_log (room_code, player_id, player_name, action_type, action_data, timestamp)
      VALUES ($room_code, $player_id, $player_name, $action_type, $action_data, $timestamp)
    `)

    const result = stmt.run({
      $room_code: entry.roomCode,
      $player_id: entry.playerId,
      $player_name: entry.playerName,
      $action_type: entry.actionType,
      $action_data: entry.actionData ? JSON.stringify(entry.actionData) : null,
      $timestamp: entry.timestamp,
    })

    return Number(result.lastInsertRowid)
  } catch (err) {
    console.error(`[persistence] Failed to save activity log in room ${entry.roomCode}:`, err)
    return null
  }
}

/**
 * Load recent activity log entries for a room
 * @param roomCode The room code
 * @param limit Maximum number of entries to load (default 100)
 */
export function loadActivityLog(roomCode: string, limit: number = 100): ActivityLogEntry[] {
  const database = getDb()

  const stmt = database.prepare(`
    SELECT id, player_id, player_name, action_type, action_data, timestamp
    FROM activity_log
    WHERE room_code = $room_code
    ORDER BY timestamp DESC
    LIMIT $limit
  `)

  const rows = stmt.all({ $room_code: roomCode, $limit: limit }) as {
    id: number
    player_id: string | null
    player_name: string | null
    action_type: string
    action_data: string | null
    timestamp: number
  }[]

  // Return in chronological order (oldest first)
  return rows
    .map((row) => ({
      id: row.id,
      playerId: row.player_id,
      playerName: row.player_name,
      actionType: row.action_type as ActivityType,
      actionData: row.action_data ? JSON.parse(row.action_data) : undefined,
      timestamp: row.timestamp,
    }))
    .reverse()
}

/**
 * Delete all activity log entries for a room
 */
export function deleteActivityLog(roomCode: string): void {
  const database = getDb()
  const stmt = database.prepare('DELETE FROM activity_log WHERE room_code = ?')
  stmt.run(roomCode)
}

/**
 * Clean up old activity log entries, keeping only the most recent per room
 * @param maxPerRoom Maximum entries to keep per room (default 500)
 */
export function cleanupActivityLog(maxPerRoom: number = 500): number {
  try {
    const database = getDb()

    // Get all room codes with activity
    const roomsStmt = database.prepare(`
      SELECT DISTINCT room_code FROM activity_log
    `)
    const rooms = roomsStmt.all() as { room_code: string }[]

    let totalDeleted = 0
    for (const { room_code } of rooms) {
      // Delete entries older than the Nth most recent
      const deleteStmt = database.prepare(`
        DELETE FROM activity_log
        WHERE room_code = $room_code
        AND id NOT IN (
          SELECT id FROM activity_log
          WHERE room_code = $room_code
          ORDER BY timestamp DESC
          LIMIT $limit
        )
      `)
      const result = deleteStmt.run({ $room_code: room_code, $limit: maxPerRoom })
      totalDeleted += result.changes
    }

    if (totalDeleted > 0) {
      console.log(`[persistence] Cleaned up ${totalDeleted} old activity log entries`)
    }

    return totalDeleted
  } catch (err) {
    console.error(`[persistence] Failed to cleanup activity log:`, err)
    return 0
  }
}
