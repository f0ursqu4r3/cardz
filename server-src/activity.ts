/**
 * Activity logging module
 * Records significant player actions and broadcasts them to room clients
 */

import type { ActivityType, ActivityLogEntry } from '../shared/types'
import type { GenericWebSocket } from './utils/broadcast'
import { broadcastToRoom } from './utils/broadcast'
import { saveActivityLog, loadActivityLog } from './persistence'

/**
 * Log an activity and broadcast it to all clients in the room
 */
export function logActivity(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  playerId: string | null,
  playerName: string | null,
  actionType: ActivityType,
  actionData?: Record<string, unknown>,
): void {
  const timestamp = Date.now()

  // Save to database
  const id = saveActivityLog({
    roomCode,
    playerId,
    playerName,
    actionType,
    actionData,
    timestamp,
  })

  if (id === null) {
    return // Failed to save, don't broadcast
  }

  // Create entry for broadcast
  const entry: ActivityLogEntry = {
    id,
    playerId,
    playerName,
    actionType,
    actionData,
    timestamp,
  }

  // Broadcast to all clients in the room
  broadcastToRoom(clients, roomCode, {
    type: 'activity:logged',
    entry,
  })
}

/**
 * Get activity history for a room
 */
export function getActivityHistory(roomCode: string, limit: number = 100): ActivityLogEntry[] {
  return loadActivityLog(roomCode, limit)
}

/**
 * Helper to log player join
 */
export function logPlayerJoined(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  playerId: string,
  playerName: string,
): void {
  logActivity(clients, roomCode, playerId, playerName, 'player_joined')
}

/**
 * Helper to log player left
 */
export function logPlayerLeft(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  playerId: string,
  playerName: string,
): void {
  logActivity(clients, roomCode, playerId, playerName, 'player_left')
}

/**
 * Helper to log spectator join
 */
export function logPlayerSpectating(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  playerId: string,
  playerName: string,
): void {
  logActivity(clients, roomCode, playerId, playerName, 'player_spectating')
}

/**
 * Helper to log card placed on table
 */
export function logCardPlaced(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  playerId: string,
  playerName: string,
  cardCount: number = 1,
): void {
  logActivity(clients, roomCode, playerId, playerName, 'card_placed', { count: cardCount })
}

/**
 * Helper to log stack created
 */
export function logStackCreated(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  playerId: string,
  playerName: string,
  cardCount: number,
): void {
  logActivity(clients, roomCode, playerId, playerName, 'stack_created', { cardCount })
}

/**
 * Helper to log stack shuffled
 */
export function logStackShuffled(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  playerId: string,
  playerName: string,
  cardCount: number,
): void {
  logActivity(clients, roomCode, playerId, playerName, 'stack_shuffled', { cardCount })
}

/**
 * Helper to log stack flipped
 */
export function logStackFlipped(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  playerId: string,
  playerName: string,
  cardCount: number,
): void {
  logActivity(clients, roomCode, playerId, playerName, 'stack_flipped', { cardCount })
}

/**
 * Helper to log zone created
 */
export function logZoneCreated(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  playerId: string,
  playerName: string,
  zoneName: string,
): void {
  logActivity(clients, roomCode, playerId, playerName, 'zone_created', { name: zoneName })
}

/**
 * Helper to log zone deleted
 */
export function logZoneDeleted(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  playerId: string,
  playerName: string,
  zoneName: string,
): void {
  logActivity(clients, roomCode, playerId, playerName, 'zone_deleted', { name: zoneName })
}

/**
 * Helper to log die rolled
 */
export function logDieRolled(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  playerId: string,
  playerName: string,
  sides: number,
  value: number,
): void {
  logActivity(clients, roomCode, playerId, playerName, 'die_rolled', { sides, value })
}

/**
 * Helper to log counter changed
 */
export function logCounterChanged(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  playerId: string,
  playerName: string,
  counterName: string,
  oldValue: number,
  newValue: number,
): void {
  logActivity(clients, roomCode, playerId, playerName, 'counter_changed', {
    name: counterName,
    from: oldValue,
    to: newValue,
  })
}

/**
 * Helper to log timer started
 */
export function logTimerStarted(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  playerId: string,
  playerName: string,
  timerName: string,
): void {
  logActivity(clients, roomCode, playerId, playerName, 'timer_started', { name: timerName })
}

/**
 * Helper to log timer stopped
 */
export function logTimerStopped(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  playerId: string,
  playerName: string,
  timerName: string,
): void {
  logActivity(clients, roomCode, playerId, playerName, 'timer_stopped', { name: timerName })
}

/**
 * Helper to log table reset
 */
export function logTableReset(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  playerId: string,
  playerName: string,
): void {
  logActivity(clients, roomCode, playerId, playerName, 'table_reset')
}

/**
 * Helper to log settings changed
 */
export function logSettingsChanged(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  playerId: string,
  playerName: string,
  setting: string,
): void {
  logActivity(clients, roomCode, playerId, playerName, 'settings_changed', { setting })
}

/**
 * Helper to log player kicked
 */
export function logPlayerKicked(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  kickerId: string,
  kickerName: string,
  targetName: string,
): void {
  logActivity(clients, roomCode, kickerId, kickerName, 'player_kicked', { target: targetName })
}

/**
 * Helper to log player banned
 */
export function logPlayerBanned(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  bannerId: string,
  bannerName: string,
  targetName: string,
): void {
  logActivity(clients, roomCode, bannerId, bannerName, 'player_banned', { target: targetName })
}
