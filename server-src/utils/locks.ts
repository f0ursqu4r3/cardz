import { LOCK_TTL_MS } from '../../shared/types'

interface Lock {
  playerId: string
  expiresAt: number
}

/**
 * Manages locks on cards and stacks with automatic TTL expiration
 */
export class LockManager {
  private cardLocks = new Map<number, Lock>()
  private stackLocks = new Map<number, Lock>()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    // Periodically clean up expired locks
    this.cleanupInterval = setInterval(() => this.cleanup(), 5000)
  }

  /**
   * Try to acquire a lock on a card
   */
  lockCard(cardId: number, playerId: string): boolean {
    const existing = this.cardLocks.get(cardId)
    const now = Date.now()

    // Check if already locked by another player (and not expired)
    if (existing && existing.playerId !== playerId && existing.expiresAt > now) {
      return false
    }

    this.cardLocks.set(cardId, {
      playerId,
      expiresAt: now + LOCK_TTL_MS,
    })
    return true
  }

  /**
   * Release a lock on a card
   */
  unlockCard(cardId: number, playerId: string): boolean {
    const existing = this.cardLocks.get(cardId)
    if (!existing || existing.playerId !== playerId) {
      return false
    }
    this.cardLocks.delete(cardId)
    return true
  }

  /**
   * Check if a card is locked
   */
  isCardLocked(cardId: number): string | null {
    const lock = this.cardLocks.get(cardId)
    if (!lock || lock.expiresAt <= Date.now()) {
      this.cardLocks.delete(cardId)
      return null
    }
    return lock.playerId
  }

  /**
   * Try to acquire a lock on a stack
   */
  lockStack(stackId: number, playerId: string): boolean {
    const existing = this.stackLocks.get(stackId)
    const now = Date.now()

    if (existing && existing.playerId !== playerId && existing.expiresAt > now) {
      return false
    }

    this.stackLocks.set(stackId, {
      playerId,
      expiresAt: now + LOCK_TTL_MS,
    })
    return true
  }

  /**
   * Release a lock on a stack
   */
  unlockStack(stackId: number, playerId: string): boolean {
    const existing = this.stackLocks.get(stackId)
    if (!existing || existing.playerId !== playerId) {
      return false
    }
    this.stackLocks.delete(stackId)
    return true
  }

  /**
   * Check if a stack is locked
   */
  isStackLocked(stackId: number): string | null {
    const lock = this.stackLocks.get(stackId)
    if (!lock || lock.expiresAt <= Date.now()) {
      this.stackLocks.delete(stackId)
      return null
    }
    return lock.playerId
  }

  /**
   * Release all locks held by a player (e.g., on disconnect)
   */
  releaseAllForPlayer(playerId: string): { cards: number[]; stacks: number[] } {
    const released = { cards: [] as number[], stacks: [] as number[] }

    for (const [cardId, lock] of this.cardLocks) {
      if (lock.playerId === playerId) {
        this.cardLocks.delete(cardId)
        released.cards.push(cardId)
      }
    }

    for (const [stackId, lock] of this.stackLocks) {
      if (lock.playerId === playerId) {
        this.stackLocks.delete(stackId)
        released.stacks.push(stackId)
      }
    }

    return released
  }

  /**
   * Release all locks (e.g., on table reset)
   */
  releaseAll(): void {
    this.cardLocks.clear()
    this.stackLocks.clear()
  }

  /**
   * Refresh the expiration time for a lock
   */
  refreshCardLock(cardId: number, playerId: string): boolean {
    const lock = this.cardLocks.get(cardId)
    if (!lock || lock.playerId !== playerId) {
      return false
    }
    lock.expiresAt = Date.now() + LOCK_TTL_MS
    return true
  }

  refreshStackLock(stackId: number, playerId: string): boolean {
    const lock = this.stackLocks.get(stackId)
    if (!lock || lock.playerId !== playerId) {
      return false
    }
    lock.expiresAt = Date.now() + LOCK_TTL_MS
    return true
  }

  /**
   * Clean up expired locks
   */
  private cleanup(): void {
    const now = Date.now()

    for (const [cardId, lock] of this.cardLocks) {
      if (lock.expiresAt <= now) {
        this.cardLocks.delete(cardId)
      }
    }

    for (const [stackId, lock] of this.stackLocks) {
      if (lock.expiresAt <= now) {
        this.stackLocks.delete(stackId)
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
  }
}
