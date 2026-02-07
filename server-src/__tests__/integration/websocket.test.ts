/**
 * Integration tests for WebSocket client-server communication
 *
 * These tests spin up an actual server and test real WebSocket connections
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import type { ServerWebSocket } from 'bun'

// Test server setup
let server: ReturnType<typeof Bun.serve> | undefined
let testPort: number

interface ClientData {
  id: string
  roomCode: string | null
  name: string
}

// Simple in-memory state for testing
const rooms = new Map<string, { players: Map<string, { name: string; ws: ServerWebSocket<ClientData> }> }>()
let clientIdCounter = 0

function createTestServer(port: number) {
  return Bun.serve<ClientData>({
    port,
    fetch(req, server) {
      const url = new URL(req.url)

      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const upgradeHeader = req.headers.get('upgrade')
      if (upgradeHeader?.toLowerCase() === 'websocket') {
        const success = server.upgrade(req, {
          data: {
            id: `client-${++clientIdCounter}`,
            roomCode: null,
            name: '',
          },
        })
        if (success) return undefined
        return new Response('WebSocket upgrade failed', { status: 400 })
      }

      return new Response('Not Found', { status: 404 })
    },
    websocket: {
      open(ws) {
        ws.send(JSON.stringify({ type: 'connected', clientId: ws.data.id }))
      },
      message(ws, message) {
        try {
          const msg = JSON.parse(message.toString())
          handleMessage(ws, msg)
        } catch {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }))
        }
      },
      close(ws) {
        // Clean up from room if in one
        if (ws.data.roomCode) {
          const room = rooms.get(ws.data.roomCode)
          if (room) {
            room.players.delete(ws.data.id)
            if (room.players.size === 0) {
              rooms.delete(ws.data.roomCode)
            }
          }
        }
      },
    },
  })
}

async function canBindPort(): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const port = 20000 + Math.floor(Math.random() * 20000)
    try {
      const probe = Bun.serve({
        port,
        fetch() {
          return new Response('ok')
        },
      })
      probe.stop()
      return true
    } catch {
      // Try another port.
    }
  }
  return false
}

const socketsAvailable = await canBindPort()
const describeSockets = describe.skipIf(!socketsAvailable)

function handleMessage(ws: ServerWebSocket<ClientData>, msg: { type: string; [key: string]: unknown }) {
  switch (msg.type) {
    case 'room:create': {
      const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase()
      const playerName = (msg.playerName as string) || 'Player'

      rooms.set(roomCode, {
        players: new Map([[ws.data.id, { name: playerName, ws }]]),
      })

      ws.data.roomCode = roomCode
      ws.data.name = playerName

      ws.send(
        JSON.stringify({
          type: 'room:created',
          roomCode,
          playerId: ws.data.id,
          players: [{ id: ws.data.id, name: playerName, connected: true }],
        }),
      )
      break
    }

    case 'room:join': {
      const roomCode = msg.roomCode as string
      const playerName = (msg.playerName as string) || 'Player'
      const room = rooms.get(roomCode)

      if (!room) {
        ws.send(
          JSON.stringify({
            type: 'error',
            originalAction: 'room:join',
            code: 'NOT_FOUND',
            message: 'Room not found',
          }),
        )
        return
      }

      room.players.set(ws.data.id, { name: playerName, ws })
      ws.data.roomCode = roomCode
      ws.data.name = playerName

      // Notify existing players
      for (const [id, player] of room.players) {
        if (id !== ws.data.id) {
          player.ws.send(
            JSON.stringify({
              type: 'room:player_joined',
              player: { id: ws.data.id, name: playerName, connected: true },
            }),
          )
        }
      }

      ws.send(
        JSON.stringify({
          type: 'room:joined',
          roomCode,
          playerId: ws.data.id,
          isReconnect: false,
          players: Array.from(room.players.entries()).map(([id, p]) => ({
            id,
            name: p.name,
            connected: true,
          })),
        }),
      )
      break
    }

    case 'chat:send': {
      const room = rooms.get(ws.data.roomCode!)
      if (!room) return

      const chatMsg = {
        type: 'chat:message',
        playerId: ws.data.id,
        playerName: ws.data.name,
        message: msg.message as string,
        timestamp: Date.now(),
      }

      for (const player of room.players.values()) {
        player.ws.send(JSON.stringify(chatMsg))
      }
      break
    }

    case 'ping': {
      ws.send(JSON.stringify({ type: 'pong', timestamp: msg.timestamp }))
      break
    }

    default:
      ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }))
  }
}

// Helper to create a WebSocket client for testing
async function createClient(port: number): Promise<{
  ws: WebSocket
  messages: unknown[]
  waitForMessage: (predicate: (msg: unknown) => boolean, timeout?: number) => Promise<unknown>
  send: (msg: unknown) => void
  close: () => void
}> {
  const messages: unknown[] = []

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`)

    const waitForMessage = (predicate: (msg: unknown) => boolean, timeout = 5000): Promise<unknown> => {
      return new Promise((res, rej) => {
        // Check existing messages first
        const existing = messages.find(predicate)
        if (existing) {
          res(existing)
          return
        }

        const timeoutId = setTimeout(() => {
          rej(new Error(`Timeout waiting for message. Received: ${JSON.stringify(messages)}`))
        }, timeout)

        const checkNewMessages = () => {
          const found = messages.find(predicate)
          if (found) {
            clearTimeout(timeoutId)
            res(found)
          }
        }

        // Poll for new messages
        const interval = setInterval(checkNewMessages, 10)
        setTimeout(() => clearInterval(interval), timeout)
      })
    }

    ws.onopen = () => {
      resolve({
        ws,
        messages,
        waitForMessage,
        send: (msg) => ws.send(JSON.stringify(msg)),
        close: () => ws.close(),
      })
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        messages.push(msg)
      } catch {
        messages.push({ raw: event.data })
      }
    }

    ws.onerror = (err) => {
      reject(err)
    }
  })
}

describeSockets('WebSocket Integration Tests', () => {
  beforeAll(async () => {
    let lastError: unknown
    for (let attempt = 0; attempt < 10; attempt++) {
      const port = 20000 + Math.floor(Math.random() * 20000)
      try {
        server = createTestServer(port)
        testPort = server.port!
        break
      } catch (err) {
        lastError = err
      }
    }

    if (!server) {
      throw lastError instanceof Error ? lastError : new Error('Failed to start test server')
    }

    // Wait for server to be ready
    await Bun.sleep(100)
  })

  afterAll(() => {
    server?.stop()
    rooms.clear()
  })

  beforeEach(() => {
    rooms.clear()
    clientIdCounter = 0
  })

  describe('Connection', () => {
    test('client receives connected message on connect', async () => {
      const client = await createClient(testPort)

      const msg = (await client.waitForMessage((m: any) => m.type === 'connected')) as {
        type: string
        clientId: string
      }

      expect(msg.type).toBe('connected')
      expect(msg.clientId).toMatch(/^client-\d+$/)

      client.close()
    })

    test('server responds to ping with pong', async () => {
      const client = await createClient(testPort)
      await client.waitForMessage((m: any) => m.type === 'connected')

      const timestamp = Date.now()
      client.send({ type: 'ping', timestamp })

      const pong = (await client.waitForMessage((m: any) => m.type === 'pong')) as {
        type: string
        timestamp: number
      }

      expect(pong.type).toBe('pong')
      expect(pong.timestamp).toBe(timestamp)

      client.close()
    })
  })

  describe('Room Management', () => {
    test('client can create a room', async () => {
      const client = await createClient(testPort)
      await client.waitForMessage((m: any) => m.type === 'connected')

      client.send({ type: 'room:create', playerName: 'Alice' })

      const msg = (await client.waitForMessage((m: any) => m.type === 'room:created')) as {
        type: string
        roomCode: string
        playerId: string
        players: { id: string; name: string }[]
      }

      expect(msg.type).toBe('room:created')
      expect(msg.roomCode).toHaveLength(6)
      expect(msg.players).toHaveLength(1)
      expect(msg.players[0].name).toBe('Alice')

      client.close()
    })

    test('client can join an existing room', async () => {
      // Create room with first client
      const client1 = await createClient(testPort)
      await client1.waitForMessage((m: any) => m.type === 'connected')
      client1.send({ type: 'room:create', playerName: 'Alice' })

      const createMsg = (await client1.waitForMessage((m: any) => m.type === 'room:created')) as {
        roomCode: string
      }
      const roomCode = createMsg.roomCode

      // Join with second client
      const client2 = await createClient(testPort)
      await client2.waitForMessage((m: any) => m.type === 'connected')
      client2.send({ type: 'room:join', roomCode, playerName: 'Bob' })

      const joinMsg = (await client2.waitForMessage((m: any) => m.type === 'room:joined')) as {
        type: string
        roomCode: string
        players: { name: string }[]
      }

      expect(joinMsg.type).toBe('room:joined')
      expect(joinMsg.roomCode).toBe(roomCode)
      expect(joinMsg.players).toHaveLength(2)
      expect(joinMsg.players.map((p) => p.name).sort()).toEqual(['Alice', 'Bob'])

      client1.close()
      client2.close()
    })

    test('existing player is notified when new player joins', async () => {
      // Create room with first client
      const client1 = await createClient(testPort)
      await client1.waitForMessage((m: any) => m.type === 'connected')
      client1.send({ type: 'room:create', playerName: 'Alice' })

      const createMsg = (await client1.waitForMessage((m: any) => m.type === 'room:created')) as {
        roomCode: string
      }

      // Join with second client
      const client2 = await createClient(testPort)
      await client2.waitForMessage((m: any) => m.type === 'connected')
      client2.send({ type: 'room:join', roomCode: createMsg.roomCode, playerName: 'Bob' })

      // First client should receive notification
      const notification = (await client1.waitForMessage((m: any) => m.type === 'room:player_joined')) as {
        type: string
        player: { name: string }
      }

      expect(notification.type).toBe('room:player_joined')
      expect(notification.player.name).toBe('Bob')

      client1.close()
      client2.close()
    })

    test('joining non-existent room returns error', async () => {
      const client = await createClient(testPort)
      await client.waitForMessage((m: any) => m.type === 'connected')

      client.send({ type: 'room:join', roomCode: 'FAKE00', playerName: 'Bob' })

      const errorMsg = (await client.waitForMessage((m: any) => m.type === 'error')) as {
        type: string
        code: string
      }

      expect(errorMsg.type).toBe('error')
      expect(errorMsg.code).toBe('NOT_FOUND')

      client.close()
    })
  })

  describe('Chat', () => {
    test('chat messages are broadcast to all players in room', async () => {
      // Create room with first client
      const client1 = await createClient(testPort)
      await client1.waitForMessage((m: any) => m.type === 'connected')
      client1.send({ type: 'room:create', playerName: 'Alice' })

      const createMsg = (await client1.waitForMessage((m: any) => m.type === 'room:created')) as {
        roomCode: string
      }

      // Join with second client
      const client2 = await createClient(testPort)
      await client2.waitForMessage((m: any) => m.type === 'connected')
      client2.send({ type: 'room:join', roomCode: createMsg.roomCode, playerName: 'Bob' })
      await client2.waitForMessage((m: any) => m.type === 'room:joined')

      // Clear previous messages
      client1.messages.length = 0
      client2.messages.length = 0

      // Send chat message
      client1.send({ type: 'chat:send', message: 'Hello everyone!' })

      // Both clients should receive the message
      const msg1 = (await client1.waitForMessage((m: any) => m.type === 'chat:message')) as {
        message: string
        playerName: string
      }
      const msg2 = (await client2.waitForMessage((m: any) => m.type === 'chat:message')) as {
        message: string
        playerName: string
      }

      expect(msg1.message).toBe('Hello everyone!')
      expect(msg1.playerName).toBe('Alice')
      expect(msg2.message).toBe('Hello everyone!')
      expect(msg2.playerName).toBe('Alice')

      client1.close()
      client2.close()
    })
  })

  describe('Error Handling', () => {
    test('unknown message type returns error', async () => {
      const client = await createClient(testPort)
      await client.waitForMessage((m: any) => m.type === 'connected')

      client.send({ type: 'unknown:action', data: 'test' })

      const errorMsg = (await client.waitForMessage((m: any) => m.type === 'error')) as {
        type: string
        message: string
      }

      expect(errorMsg.type).toBe('error')
      expect(errorMsg.message).toContain('Unknown message type')

      client.close()
    })
  })
})
