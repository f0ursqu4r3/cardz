import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test'

/**
 * E2E Multiplayer Scenario Tests
 *
 * These tests simulate realistic multiplayer game scenarios with multiple
 * connected players performing concurrent actions.
 */

// Test server configuration
const TEST_PORT = 9999
let serverProcess: ReturnType<typeof Bun.spawn> | null = null

// Helper to create a WebSocket client
function createClient(): Promise<{
  ws: WebSocket
  messages: unknown[]
  waitForMessage: (predicate: (msg: unknown) => boolean, timeout?: number) => Promise<unknown>
  send: (msg: unknown) => void
  close: () => void
}> {
  return new Promise((resolve, reject) => {
    const messages: unknown[] = []
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`)

    const waitForMessage = (
      predicate: (msg: unknown) => boolean,
      timeout = 5000,
    ): Promise<unknown> => {
      // Check existing messages first
      const existing = messages.find(predicate)
      if (existing) return Promise.resolve(existing)

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Timeout waiting for message`))
        }, timeout)

        const checkInterval = setInterval(() => {
          const found = messages.find(predicate)
          if (found) {
            clearTimeout(timer)
            clearInterval(checkInterval)
            resolve(found)
          }
        }, 10)
      })
    }

    ws.onopen = () => {
      resolve({
        ws,
        messages,
        waitForMessage,
        send: (msg: unknown) => ws.send(JSON.stringify(msg)),
        close: () => ws.close(),
      })
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string)
        messages.push(data)
      } catch {
        // Ignore non-JSON messages
      }
    }

    ws.onerror = (err) => reject(err)
  })
}

