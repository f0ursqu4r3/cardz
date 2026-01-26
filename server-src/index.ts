import type { ServerWebSocket } from 'bun'
import { nanoid } from 'nanoid'
import { RoomManager } from './room'
import { ClientMessageSchema } from './validation'
import type { ClientData, GenericWebSocket } from './utils/broadcast'
import { send, broadcastToRoom, broadcastToViewport, updateClientViewport } from './utils/broadcast'
import { CURSOR_THROTTLE_MS } from '../shared/types'
import { closeDatabase, saveChatMessage } from './persistence'
import { RateLimiter } from './utils/rate-limit'
import { sanitizeChatMessage } from './utils/sanitize'
import { heartbeatManager } from './utils/heartbeat'
import { config, logConfigSummary } from './config'
import { initAnalytics, trackConnection, trackChatMessage, getStats } from './analytics'

// Handlers
import {
  handleRoomCreate,
  handleRoomJoin,
  handleRoomLeave,
  handleRoomList,
  handleDisconnect,
  handlePlayerKick,
  handlePlayerBan,
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
import {
  handleCounterCreate,
  handleCounterUpdate,
  handleCounterIncrement,
  handleCounterDelete,
  handleCounterLock,
  handleCounterUnlock,
} from './handlers/counter'
import {
  handleTokenCreate,
  handleTokenUpdate,
  handleTokenDelete,
  handleTokenLock,
  handleTokenUnlock,
} from './handlers/token'
import {
  handleDieCreate,
  handleDieRoll,
  handleDieUpdate,
  handleDieDelete,
  handleDieLock,
  handleDieUnlock,
} from './handlers/die'
import {
  handleTimerCreate,
  handleTimerStart,
  handleTimerPause,
  handleTimerReset,
  handleTimerUpdate,
  handleTimerDelete,
  handleTimerLock,
  handleTimerUnlock,
} from './handlers/timer'

const roomManager = new RoomManager()

// Initialize analytics with room manager reference
initAnalytics(roomManager)

// Track cursor update timestamps for throttling
const lastCursorUpdate = new Map<string, number>()

// Rate limiter for WebSocket messages
const rateLimiter = new RateLimiter({
  maxTokens: 150, // Allow burst of 150 messages
  refillRate: 100, // Refill 100 tokens per second (handles drag + cursor updates)
  messageCost: 1,
})

/**
 * Validate WebSocket origin to prevent CSRF attacks
 */
function isValidOrigin(origin: string | null): boolean {
  // In development, allow all origins if allowedOrigins is not set
  if (!config.allowedOrigins) {
    return true
  }

  // Require origin header in production
  if (!origin) {
    return false
  }

  // Check if origin matches any allowed pattern
  return config.allowedOrigins.some((allowed) => {
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

  if (config.nodeEnv === 'production') {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    headers['Content-Security-Policy'] =
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://img.buymeacoffee.com; connect-src 'self' wss: ws:; font-src 'self'"
  }

  return headers
}

// Type alias for Bun's WebSocket
export type BunWebSocket = ServerWebSocket<ClientData>

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
    const filePath = `${config.staticDir}${pathname}`
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
  port: config.port,
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

    // Admin API endpoints (password protected)
    if (url.pathname === '/api/admin/stats') {
      // Check if admin password is configured
      if (!config.adminPassword) {
        return new Response(JSON.stringify({ error: 'Admin dashboard not enabled' }), {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            ...getSecurityHeaders(),
          },
        })
      }

      // Check basic auth
      const authHeader = req.headers.get('authorization')
      if (!authHeader || !authHeader.startsWith('Basic ')) {
        return new Response('Unauthorized', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Basic realm="Admin Dashboard"',
            ...getSecurityHeaders(),
          },
        })
      }

      const base64Credentials = authHeader.slice(6)
      const credentials = atob(base64Credentials)
      const [username, password] = credentials.split(':')

      if (username !== 'admin' || password !== config.adminPassword) {
        return new Response('Unauthorized', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Basic realm="Admin Dashboard"',
            ...getSecurityHeaders(),
          },
        })
      }

      // Return server stats
      const stats = getStats()
      return new Response(JSON.stringify(stats), {
        headers: {
          'Content-Type': 'application/json',
          ...getSecurityHeaders(),
        },
      })
    }

    // Admin dashboard page
    if (url.pathname === '/admin') {
      // Check if admin password is configured
      if (!config.adminPassword) {
        return new Response(
          'Admin dashboard not enabled. Set VITE_ADMIN_PASSWORD environment variable.',
          {
            status: 503,
            headers: getSecurityHeaders(),
          },
        )
      }

      // Check basic auth
      const authHeader = req.headers.get('authorization')
      if (!authHeader || !authHeader.startsWith('Basic ')) {
        return new Response('Unauthorized', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Basic realm="Admin Dashboard"',
            ...getSecurityHeaders(),
          },
        })
      }

      const base64Credentials = authHeader.slice(6)
      const credentials = atob(base64Credentials)
      const [username, password] = credentials.split(':')

      if (username !== 'admin' || password !== config.adminPassword) {
        return new Response('Unauthorized', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Basic realm="Admin Dashboard"',
            ...getSecurityHeaders(),
          },
        })
      }

      // Serve admin dashboard (use import.meta.dir for reliable path resolution)
      const adminFile = Bun.file(`${import.meta.dir}/admin.html`)
      if (await adminFile.exists()) {
        return new Response(adminFile, {
          headers: {
            'Content-Type': 'text/html',
            ...getSecurityHeaders(),
          },
        })
      }

      return new Response('Admin dashboard not found', {
        status: 404,
        headers: getSecurityHeaders(),
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
          playerId: null,
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
    if (config.nodeEnv === 'production') {
      // Try to serve the requested file
      const staticResponse = await serveStaticFile(url.pathname)
      if (staticResponse) {
        return staticResponse
      }

      // For SPA routing, serve index.html for non-file requests
      if (!url.pathname.includes('.')) {
        const indexFile = Bun.file(`${config.staticDir}/index.html`)
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
      const socket = ws as GenericWebSocket
      roomManager.addClient(clientData.id, socket)
      heartbeatManager.startHeartbeat(clientData.id, socket)
      trackConnection(1)
      console.log(`[connect] ${clientData.id}`)
    },

    message(ws, message) {
      const clientData = ws.data
      const socket = ws as GenericWebSocket

      // Parse message first to extract requestId for error correlation
      let raw: unknown
      let requestId: string | undefined
      try {
        const text = typeof message === 'string' ? message : new TextDecoder().decode(message)
        raw = JSON.parse(text)
        // Extract requestId early for error correlation
        requestId = (raw as Record<string, unknown>)?.requestId as string | undefined
      } catch {
        send(socket, {
          type: 'error',
          originalAction: 'unknown',
          code: 'INVALID_ACTION',
          message: 'Invalid JSON',
        })
        return
      }

      // Determine rate limit cost based on message type
      // High-frequency position updates are cheaper to allow smooth dragging
      const messageType = (raw as Record<string, unknown>)?.type as string
      const LOW_COST_MESSAGES = new Set([
        'cursor:update',
        'card:move',
        'stack:move',
        'counter:update',
        'token:update',
        'die:update',
        'timer:update',
        'zone:update',
      ])
      const messageCost = LOW_COST_MESSAGES.has(messageType) ? 0.25 : 1

      // Rate limiting check
      if (!rateLimiter.allowMessage(clientData.id, messageCost)) {
        send(socket, {
          type: 'error',
          originalAction: messageType ?? 'unknown',
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please slow down.',
          requestId,
        })
        return
      }

      // Validate message
      const result = ClientMessageSchema.safeParse(raw)
      if (!result.success) {
        send(socket, {
          type: 'error',
          originalAction: ((raw as Record<string, unknown>)?.type as string) ?? 'unknown',
          code: 'INVALID_ACTION',
          message: result.error.issues[0]?.message ?? 'Invalid message',
          requestId,
        })
        return
      }

      const msg = result.data

      try {
        // Handle heartbeat pong (doesn't require being in a room)
        if (msg.type === 'pong') {
          heartbeatManager.receivePong(clientData.id, msg.timestamp)
          return
        }

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
            requestId,
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
            requestId,
          })
          return
        }

        const clients = roomManager.getClients()

        // Block game actions for spectators (allow chat, cursor, viewport updates)
        const spectatorAllowedActions = [
          'chat:send',
          'chat:typing',
          'cursor:update',
          'selection:update',
          'viewport:update',
          'state:request',
        ]
        if (
          clientData.playerId &&
          roomManager.isSpectator(clientData.roomCode, clientData.playerId) &&
          !spectatorAllowedActions.includes(msg.type)
        ) {
          send(socket, {
            type: 'error',
            originalAction: msg.type,
            code: 'SPECTATOR_READONLY',
            message: 'Spectators cannot perform this action',
            requestId,
          })
          return
        }

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

          // Counter actions
          case 'counter:create':
            handleCounterCreate(socket, msg, room, clients)
            roomManager.markDirtyImmediate(room.code)
            break
          case 'counter:update':
            handleCounterUpdate(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'counter:increment':
            handleCounterIncrement(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'counter:delete':
            handleCounterDelete(socket, msg, room, clients)
            roomManager.markDirtyImmediate(room.code)
            break
          case 'counter:lock':
            handleCounterLock(socket, msg, room, clients)
            break
          case 'counter:unlock':
            handleCounterUnlock(socket, msg, room, clients)
            break

          // Token actions
          case 'token:create':
            handleTokenCreate(socket, msg, room, clients)
            roomManager.markDirtyImmediate(room.code)
            break
          case 'token:update':
            handleTokenUpdate(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'token:delete':
            handleTokenDelete(socket, msg, room, clients)
            roomManager.markDirtyImmediate(room.code)
            break
          case 'token:lock':
            handleTokenLock(socket, msg, room, clients)
            break
          case 'token:unlock':
            handleTokenUnlock(socket, msg, room, clients)
            break

          // Die actions
          case 'die:create':
            handleDieCreate(socket, msg, room, clients)
            roomManager.markDirtyImmediate(room.code)
            break
          case 'die:roll':
            handleDieRoll(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'die:update':
            handleDieUpdate(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'die:delete':
            handleDieDelete(socket, msg, room, clients)
            roomManager.markDirtyImmediate(room.code)
            break
          case 'die:lock':
            handleDieLock(socket, msg, room, clients)
            break
          case 'die:unlock':
            handleDieUnlock(socket, msg, room, clients)
            break

          // Timer actions
          case 'timer:create':
            handleTimerCreate(socket, msg, room, clients)
            roomManager.markDirtyImmediate(room.code)
            break
          case 'timer:start':
            handleTimerStart(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'timer:pause':
            handleTimerPause(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'timer:reset':
            handleTimerReset(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'timer:update':
            handleTimerUpdate(socket, msg, room, clients)
            roomManager.markDirty(room.code)
            break
          case 'timer:delete':
            handleTimerDelete(socket, msg, room, clients)
            roomManager.markDirtyImmediate(room.code)
            break
          case 'timer:lock':
            handleTimerLock(socket, msg, room, clients)
            break
          case 'timer:unlock':
            handleTimerUnlock(socket, msg, room, clients)
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
            if (!clientData.playerId) break
            const now = Date.now()
            const lastUpdate = lastCursorUpdate.get(clientData.id) ?? 0

            if (now - lastUpdate < CURSOR_THROTTLE_MS) {
              // Throttled, skip
              break
            }

            lastCursorUpdate.set(clientData.id, now)

            // Store cursor position in room for new players joining
            room.cursors.set(clientData.playerId, { x: msg.x, y: msg.y, state: msg.state })

            // Broadcast cursor to players whose viewport contains this position
            broadcastToViewport(
              clients,
              room.code,
              {
                type: 'cursor:updated',
                playerId: clientData.playerId,
                x: msg.x,
                y: msg.y,
                state: msg.state,
              },
              { x: msg.x, y: msg.y },
              clientData.id, // Exclude sender (uses socket ID for routing)
            )
            break
          }

          // Selection updates (broadcast to all players)
          case 'selection:update': {
            if (!clientData.playerId) break

            const player = room.players.get(clientData.playerId)
            if (!player) break

            // Broadcast selection to all other players in the room
            broadcastToRoom(
              clients,
              room.code,
              {
                type: 'selection:updated',
                playerId: clientData.playerId,
                playerColor: player.color,
                cardIds: msg.cardIds,
              },
              clientData.id, // Exclude sender
            )
            break
          }

          // Viewport updates (for selective broadcasting optimization)
          case 'viewport:update': {
            updateClientViewport(socket, msg.viewport)
            break
          }

          // State sync request
          case 'state:request': {
            if (!clientData.playerId) break
            const state = room.gameState.getState()
            const playerHand = state.hands.find((h) => h.playerId === clientData.playerId)
            const handCounts = state.hands.map((h) => ({
              playerId: h.playerId,
              count: h.cardIds.length,
            }))
            send(socket, {
              type: 'state:sync',
              state,
              yourHand: playerHand?.cardIds ?? [],
              handCounts,
              stateVersion: room.gameState.getVersion(),
            })
            break
          }

          // Chat messages
          case 'chat:send': {
            if (!clientData.playerId) break
            const player = room.players.get(clientData.playerId)
            if (!player) break

            // Sanitize message to prevent XSS
            const sanitizedMessage = sanitizeChatMessage(msg.message)
            if (!sanitizedMessage) break // Ignore empty messages

            const chatMessage = {
              id: nanoid(),
              roomCode: room.code,
              playerId: clientData.playerId,
              playerName: player.name,
              playerColor: player.color,
              message: sanitizedMessage,
              timestamp: Date.now(),
            }

            // Save to database and track metric
            saveChatMessage(chatMessage)
            trackChatMessage()

            // Broadcast to all players in the room
            broadcastToRoom(clients, room.code, {
              type: 'chat:message',
              ...chatMessage,
            })
            break
          }

          case 'chat:typing': {
            if (!clientData.playerId) break
            const player = room.players.get(clientData.playerId)
            if (!player) break

            // Broadcast typing status to other players in the room
            broadcastToRoom(
              clients,
              room.code,
              {
                type: 'chat:typing_status',
                playerId: clientData.playerId,
                playerName: player.name,
                isTyping: msg.isTyping,
              },
              clientData.id, // Exclude sender (uses socket ID for routing)
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

          // Player moderation
          case 'player:kick':
            handlePlayerKick(socket, msg, roomManager)
            break
          case 'player:ban':
            handlePlayerBan(socket, msg, roomManager)
            break
        }
      } catch (err) {
        console.error(`[error] Handler error for ${msg.type}:`, err)
        send(socket, {
          type: 'error',
          originalAction: msg.type,
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
          requestId,
        })
      }
    },

    close(ws, code, reason) {
      const clientData = ws.data
      console.log(`[disconnect] ${clientData.id} (code: ${code})`)

      trackConnection(-1)
      lastCursorUpdate.delete(clientData.id)
      rateLimiter.removeClient(clientData.id)
      heartbeatManager.stopHeartbeat(clientData.id)
      handleDisconnect(clientData, roomManager)
    },
  },
})

// Set up heartbeat timeout callback to close dead connections
heartbeatManager.setTimeoutCallback((clientId) => {
  const ws = roomManager.getClient(clientId)
  if (ws) {
    console.log(`[heartbeat] Closing timed-out connection for ${clientId}`)
    // Close with code 4000 to indicate heartbeat timeout
    try {
      ;(ws as ServerWebSocket<ClientData>).close(4000, 'Heartbeat timeout')
    } catch {
      // Connection may already be closed
    }
  }
})

console.log(`🃏 Cardz server running on port ${server.port}`)
console.log(`   Local:   ws://localhost:${server.port}`)
console.log(
  `   Network: ws://0.0.0.0:${server.port} (use your machine's IP for remote connections)`,
)

// Log startup info
logConfigSummary()
console.log(`Server listening on http://localhost:${config.port}`)

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...')
  heartbeatManager.cleanup()
  roomManager.dispose()
  rateLimiter.dispose()
  closeDatabase()
  server.stop()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\nShutting down...')
  heartbeatManager.cleanup()
  roomManager.dispose()
  rateLimiter.dispose()
  closeDatabase()
  server.stop()
  process.exit(0)
})
