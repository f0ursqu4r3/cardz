import { describe, test, expect } from 'bun:test'
import type { GenericWebSocket, ClientData } from '../utils/broadcast'

// We need to test the broadcast functions, but they require mock WebSockets
// Let's create a minimal mock setup

interface MockMessage {
  data: string
}

function createMockWebSocket(clientData: ClientData): GenericWebSocket & { sentMessages: MockMessage[] } {
  const sentMessages: MockMessage[] = []
  return {
    data: clientData,
    sentMessages,
    send(message: string) {
      sentMessages.push({ data: message })
      return message.length
    },
  }
}

// Import the functions to test
import { broadcastToRoom, broadcastToViewport, updateClientViewport, getClientData } from '../utils/broadcast'

describe('broadcastToRoom', () => {
  test('broadcasts to all clients in room', () => {
    const clients = new Map<string, GenericWebSocket>()

    const ws1 = createMockWebSocket({ id: 'p1', playerId: null, roomCode: 'ROOM01', name: 'Alice' })
    const ws2 = createMockWebSocket({ id: 'p2', playerId: null, roomCode: 'ROOM01', name: 'Bob' })
    const ws3 = createMockWebSocket({ id: 'p3', playerId: null, roomCode: 'OTHER1', name: 'Carol' })

    clients.set('p1', ws1)
    clients.set('p2', ws2)
    clients.set('p3', ws3)

    broadcastToRoom(clients, 'ROOM01', { type: 'chat:message', id: 'msg1', playerId: 'p1', playerName: 'Alice', message: 'Hi', timestamp: 123, playerColor: '#fff' })

    expect(ws1.sentMessages).toHaveLength(1)
    expect(ws2.sentMessages).toHaveLength(1)
    expect(ws3.sentMessages).toHaveLength(0) // Different room
  })

  test('excludes specified client', () => {
    const clients = new Map<string, GenericWebSocket>()

    const ws1 = createMockWebSocket({ id: 'p1', playerId: null, roomCode: 'ROOM01', name: 'Alice' })
    const ws2 = createMockWebSocket({ id: 'p2', playerId: null, roomCode: 'ROOM01', name: 'Bob' })

    clients.set('p1', ws1)
    clients.set('p2', ws2)

    broadcastToRoom(clients, 'ROOM01', { type: 'chat:message', id: 'msg1', playerId: 'p1', playerName: 'Alice', message: 'Hi', timestamp: 123, playerColor: '#fff' }, 'p1')

    expect(ws1.sentMessages).toHaveLength(0) // Excluded
    expect(ws2.sentMessages).toHaveLength(1)
  })
})

