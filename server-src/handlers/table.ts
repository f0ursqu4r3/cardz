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
      requestId: msg.requestId,
    })
    return
  }

  // Permission check - only creator can reset table
  // Use playerId (stable ID) not id (socket ID) for permission checks
  if (!clientData.playerId || !roomManager.isCreator(clientData.roomCode, clientData.playerId)) {
    send(ws, {
      type: 'error',
      originalAction: 'table:reset',
      code: 'PERMISSION_DENIED',
      message: 'Only the table creator can reset the table',
      requestId: msg.requestId,
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
      requestId: msg.requestId,
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
      requestId: msg.requestId,
    })
    return
  }

  // Permission check - only creator can change settings
  // Use playerId (stable ID) not id (socket ID) for permission checks
  if (!clientData.playerId || !roomManager.isCreator(clientData.roomCode, clientData.playerId)) {
    send(ws, {
      type: 'error',
      originalAction: 'table:update_settings',
      code: 'PERMISSION_DENIED',
      message: 'Only the table creator can change settings',
      requestId: msg.requestId,
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
      requestId: msg.requestId,
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
      requestId: msg.requestId,
    })
    return
  }

  // Permission check - only creator can change visibility
  // Use playerId (stable ID) not id (socket ID) for permission checks
  if (!clientData.playerId || !roomManager.isCreator(clientData.roomCode, clientData.playerId)) {
    send(ws, {
      type: 'error',
      originalAction: 'table:update_visibility',
      code: 'PERMISSION_DENIED',
      message: 'Only the table creator can change visibility',
      requestId: msg.requestId,
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
      requestId: msg.requestId,
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
      requestId: msg.requestId,
    })
    return
  }

  // Permission check - only creator can change table name
  // Use playerId (stable ID) not id (socket ID) for permission checks
  if (!clientData.playerId || !roomManager.isCreator(clientData.roomCode, clientData.playerId)) {
    send(ws, {
      type: 'error',
      originalAction: 'table:update_name',
      code: 'PERMISSION_DENIED',
      message: 'Only the table creator can change the table name',
      requestId: msg.requestId,
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
      requestId: msg.requestId,
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
