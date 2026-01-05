import type { ServerWebSocket } from 'bun'
import { nanoid } from 'nanoid'
import { RoomManager } from './room'
import { ClientMessageSchema } from './validation'
import type { ClientData } from './utils/broadcast'
import { send, broadcastToRoom } from './utils/broadcast'
import { CURSOR_THROTTLE_MS } from '../shared/types'
import { closeDatabase, saveChatMessage } from './persistence'

// Handlers
import {
  handleRoomCreate,
  handleRoomJoin,
  handleRoomLeave,
  handleRoomList,
  handleDisconnect,
} from './handlers/room'
import { handleCardMove, handleCardLock, handleCardUnlock, handleCardFlip } from './handlers/card'
import {
  handleStackCreate,
  handleStackMove,
  handleStackLock,
  handleStackUnlock,
  handleStackAddCard,
  handleStackRemoveCard,
  handleStackMerge,
  handleStackShuffle,
  handleStackFlip,
  handleStackReorder,
} from './handlers/stack'
import {
  handleZoneCreate,
  handleZoneUpdate,
  handleZoneDelete,
  handleZoneAddCard,
} from './handlers/zone'
import {
  handleHandAdd,
  handleHandRemove,
  handleHandReorder,
  handleHandAddStack,
} from './handlers/hand'
import {
  handleTableReset,
  handleTableUpdateSettings,
  handleTableUpdateVisibility,
  handleTableUpdateName,
} from './handlers/table'

const PORT = parseInt(process.env.PORT ?? '9001', 10)
const roomManager = new RoomManager()

// Track cursor update timestamps for throttling
const lastCursorUpdate = new Map<string, number>()

// Type alias for Bun's WebSocket
export type BunWebSocket = ServerWebSocket<ClientData>

// Static file serving for production
const STATIC_DIR = process.env.STATIC_DIR || '../dist'
const isProduction = process.env.NODE_ENV === 'production'

// MIME types for static files
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
}

async function serveStaticFile(pathname: string): Promise<Response | null> {
  const extname = pathname.substring(pathname.lastIndexOf('.'))
  const mimeType = MIME_TYPES[extname] || 'application/octet-stream'

  try {
    const filePath = `${STATIC_DIR}${pathname}`
    const file = Bun.file(filePath)
    if (await file.exists()) {
      return new Response(file, {
        headers: { 'Content-Type': mimeType },
      })
    }
  } catch {
    // File not found
  }
  return null
}

