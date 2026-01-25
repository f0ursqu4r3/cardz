/**
 * Token bucket rate limiter for WebSocket messages
 * Limits the number of messages a client can send per time window
 */

interface TokenBucket {
  tokens: number
  lastRefill: number
}

export interface RateLimiterConfig {
  /** Maximum number of tokens (messages) in the bucket */
  maxTokens: number
  /** Number of tokens to refill per second */
  refillRate: number
  /** Cost per message (default: 1) */
  messageCost?: number
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxTokens: 100, // Allow burst of 100 messages
  refillRate: 50, // Refill 50 tokens per second
  messageCost: 1,
}

export class RateLimiter {
  private buckets = new Map<string, TokenBucket>()
  private config: Required<RateLimiterConfig>
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      messageCost: config.messageCost ?? DEFAULT_CONFIG.messageCost!,
    }

    // Clean up stale buckets every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000)
  }

  /**
   * Check if a message from the given client ID should be allowed
   * Returns true if allowed, false if rate limited
   */
  allowMessage(clientId: string, cost: number = this.config.messageCost): boolean {
    const now = Date.now()
    let bucket = this.buckets.get(clientId)

    if (!bucket) {
      // Initialize new bucket with full tokens
      bucket = {
        tokens: this.config.maxTokens,
        lastRefill: now,
      }
      this.buckets.set(clientId, bucket)
    }

    // Refill tokens based on time elapsed
    const elapsed = (now - bucket.lastRefill) / 1000 // Convert to seconds
    const tokensToAdd = elapsed * this.config.refillRate
    bucket.tokens = Math.min(this.config.maxTokens, bucket.tokens + tokensToAdd)
    bucket.lastRefill = now

    // Check if we have enough tokens
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost
      return true
    }

    return false
  }

  /**
   * Remove rate limit bucket for a client (e.g., on disconnect)
   */
  removeClient(clientId: string): void {
    this.buckets.delete(clientId)
  }

  /**
   * Get current token count for a client (for debugging/monitoring)
   */
  getTokens(clientId: string): number {
    const bucket = this.buckets.get(clientId)
    if (!bucket) return this.config.maxTokens

    // Calculate current tokens including refill
    const now = Date.now()
    const elapsed = (now - bucket.lastRefill) / 1000
    const tokensToAdd = elapsed * this.config.refillRate
    return Math.min(this.config.maxTokens, bucket.tokens + tokensToAdd)
  }

  /**
   * Clean up buckets for clients that haven't sent messages in a while
   */
  private cleanup(): void {
    const now = Date.now()
    const staleThreshold = 5 * 60 * 1000 // 5 minutes

    for (const [clientId, bucket] of this.buckets) {
      if (now - bucket.lastRefill > staleThreshold) {
        this.buckets.delete(clientId)
      }
    }
  }

  /**
   * Stop the cleanup interval
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.buckets.clear()
  }
}
