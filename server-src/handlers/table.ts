import type {
  TableReset,
  TableUpdateSettings,
  TableUpdateVisibility,
  TableUpdateName,
  TableSnapshotCreate,
  TableSnapshotListRequest,
  TableSnapshotRestore,
  TableUndo,
  TableRedo,
  TableInviteRegenerate,
} from '../../shared/types'
import type { RoomManager, Room } from '../room'
import type { GenericWebSocket } from '../utils/broadcast'
import { send, broadcastToRoom, getClientData } from '../utils/broadcast'
import { sanitizeTableName } from '../utils/sanitize'
import { logTableReset, logSettingsChanged, logUndo, logRedo } from '../activity'
import { createSnapshot, listSnapshots, loadSnapshot } from '../persistence'
import { GameStateManager } from '../game-state'

function clearLocksInState(state: {
  cards: { lockedBy: string | null }[]
  stacks: { lockedBy: string | null }[]
  counters: { lockedBy: string | null }[]
  tokens: { lockedBy: string | null }[]
  dice: { lockedBy: string | null }[]
  timers: { lockedBy: string | null }[]
}): void {
  for (const card of state.cards) {
    card.lockedBy = null
  }
  for (const stack of state.stacks) {
    stack.lockedBy = null
  }
  for (const counter of state.counters) {
    counter.lockedBy = null
  }
  for (const token of state.tokens) {
    token.lockedBy = null
  }
  for (const die of state.dice) {
    die.lockedBy = null
  }
  for (const timer of state.timers) {
    timer.lockedBy = null
  }
}

function broadcastStateSync(roomManager: RoomManager, room: Room): void {
  const state = room.gameState.getState()
  const handCounts = state.hands.map((h) => ({
    playerId: h.playerId,
    count: h.cardIds.length,
  }))

  for (const client of roomManager.getClients().values()) {
    const data = getClientData(client)
    if (data.roomCode !== room.code || !data.playerId) continue
    const playerHand = state.hands.find((h) => h.playerId === data.playerId)
    send(client, {
      type: 'state:sync',
      state,
      yourHand: playerHand?.cardIds ?? [],
      handCounts,
      stateVersion: room.gameState.getVersion(),
    })
  }
}

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

  // Log activity
  logTableReset(roomManager.getClients(), clientData.roomCode, clientData.playerId ?? clientData.id, clientData.name)

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

  roomManager.markDirty(clientData.roomCode)

  // Broadcast settings update to all players
  broadcastToRoom(roomManager.getClients(), clientData.roomCode, {
    type: 'table:settings_updated',
    settings,
    playerId: clientData.playerId ?? clientData.id,
  })

  // Log activity - describe what setting changed
  const changedSettings = Object.keys(msg.settings).join(', ')
  logSettingsChanged(roomManager.getClients(), clientData.roomCode, clientData.playerId ?? clientData.id, clientData.name, changedSettings)

  console.log(
    `[table:settings] Table ${clientData.roomCode} settings updated by ${clientData.name}`,
  )
}

/**
 * Handle invite token regeneration
 * Only the room creator can regenerate tokens
 */
export function handleTableInviteRegenerate(
  ws: GenericWebSocket,
  msg: TableInviteRegenerate,
  roomManager: RoomManager,
): void {
  const clientData = getClientData(ws)
  if (!clientData.roomCode) {
    send(ws, {
      type: 'error',
      originalAction: 'table:invite_regenerate',
      code: 'INVALID_ACTION',
      message: 'Not in a room',
      requestId: msg.requestId,
    })
    return
  }

  if (!clientData.playerId || !roomManager.isCreator(clientData.roomCode, clientData.playerId)) {
    send(ws, {
      type: 'error',
      originalAction: 'table:invite_regenerate',
      code: 'PERMISSION_DENIED',
      message: 'Only the table creator can regenerate invite links',
      requestId: msg.requestId,
    })
    return
  }

  const token = roomManager.regenerateInviteToken(clientData.roomCode)
  if (!token) {
    send(ws, {
      type: 'error',
      originalAction: 'table:invite_regenerate',
      code: 'NOT_FOUND',
      message: 'Room not found',
      requestId: msg.requestId,
    })
    return
  }

  const room = roomManager.getRoom(clientData.roomCode)
  if (!room) return

  for (const wsClient of roomManager.getClients().values()) {
    const data = getClientData(wsClient)
    if (data.roomCode === room.code && data.playerId === room.creatorPlayerId) {
      send(wsClient, {
        type: 'table:invite_token',
        token,
      })
    }
  }
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
    playerId: clientData.playerId ?? clientData.id,
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
    playerId: clientData.playerId ?? clientData.id,
  })

  console.log(`[table:name] Table ${clientData.roomCode} renamed to "${sanitizedName}"`)
}

