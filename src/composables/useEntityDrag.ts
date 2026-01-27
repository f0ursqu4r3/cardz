import { ref, type Ref } from 'vue'
import type { useViewport } from './useViewport'
import type { ClientMessage, Player } from '../../shared/types'
import { CURSOR_THROTTLE_MS } from '@/types'

/**
 * Entity interface - any draggable entity with position and lock state
 */
export interface DraggableEntity {
  id: number
  x: number
  y: number
  lockedBy: string | null
}

/**
 * Configuration for the entity drag composable
 */
export interface EntityDragConfig<T extends DraggableEntity> {
  /** Entity type name for message types (e.g., 'counter', 'token', 'die', 'timer') */
  entityType: 'counter' | 'token' | 'die' | 'timer'
  /** Function to get an entity by ID */
  getEntityById: (id: number) => T | undefined
  /** Current player ID */
  playerId: Ref<string | null>
  /** Players list for getting colors */
  players: Ref<Player[]>
  /** Viewport for coordinate conversion */
  viewport: ReturnType<typeof useViewport>
  /** Function to send WebSocket messages */
  sendMessage: (msg: ClientMessage) => void
  /** Function to track user activity */
  trackActivity: () => void
  /** Function to set cursor type */
  setCursor: (type: 'default' | 'grab' | 'grabbing') => void
  /** Optional callback to broadcast cursor position during drag */
  onCursorMove?: (worldX: number, worldY: number) => void
  /** Optional callback when shake gesture is detected (for dice rolling) */
  onShake?: (entityId: number) => void
}

// Shake detection constants (using screen coordinates for consistency)
const SHAKE_WINDOW_MS = 400 // Time window to detect shakes
const SHAKE_MIN_REVERSALS = 2 // Minimum direction changes to trigger shake
const SHAKE_MIN_DISTANCE = 20 // Minimum screen pixels per movement to count

/**
 * Generic composable for handling drag operations on game entities (counters, tokens, dice, timers).
 * All these entity types share the same drag pattern:
 * - Lock on pointer down
 * - Update position on pointer move (throttled)
 * - Unlock on pointer up
 */
