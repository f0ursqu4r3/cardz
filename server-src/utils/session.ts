/**
 * Session token management with HMAC-signed tokens
 *
 * Session tokens are cryptographically signed to prevent:
 * - Session hijacking (attacker can't forge valid tokens)
 * - Session fixation (tokens are bound to specific player/room)
 *
 * Token format: base64(playerId:roomCode:timestamp):signature
 */

import { createHmac } from 'crypto'
import { config } from '../config'

// Token validity period (24 hours in milliseconds)
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

interface SessionPayload {
  playerId: string
  roomCode: string
  timestamp: number
}

/**
 * Create an HMAC signature for the payload
 */
function createSignature(payload: string): string {
  const hmac = createHmac('sha256', config.sessionSecret)
  hmac.update(payload)
  return hmac.digest('base64url')
}

/**
 * Verify an HMAC signature
 */
function verifySignature(payload: string, signature: string): boolean {
  const expectedSignature = createSignature(payload)
  // Use timing-safe comparison to prevent timing attacks
  if (signature.length !== expectedSignature.length) {
    return false
  }
  let result = 0
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i)
  }
  return result === 0
}

/**
 * Create a signed session token for a player
 */
export function createSessionToken(playerId: string, roomCode: string): string {
  const payload: SessionPayload = {
    playerId,
    roomCode,
    timestamp: Date.now(),
  }

  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createSignature(payloadStr)

  return `${payloadStr}.${signature}`
}

/**
 * Verify and decode a session token
 * Returns the payload if valid, null if invalid or expired
 */
export function verifySessionToken(
  token: string,
  expectedRoomCode?: string,
): SessionPayload | null {
  try {
    const [payloadStr, signature] = token.split('.')
    if (!payloadStr || !signature) {
      return null
    }

    // Verify signature
    if (!verifySignature(payloadStr, signature)) {
      console.log('[session] Invalid signature')
      return null
    }

    // Decode payload
    const payload: SessionPayload = JSON.parse(
      Buffer.from(payloadStr, 'base64url').toString('utf-8'),
    )

    // Check expiration
    if (Date.now() - payload.timestamp > TOKEN_TTL_MS) {
      console.log('[session] Token expired')
      return null
    }

    // Optionally verify room code matches
    if (expectedRoomCode && payload.roomCode !== expectedRoomCode) {
      console.log('[session] Room code mismatch')
      return null
    }

    return payload
  } catch (err) {
    console.log('[session] Token verification failed:', err)
    return null
  }
}

/**
 * Check if a session token is valid for reconnecting to a room
 */
export function isValidReconnection(
  token: string,
  roomCode: string,
): { valid: true; playerId: string } | { valid: false } {
  const payload = verifySessionToken(token, roomCode)
  if (!payload) {
    return { valid: false }
  }
  return { valid: true, playerId: payload.playerId }
}