/**
 * Handle table snapshot creation
 * Only the room creator can create snapshots
 */
export function handleTableSnapshotCreate(
  ws: GenericWebSocket,
  msg: TableSnapshotCreate,
  roomManager: RoomManager,
): void {
  const clientData = getClientData(ws)
  if (!clientData.roomCode) {
    send(ws, {
      type: 'error',
      originalAction: 'table:snapshot_create',
      code: 'INVALID_ACTION',
      message: 'Not in a room',
      requestId: msg.requestId,
    })
    return
  }

  if (!clientData.playerId || !roomManager.isCreator(clientData.roomCode, clientData.playerId)) {
    send(ws, {
      type: 'error',
      originalAction: 'table:snapshot_create',
      code: 'PERMISSION_DENIED',
      message: 'Only the table creator can create snapshots',
      requestId: msg.requestId,
    })
    return
  }

  const room = roomManager.getRoom(clientData.roomCode)
  if (!room) {
    send(ws, {
      type: 'error',
      originalAction: 'table:snapshot_create',
      code: 'NOT_FOUND',
      message: 'Room not found',
      requestId: msg.requestId,
    })
    return
  }

  const snapshotName = msg.name?.trim() || `Snapshot ${new Date().toISOString()}`
  const snapshot = createSnapshot(
    room.code,
    snapshotName,
    clientData.name || 'Host',
    room.settings,
    room.gameState.getState(),
  )

  if (!snapshot) {
    send(ws, {
      type: 'error',
      originalAction: 'table:snapshot_create',
      code: 'INTERNAL_ERROR',
      message: 'Failed to create snapshot',
      requestId: msg.requestId,
    })
    return
  }

  broadcastToRoom(roomManager.getClients(), room.code, {
    type: 'table:snapshot_created',
    snapshot,
  })
}

/**
 * Handle snapshot list request
 */
export function handleTableSnapshotList(
  ws: GenericWebSocket,
  _msg: TableSnapshotListRequest,
  _roomManager: RoomManager,
): void {
  const clientData = getClientData(ws)
  if (!clientData.roomCode) {
    send(ws, {
      type: 'error',
      originalAction: 'table:snapshot_list',
      code: 'INVALID_ACTION',
      message: 'Not in a room',
    })
    return
  }

  const snapshots = listSnapshots(clientData.roomCode)
  send(ws, {
    type: 'table:snapshot_list',
    snapshots,
  })
}

/**
 * Handle snapshot restore
 * Only the room creator can restore snapshots
 */
export function handleTableSnapshotRestore(
  ws: GenericWebSocket,
  msg: TableSnapshotRestore,
  roomManager: RoomManager,
): void {
  const clientData = getClientData(ws)
  if (!clientData.roomCode) {
    send(ws, {
      type: 'error',
      originalAction: 'table:snapshot_restore',
      code: 'INVALID_ACTION',
      message: 'Not in a room',
      requestId: msg.requestId,
    })
    return
  }

  if (!clientData.playerId || !roomManager.isCreator(clientData.roomCode, clientData.playerId)) {
    send(ws, {
      type: 'error',
      originalAction: 'table:snapshot_restore',
      code: 'PERMISSION_DENIED',
      message: 'Only the table creator can restore snapshots',
      requestId: msg.requestId,
    })
    return
  }

  const room = roomManager.getRoom(clientData.roomCode)
  if (!room) {
    send(ws, {
      type: 'error',
      originalAction: 'table:snapshot_restore',
      code: 'NOT_FOUND',
      message: 'Room not found',
      requestId: msg.requestId,
    })
    return
  }

  const snapshot = loadSnapshot(room.code, msg.snapshotId)
  if (!snapshot) {
    send(ws, {
      type: 'error',
      originalAction: 'table:snapshot_restore',
      code: 'NOT_FOUND',
      message: 'Snapshot not found',
      requestId: msg.requestId,
    })
    return
  }

  clearLocksInState(snapshot.gameState)

  room.gameState = new GameStateManager(snapshot.gameState)
  room.settings = snapshot.settings
  room.locks.releaseAll()

  for (const playerId of room.players.keys()) {
    room.gameState.getOrCreateHand(playerId)
  }

  roomManager.markDirtyImmediate(room.code)

  broadcastToRoom(roomManager.getClients(), room.code, {
    type: 'table:settings_updated',
    settings: room.settings,
    playerId: clientData.playerId ?? clientData.id,
  })

  broadcastToRoom(roomManager.getClients(), room.code, {
    type: 'table:snapshot_restored',
    snapshot: {
      id: snapshot.id,
      name: snapshot.name,
      createdAt: snapshot.createdAt,
      createdBy: snapshot.createdBy,
    },
  })

  broadcastStateSync(roomManager, room)
}

