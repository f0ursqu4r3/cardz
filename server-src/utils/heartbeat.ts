/**
 * Heartbeat manager for WebSocket connection health monitoring
 *
 * Sends periodic ping messages to clients and tracks pong responses.
 * Clients that don't respond within the timeout are considered dead
 * and their connection should be closed.
 */

import type { GenericWebSocket } from './broadcast'
import type { Ping } from '../../shared/types'

// Configuration
const HEARTBEAT_INTERVAL_MS = 30_000 // Send ping every 30 seconds
const HEARTBEAT_TIMEOUT_MS = 10_000 // Wait 10 seconds for pong response

interface HeartbeatState {
  lastPing: number
  lastPong: number
  missedPongs: number
  intervalId: ReturnType<typeof setInterval> | null
}

export class HeartbeatManager {
  private clients = new Map<string, HeartbeatState>()
  private onClientTimeout: ((clientId: string) => void) | null = null

  /**
   * Set callback for when a client times out (doesn't respond to pings)
   */
  setTimeoutCallback(callback: (clientId: string) => void): void {
    this.onClientTimeout = callback
  }

  /**
   * Start heartbeat monitoring for a client
   */
  startHeartbeat(clientId: string, ws: GenericWebSocket): void {
    // Clean up any existing heartbeat for this client
    this.stopHeartbeat(clientId)

    const state: HeartbeatState = {
      lastPing: 0,
      lastPong: Date.now(),
      missedPongs: 0,
      intervalId: null,
    }

    state.intervalId = setInterval(() => {
      this.sendPing(clientId, ws, state)
    }, HEARTBEAT_INTERVAL_MS)

    this.clients.set(clientId, state)
  }

  /**
   * Stop heartbeat monitoring for a client
   */
  stopHeartbeat(clientId: string): void {
    const state = this.clients.get(clientId)
    if (state) {
      if (state.intervalId) {
        clearInterval(state.intervalId)
      }
      this.clients.delete(clientId)
    }
  }

  /**
   * Record a pong response from a client
   */
  receivePong(clientId: string, timestamp: number): void {
    const state = this.clients.get(clientId)
    if (state) {
      state.lastPong = Date.now()
      state.missedPongs = 0
    }
  }

  /**
   * Send a ping message and check for timeout
   */
  private sendPing(clientId: string, ws: GenericWebSocket, state: HeartbeatState): void {
    const now = Date.now()

    // Check if the last ping was not responded to
    if (state.lastPing > 0) {
      const timeSinceLastPong = now - state.lastPong
      if (timeSinceLastPong > HEARTBEAT_TIMEOUT_MS) {
        state.missedPongs++

        // After 2 missed pongs, consider the connection dead
        if (state.missedPongs >= 2) {
          console.log(
            `[heartbeat] Client ${clientId} timed out (missed ${state.missedPongs} pongs)`,
          )
          this.stopHeartbeat(clientId)
          this.onClientTimeout?.(clientId)
          return
        }
      }
    }

    // Send ping
    state.lastPing = now
    const pingMessage: Ping = {
      type: 'ping',
      timestamp: now,
    }

    try {
      ws.send(JSON.stringify(pingMessage))
    } catch (err) {
      // Connection likely already closed
      console.log(`[heartbeat] Failed to send ping to ${clientId}:`, err)
      this.stopHeartbeat(clientId)
    }
  }

  /**
   * Get heartbeat stats for a client (for debugging)
   */
  getStats(clientId: string): { lastPing: number; lastPong: number; missedPongs: number } | null {
    const state = this.clients.get(clientId)
    if (!state) return null
    return {
      lastPing: state.lastPing,
      lastPong: state.lastPong,
      missedPongs: state.missedPongs,
    }
  }

  /**
   * Clean up all heartbeats
   */
  cleanup(): void {
    for (const [clientId] of this.clients) {
      this.stopHeartbeat(clientId)
    }
  }
}

// Singleton instance
export const heartbeatManager = new HeartbeatManager()
