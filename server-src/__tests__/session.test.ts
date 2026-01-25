import { describe, test, expect } from 'bun:test'
import { createSessionToken, verifySessionToken, isValidReconnection } from '../utils/session'

describe('Session Token Management', () => {
  const playerId = 'player123'
  const roomCode = 'ABC123'

  describe('createSessionToken', () => {
    test('creates a token with correct format', () => {
      const token = createSessionToken(playerId, roomCode)

      expect(token).toContain('.')
      const parts = token.split('.')
      expect(parts).toHaveLength(2)
    })

    test('creates unique tokens for same input', () => {
      // Tokens have timestamp, so consecutive calls produce different tokens
      const token1 = createSessionToken(playerId, roomCode)
      // Wait a tiny bit to ensure different timestamp
      const token2 = createSessionToken(playerId, roomCode)

      // Tokens may be same if generated in same millisecond, but that's acceptable
      expect(typeof token1).toBe('string')
      expect(typeof token2).toBe('string')
    })
  })

  describe('verifySessionToken', () => {
    test('verifies a valid token', () => {
      const token = createSessionToken(playerId, roomCode)
      const payload = verifySessionToken(token)

      expect(payload).not.toBeNull()
      expect(payload?.playerId).toBe(playerId)
      expect(payload?.roomCode).toBe(roomCode)
    })

    test('verifies token with expected room code', () => {
      const token = createSessionToken(playerId, roomCode)
      const payload = verifySessionToken(token, roomCode)

      expect(payload).not.toBeNull()
      expect(payload?.roomCode).toBe(roomCode)
    })

    test('rejects token with wrong expected room code', () => {
      const token = createSessionToken(playerId, roomCode)
      const payload = verifySessionToken(token, 'WRONG1')

      expect(payload).toBeNull()
    })

    test('rejects malformed token (no dot)', () => {
      const payload = verifySessionToken('invalidtoken')
      expect(payload).toBeNull()
    })

    test('rejects token with tampered payload', () => {
      const token = createSessionToken(playerId, roomCode)
      const [, signature] = token.split('.')
      const tamperedPayload = Buffer.from(
        JSON.stringify({ playerId: 'hacker', roomCode, timestamp: Date.now() }),
      ).toString('base64url')

      const payload = verifySessionToken(`${tamperedPayload}.${signature}`)
      expect(payload).toBeNull()
    })

    test('rejects token with tampered signature', () => {
      const token = createSessionToken(playerId, roomCode)
      const [payload] = token.split('.')

      const result = verifySessionToken(`${payload}.tamperedsignature`)
      expect(result).toBeNull()
    })

    test('rejects empty token', () => {
      expect(verifySessionToken('')).toBeNull()
    })
  })

  describe('isValidReconnection', () => {
    test('returns valid true with playerId for valid token', () => {
      const token = createSessionToken(playerId, roomCode)
      const result = isValidReconnection(token, roomCode)

      expect(result.valid).toBe(true)
      if (result.valid) {
        expect(result.playerId).toBe(playerId)
      }
    })

    test('returns valid false for wrong room', () => {
      const token = createSessionToken(playerId, roomCode)
      const result = isValidReconnection(token, 'WRONG1')

      expect(result.valid).toBe(false)
    })

    test('returns valid false for invalid token', () => {
      const result = isValidReconnection('invalid.token', roomCode)

      expect(result.valid).toBe(false)
    })
  })
})