/**
 * Handle table undo request
 * Only the room creator or moderator can undo
 */
export function handleTableUndo(
  ws: GenericWebSocket,
  msg: TableUndo,
  roomManager: RoomManager,
): void {
  const clientData = getClientData(ws)
  if (!clientData.roomCode) {
    send(ws, {
      type: 'error',
      originalAction: 'table:undo',
      code: 'INVALID_ACTION',
      message: 'Not in a room',
      requestId: msg.requestId,
    })
    return
  }

  if (!clientData.playerId || !roomManager.isCreatorOrModerator(clientData.roomCode, clientData.playerId)) {
    send(ws, {
      type: 'error',
      originalAction: 'table:undo',
      code: 'PERMISSION_DENIED',
      message: 'Only the table creator or moderators can undo actions',
      requestId: msg.requestId,
    })
    return
  }

  const room = roomManager.getRoom(clientData.roomCode)
  if (!room) {
    send(ws, {
      type: 'error',
      originalAction: 'table:undo',
      code: 'NOT_FOUND',
      message: 'Room not found',
      requestId: msg.requestId,
    })
    return
  }

  const snapshot = roomManager.undo(room.code)
  if (!snapshot) {
    send(ws, {
      type: 'error',
      originalAction: 'table:undo',
      code: 'NOTHING_TO_UNDO',
      message: 'No actions to undo',
      requestId: msg.requestId,
    })
    return
  }

  clearLocksInState(snapshot)
  room.gameState = new GameStateManager(snapshot)
  room.locks.releaseAll()

  for (const playerId of room.players.keys()) {
    room.gameState.getOrCreateHand(playerId)
  }

  roomManager.resetUndoGrouping(room.code)
  roomManager.markDirtyImmediate(room.code)

  broadcastStateSync(roomManager, room)

  logUndo(
    roomManager.getClients(),
    room.code,
    clientData.playerId,
    clientData.name,
  )
}

/**
 * Handle table redo request
 * Only the room creator or moderator can redo
 */
export function handleTableRedo(
  ws: GenericWebSocket,
  msg: TableRedo,
  roomManager: RoomManager,
): void {
  const clientData = getClientData(ws)
  if (!clientData.roomCode) {
    send(ws, {
      type: 'error',
      originalAction: 'table:redo',
      code: 'INVALID_ACTION',
      message: 'Not in a room',
      requestId: msg.requestId,
    })
    return
  }

  if (!clientData.playerId || !roomManager.isCreatorOrModerator(clientData.roomCode, clientData.playerId)) {
    send(ws, {
      type: 'error',
      originalAction: 'table:redo',
      code: 'PERMISSION_DENIED',
      message: 'Only the table creator or moderators can redo actions',
      requestId: msg.requestId,
    })
    return
  }

  const room = roomManager.getRoom(clientData.roomCode)
  if (!room) {
    send(ws, {
      type: 'error',
      originalAction: 'table:redo',
      code: 'NOT_FOUND',
      message: 'Room not found',
      requestId: msg.requestId,
    })
    return
  }

  const snapshot = roomManager.redo(room.code)
  if (!snapshot) {
    send(ws, {
      type: 'error',
      originalAction: 'table:redo',
      code: 'NOTHING_TO_REDO',
      message: 'No actions to redo',
      requestId: msg.requestId,
    })
    return
  }

  clearLocksInState(snapshot)
  room.gameState = new GameStateManager(snapshot)
  room.locks.releaseAll()

  for (const playerId of room.players.keys()) {
    room.gameState.getOrCreateHand(playerId)
  }

  roomManager.resetUndoGrouping(room.code)
  roomManager.markDirtyImmediate(room.code)

  broadcastStateSync(roomManager, room)

  logRedo(
    roomManager.getClients(),
    room.code,
    clientData.playerId,
    clientData.name,
  )
}
