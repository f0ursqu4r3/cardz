import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { GameState } from '../shared/types'

// Database directory and file
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')
const DB_PATH = join(DATA_DIR, 'cardz.db')

// Table metadata stored alongside game state
export interface TableMetadata {
  code: string
  name: string
  isPublic: boolean
  maxPlayers: number
  createdAt: number
  updatedAt: number
  createdBy: string // Player name who created the table
  settings: TableSettings
}

export interface TableSettings {
  background: TableBackground
  music: TableMusic | null
}

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

// Singleton database instance
let db: Database | null = null

/**
 * Get or create the database instance
 */
function getDb(): Database {
  if (db) return db

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }

  db = new Database(DB_PATH)

  // Enable WAL mode for better concurrent access
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')

  // Create tables table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS tables (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_public INTEGER NOT NULL DEFAULT 0,
      max_players INTEGER NOT NULL DEFAULT 8,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      settings TEXT NOT NULL,
      game_state TEXT NOT NULL
    )
  `)

  // Create index for public tables listing
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tables_public ON tables (is_public, updated_at DESC)
  `)

  console.log(`[persistence] SQLite database initialized at ${DB_PATH}`)

  return db
}

/**
 * Save a table to the database
 */
export function saveTable(code: string, metadata: TableMetadata, gameState: GameState): void {
  const database = getDb()
  const now = Date.now()

  const stmt = database.prepare(`
    INSERT INTO tables (code, name, is_public, max_players, created_at, updated_at, created_by, settings, game_state)
    VALUES ($code, $name, $is_public, $max_players, $created_at, $updated_at, $created_by, $settings, $game_state)
    ON CONFLICT(code) DO UPDATE SET
      name = $name,
      is_public = $is_public,
      max_players = $max_players,
      updated_at = $updated_at,
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
    $settings: JSON.stringify(metadata.settings),
    $game_state: JSON.stringify(gameState),
  })

  console.log(`[persistence] Saved table ${code}`)
}

/**
 * Load a table from the database
 */
export function loadTable(code: string): PersistedTable | null {
  const database = getDb()

  const stmt = database.prepare(`
    SELECT code, name, is_public, max_players, created_at, updated_at, created_by, settings, game_state
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
    settings: string
    game_state: string
  } | null

  if (!row) {
    return null
  }

  let settings: TableSettings
  try {
    settings = JSON.parse(row.settings)
  } catch {
    settings = getDefaultSettings()
  }

  let gameState: GameState
  try {
    gameState = JSON.parse(row.game_state)
  } catch {
    console.error(`[persistence] Failed to parse game state for table ${code}`)
    return null
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
      settings,
    },
    gameState,
  }
}

/**
 * Delete a table from the database
 */
export function deleteTable(code: string): boolean {
  const database = getDb()

  const stmt = database.prepare('DELETE FROM tables WHERE code = ?')
  const result = stmt.run(code)

  if (result.changes > 0) {
    console.log(`[persistence] Deleted table ${code}`)
    return true
  }

  return false
}

/**
 * List all persisted tables (metadata only)
 */
export function listTables(): TableMetadata[] {
  const database = getDb()

  const stmt = database.prepare(`
    SELECT code, name, is_public, max_players, created_at, updated_at, created_by, settings
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
    settings: string
  }[]

  return rows.map((row) => {
    let settings: TableSettings
    try {
      settings = JSON.parse(row.settings)
    } catch {
      settings = getDefaultSettings()
    }

    return {
      code: row.code,
      name: row.name,
      isPublic: row.is_public === 1,
      maxPlayers: row.max_players,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
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
    music: null,
  }
}

/**
 * Create default table metadata
 */
export function createTableMetadata(
  code: string,
  name: string,
  createdBy: string,
  isPublic: boolean = false,
): TableMetadata {
  return {
    code,
    name,
    isPublic,
    maxPlayers: 8,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdBy,
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
): void {
  // Clear existing interval if any
  stopAutoSave(code)

  const interval = setInterval(() => {
    const state = getState()
    if (state) {
      saveTable(code, state.metadata, state.gameState)
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

/**
 * Clean up old tables (older than maxAge)
 */
export function cleanupOldTables(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
  const database = getDb()
  const cutoff = Date.now() - maxAgeMs

  const stmt = database.prepare('DELETE FROM tables WHERE updated_at < ?')
  const result = stmt.run(cutoff)

  if (result.changes > 0) {
    console.log(`[persistence] Cleaned up ${result.changes} old tables`)
  }

  return result.changes
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
    SELECT code, name, is_public, max_players, created_at, updated_at, created_by, settings
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
    settings: string
  }[]

  return rows.map((row) => {
    let settings: TableSettings
    try {
      settings = JSON.parse(row.settings)
    } catch {
      settings = getDefaultSettings()
    }

    return {
      code: row.code,
      name: row.name,
      isPublic: row.is_public === 1,
      maxPlayers: row.max_players,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      settings,
    }
  })
}