// Helper to wait for a short time
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('E2E Multiplayer Scenarios', () => {
  beforeAll(async () => {
    // Start a test server
    serverProcess = Bun.spawn(['bun', 'run', 'server-src/index.ts'], {
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        NODE_ENV: 'test',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    })

    // Wait for server to be ready
    await wait(1000)
  })

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill()
    }
  })

  describe('Room Lifecycle', () => {
    test('player creates room, another joins, first player sees join notification', async () => {
      const player1 = await createClient()
      const player2 = await createClient()

      try {
        // Player 1 creates a room
        player1.send({ type: 'room:create', playerName: 'Alice' })
        const created = (await player1.waitForMessage(
          (m: any) => m.type === 'room:created',
        )) as any
        expect(created.roomCode).toHaveLength(6)

        // Player 2 joins the room
        player2.send({ type: 'room:join', roomCode: created.roomCode, playerName: 'Bob' })
        const joined = (await player2.waitForMessage((m: any) => m.type === 'room:joined')) as any
        expect(joined.players).toHaveLength(2)

        // Player 1 should receive room:player_joined notification
        const notification = (await player1.waitForMessage(
          (m: any) => m.type === 'room:player_joined',
        )) as any
        expect(notification.player.name).toBe('Bob')
      } finally {
        player1.close()
        player2.close()
      }
    })

    test('player disconnect notifies other players', async () => {
      const player1 = await createClient()
      const player2 = await createClient()

      try {
        // Setup: both players in same room
        player1.send({ type: 'room:create', playerName: 'Alice' })
        const created = (await player1.waitForMessage(
          (m: any) => m.type === 'room:created',
        )) as any

        player2.send({ type: 'room:join', roomCode: created.roomCode, playerName: 'Bob' })
        await player2.waitForMessage((m: any) => m.type === 'room:joined')
        await player1.waitForMessage((m: any) => m.type === 'room:player_joined')

        // Player 2 disconnects
        player2.close()

        // Player 1 should receive disconnect notification (room:player_left)
        const disconnected = (await player1.waitForMessage(
          (m: any) => m.type === 'room:player_left',
        )) as any
        expect(disconnected.playerId).toBeDefined()
      } finally {
        player1.close()
      }
    })
  })

  describe('Card Movement Scenarios', () => {
    test('card move is broadcast to other players in room', async () => {
      const player1 = await createClient()
      const player2 = await createClient()

      try {
        // Setup room
        player1.send({ type: 'room:create', playerName: 'Alice' })
        const created = (await player1.waitForMessage(
          (m: any) => m.type === 'room:created',
        )) as any

        player2.send({ type: 'room:join', roomCode: created.roomCode, playerName: 'Bob' })
        await player2.waitForMessage((m: any) => m.type === 'room:joined')

        // Player 1 locks and moves a card
        player1.send({ type: 'card:lock', cardId: 0 })
        await player1.waitForMessage((m: any) => m.type === 'card:locked')

        player1.send({ type: 'card:move', cardId: 0, x: 100, y: 200 })

        // Player 2 should see the move (since no viewport set, receives all)
        const moved = (await player2.waitForMessage((m: any) => m.type === 'card:moved')) as any
        expect(moved.cardId).toBe(0)
        expect(moved.x).toBe(100)
        expect(moved.y).toBe(200)
      } finally {
        player1.close()
        player2.close()
      }
    })

    test('card lock prevents other player from moving', async () => {
      const player1 = await createClient()
      const player2 = await createClient()

      try {
        // Setup room
        player1.send({ type: 'room:create', playerName: 'Alice' })
        const created = (await player1.waitForMessage(
          (m: any) => m.type === 'room:created',
        )) as any

        player2.send({ type: 'room:join', roomCode: created.roomCode, playerName: 'Bob' })
        await player2.waitForMessage((m: any) => m.type === 'room:joined')

        // Player 1 locks a card
        player1.send({ type: 'card:lock', cardId: 5 })
        await player1.waitForMessage((m: any) => m.type === 'card:locked')
        await wait(50) // Let broadcast propagate

        // Player 2 tries to lock the same card - should fail
        player2.send({ type: 'card:lock', cardId: 5 })
        const error = (await player2.waitForMessage(
          (m: any) => m.type === 'error' && m.originalAction === 'card:lock',
        )) as any
        expect(error.code).toBe('CARD_LOCKED')
      } finally {
        player1.close()
        player2.close()
      }
    })
  })

  describe('Stack Operations', () => {
    test('stack creation is broadcast to other players', async () => {
      const player1 = await createClient()
      const player2 = await createClient()

      try {
        // Setup room
        player1.send({ type: 'room:create', playerName: 'Alice' })
        const created = (await player1.waitForMessage(
          (m: any) => m.type === 'room:created',
        )) as any

        player2.send({ type: 'room:join', roomCode: created.roomCode, playerName: 'Bob' })
        await player2.waitForMessage((m: any) => m.type === 'room:joined')

        // First, we need to move cards out of the initial stack
        // Get state to understand initial positions
        player1.send({ type: 'state:request' })
        const state = (await player1.waitForMessage((m: any) => m.type === 'state:sync')) as any

        // Find two loose cards (not in a stack) or remove from stack first
        // For simplicity, let's remove two cards from the initial stack
        player1.send({ type: 'stack:remove_card', cardId: 0 })
        await player1.waitForMessage((m: any) => m.type === 'stack:card_removed')

        player1.send({ type: 'stack:remove_card', cardId: 1 })
        await player1.waitForMessage((m: any) => m.type === 'stack:card_removed')

        // Now create a new stack with these cards
        player1.send({
          type: 'stack:create',
          cardIds: [0, 1],
          anchorX: 300,
          anchorY: 300,
        })

        // Player 2 should see the stack creation
        const stackCreated = (await player2.waitForMessage(
          (m: any) => m.type === 'stack:created',
        )) as any
        expect(stackCreated.stack.cardIds).toContain(0)
        expect(stackCreated.stack.cardIds).toContain(1)
      } finally {
        player1.close()
        player2.close()
      }
    })

    test('stack shuffle is broadcast to other players', async () => {
      const player1 = await createClient()
      const player2 = await createClient()

      try {
        // Setup room
        player1.send({ type: 'room:create', playerName: 'Alice' })
        const created = (await player1.waitForMessage(
          (m: any) => m.type === 'room:created',
        )) as any

        player2.send({ type: 'room:join', roomCode: created.roomCode, playerName: 'Bob' })
        await player2.waitForMessage((m: any) => m.type === 'room:joined')

        // Get initial state to find a stack
        player1.send({ type: 'state:request' })
        const state = (await player1.waitForMessage((m: any) => m.type === 'state:sync')) as any
        const stack = state.state.stacks[0]

        // Shuffle the stack
        player1.send({ type: 'stack:shuffle', stackId: stack.id })

        // Player 2 should see the shuffle
        const shuffled = (await player2.waitForMessage(
          (m: any) => m.type === 'stack:shuffled',
        )) as any
        expect(shuffled.stackId).toBe(stack.id)
        expect(shuffled.newOrder).toBeDefined()
      } finally {
        player1.close()
        player2.close()
      }
    })
  })

  describe('Zone Operations', () => {
    test('zone creation is broadcast to other players', async () => {
      const player1 = await createClient()
      const player2 = await createClient()

      try {
        // Setup room
        player1.send({ type: 'room:create', playerName: 'Alice' })
        const created = (await player1.waitForMessage(
          (m: any) => m.type === 'room:created',
        )) as any

        player2.send({ type: 'room:join', roomCode: created.roomCode, playerName: 'Bob' })
        await player2.waitForMessage((m: any) => m.type === 'room:joined')

        // Create a zone
        player1.send({
          type: 'zone:create',
          x: 100,
          y: 100,
          width: 200,
          height: 150,
          label: 'Discard Pile',
          faceUp: true,
        })

        // Player 2 should see the zone creation
        const zoneCreated = (await player2.waitForMessage(
          (m: any) => m.type === 'zone:created',
        )) as any
        expect(zoneCreated.zone.label).toBe('Discard Pile')
        expect(zoneCreated.zone.width).toBe(200)
        expect(zoneCreated.zone.height).toBe(150)
      } finally {
        player1.close()
        player2.close()
      }
    })
  })

  describe('Chat System', () => {
    test('chat messages are broadcast to all players', async () => {
      const player1 = await createClient()
      const player2 = await createClient()
      const player3 = await createClient()

      try {
        // Setup room with 3 players
        player1.send({ type: 'room:create', playerName: 'Alice' })
        const created = (await player1.waitForMessage(
          (m: any) => m.type === 'room:created',
        )) as any

        player2.send({ type: 'room:join', roomCode: created.roomCode, playerName: 'Bob' })
        await player2.waitForMessage((m: any) => m.type === 'room:joined')

        player3.send({ type: 'room:join', roomCode: created.roomCode, playerName: 'Carol' })
        await player3.waitForMessage((m: any) => m.type === 'room:joined')

        // Player 2 sends a chat message
        player2.send({ type: 'chat:send', message: 'Hello everyone!' })

        // All players (including sender) should receive the message
        const msg1 = (await player1.waitForMessage(
          (m: any) => m.type === 'chat:message',
        )) as any
        const msg2 = (await player2.waitForMessage(
          (m: any) => m.type === 'chat:message',
        )) as any
        const msg3 = (await player3.waitForMessage(
          (m: any) => m.type === 'chat:message',
        )) as any

        expect(msg1.message).toBe('Hello everyone!')
        expect(msg1.playerName).toBe('Bob')
        expect(msg2.message).toBe('Hello everyone!')
        expect(msg3.message).toBe('Hello everyone!')
      } finally {
        player1.close()
        player2.close()
        player3.close()
      }
    })

    test('chat messages are sanitized against XSS', async () => {
      const player1 = await createClient()
      const player2 = await createClient()

      try {
        // Setup room
        player1.send({ type: 'room:create', playerName: 'Alice' })
        const created = (await player1.waitForMessage(
          (m: any) => m.type === 'room:created',
        )) as any

        player2.send({ type: 'room:join', roomCode: created.roomCode, playerName: 'Bob' })
        await player2.waitForMessage((m: any) => m.type === 'room:joined')

        // Player 1 sends a message with potential XSS
        player1.send({ type: 'chat:send', message: '<script>alert("xss")</script>' })

        // Player 2 should receive sanitized message
        const msg = (await player2.waitForMessage((m: any) => m.type === 'chat:message')) as any
        expect(msg.message).not.toContain('<script>')
        expect(msg.message).toContain('&lt;script&gt;')
      } finally {
        player1.close()
        player2.close()
      }
    })
  })

  describe('Hand Operations', () => {
    test('adding card to hand hides it from other players', async () => {
      const player1 = await createClient()
      const player2 = await createClient()

      try {
        // Setup room
        player1.send({ type: 'room:create', playerName: 'Alice' })
        const created = (await player1.waitForMessage(
          (m: any) => m.type === 'room:created',
        )) as any

        player2.send({ type: 'room:join', roomCode: created.roomCode, playerName: 'Bob' })
        await player2.waitForMessage((m: any) => m.type === 'room:joined')

        // First remove a card from the initial stack
        player1.send({ type: 'stack:remove_card', cardId: 10 })
        await player1.waitForMessage((m: any) => m.type === 'stack:card_removed')
        await wait(50)

        // Player 1 adds card to hand
        player1.send({ type: 'hand:add', cardId: 10 })

        // Player 1 should see full hand info
        const handAdded1 = (await player1.waitForMessage(
          (m: any) => m.type === 'hand:card_added' && m.cardId === 10,
        )) as any
        expect(handAdded1.cardId).toBe(10)

        // Player 2 should see hand:card_added_other with hand count
        const handUpdate = (await player2.waitForMessage(
          (m: any) => m.type === 'hand:card_added_other',
        )) as any
        expect(handUpdate.handCount).toBe(1)
        // Card ID is revealed but card state (face) is hidden
        expect(handUpdate.cardId).toBe(10)
      } finally {
        player1.close()
        player2.close()
      }
    })
  })

  describe('Concurrent Actions', () => {
    test('multiple players can perform independent actions simultaneously', async () => {
      const player1 = await createClient()
      const player2 = await createClient()

      try {
        // Setup room
        player1.send({ type: 'room:create', playerName: 'Alice' })
        const created = (await player1.waitForMessage(
          (m: any) => m.type === 'room:created',
        )) as any

        player2.send({ type: 'room:join', roomCode: created.roomCode, playerName: 'Bob' })
        await player2.waitForMessage((m: any) => m.type === 'room:joined')

        // Get state to find card positions
        player1.send({ type: 'state:request' })
        await player1.waitForMessage((m: any) => m.type === 'state:sync')

        // Both players create zones simultaneously
        player1.send({
          type: 'zone:create',
          x: 100,
          y: 100,
          width: 200,
          height: 150,
          label: 'Zone A',
          faceUp: true,
        })

        player2.send({
          type: 'zone:create',
          x: 400,
          y: 100,
          width: 200,
          height: 150,
          label: 'Zone B',
          faceUp: false,
        })

        // Both should succeed and both players should see both zones
        const zone1ForP1 = await player1.waitForMessage(
          (m: any) => m.type === 'zone:created' && m.zone.label === 'Zone A',
        )
        const zone2ForP1 = await player1.waitForMessage(
          (m: any) => m.type === 'zone:created' && m.zone.label === 'Zone B',
        )
        const zone1ForP2 = await player2.waitForMessage(
          (m: any) => m.type === 'zone:created' && m.zone.label === 'Zone A',
        )
        const zone2ForP2 = await player2.waitForMessage(
          (m: any) => m.type === 'zone:created' && m.zone.label === 'Zone B',
        )

        expect(zone1ForP1).toBeDefined()
        expect(zone2ForP1).toBeDefined()
        expect(zone1ForP2).toBeDefined()
        expect(zone2ForP2).toBeDefined()
      } finally {
        player1.close()
        player2.close()
      }
    })
  })

  describe('Viewport Broadcasting', () => {
    test('player only receives updates within their viewport', async () => {
      const player1 = await createClient()
      const player2 = await createClient()

      try {
        // Setup room
        player1.send({ type: 'room:create', playerName: 'Alice' })
        const created = (await player1.waitForMessage(
          (m: any) => m.type === 'room:created',
        )) as any

        player2.send({ type: 'room:join', roomCode: created.roomCode, playerName: 'Bob' })
        await player2.waitForMessage((m: any) => m.type === 'room:joined')

        // Player 2 sets a viewport far from origin
        player2.send({
          type: 'viewport:update',
          viewport: { x: 5000, y: 5000, width: 1000, height: 800 },
        })
        await wait(50)

        // Player 1 creates a zone at origin (far from player 2's viewport)
        player1.send({
          type: 'zone:create',
          x: 0,
          y: 0,
          width: 200,
          height: 150,
          label: 'Origin Zone',
          faceUp: true,
        })

        // Player 1 should receive the zone (no viewport set = receive all)
        const zoneForP1 = await player1.waitForMessage((m: any) => m.type === 'zone:created')
        expect(zoneForP1).toBeDefined()

        // Player 2 should NOT receive the zone (outside viewport)
        // Wait briefly and check messages
        await wait(200)
        const zoneForP2 = player2.messages.find(
          (m: any) => m.type === 'zone:created' && m.zone?.label === 'Origin Zone',
        )
        expect(zoneForP2).toBeUndefined()

        // Now Player 1 creates a zone within Player 2's viewport
        player1.send({
          type: 'zone:create',
          x: 5200,
          y: 5200,
          width: 200,
          height: 150,
          label: 'Viewport Zone',
          faceUp: true,
        })

        // Player 2 should receive this zone
        const nearZone = await player2.waitForMessage(
          (m: any) => m.type === 'zone:created' && m.zone?.label === 'Viewport Zone',
        )
        expect(nearZone).toBeDefined()
      } finally {
        player1.close()
        player2.close()
      }
    })
  })

  describe('State Synchronization', () => {
    test('new player receives full game state on join', async () => {
      const player1 = await createClient()
      const player2 = await createClient()

      try {
        // Player 1 creates room and makes some changes
        player1.send({ type: 'room:create', playerName: 'Alice' })
        const created = (await player1.waitForMessage(
          (m: any) => m.type === 'room:created',
        )) as any

        // Create a zone
        player1.send({
          type: 'zone:create',
          x: 100,
          y: 100,
          width: 200,
          height: 150,
          label: 'Test Zone',
          faceUp: true,
        })
        await player1.waitForMessage((m: any) => m.type === 'zone:created')

        // Now player 2 joins
        player2.send({ type: 'room:join', roomCode: created.roomCode, playerName: 'Bob' })
        const joined = (await player2.waitForMessage((m: any) => m.type === 'room:joined')) as any

        // Player 2 should have the zone in their initial state
        expect(joined.state.zones.length).toBeGreaterThan(0)
        const zone = joined.state.zones.find((z: any) => z.label === 'Test Zone')
        expect(zone).toBeDefined()
      } finally {
        player1.close()
        player2.close()
      }
    })

    test('state:request returns current game state', async () => {
      const player1 = await createClient()

      try {
        // Create room
        player1.send({ type: 'room:create', playerName: 'Alice' })
        await player1.waitForMessage((m: any) => m.type === 'room:created')

        // Request state
        player1.send({ type: 'state:request' })
        const state = (await player1.waitForMessage((m: any) => m.type === 'state:sync')) as any

        expect(state.state.cards).toHaveLength(52)
        expect(state.state.stacks.length).toBeGreaterThan(0)
        expect(state.stateVersion).toBeDefined()
      } finally {
        player1.close()
      }
    })
  })
})
