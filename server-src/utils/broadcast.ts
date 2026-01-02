import type { ServerMessage } from '../../shared/types'

export interface ClientData {
  id: string
  roomCode: string | null
  name: string
}

// Generic WebSocket interface that works with both Bun and uWebSockets.js
export interface GenericWebSocket {
  send(message: string): void
  data?: ClientData
  getUserData?(): ClientData
}

function getClientData(ws: GenericWebSocket): ClientData {
  // Bun uses ws.data, uWebSockets.js uses ws.getUserData()
  return ws.data ?? ws.getUserData?.() ?? { id: '', roomCode: null, name: '' }
}

/**
 * Send a message to a single client
 */
export function send(ws: GenericWebSocket, message: ServerMessage): void {
  ws.send(JSON.stringify(message))
}

/**
 * Broadcast a message to all clients in a room except the sender
 */
export function broadcastToRoom(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  message: ServerMessage,
  excludeId?: string,
): void {
  const data = JSON.stringify(message)
  for (const [id, ws] of clients) {
    const clientData = getClientData(ws)
    if (clientData.roomCode === roomCode && id !== excludeId) {
      ws.send(data)
    }
  }
}

/**
 * Broadcast a message to all clients in a room including the sender
 */
export function broadcastToRoomAll(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  message: ServerMessage,
): void {
  broadcastToRoom(clients, roomCode, message, undefined)
}

/**
 * Send a message to a specific player by ID
 */
export function sendToPlayer(
  clients: Map<string, GenericWebSocket>,
  playerId: string,
  message: ServerMessage,
): void {
  const ws = clients.get(playerId)
  if (ws) {
    send(ws, message)
  }
}

/**
 * Broadcast different messages to different recipients
 * Useful for hand actions where owner sees full info, others see limited info
 */
export function broadcastSplit(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  ownerId: string,
  ownerMessage: ServerMessage,
  otherMessage: ServerMessage,
): void {
  const ownerData = JSON.stringify(ownerMessage)
  const otherData = JSON.stringify(otherMessage)

  for (const [id, ws] of clients) {
    const clientData = getClientData(ws)
    if (clientData.roomCode === roomCode) {
      ws.send(id === ownerId ? ownerData : otherData)
    }
  }
}
