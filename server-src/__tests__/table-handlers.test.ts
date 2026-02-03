import { describe, test, expect, beforeEach } from 'bun:test'
import type { GenericWebSocket, ClientData } from '../utils/broadcast'
import { RoomManager } from '../room'
import { handleTableReset, handleTableUpdateSettings } from '../handlers/table'

interface MockMessage {
  data: string
}

/**
 * Create a mock WebSocket with separate socket ID and player ID
 * This correctly simulates the real scenario where:
 * - id: socket ID (used for routing, changes on reconnect)
 * - playerId: stable player ID (persists across reconnects, used for permission checks)
 */
function createMockWebSocket(
  socketId: string,
  playerId: string | null,
  roomCode: string | null,
  name: string,
): GenericWebSocket & { sentMessages: MockMessage[] } {
  const sentMessages: MockMessage[] = []
  return {
    data: { id: socketId, playerId, roomCode, name } as ClientData,
    sentMessages,
    send(message: string) {
      sentMessages.push({ data: message })
      return message.length
    },
  }
}

describe('handleTableReset', () => {
  let roomManager: RoomManager

  beforeEach(() => {
    roomManager = new RoomManager()
  })

  test('creator can reset the table', () => {
    // Create a room - returns the room and playerId
    const { room, playerId } = roomManager.createRoom('socket1', 'Alice', undefined, 'Test Table')
    const roomCode = room.code

    // Create mock websocket for the creator
    // Note: socket ID ('socket1') is different from player ID
    const ws = createMockWebSocket('socket1', playerId, roomCode, 'Alice')
    roomManager.addClient('socket1', ws)

    // Send table:reset message as creator
    handleTableReset(ws, { type: 'table:reset' }, roomManager)

    // Check that the response was successful (table:reset broadcast)
    const messages = ws.sentMessages.map((m) => JSON.parse(m.data))
    const resetMsg = messages.find((m) => m.type === 'table:reset')

    expect(resetMsg).toBeDefined()
    expect(resetMsg.state).toBeDefined()
    // Reset creates a fresh initial state with 52 cards in a deck
    expect(resetMsg.state.cards).toHaveLength(52)
    expect(resetMsg.state.stacks).toHaveLength(1)
    expect(resetMsg.state.zones).toEqual([])
  })

  test('non-creator cannot reset the table', () => {
    // Create a room as Alice (creator)
    const { room } = roomManager.createRoom('socket1', 'Alice', undefined, 'Test Table')
    const roomCode = room.code

    // Join room as Bob (member)
    const bobResult = roomManager.joinRoom(roomCode, 'socket2', 'Bob')
    if ('error' in bobResult) {
      throw new Error('Failed to join room')
    }
    const bobId = bobResult.playerId

    // Create mock websockets with proper socket ID vs player ID separation
    const aliceWs = createMockWebSocket('socket1', aliceId, roomCode, 'Alice')
    const bobWs = createMockWebSocket('socket2', bobId, roomCode, 'Bob')
    roomManager.addClient('socket1', aliceWs)
    roomManager.addClient('socket2', bobWs)

    // Try to reset as Bob (non-creator)
    handleTableReset(bobWs, { type: 'table:reset' }, roomManager)

    // Check that Bob received a permission denied error
    const messages = bobWs.sentMessages.map((m) => JSON.parse(m.data))
    const errorMsg = messages.find((m) => m.type === 'error')

    expect(errorMsg).toBeDefined()
    expect(errorMsg.code).toBe('PERMISSION_DENIED')
    expect(errorMsg.originalAction).toBe('table:reset')
    expect(errorMsg.message).toContain('Only the table creator')
  })

  test('reset clears zones and counters, restores initial deck', () => {
    // Create a room
    const { room, playerId } = roomManager.createRoom('socket1', 'Alice', undefined, 'Test Table')
    const roomCode = room.code

    // Modify game state - add a zone and counter using GameStateManager methods
    room.gameState.createZone(200, 200, 300, 200, 'Test Zone', true)
    room.gameState.createCounter(100, 100, 'Health', 20)

    // Verify state has zones and counters (in addition to initial deck)
    expect(room.gameState.getState().cards.length).toBe(52) // Initial deck
    expect(room.gameState.getState().zones.length).toBe(1)
    expect(room.gameState.getState().counters.length).toBe(1)

    // Reset the table
    const ws = createMockWebSocket('socket1', playerId, roomCode, 'Alice')
    roomManager.addClient('socket1', ws)
    handleTableReset(ws, { type: 'table:reset' }, roomManager)

    // Check that state was reset to initial state
    const messages = ws.sentMessages.map((m) => JSON.parse(m.data))
    const resetMsg = messages.find((m) => m.type === 'table:reset')

    // Reset restores fresh 52-card deck
    expect(resetMsg.state.cards).toHaveLength(52)
    expect(resetMsg.state.stacks).toHaveLength(1)
    // Zones and counters are cleared
    expect(resetMsg.state.zones).toEqual([])
    expect(resetMsg.state.counters).toEqual([])
  })

  test('returns error when not in a room', () => {
    const ws = createMockWebSocket('socket1', null, null, 'Alice')

    handleTableReset(ws, { type: 'table:reset' }, roomManager)

    const messages = ws.sentMessages.map((m) => JSON.parse(m.data))
    const errorMsg = messages.find((m) => m.type === 'error')

    expect(errorMsg).toBeDefined()
    expect(errorMsg.code).toBe('INVALID_ACTION')
    expect(errorMsg.message).toContain('Not in a room')
  })

  test('creator role persists through reconnection', () => {
    // Create a room as Alice
    const { room, playerId: aliceId } = roomManager.createRoom('socket1', 'Alice', undefined, 'Test Table')
    const roomCode = room.code

    // Verify Alice is creator
    expect(roomManager.isCreator(roomCode, aliceId)).toBe(true)

    // Simulate disconnect and reconnect with same playerId
    roomManager.disconnectPlayer(aliceId, roomCode)

    // Reconnect with the same stable playerId
    const reconnectResult = roomManager.joinRoom(roomCode, 'socket2', 'Alice', undefined, aliceId)
    if ('error' in reconnectResult) {
      throw new Error('Failed to reconnect')
    }

    // Alice should still be creator
    expect(roomManager.isCreator(roomCode, aliceId)).toBe(true)

    // Reset should work - note the new socket ID is 'socket2' after reconnection
    const ws = createMockWebSocket('socket2', aliceId, roomCode, 'Alice')
    roomManager.addClient('socket2', ws)
    handleTableReset(ws, { type: 'table:reset' }, roomManager)

    const messages = ws.sentMessages.map((m) => JSON.parse(m.data))
    const resetMsg = messages.find((m) => m.type === 'table:reset')
    expect(resetMsg).toBeDefined()
  })
})

