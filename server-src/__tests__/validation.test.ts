import { describe, test, expect } from 'bun:test'
import {
  RoomCreateSchema,
  RoomJoinSchema,
  CardMoveIntentSchema,
  StackCreateSchema,
  ZoneCreateSchema,
  ZoneUpdateSchema,
  HandAddSchema,
  HandRemoveSchema,
  ChatSendSchema,
  ClientMessageSchema,
} from '../validation'

describe('RoomCreateSchema', () => {
  test('accepts valid room creation', () => {
    const result = RoomCreateSchema.safeParse({
      type: 'room:create',
      playerName: 'Alice',
    })
    expect(result.success).toBe(true)
  })

  test('accepts optional fields', () => {
    const result = RoomCreateSchema.safeParse({
      type: 'room:create',
      playerName: 'Alice',
      tableName: 'My Table',
      isPublic: true,
      sessionId: 'session123',
    })
    expect(result.success).toBe(true)
  })

  test('rejects empty player name', () => {
    const result = RoomCreateSchema.safeParse({
      type: 'room:create',
      playerName: '',
    })
    expect(result.success).toBe(false)
  })

  test('rejects too long player name', () => {
    const result = RoomCreateSchema.safeParse({
      type: 'room:create',
      playerName: 'A'.repeat(33),
    })
    expect(result.success).toBe(false)
  })
})

describe('RoomJoinSchema', () => {
  test('accepts valid room join', () => {
    const result = RoomJoinSchema.safeParse({
      type: 'room:join',
      roomCode: 'ABC123',
      playerName: 'Bob',
    })
    expect(result.success).toBe(true)
  })

  test('rejects invalid room code length', () => {
    const result = RoomJoinSchema.safeParse({
      type: 'room:join',
      roomCode: 'ABC',
      playerName: 'Bob',
    })
    expect(result.success).toBe(false)
  })

  test('rejects lowercase room code', () => {
    const result = RoomJoinSchema.safeParse({
      type: 'room:join',
      roomCode: 'abc123',
      playerName: 'Bob',
    })
    expect(result.success).toBe(false)
  })

  test('rejects room code with special characters', () => {
    const result = RoomJoinSchema.safeParse({
      type: 'room:join',
      roomCode: 'ABC-12',
      playerName: 'Bob',
    })
    expect(result.success).toBe(false)
  })
})

describe('CardMoveIntentSchema', () => {
  test('accepts valid card move', () => {
    const result = CardMoveIntentSchema.safeParse({
      type: 'card:move',
      cardId: 0,
      x: 100.5,
      y: 200.5,
    })
    expect(result.success).toBe(true)
  })

  test('accepts optional velocity', () => {
    const result = CardMoveIntentSchema.safeParse({
      type: 'card:move',
      cardId: 0,
      x: 100,
      y: 200,
      vx: 5.5,
      vy: -3.2,
    })
    expect(result.success).toBe(true)
  })

  test('rejects card id out of range', () => {
    const result = CardMoveIntentSchema.safeParse({
      type: 'card:move',
      cardId: 52,
      x: 100,
      y: 200,
    })
    expect(result.success).toBe(false)
  })

  test('rejects negative card id', () => {
    const result = CardMoveIntentSchema.safeParse({
      type: 'card:move',
      cardId: -1,
      x: 100,
      y: 200,
    })
    expect(result.success).toBe(false)
  })
})

describe('StackCreateSchema', () => {
  test('accepts valid stack creation', () => {
    const result = StackCreateSchema.safeParse({
      type: 'stack:create',
      cardIds: [0, 1],
      anchorX: 100,
      anchorY: 200,
    })
    expect(result.success).toBe(true)
  })

  test('rejects stack with single card', () => {
    const result = StackCreateSchema.safeParse({
      type: 'stack:create',
      cardIds: [0],
      anchorX: 100,
      anchorY: 200,
    })
    expect(result.success).toBe(false)
  })

  test('rejects card ids out of range', () => {
    const result = StackCreateSchema.safeParse({
      type: 'stack:create',
      cardIds: [0, 52],
      anchorX: 100,
      anchorY: 200,
    })
    expect(result.success).toBe(false)
  })
})

describe('ZoneCreateSchema', () => {
  test('accepts valid zone creation', () => {
    const result = ZoneCreateSchema.safeParse({
      type: 'zone:create',
      x: 100,
      y: 200,
      width: 300,
      height: 200,
      label: 'Discard Pile',
      faceUp: true,
    })
    expect(result.success).toBe(true)
  })

  test('rejects zero width', () => {
    const result = ZoneCreateSchema.safeParse({
      type: 'zone:create',
      x: 100,
      y: 200,
      width: 0,
      height: 200,
      label: 'Zone',
      faceUp: true,
    })
    expect(result.success).toBe(false)
  })

  test('rejects negative height', () => {
    const result = ZoneCreateSchema.safeParse({
      type: 'zone:create',
      x: 100,
      y: 200,
      width: 300,
      height: -50,
      label: 'Zone',
      faceUp: true,
    })
    expect(result.success).toBe(false)
  })

  test('rejects too long label', () => {
    const result = ZoneCreateSchema.safeParse({
      type: 'zone:create',
      x: 100,
      y: 200,
      width: 300,
      height: 200,
      label: 'A'.repeat(33),
      faceUp: true,
    })
    expect(result.success).toBe(false)
  })
})

