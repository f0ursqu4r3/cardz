import type { ServerWebSocket } from 'bun'
import { nanoid } from 'nanoid'
import { RoomManager } from './room'
import { ClientMessageSchema } from './validation'
import type { ClientData, GenericWebSocket } from './utils/broadcast'
import { send, broadcastToRoom } from './utils/broadcast'
import { CURSOR_THROTTLE_MS } from '../shared/types'
import { closeDatabase, saveChatMessage } from './persistence'
import { RateLimiter } from './utils/rate-limit'
import { sanitizeChatMessage } from './utils/sanitize'

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
  handleStackSetFaces,
  handleStackReorder,
} from './handlers/stack'
import {
  handleZoneCreate,
  handleZoneUpdate,
  handleZoneDelete,
  handleZoneAddCard,
  handleZoneAddCards,
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

// Rate limiter for WebSocket messages
const rateLimiter = new RateLimiter({
  maxTokens: 100, // Allow burst of 100 messages
  refillRate: 50, // Refill 50 tokens per second (allows sustained 50 msg/s)
  messageCost: 1,
})

// Allowed origins for WebSocket connections (configurable via env)
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : null // null means allow all origins (development mode)

/**
 * Validate WebSocket origin to prevent CSRF attacks
 */
function isValidOrigin(origin: string | null): boolean {
  // In development, allow all origins if ALLOWED_ORIGINS is not set
  if (!ALLOWED_ORIGINS) {
    return true
  }

  // Require origin header in production
  if (!origin) {
    return false
  }

  // Check if origin matches any allowed pattern
  return ALLOWED_ORIGINS.some((allowed) => {
    if (allowed === '*') return true
    if (allowed === origin) return true
    // Support wildcard subdomains (e.g., *.example.com)
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2)
      return origin.endsWith(domain) || origin.endsWith('.' + domain)
    }
    return false
  })
}

/**
 * Security headers for HTTP responses
 */
function getSecurityHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  }

  if (isProduction) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    headers['Content-Security-Policy'] =
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' wss: ws:; font-src 'self'"
  }

  return headers
}

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
        headers: {
          'Content-Type': mimeType,
          ...getSecurityHeaders(),
        },
      })
    }
  } catch (err) {
    // Log unexpected errors (not file not found, which is normal for SPA routing)
    if (err instanceof Error && !err.message.includes('ENOENT')) {
      console.warn(`[static] Error serving ${pathname}:`, err.message)
    }
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
        headers: {
          'Content-Type': 'application/json',
          ...getSecurityHeaders(),
        },
      })
    }

    // Check if this is a WebSocket upgrade request
    const upgradeHeader = req.headers.get('upgrade')
    if (upgradeHeader?.toLowerCase() === 'websocket') {
      // Validate origin to prevent CSRF attacks
      const origin = req.headers.get('origin')
      if (!isValidOrigin(origin)) {
        console.warn(`[ws] Rejected connection from invalid origin: ${origin}`)
        return new Response('Forbidden: Invalid origin', {
          status: 403,
          headers: getSecurityHeaders(),
        })
      }

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

      return new Response('WebSocket upgrade failed', {
        status: 400,
        headers: getSecurityHeaders(),
      })
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
            headers: {
              'Content-Type': 'text/html',
              ...getSecurityHeaders(),
            },
          })
        }
      }

      return new Response('Not Found', {
        status: 404,
        headers: getSecurityHeaders(),
      })
    }

    // In development, just handle WebSocket or return 404
    return new Response('Not Found', {
      status: 404,
      headers: getSecurityHeaders(),
    })
  },

  websocket: {
    idleTimeout: 120,
    maxPayloadLength: 64 * 1024, // 64KB max message size

    open(ws) {
      const clientData = ws.data
      roomManager.addClient(clientData.id, ws as GenericWebSocket)
      console.log(`[connect] ${clientData.id}`)
    },

    message(ws, message) {
      const clientData = ws.data
      const socket = ws as GenericWebSocket

      // Rate limiting check
      if (!rateLimiter.allowMessage(clientData.id)) {
        send(socket, {
          type: 'error',
          originalAction: 'unknown',
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please slow down.',
        })
        return
      }

      // Parse message
      let raw: unknown
      try {
        const text = typeof message === 'string' ? message : new TextDecoder().decode(message)
        raw = JSON.parse(text)
      } catch {
        send(socket, {
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
        send(socket, {
          type: 'error',
          originalAction: (raw as Record<string, unknown>)?.type as string ?? 'unknown',
          code: 'INVALID_ACTION',
          message: result.error.issues[0]?.message ?? 'Invalid message',
        })
        return
      }

      const msg = result.data

      try {
        // Handle room messages (don't require being in a room)
        if (msg.type === 'room:create') {
          handleRoomCreate(socket, msg, roomManager)
          return
        }

        if (msg.type === 'room:join') {
          handleRoomJoin(socket, msg, roomManager)
          return
        }

        if (msg.type === 'room:leave') {
          handleRoomLeave(socket, roomManager)
          return
        }

        if (msg.type === 'room:list') {
          handleRoomList(socket, msg, roomManager)
          return
        }

        // All other messages require being in a room
        if (!clientData.roomCode) {
          send(socket, {
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
          send(socket, {
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
            handleCardMove(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'card:lock':
            handleCardLock(socket, msg, room, clients)
            break
          case 'card:unlock':
            handleCardUnlock(socket, msg, room, clients)
            break
          case 'card:flip':
            handleCardFlip(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break

          // Stack actions
          case 'stack:create':
            handleStackCreate(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'stack:move':
            handleStackMove(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'stack:lock':
            handleStackLock(socket, msg, room, clients)
            break
          case 'stack:unlock':
            handleStackUnlock(socket, msg, room, clients)
            break
          case 'stack:add_card':
            handleStackAddCard(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'stack:remove_card':
            handleStackRemoveCard(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'stack:merge':
            handleStackMerge(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'stack:shuffle':
            handleStackShuffle(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'stack:flip':
            handleStackFlip(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'stack:set_faces':
            handleStackSetFaces(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'stack:reorder':
            handleStackReorder(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break

          // Zone actions
          case 'zone:create':
            handleZoneCreate(socket, msg, room, clients)
            roomManager.markDirtyImmediate(room.code)
            break
          case 'zone:update':
            handleZoneUpdate(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'zone:delete':
            handleZoneDelete(socket, msg, room, clients)
            roomManager.markDirtyImmediate(room.code)
            break
          case 'zone:add_card':
            handleZoneAddCard(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'zone:add_cards':
            handleZoneAddCards(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break

          // Hand actions
          case 'hand:add':
            handleHandAdd(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'hand:remove':
            handleHandRemove(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'hand:reorder':
            handleHandReorder(socket, msg, room)
            roomManager.markDirty(room.code)
            break
          case 'hand:add_stack':
            handleHandAddStack(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break

          // Selection actions
          case 'selection:stack':
            handleStackCreate(
              socket,
              {
                type: 'stack:create',
                cardIds: msg.cardIds,
                anchorX: msg.anchorX,
                anchorY: msg.anchorY,
              },
              room,
              clients,
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
              clients,
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
            send(socket, {
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

            // Sanitize message to prevent XSS
            const sanitizedMessage = sanitizeChatMessage(msg.message)
            if (!sanitizedMessage) break // Ignore empty messages

            const chatMessage = {
              id: nanoid(),
              roomCode: room.code,
              playerId: clientData.id,
              playerName: player.name,
              playerColor: player.color,
              message: sanitizedMessage,
              timestamp: Date.now(),
            }

            // Save to database
            saveChatMessage(chatMessage)

            // Broadcast to all players in the room
            broadcastToRoom(clients, room.code, {
              type: 'chat:message',
              ...chatMessage,
            })
            break
          }

          case 'chat:typing': {
            const player = room.players.get(clientData.id)
            if (!player) break

            // Broadcast typing status to other players in the room
            broadcastToRoom(
              clients,
              room.code,
              {
                type: 'chat:typing_status',
                playerId: clientData.id,
                playerName: player.name,
                isTyping: msg.isTyping,
              },
              clientData.id, // Exclude sender
            )
            break
          }

          // Table management
          case 'table:reset':
            handleTableReset(socket, msg, roomManager)
            break
          case 'table:update_settings':
            handleTableUpdateSettings(socket, msg, roomManager)
            break
          case 'table:update_visibility':
            handleTableUpdateVisibility(socket, msg, roomManager)
            break
          case 'table:update_name':
            handleTableUpdateName(socket, msg, roomManager)
            break
        }
      } catch (err) {
        console.error(`[error] Handler error for ${msg.type}:`, err)
        send(socket, {
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
      rateLimiter.removeClient(clientData.id)
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
  rateLimiter.dispose()
  closeDatabase()
  server.stop()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\nShutting down...')
  roomManager.dispose()
  rateLimiter.dispose()
  closeDatabase()
  server.stop()
  process.exit(0)
})
