import type {
  TableReset,
  TableUpdateSettings,
  TableUpdateVisibility,
  TableUpdateName,
} from '../../shared/types'
import type { RoomManager } from '../room'
import type { GenericWebSocket } from '../utils/broadcast'
import { send, broadcastToRoom, getClientData } from '../utils/broadcast'
import { sanitizeTableName } from '../utils/sanitize'

/**
 * Handle table reset request
 * Only the room creator can reset the table
 */
export function handleTableReset(
  ws: GenericWebSocket,
  msg: TableReset,
  roomManager: RoomManager,
): void {
  const clientData = getClientData(ws)
  if (!clientData.roomCode) {
    send(ws, {
      type: 'error',
      originalAction: 'table:reset',
      code: 'INVALID_ACTION',
      message: 'Not in a room',
    })
    return
  }

  // Permission check - only creator can reset table
  if (!roomManager.isCreator(clientData.roomCode, clientData.id)) {
    send(ws, {
      type: 'error',
      originalAction: 'table:reset',
      code: 'PERMISSION_DENIED',
      message: 'Only the table creator can reset the table',
    })
    return
  }

  const newState = roomManager.resetRoom(clientData.roomCode)
  if (!newState) {
    send(ws, {
      type: 'error',
      originalAction: 'table:reset',
      code: 'NOT_FOUND',
      message: 'Room not found',
    })
    return
  }

  // Save immediately - this is a hero action
  roomManager.markDirtyImmediate(clientData.roomCode)

  // Broadcast reset to all players
  broadcastToRoom(roomManager.getClients(), clientData.roomCode, {
    type: 'table:reset',
    state: newState,
  })

  console.log(`[table:reset] Table ${clientData.roomCode} reset by ${clientData.name}`)
}

/**
 * Handle table settings update
 * Only the room creator can change settings
 */
export function handleTableUpdateSettings(
  ws: GenericWebSocket,
  msg: TableUpdateSettings,
  roomManager: RoomManager,
): void {
  const clientData = getClientData(ws)
  if (!clientData.roomCode) {
    send(ws, {
      type: 'error',
      originalAction: 'table:update_settings',
      code: 'INVALID_ACTION',
      message: 'Not in a room',
    })
    return
  }

  // Permission check - only creator can change settings
  if (!roomManager.isCreator(clientData.roomCode, clientData.id)) {
    send(ws, {
      type: 'error',
      originalAction: 'table:update_settings',
      code: 'PERMISSION_DENIED',
      message: 'Only the table creator can change settings',
    })
    return
  }

  const settings = roomManager.updateSettings(clientData.roomCode, msg.settings)
  if (!settings) {
    send(ws, {
      type: 'error',
      originalAction: 'table:update_settings',
      code: 'NOT_FOUND',
      message: 'Room not found',
    })
    return
  }

  // Broadcast settings update to all players
  broadcastToRoom(roomManager.getClients(), clientData.roomCode, {
    type: 'table:settings_updated',
    settings,
    playerId: clientData.id,
  })

  console.log(
    `[table:settings] Table ${clientData.roomCode} settings updated by ${clientData.name}`,
  )
}

/**
 * Handle table visibility update
 * Only the room creator can change visibility
 */
export function handleTableUpdateVisibility(
  ws: GenericWebSocket,
  msg: TableUpdateVisibility,
  roomManager: RoomManager,
): void {
  const clientData = getClientData(ws)
  if (!clientData.roomCode) {
    send(ws, {
      type: 'error',
      originalAction: 'table:update_visibility',
      code: 'INVALID_ACTION',
      message: 'Not in a room',
    })
    return
  }

  // Permission check - only creator can change visibility
  if (!roomManager.isCreator(clientData.roomCode, clientData.id)) {
    send(ws, {
      type: 'error',
      originalAction: 'table:update_visibility',
      code: 'PERMISSION_DENIED',
      message: 'Only the table creator can change visibility',
    })
    return
  }

  const success = roomManager.updateVisibility(clientData.roomCode, msg.isPublic)
  if (!success) {
    send(ws, {
      type: 'error',
      originalAction: 'table:update_visibility',
      code: 'NOT_FOUND',
      message: 'Room not found',
    })
    return
  }

  // Broadcast visibility update to all players
  broadcastToRoom(roomManager.getClients(), clientData.roomCode, {
    type: 'table:visibility_updated',
    isPublic: msg.isPublic,
    playerId: clientData.id,
  })

  console.log(
    `[table:visibility] Table ${clientData.roomCode} now ${msg.isPublic ? 'public' : 'private'}`,
  )
}

/**
 * Handle table name update
 * Only the room creator can change the table name
 */
export function handleTableUpdateName(
  ws: GenericWebSocket,
  msg: TableUpdateName,
  roomManager: RoomManager,
): void {
  const clientData = getClientData(ws)
  if (!clientData.roomCode) {
    send(ws, {
      type: 'error',
      originalAction: 'table:update_name',
      code: 'INVALID_ACTION',
      message: 'Not in a room',
    })
    return
  }

  // Permission check - only creator can change table name
  if (!roomManager.isCreator(clientData.roomCode, clientData.id)) {
    send(ws, {
      type: 'error',
      originalAction: 'table:update_name',
      code: 'PERMISSION_DENIED',
      message: 'Only the table creator can change the table name',
    })
    return
  }

  // Sanitize table name to prevent XSS
  const sanitizedName = sanitizeTableName(msg.name) || 'Untitled Table'

  const success = roomManager.updateName(clientData.roomCode, sanitizedName)
  if (!success) {
    send(ws, {
      type: 'error',
      originalAction: 'table:update_name',
      code: 'NOT_FOUND',
      message: 'Room not found',
    })
    return
  }

  // Broadcast name update to all players
  broadcastToRoom(roomManager.getClients(), clientData.roomCode, {
    type: 'table:name_updated',
    name: sanitizedName,
    playerId: clientData.id,
  })

  console.log(`[table:name] Table ${clientData.roomCode} renamed to "${sanitizedName}"`)
}