describe('ZoneUpdateSchema', () => {
  test('accepts valid zone update', () => {
    const result = ZoneUpdateSchema.safeParse({
      type: 'zone:update',
      zoneId: 1,
      updates: {
        label: 'New Label',
        locked: true,
      },
    })
    expect(result.success).toBe(true)
  })

  test('accepts all update fields', () => {
    const result = ZoneUpdateSchema.safeParse({
      type: 'zone:update',
      zoneId: 1,
      updates: {
        x: 50,
        y: 60,
        width: 200,
        height: 150,
        label: 'Updated',
        faceUp: false,
        locked: true,
        visibility: 'owner',
        ownerId: 'player1',
        layout: 'fan',
        cardSettings: {
          cardScale: 0.8,
          cardSpacing: 0.5,
          randomOffset: 10,
          randomRotation: 5,
        },
      },
    })
    expect(result.success).toBe(true)
  })

  test('rejects invalid visibility', () => {
    const result = ZoneUpdateSchema.safeParse({
      type: 'zone:update',
      zoneId: 1,
      updates: {
        visibility: 'secret',
      },
    })
    expect(result.success).toBe(false)
  })

  test('rejects card scale out of range', () => {
    const result = ZoneUpdateSchema.safeParse({
      type: 'zone:update',
      zoneId: 1,
      updates: {
        cardSettings: {
          cardScale: 2.0, // max is 1.5
          cardSpacing: 0.5,
        },
      },
    })
    expect(result.success).toBe(false)
  })
})

describe('HandAddSchema', () => {
  test('accepts valid hand add', () => {
    const result = HandAddSchema.safeParse({
      type: 'hand:add',
      cardId: 25,
    })
    expect(result.success).toBe(true)
  })

  test('rejects card id out of range', () => {
    const result = HandAddSchema.safeParse({
      type: 'hand:add',
      cardId: 100,
    })
    expect(result.success).toBe(false)
  })
})

describe('HandRemoveSchema', () => {
  test('accepts valid hand remove', () => {
    const result = HandRemoveSchema.safeParse({
      type: 'hand:remove',
      cardId: 10,
      x: 300,
      y: 400,
      faceUp: true,
    })
    expect(result.success).toBe(true)
  })

  test('requires all fields', () => {
    const result = HandRemoveSchema.safeParse({
      type: 'hand:remove',
      cardId: 10,
      x: 300,
      // missing y and faceUp
    })
    expect(result.success).toBe(false)
  })
})

describe('ChatSendSchema', () => {
  test('accepts valid chat message', () => {
    const result = ChatSendSchema.safeParse({
      type: 'chat:send',
      message: 'Hello, world!',
    })
    expect(result.success).toBe(true)
  })

  test('rejects empty message', () => {
    const result = ChatSendSchema.safeParse({
      type: 'chat:send',
      message: '',
    })
    expect(result.success).toBe(false)
  })

  test('rejects too long message', () => {
    const result = ChatSendSchema.safeParse({
      type: 'chat:send',
      message: 'A'.repeat(501),
    })
    expect(result.success).toBe(false)
  })

  test('trims whitespace', () => {
    const result = ChatSendSchema.safeParse({
      type: 'chat:send',
      message: '  Hello  ',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.message).toBe('Hello')
    }
  })
})

describe('ClientMessageSchema (discriminated union)', () => {
  test('parses room:create message', () => {
    const result = ClientMessageSchema.safeParse({
      type: 'room:create',
      playerName: 'Player',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe('room:create')
    }
  })

  test('parses card:move message', () => {
    const result = ClientMessageSchema.safeParse({
      type: 'card:move',
      cardId: 5,
      x: 100,
      y: 200,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe('card:move')
    }
  })

  test('parses chat:send message', () => {
    const result = ClientMessageSchema.safeParse({
      type: 'chat:send',
      message: 'Hello',
    })
    expect(result.success).toBe(true)
  })

  test('rejects unknown message type', () => {
    const result = ClientMessageSchema.safeParse({
      type: 'unknown:action',
      data: 'test',
    })
    expect(result.success).toBe(false)
  })

  test('rejects message with wrong fields for type', () => {
    const result = ClientMessageSchema.safeParse({
      type: 'card:move',
      // Missing required fields
      cardId: 5,
    })
    expect(result.success).toBe(false)
  })
})