describe('broadcastToViewport', () => {
  test('broadcasts to clients whose viewport contains the position', () => {
    const clients = new Map<string, GenericWebSocket>()

    // Client 1: viewport covers 0-500, 0-500
    const ws1 = createMockWebSocket({
      id: 'p1',
      playerId: null,
      roomCode: 'ROOM01',
      name: 'Alice',
      viewport: { x: 0, y: 0, width: 500, height: 500 },
    })

    // Client 2: viewport covers 400-900, 400-900
    const ws2 = createMockWebSocket({
      id: 'p2',
      playerId: null,
      roomCode: 'ROOM01',
      name: 'Bob',
      viewport: { x: 400, y: 400, width: 500, height: 500 },
    })

    // Client 3: viewport covers 1000-1500, 1000-1500 (far away)
    const ws3 = createMockWebSocket({
      id: 'p3',
      playerId: null,
      roomCode: 'ROOM01',
      name: 'Carol',
      viewport: { x: 1000, y: 1000, width: 500, height: 500 },
    })

    clients.set('p1', ws1)
    clients.set('p2', ws2)
    clients.set('p3', ws3)

    // Broadcast update at position (200, 200) - only client 1 should receive
    broadcastToViewport(
      clients,
      'ROOM01',
      { type: 'card:moved', cardId: 0, x: 200, y: 200, z: 1, playerId: 'p1' },
      { x: 200, y: 200 },
    )

    expect(ws1.sentMessages).toHaveLength(1)
    expect(ws2.sentMessages).toHaveLength(0)
    expect(ws3.sentMessages).toHaveLength(0)
  })

  test('broadcasts to clients with overlapping viewports (within padding)', () => {
    const clients = new Map<string, GenericWebSocket>()

    // Client at 0-500 range
    const ws1 = createMockWebSocket({
      id: 'p1',
      playerId: null,
      roomCode: 'ROOM01',
      name: 'Alice',
      viewport: { x: 0, y: 0, width: 500, height: 500 },
    })

    // Client at 500-1000 range (just outside but within default 100px padding)
    const ws2 = createMockWebSocket({
      id: 'p2',
      playerId: null,
      roomCode: 'ROOM01',
      name: 'Bob',
      viewport: { x: 550, y: 0, width: 500, height: 500 },
    })

    clients.set('p1', ws1)
    clients.set('p2', ws2)

    // Position at edge (500, 250) should reach both due to padding
    broadcastToViewport(
      clients,
      'ROOM01',
      { type: 'card:moved', cardId: 0, x: 500, y: 250, z: 1, playerId: 'p1' },
      { x: 500, y: 250 },
    )

    expect(ws1.sentMessages).toHaveLength(1)
    expect(ws2.sentMessages).toHaveLength(1)
  })

  test('broadcasts to clients without viewport (fallback)', () => {
    const clients = new Map<string, GenericWebSocket>()

    // Client with viewport
    const ws1 = createMockWebSocket({
      id: 'p1',
      playerId: null,
      roomCode: 'ROOM01',
      name: 'Alice',
      viewport: { x: 1000, y: 1000, width: 500, height: 500 }, // Far away
    })

    // Client without viewport (new connection, hasn't reported yet)
    const ws2 = createMockWebSocket({
      id: 'p2',
      playerId: null,
      roomCode: 'ROOM01',
      name: 'Bob',
      // No viewport
    })

    clients.set('p1', ws1)
    clients.set('p2', ws2)

    // Position at 200, 200 - ws1 won't see (out of viewport), ws2 will (no viewport = receive all)
    broadcastToViewport(
      clients,
      'ROOM01',
      { type: 'card:moved', cardId: 0, x: 200, y: 200, z: 1, playerId: 'p1' },
      { x: 200, y: 200 },
    )

    expect(ws1.sentMessages).toHaveLength(0)
    expect(ws2.sentMessages).toHaveLength(1) // Receives because no viewport set
  })

  test('excludes specified client', () => {
    const clients = new Map<string, GenericWebSocket>()

    const ws1 = createMockWebSocket({
      id: 'p1',
      playerId: null,
      roomCode: 'ROOM01',
      name: 'Alice',
      viewport: { x: 0, y: 0, width: 500, height: 500 },
    })

    const ws2 = createMockWebSocket({
      id: 'p2',
      playerId: null,
      roomCode: 'ROOM01',
      name: 'Bob',
      viewport: { x: 0, y: 0, width: 500, height: 500 },
    })

    clients.set('p1', ws1)
    clients.set('p2', ws2)

    broadcastToViewport(
      clients,
      'ROOM01',
      { type: 'card:moved', cardId: 0, x: 200, y: 200, z: 1, playerId: 'p1' },
      { x: 200, y: 200 },
      'p1', // Exclude p1
    )

    expect(ws1.sentMessages).toHaveLength(0) // Excluded
    expect(ws2.sentMessages).toHaveLength(1)
  })

  test('handles area-based positions (width/height)', () => {
    const clients = new Map<string, GenericWebSocket>()

    // Client viewport: 0-500, 0-500
    const ws1 = createMockWebSocket({
      id: 'p1',
      playerId: null,
      roomCode: 'ROOM01',
      name: 'Alice',
      viewport: { x: 0, y: 0, width: 500, height: 500 },
    })

    // Client viewport: 600-1100, 600-1100 (far away)
    const ws2 = createMockWebSocket({
      id: 'p2',
      playerId: null,
      roomCode: 'ROOM01',
      name: 'Bob',
      viewport: { x: 600, y: 600, width: 500, height: 500 },
    })

    clients.set('p1', ws1)
    clients.set('p2', ws2)

    // Large zone that spans from 400-700 (overlaps with ws2's viewport considering padding)
    broadcastToViewport(
      clients,
      'ROOM01',
      { type: 'zone:created', zone: { id: 1, x: 400, y: 400, width: 300, height: 300, label: 'Test', faceUp: true, locked: false, stackId: null, visibility: 'public', ownerId: null, layout: 'stack', cardSettings: { cardScale: 1, cardSpacing: 0.5 } }, playerId: 'p1' },
      { x: 400, y: 400, width: 300, height: 300 },
    )

    expect(ws1.sentMessages).toHaveLength(1) // Zone overlaps viewport
    expect(ws2.sentMessages).toHaveLength(1) // Zone overlaps viewport (with padding)
  })
})

describe('updateClientViewport', () => {
  test('updates client viewport data', () => {
    const ws = createMockWebSocket({ id: 'p1', playerId: null, roomCode: 'ROOM01', name: 'Alice' })

    updateClientViewport(ws, { x: 100, y: 200, width: 800, height: 600 })

    const clientData = getClientData(ws)
    expect(clientData.viewport).toEqual({ x: 100, y: 200, width: 800, height: 600 })
  })
})