export function useEntityDrag<T extends DraggableEntity>(config: EntityDragConfig<T>) {
  const {
    entityType,
    getEntityById,
    playerId,
    players,
    viewport,
    sendMessage,
    trackActivity,
    setCursor,
    onCursorMove,
    onShake,
  } = config

  // Drag state
  const draggingId = ref<number | null>(null)
  const dragOffset = ref({ x: 0, y: 0 })
  let lastPositionUpdate = 0

  // Shake detection state
  interface PositionSample {
    x: number
    y: number
    time: number
  }
  let positionHistory: PositionSample[] = []
  let hasShaken = false // Prevent multiple shakes per drag

  /**
   * Get a player's color by their ID
   */
  const getPlayerColor = (pid: string | null): string | null => {
    if (!pid) return null
    const player = players.value.find((p) => p.id === pid)
    return player?.color || null
  }

  /**
   * Detect shake gesture from position history (uses screen coordinates)
   * Returns true if rapid direction reversals are detected
   */
  const detectShake = (screenX: number, screenY: number): boolean => {
    if (!onShake || hasShaken) return false

    const now = Date.now()

    // Add new position sample (screen coordinates)
    positionHistory.push({ x: screenX, y: screenY, time: now })

    // Remove old samples outside the time window
    positionHistory = positionHistory.filter((p) => now - p.time < SHAKE_WINDOW_MS)

    // Need at least 4 samples to detect direction changes
    if (positionHistory.length < 4) return false

    // Count direction reversals by looking at velocity sign changes
    let reversals = 0
    let lastVx = 0
    let lastVy = 0
    let hadSignificantMove = false

    for (let i = 1; i < positionHistory.length; i++) {
      const prev = positionHistory[i - 1]
      const curr = positionHistory[i]
      if (!prev || !curr) continue

      // Calculate velocity
      const vx = curr.x - prev.x
      const vy = curr.y - prev.y

      // Check if movement is significant enough
      const dist = Math.sqrt(vx * vx + vy * vy)
      if (dist < SHAKE_MIN_DISTANCE) continue

      // Check for direction reversal (dot product negative means opposite direction)
      if (hadSignificantMove) {
        const dot = lastVx * vx + lastVy * vy
        if (dot < 0) {
          reversals++
        }
      }

      lastVx = vx
      lastVy = vy
      hadSignificantMove = true
    }

    return reversals >= SHAKE_MIN_REVERSALS
  }

  /**
   * Handle pointer down - start dragging
   */
  const onPointerDown = (event: PointerEvent, entityId: number) => {
    const entity = getEntityById(entityId)
    if (!entity) return

    // Don't start drag if locked by another player
    if (entity.lockedBy && entity.lockedBy !== playerId.value) return

    event.stopPropagation()
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)

    // Calculate offset from entity origin to pointer
    const worldPos = viewport.screenToWorld(event.clientX, event.clientY)
    dragOffset.value = {
      x: worldPos.x - entity.x,
      y: worldPos.y - entity.y,
    }

    draggingId.value = entityId
    setCursor('grabbing')

    // Reset shake detection state
    positionHistory = []
    hasShaken = false

    // Lock the entity
    trackActivity()
    sendMessage({
      type: `${entityType}:lock` as ClientMessage['type'],
      [`${entityType}Id`]: entityId,
    } as ClientMessage)
  }

  /**
   * Handle pointer move - update position while dragging
   */
  const onPointerMove = (event: PointerEvent) => {
    if (draggingId.value === null) return

    const entity = getEntityById(draggingId.value)
    if (!entity) return

    const worldPos = viewport.screenToWorld(event.clientX, event.clientY)
    const newX = worldPos.x - dragOffset.value.x
    const newY = worldPos.y - dragOffset.value.y

    // Update local position immediately for smooth dragging
    entity.x = newX
    entity.y = newY

    // Check for shake gesture (for dice rolling) - use screen coordinates
    if (onShake && detectShake(event.clientX, event.clientY)) {
      hasShaken = true
      onShake(draggingId.value)
    }

    // Broadcast cursor position during drag (for remote player cursors)
    onCursorMove?.(worldPos.x, worldPos.y)

    // Throttle server updates to avoid rate limiting
    const now = Date.now()
    if (now - lastPositionUpdate < CURSOR_THROTTLE_MS) return
    lastPositionUpdate = now

    trackActivity()
    sendMessage({
      type: `${entityType}:update` as ClientMessage['type'],
      [`${entityType}Id`]: draggingId.value,
      updates: { x: newX, y: newY },
    } as ClientMessage)
  }

  /**
   * Handle pointer up - finish dragging
   */
  const onPointerUp = (event: PointerEvent) => {
    if (draggingId.value === null) return
    ;(event.target as HTMLElement).releasePointerCapture(event.pointerId)

    const entity = getEntityById(draggingId.value)
    const entityId = draggingId.value

    // Send final position update
    if (entity) {
      sendMessage({
        type: `${entityType}:update` as ClientMessage['type'],
        [`${entityType}Id`]: entityId,
        updates: { x: entity.x, y: entity.y },
      } as ClientMessage)
    }

    // Unlock the entity
    sendMessage({
      type: `${entityType}:unlock` as ClientMessage['type'],
      [`${entityType}Id`]: entityId,
    } as ClientMessage)

    draggingId.value = null
    setCursor('grab')
  }

  /**
   * Check if a specific entity is being dragged
   */
  const isDragging = (entityId: number): boolean => {
    return draggingId.value === entityId
  }

  /**
   * Check if an entity is locked by another player
   */
  const isLockedByOther = (entity: { lockedBy: string | null }): boolean => {
    return entity.lockedBy !== null && entity.lockedBy !== playerId.value
  }

  /**
   * Get the lock color for an entity (color of the player who locked it)
   */
  const getLockColor = (entity: { lockedBy: string | null }): string | undefined => {
    if (!entity.lockedBy || entity.lockedBy === playerId.value) return undefined
    return getPlayerColor(entity.lockedBy) || '#888'
  }

  return {
    draggingId,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    isDragging,
    isLockedByOther,
    getLockColor,
  }
}
