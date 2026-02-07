import {
  recordMetric,
  getMetricCount,
  getTotalTablesCreated,
  getTotalChatMessages,
} from './persistence'
import type { RoomManager } from './room'

/**
 * Server statistics returned by the analytics API
 */
export interface ServerStats {
  // Real-time (in-memory)
  activeTables: number
  activePlayers: number
  activeConnections: number

  // Persistent (database)
  tablesCreatedToday: number
  tablesCreatedTotal: number
  peakPlayersToday: number
  chatMessagesToday: number
  chatMessagesTotal: number

  // Timestamps
  serverStartedAt: number
  statsGeneratedAt: number
}

// In-memory tracking
let currentConnections = 0
let peakPlayersToday = 0
let lastPeakResetDay = new Date().toDateString()
const serverStartedAt = Date.now()

// Reference to room manager (set during init)
let roomManagerRef: RoomManager | null = null

/**
 * Initialize analytics with room manager reference
 */
export function initAnalytics(roomManager: RoomManager): void {
  roomManagerRef = roomManager
}

/**
 * Get the start of today in milliseconds
 */
function getStartOfToday(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

/**
 * Reset daily peak if it's a new day
 */
function checkDailyReset(): void {
  const today = new Date().toDateString()
  if (today !== lastPeakResetDay) {
    // Record yesterday's peak before resetting
    if (peakPlayersToday > 0) {
      recordMetric('peak_players_daily', peakPlayersToday)
    }
    peakPlayersToday = 0
    lastPeakResetDay = today
  }
}

/**
 * Track a new connection
 */
export function trackConnection(delta: 1 | -1): void {
  currentConnections += delta
  if (currentConnections < 0) currentConnections = 0

  // Update peak if this is a new high
  checkDailyReset()
  if (currentConnections > peakPlayersToday) {
    peakPlayersToday = currentConnections
  }
}

/**
 * Track table creation
 */
export function trackTableCreated(): void {
  recordMetric('table_created', 1)
}

/**
 * Track chat message sent
 */
export function trackChatMessage(): void {
  recordMetric('chat_message', 1)
}

/**
 * Get current server statistics
 */
export function getStats(): ServerStats {
  checkDailyReset()

  const startOfToday = getStartOfToday()

  // Get real-time stats from room manager
  let activeTables = 0
  let activePlayers = 0

  if (roomManagerRef) {
    const stats = roomManagerRef.getActiveStats()
    activeTables = stats.activeTables
    activePlayers = stats.activePlayers
  }

  return {
    // Real-time
    activeTables,
    activePlayers,
    activeConnections: currentConnections,

    // Persistent
    tablesCreatedToday: getMetricCount('table_created', startOfToday),
    tablesCreatedTotal: getTotalTablesCreated(),
    peakPlayersToday,
    chatMessagesToday: getMetricCount('chat_message', startOfToday),
    chatMessagesTotal: getTotalChatMessages(),

    // Timestamps
    serverStartedAt,
    statsGeneratedAt: Date.now(),
  }
}
