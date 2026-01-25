import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { RateLimiter } from '../utils/rate-limit'

describe('RateLimiter', () => {
  let limiter: RateLimiter

  afterEach(() => {
    limiter?.dispose()
  })

  describe('allowMessage', () => {
    beforeEach(() => {
      limiter = new RateLimiter({
        maxTokens: 10,
        refillRate: 5, // 5 tokens per second
        messageCost: 1,
      })
    })

    test('allows messages within rate limit', () => {
      const clientId = 'client1'

      // Should allow 10 messages (maxTokens)
      for (let i = 0; i < 10; i++) {
        expect(limiter.allowMessage(clientId)).toBe(true)
      }
    })

    test('blocks messages when rate limit exceeded', () => {
      const clientId = 'client1'

      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        limiter.allowMessage(clientId)
      }

      // 11th message should be blocked
      expect(limiter.allowMessage(clientId)).toBe(false)
    })

    test('allows different clients independently', () => {
      // Exhaust client1's tokens
      for (let i = 0; i < 10; i++) {
        limiter.allowMessage('client1')
      }
      expect(limiter.allowMessage('client1')).toBe(false)

      // client2 should still have full tokens
      expect(limiter.allowMessage('client2')).toBe(true)
    })

    test('supports custom message cost', () => {
      const clientId = 'client1'

      // Send message with cost of 5 (uses half the tokens)
      expect(limiter.allowMessage(clientId, 5)).toBe(true)
      expect(limiter.allowMessage(clientId, 5)).toBe(true)

      // Third message with cost 5 should fail (only have 0 tokens left)
      expect(limiter.allowMessage(clientId, 5)).toBe(false)
    })
  })

  describe('token refill', () => {
    test('refills tokens over time', async () => {
      limiter = new RateLimiter({
        maxTokens: 10,
        refillRate: 100, // 100 tokens per second for faster testing
        messageCost: 1,
      })

      const clientId = 'client1'

      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        limiter.allowMessage(clientId)
      }
      expect(limiter.allowMessage(clientId)).toBe(false)

      // Wait 100ms (should refill ~10 tokens at 100/sec)
      await Bun.sleep(100)

      // Should have tokens again
      expect(limiter.allowMessage(clientId)).toBe(true)
    })
  })

  describe('getTokens', () => {
    beforeEach(() => {
      limiter = new RateLimiter({
        maxTokens: 10,
        refillRate: 5,
        messageCost: 1,
      })
    })

    test('returns max tokens for new client', () => {
      expect(limiter.getTokens('newclient')).toBe(10)
    })

    test('returns remaining tokens after messages', () => {
      const clientId = 'client1'

      limiter.allowMessage(clientId)
      limiter.allowMessage(clientId)
      limiter.allowMessage(clientId)

      // Should have approximately 7 tokens (minus some for time elapsed)
      const tokens = limiter.getTokens(clientId)
      expect(tokens).toBeGreaterThanOrEqual(7)
      expect(tokens).toBeLessThanOrEqual(10)
    })
  })

  describe('removeClient', () => {
    beforeEach(() => {
      limiter = new RateLimiter({
        maxTokens: 10,
        refillRate: 5,
        messageCost: 1,
      })
    })

    test('removes client bucket', () => {
      const clientId = 'client1'

      // Use some tokens
      for (let i = 0; i < 5; i++) {
        limiter.allowMessage(clientId)
      }

      // Remove client
      limiter.removeClient(clientId)

      // New bucket should have full tokens
      expect(limiter.getTokens(clientId)).toBe(10)
    })
  })

  describe('dispose', () => {
    test('clears all buckets', () => {
      limiter = new RateLimiter({
        maxTokens: 10,
        refillRate: 5,
        messageCost: 1,
      })

      // Create some buckets
      limiter.allowMessage('client1')
      limiter.allowMessage('client2')

      limiter.dispose()

      // After dispose, new messages should get fresh buckets
      // (getTokens returns maxTokens for unknown clients)
      expect(limiter.getTokens('client1')).toBe(10)
      expect(limiter.getTokens('client2')).toBe(10)
    })
  })

  describe('default config', () => {
    test('uses sensible defaults', () => {
      limiter = new RateLimiter()

      // Should allow a reasonable burst
      let allowed = 0
      for (let i = 0; i < 150; i++) {
        if (limiter.allowMessage('client1')) {
          allowed++
        }
      }

      // Default maxTokens is 100
      expect(allowed).toBe(100)
    })
  })
})
