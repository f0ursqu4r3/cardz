import type { ServerMessage, Viewport } from '../../shared/types'

export interface ClientData {
  id: string
  roomCode: string | null
  name: string
  viewport?: Viewport
}

// Generic WebSocket interface that works with both Bun and uWebSockets.js
// The send signature is compatible with Bun's ServerWebSocket (returns number) and others (void)
export interface GenericWebSocket {
  send(message: string, compress?: boolean): number | void
  readonly data?: ClientData
  getUserData?(): ClientData
}

export function getClientData(ws: GenericWebSocket): ClientData {
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

/**
 * Check if a point is within a viewport (with optional padding)
 */
function isPointInViewport(x: number, y: number, viewport: Viewport, padding: number = 100): boolean {
  return (
    x >= viewport.x - padding &&
    x <= viewport.x + viewport.width + padding &&
    y >= viewport.y - padding &&
    y <= viewport.y + viewport.height + padding
  )
}

/**
 * Check if a rectangle overlaps with a viewport
 */
function isRectInViewport(
  x: number,
  y: number,
  width: number,
  height: number,
  viewport: Viewport,
  padding: number = 100,
): boolean {
  const expandedViewport = {
    x: viewport.x - padding,
    y: viewport.y - padding,
    width: viewport.width + padding * 2,
    height: viewport.height + padding * 2,
  }

  return !(
    x + width < expandedViewport.x ||
    x > expandedViewport.x + expandedViewport.width ||
    y + height < expandedViewport.y ||
    y > expandedViewport.y + expandedViewport.height
  )
}

/**
 * Broadcast a message only to clients whose viewport contains the given position
 * Falls back to regular broadcast if client hasn't reported a viewport
 *
 * @param position - The x,y coordinates (and optional width/height for area updates)
 */
export function broadcastToViewport(
  clients: Map<string, GenericWebSocket>,
  roomCode: string,
  message: ServerMessage,
  position: { x: number; y: number; width?: number; height?: number },
  excludeId?: string,
): void {
  const data = JSON.stringify(message)
  const { x, y, width, height } = position

  for (const [id, ws] of clients) {
    const clientData = getClientData(ws)
    if (clientData.roomCode !== roomCode || id === excludeId) {
      continue
    }

    // If client hasn't reported viewport, always send (fallback behavior)
    if (!clientData.viewport) {
      ws.send(data)
      continue
    }

    // Check if the update position is visible in client's viewport
    const isVisible =
      width !== undefined && height !== undefined
        ? isRectInViewport(x, y, width, height, clientData.viewport)
        : isPointInViewport(x, y, clientData.viewport)

    if (isVisible) {
      ws.send(data)
    }
  }
}

/**
 * Update a client's viewport
 */
export function updateClientViewport(ws: GenericWebSocket, viewport: Viewport): void {
  const clientData = getClientData(ws)
  clientData.viewport = viewport
}