const server = Bun.serve<ClientData>({
  port: PORT,
  hostname: '0.0.0.0', // Listen on all network interfaces for remote connections

  async fetch(req, server) {
    const url = new URL(req.url)

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check if this is a WebSocket upgrade request
    const upgradeHeader = req.headers.get('upgrade')
    if (upgradeHeader?.toLowerCase() === 'websocket') {
      const success = server.upgrade(req, {
        data: {
          id: nanoid(),
          roomCode: null,
          name: '',
        } as ClientData,
      })

      if (success) {
        return undefined
      }

      return new Response('WebSocket upgrade failed', { status: 400 })
    }

    // In production, serve static files
    if (isProduction) {
      // Try to serve the requested file
      const staticResponse = await serveStaticFile(url.pathname)
      if (staticResponse) {
        return staticResponse
      }

      // For SPA routing, serve index.html for non-file requests
      if (!url.pathname.includes('.')) {
        const indexFile = Bun.file(`${STATIC_DIR}/index.html`)
        if (await indexFile.exists()) {
          return new Response(indexFile, {
            headers: { 'Content-Type': 'text/html' },
          })
        }
      }

      return new Response('Not Found', { status: 404 })
    }

    // In development, just handle WebSocket or return 404
    return new Response('Not Found', { status: 404 })
  },

  websocket: {
    idleTimeout: 120,
    maxPayloadLength: 64 * 1024, // 64KB max message size

    open(ws) {
      const clientData = ws.data
      roomManager.addClient(clientData.id, ws as any)
      console.log(`[connect] ${clientData.id}`)
    },

    message(ws, message) {
      const clientData = ws.data

      // Parse message
      let raw: unknown
      try {
        const text = typeof message === 'string' ? message : new TextDecoder().decode(message)
        raw = JSON.parse(text)
      } catch {
        send(ws as any, {
          type: 'error',
          originalAction: 'unknown',
          code: 'INVALID_ACTION',
          message: 'Invalid JSON',
        })
        return
      }

      // Validate message
      const result = ClientMessageSchema.safeParse(raw)
      if (!result.success) {
        send(ws as any, {
          type: 'error',
          originalAction: (raw as any)?.type ?? 'unknown',
          code: 'INVALID_ACTION',
          message: result.error.issues[0]?.message ?? 'Invalid message',
        })
        return
      }

      const msg = result.data

      try {
        // Handle room messages (don't require being in a room)
        if (msg.type === 'room:create') {
          handleRoomCreate(ws as any, msg, roomManager)
          return
        }

        if (msg.type === 'room:join') {
          handleRoomJoin(ws as any, msg, roomManager)
          return
        }

        if (msg.type === 'room:leave') {
          handleRoomLeave(ws as any, roomManager)
          return
        }

        if (msg.type === 'room:list') {
          handleRoomList(ws as any, msg, roomManager)
          return
        }

        // All other messages require being in a room
        if (!clientData.roomCode) {
          send(ws as any, {
            type: 'error',
            originalAction: msg.type,
            code: 'INVALID_ACTION',
            message: 'Not in a room',
          })
          return
        }

        const room = roomManager.getRoom(clientData.roomCode)
        if (!room) {
          clientData.roomCode = null
          send(ws as any, {
            type: 'error',
            originalAction: msg.type,
            code: 'NOT_FOUND',
            message: 'Room no longer exists',
          })
          return
        }

        const clients = roomManager.getClients()

        // Route to appropriate handler
        switch (msg.type) {
          // Card actions
          case 'card:move':
            handleCardMove(ws as any, msg, room, clients as any)
            roomManager.markDirty(room.code)
            break
          case 'card:lock':
            handleCardLock(ws as any, msg, room, clients as any)
            break
          case 'card:unlock':
            handleCardUnlock(ws as any, msg, room, clients as any)
            break
          case 'card:flip':
            handleCardFlip(ws as any, msg, room, clients as any)
            roomManager.markDirty(room.code)
            break

          // Stack actions
          case 'stack:create':
            handleStackCreate(ws as any, msg, room, clients as any)
            roomManager.markDirty(room.code)
            break
          case 'stack:move':
            handleStackMove(ws as any, msg, room, clients as any)
            roomManager.markDirty(room.code)
            break
          case 'stack:lock':
            handleStackLock(ws as any, msg, room, clients as any)
            break
          case 'stack:unlock':
            handleStackUnlock(ws as any, msg, room, clients as any)
            break
          case 'stack:add_card':
            handleStackAddCard(ws as any, msg, room, clients as any)
            roomManager.markDirty(room.code)
            break
          case 'stack:remove_card':
            handleStackRemoveCard(ws as any, msg, room, clients as any)
            roomManager.markDirty(room.code)
            break
          case 'stack:merge':
            handleStackMerge(ws as any, msg, room, clients as any)
            roomManager.markDirty(room.code)
            break
          case 'stack:shuffle':
            handleStackShuffle(ws as any, msg, room, clients as any)
            roomManager.markDirty(room.code)
            break
          case 'stack:flip':
            handleStackFlip(ws as any, msg, room, clients as any)
            roomManager.markDirty(room.code)
            break
          case 'stack:reorder':
            handleStackReorder(ws as any, msg, room, clients as any)
            roomManager.markDirty(room.code)
            break

          // Zone actions
          case 'zone:create':
            handleZoneCreate(ws as any, msg, room, clients as any)
            roomManager.markDirtyImmediate(room.code)
            break
          case 'zone:update':
            handleZoneUpdate(ws as any, msg, room, clients as any)
            roomManager.markDirty(room.code)
            break
          case 'zone:delete':
            handleZoneDelete(ws as any, msg, room, clients as any)
            roomManager.markDirtyImmediate(room.code)
            break
          case 'zone:add_card':
            handleZoneAddCard(ws as any, msg, room, clients as any)
            roomManager.markDirty(room.code)
            break

          // Hand actions
          case 'hand:add':
            handleHandAdd(ws as any, msg, room, clients as any)
            roomManager.markDirty(room.code)
            break
          case 'hand:remove':
            handleHandRemove(ws as any, msg, room, clients as any)
            roomManager.markDirty(room.code)
            break
          case 'hand:reorder':
            handleHandReorder(ws as any, msg, room)
            roomManager.markDirty(room.code)
            break
          case 'hand:add_stack':
            handleHandAddStack(ws as any, msg, room, clients as any)
            roomManager.markDirty(room.code)
            break

          // Selection actions
          case 'selection:stack':
            handleStackCreate(
              ws as any,
              {
                type: 'stack:create',
                cardIds: msg.cardIds,
                anchorX: msg.anchorX,
                anchorY: msg.anchorY,
              },
              room,
              clients as any,
            )
            roomManager.markDirty(room.code)
            break

          // Cursor updates (throttled)
          case 'cursor:update': {
            const now = Date.now()
            const lastUpdate = lastCursorUpdate.get(clientData.id) ?? 0

            if (now - lastUpdate < CURSOR_THROTTLE_MS) {
              // Throttled, skip
              break
            }

            lastCursorUpdate.set(clientData.id, now)

            // Store cursor position in room for new players joining
            room.cursors.set(clientData.id, { x: msg.x, y: msg.y, state: msg.state })

            broadcastToRoom(
              clients as any,
              room.code,
              {
                type: 'cursor:updated',
                playerId: clientData.id,
                x: msg.x,
                y: msg.y,
                state: msg.state,
              },
              clientData.id,
            )
            break
          }

          // State sync request
          case 'state:request': {
            const state = room.gameState.getState()
            const playerHand = state.hands.find((h) => h.playerId === clientData.id)
            const handCounts = state.hands.map((h) => ({
              playerId: h.playerId,
              count: h.cardIds.length,
            }))
            send(ws as any, {
              type: 'state:sync',
              state,
              yourHand: playerHand?.cardIds ?? [],
              handCounts,
            })
            break
          }

          // Chat messages
          case 'chat:send': {
            const player = room.players.get(clientData.id)
            if (!player) break

            const chatMessage = {
              id: nanoid(),
              roomCode: room.code,
              playerId: clientData.id,
              playerName: player.name,
              playerColor: player.color,
              message: msg.message,
              timestamp: Date.now(),
            }

            // Save to database
            saveChatMessage(chatMessage)

            // Broadcast to all players in the room
            broadcastToRoom(clients as any, room.code, {
              type: 'chat:message',
              ...chatMessage,
            })
            break
          }

          // Table management
          case 'table:reset':
            handleTableReset(ws as any, msg, roomManager)
            break
          case 'table:update_settings':
            handleTableUpdateSettings(ws as any, msg, roomManager)
            break
          case 'table:update_visibility':
            handleTableUpdateVisibility(ws as any, msg, roomManager)
            break
          case 'table:update_name':
            handleTableUpdateName(ws as any, msg, roomManager)
            break
        }
      } catch (err) {
        console.error(`[error] Handler error for ${msg.type}:`, err)
        send(ws as any, {
          type: 'error',
          originalAction: msg.type,
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        })
      }
    },

    close(ws, code, reason) {
      const clientData = ws.data
      console.log(`[disconnect] ${clientData.id} (code: ${code})`)

      lastCursorUpdate.delete(clientData.id)
      handleDisconnect(clientData, roomManager)
    },
  },
})

console.log(`🃏 Cardz server running on port ${server.port}`)
console.log(`   Local:   ws://localhost:${server.port}`)
console.log(
  `   Network: ws://0.0.0.0:${server.port} (use your machine's IP for remote connections)`,
)

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...')
  roomManager.dispose()
  closeDatabase()
  server.stop()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\nShutting down...')
  roomManager.dispose()
  closeDatabase()
  server.stop()
  process.exit(0)
})