describe('handleTableUpdateSettings', () => {
  let roomManager: RoomManager

  beforeEach(() => {
    roomManager = new RoomManager()
  })

  test('creator can update table settings', () => {
    const { room, playerId } = roomManager.createRoom('socket1', 'Alice', undefined, 'Test Table')
    const roomCode = room.code

    const ws = createMockWebSocket('socket1', playerId, roomCode, 'Alice')
    roomManager.addClient('socket1', ws)

    handleTableUpdateSettings(
      ws,
      { type: 'table:update_settings', settings: { background: 'blue-felt' } },
      roomManager,
    )

    const messages = ws.sentMessages.map((m) => JSON.parse(m.data))
    const settingsMsg = messages.find((m) => m.type === 'table:settings_updated')

    expect(settingsMsg).toBeDefined()
    expect(settingsMsg.settings.background).toBe('blue-felt')
  })

  test('non-creator cannot update table settings', () => {
    const { room } = roomManager.createRoom('socket1', 'Alice', undefined, 'Test Table')
    const roomCode = room.code

    const bobResult = roomManager.joinRoom(roomCode, 'socket2', 'Bob')
    if ('error' in bobResult) {
      throw new Error('Failed to join room')
    }
    const bobId = bobResult.playerId

    const bobWs = createMockWebSocket('socket2', bobId, roomCode, 'Bob')
    roomManager.addClient('socket2', bobWs)

    handleTableUpdateSettings(
      bobWs,
      { type: 'table:update_settings', settings: { background: 'red-felt' } },
      roomManager,
    )

    const messages = bobWs.sentMessages.map((m) => JSON.parse(m.data))
    const errorMsg = messages.find((m) => m.type === 'error')

    expect(errorMsg).toBeDefined()
    expect(errorMsg.code).toBe('PERMISSION_DENIED')
    expect(errorMsg.originalAction).toBe('table:update_settings')
  })
})
