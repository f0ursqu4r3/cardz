import type { ServerWebSocket } from 'bun'
import { nanoid } from 'nanoid'
import { RoomManager } from './room'
import { ClientMessageSchema } from './validation'
import type { ClientData } from './utils/broadcast'
import { send, broadcastToRoom } from './utils/broadcast'
import { CURSOR_THROTTLE_MS } from '../shared/types'

// Handlers
import {
  handleRoomCreate,
  handleRoomJoin,
  handleRoomLeave,
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

const PORT = parseInt(process.env.PORT ?? '9001', 10)
const roomManager = new RoomManager()

// Track cursor update timestamps for throttling
const lastCursorUpdate = new Map<string, number>()

// Type alias for Bun's WebSocket
export type BunWebSocket = ServerWebSocket<ClientData>

const server = Bun.serve<ClientData>({
  port: PORT,

  fetch(req, server) {
    const url = new URL(req.url)

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Upgrade to WebSocket
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
  },

  websocket: {
    idleTimeout: 120,
    maxPayloadLength: 16 * 1024,

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
          handleCardMove(ws as any, msg, room)
          break
        case 'card:lock':
          handleCardLock(ws as any, msg, room, clients as any)
          break
        case 'card:unlock':
          handleCardUnlock(ws as any, msg, room, clients as any)
          break
        case 'card:flip':
          handleCardFlip(ws as any, msg, room, clients as any)
          break

        // Stack actions
        case 'stack:create':
          handleStackCreate(ws as any, msg, room, clients as any)
          break
        case 'stack:move':
          handleStackMove(ws as any, msg, room, clients as any)
          break
        case 'stack:lock':
          handleStackLock(ws as any, msg, room, clients as any)
          break
        case 'stack:unlock':
          handleStackUnlock(ws as any, msg, room, clients as any)
          break
        case 'stack:add_card':
          handleStackAddCard(ws as any, msg, room, clients as any)
          break
        case 'stack:remove_card':
          handleStackRemoveCard(ws as any, msg, room, clients as any)
          break
        case 'stack:merge':
          handleStackMerge(ws as any, msg, room, clients as any)
          break
        case 'stack:shuffle':
          handleStackShuffle(ws as any, msg, room, clients as any)
          break
        case 'stack:flip':
          handleStackFlip(ws as any, msg, room, clients as any)
          break

        // Zone actions
        case 'zone:create':
          handleZoneCreate(ws as any, msg, room, clients as any)
          break
        case 'zone:update':
          handleZoneUpdate(ws as any, msg, room, clients as any)
          break
        case 'zone:delete':
          handleZoneDelete(ws as any, msg, room, clients as any)
          break
        case 'zone:add_card':
          handleZoneAddCard(ws as any, msg, room, clients as any)
          break

        // Hand actions
        case 'hand:add':
          handleHandAdd(ws as any, msg, room, clients as any)
          break
        case 'hand:remove':
          handleHandRemove(ws as any, msg, room, clients as any)
          break
        case 'hand:reorder':
          handleHandReorder(ws as any, msg, room)
          break
        case 'hand:add_stack':
          handleHandAddStack(ws as any, msg, room, clients as any)
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

          broadcastToRoom(
            clients as any,
            room.code,
            {
              type: 'cursor:updated',
              playerId: clientData.id,
              x: msg.x,
              y: msg.y,
            },
            clientData.id,
          )
          break
        }
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

console.log(`🃏 Cardz server running on ws://localhost:${server.port}`)

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...')
  roomManager.dispose()
  server.stop()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\nShutting down...')
  roomManager.dispose()
  server.stop()
  process.exit(0)
})
