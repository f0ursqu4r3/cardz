import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import type { GameState } from '../shared/types'
import { createInitialGameState } from './game-state'

// Persistence directory
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')
const TABLES_DIR = join(DATA_DIR, 'tables')

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

/**
 * Ensure data directories exist
 */
function ensureDirectories(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
  if (!existsSync(TABLES_DIR)) {
    mkdirSync(TABLES_DIR, { recursive: true })
  }
}

/**
 * Get the file path for a table
 */
function getTablePath(code: string): string {
  return join(TABLES_DIR, `${code}.json`)
}

/**
 * Save a table to disk
 */
export function saveTable(code: string, metadata: TableMetadata, gameState: GameState): void {
  ensureDirectories()

  const data: PersistedTable = {
    metadata: {
      ...metadata,
      updatedAt: Date.now(),
    },
    gameState,
  }

  try {
    writeFileSync(getTablePath(code), JSON.stringify(data, null, 2), 'utf-8')
    console.log(`[persistence] Saved table ${code}`)
  } catch (error) {
    console.error(`[persistence] Failed to save table ${code}:`, error)
  }
}

/**
 * Load a table from disk
 */
export function loadTable(code: string): PersistedTable | null {
  const path = getTablePath(code)

  if (!existsSync(path)) {
    return null
  }

  try {
    const data = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(data) as PersistedTable

    // Migrate old data without settings
    if (!parsed.metadata.settings) {
      parsed.metadata.settings = getDefaultSettings()
    }

    return parsed
  } catch (error) {
    console.error(`[persistence] Failed to load table ${code}:`, error)
    return null
  }
}

/**
 * Delete a table from disk
 */
export function deleteTable(code: string): boolean {
  const path = getTablePath(code)

  if (!existsSync(path)) {
    return false
  }

  try {
    unlinkSync(path)
    console.log(`[persistence] Deleted table ${code}`)
    return true
  } catch (error) {
    console.error(`[persistence] Failed to delete table ${code}:`, error)
    return false
  }
}

/**
 * List all persisted tables
 */
export function listTables(): TableMetadata[] {
  ensureDirectories()

  const tables: TableMetadata[] = []

  try {
    const files = readdirSync(TABLES_DIR)

    for (const file of files) {
      if (!file.endsWith('.json')) continue

      try {
        const data = readFileSync(join(TABLES_DIR, file), 'utf-8')
        const parsed = JSON.parse(data) as PersistedTable
        tables.push(parsed.metadata)
      } catch {
        // Skip invalid files
      }
    }
  } catch (error) {
    console.error('[persistence] Failed to list tables:', error)
  }

  return tables
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
  const now = Date.now()
  let deleted = 0

  const tables = listTables()
  for (const table of tables) {
    if (now - table.updatedAt > maxAgeMs) {
      if (deleteTable(table.code)) {
        deleted++
      }
    }
  }

  if (deleted > 0) {
    console.log(`[persistence] Cleaned up ${deleted} old tables`)
  }

  return deleted
}
