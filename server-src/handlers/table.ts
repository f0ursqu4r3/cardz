import type {
  TableReset,
  TableUpdateSettings,
  TableUpdateVisibility,
  GameState,
  TableSettings,
} from '../../shared/types'
import type { RoomManager } from '../room'
import type { ClientData, GenericWebSocket } from '../utils/broadcast'
import { send, broadcastToRoom } from '../utils/broadcast'

function getClientData(ws: GenericWebSocket): ClientData {
  return ws.data ?? ws.getUserData?.() ?? { id: '', roomCode: null, name: '' }
}

/**
 * Handle table reset request
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

  // Broadcast reset to all players
  broadcastToRoom(roomManager.getClients(), clientData.roomCode, {
    type: 'table:reset',
    state: newState,
  })

  console.log(`[table:reset] Table ${clientData.roomCode} reset by ${clientData.name}`)
}

/**
 * Handle table settings update
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
