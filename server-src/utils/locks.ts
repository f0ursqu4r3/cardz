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
  private counterLocks = new Map<number, Lock>()
  private tokenLocks = new Map<number, Lock>()
  private dieLocks = new Map<number, Lock>()
  private timerLocks = new Map<number, Lock>()
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
   * Try to acquire a lock on a counter
   */
  lockCounter(counterId: number, playerId: string): boolean {
    const existing = this.counterLocks.get(counterId)
    const now = Date.now()

    if (existing && existing.playerId !== playerId && existing.expiresAt > now) {
      return false
    }

    this.counterLocks.set(counterId, {
      playerId,
      expiresAt: now + LOCK_TTL_MS,
    })
    return true
  }

  /**
   * Release a lock on a counter
   */
  unlockCounter(counterId: number, playerId: string): boolean {
    const existing = this.counterLocks.get(counterId)
    if (!existing || existing.playerId !== playerId) {
      return false
    }
    this.counterLocks.delete(counterId)
    return true
  }

  /**
   * Check if a counter is locked
   */
  isCounterLocked(counterId: number): string | null {
    const lock = this.counterLocks.get(counterId)
    if (!lock || lock.expiresAt <= Date.now()) {
      this.counterLocks.delete(counterId)
      return null
    }
    return lock.playerId
  }

  /**
   * Refresh the expiration time for a counter lock
   */
  refreshCounterLock(counterId: number, playerId: string): boolean {
    const lock = this.counterLocks.get(counterId)
    if (!lock || lock.playerId !== playerId) {
      return false
    }
    lock.expiresAt = Date.now() + LOCK_TTL_MS
    return true
  }

  /**
   * Try to acquire a lock on a token
   */
  lockToken(tokenId: number, playerId: string): boolean {
    const existing = this.tokenLocks.get(tokenId)
    const now = Date.now()

    if (existing && existing.playerId !== playerId && existing.expiresAt > now) {
      return false
    }

    this.tokenLocks.set(tokenId, {
      playerId,
      expiresAt: now + LOCK_TTL_MS,
    })
    return true
  }

  /**
   * Release a lock on a token
   */
  unlockToken(tokenId: number, playerId: string): boolean {
    const existing = this.tokenLocks.get(tokenId)
    if (!existing || existing.playerId !== playerId) {
      return false
    }
    this.tokenLocks.delete(tokenId)
    return true
  }

  /**
   * Check if a token is locked
   */
  isTokenLocked(tokenId: number): string | null {
    const lock = this.tokenLocks.get(tokenId)
    if (!lock || lock.expiresAt <= Date.now()) {
      this.tokenLocks.delete(tokenId)
      return null
    }
    return lock.playerId
  }

  /**
   * Refresh the expiration time for a token lock
   */
  refreshTokenLock(tokenId: number, playerId: string): boolean {
    const lock = this.tokenLocks.get(tokenId)
    if (!lock || lock.playerId !== playerId) {
      return false
    }
    lock.expiresAt = Date.now() + LOCK_TTL_MS
    return true
  }

  /**
   * Try to acquire a lock on a die
   */
  lockDie(dieId: number, playerId: string): boolean {
    const existing = this.dieLocks.get(dieId)
    const now = Date.now()

    if (existing && existing.playerId !== playerId && existing.expiresAt > now) {
      return false
    }

    this.dieLocks.set(dieId, {
      playerId,
      expiresAt: now + LOCK_TTL_MS,
    })
    return true
  }

  /**
   * Release a lock on a die
   */
  unlockDie(dieId: number, playerId: string): boolean {
    const existing = this.dieLocks.get(dieId)
    if (!existing || existing.playerId !== playerId) {
      return false
    }
    this.dieLocks.delete(dieId)
    return true
  }

  /**
   * Check if a die is locked
   */
  isDieLocked(dieId: number): string | null {
    const lock = this.dieLocks.get(dieId)
    if (!lock || lock.expiresAt <= Date.now()) {
      this.dieLocks.delete(dieId)
      return null
    }
    return lock.playerId
  }

  /**
   * Refresh the expiration time for a die lock
   */
  refreshDieLock(dieId: number, playerId: string): boolean {
    const lock = this.dieLocks.get(dieId)
    if (!lock || lock.playerId !== playerId) {
      return false
    }
    lock.expiresAt = Date.now() + LOCK_TTL_MS
    return true
  }

  /**
   * Try to acquire a lock on a timer
   */
  lockTimer(timerId: number, playerId: string): boolean {
    const existing = this.timerLocks.get(timerId)
    const now = Date.now()

    if (existing && existing.playerId !== playerId && existing.expiresAt > now) {
      return false
    }

    this.timerLocks.set(timerId, {
      playerId,
      expiresAt: now + LOCK_TTL_MS,
    })
    return true
  }

  /**
   * Release a lock on a timer
   */
  unlockTimer(timerId: number, playerId: string): boolean {
    const existing = this.timerLocks.get(timerId)
    if (!existing || existing.playerId !== playerId) {
      return false
    }
    this.timerLocks.delete(timerId)
    return true
  }

  /**
   * Check if a timer is locked
   */
  isTimerLocked(timerId: number): string | null {
    const lock = this.timerLocks.get(timerId)
    if (!lock || lock.expiresAt <= Date.now()) {
      this.timerLocks.delete(timerId)
      return null
    }
    return lock.playerId
  }

  /**
   * Refresh the expiration time for a timer lock
   */
  refreshTimerLock(timerId: number, playerId: string): boolean {
    const lock = this.timerLocks.get(timerId)
    if (!lock || lock.playerId !== playerId) {
      return false
    }
    lock.expiresAt = Date.now() + LOCK_TTL_MS
    return true
  }

  /**
   * Release all locks held by a player (e.g., on disconnect)
   */
  releaseAllForPlayer(playerId: string): { cards: number[]; stacks: number[]; counters: number[]; tokens: number[]; dice: number[]; timers: number[] } {
    const released = {
      cards: [] as number[],
      stacks: [] as number[],
      counters: [] as number[],
      tokens: [] as number[],
      dice: [] as number[],
      timers: [] as number[],
    }

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

    for (const [counterId, lock] of this.counterLocks) {
      if (lock.playerId === playerId) {
        this.counterLocks.delete(counterId)
        released.counters.push(counterId)
      }
    }

    for (const [tokenId, lock] of this.tokenLocks) {
      if (lock.playerId === playerId) {
        this.tokenLocks.delete(tokenId)
        released.tokens.push(tokenId)
      }
    }

    for (const [dieId, lock] of this.dieLocks) {
      if (lock.playerId === playerId) {
        this.dieLocks.delete(dieId)
        released.dice.push(dieId)
      }
    }

    for (const [timerId, lock] of this.timerLocks) {
      if (lock.playerId === playerId) {
        this.timerLocks.delete(timerId)
        released.timers.push(timerId)
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
    this.counterLocks.clear()
    this.tokenLocks.clear()
    this.dieLocks.clear()
    this.timerLocks.clear()
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

    for (const [counterId, lock] of this.counterLocks) {
      if (lock.expiresAt <= now) {
        this.counterLocks.delete(counterId)
      }
    }

    for (const [tokenId, lock] of this.tokenLocks) {
      if (lock.expiresAt <= now) {
        this.tokenLocks.delete(tokenId)
      }
    }

    for (const [dieId, lock] of this.dieLocks) {
      if (lock.expiresAt <= now) {
        this.dieLocks.delete(dieId)
      }
    }

    for (const [timerId, lock] of this.timerLocks) {
      if (lock.expiresAt <= now) {
        this.timerLocks.delete(timerId)
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
