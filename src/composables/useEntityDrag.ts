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
}

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
  } = config

  // Drag state
  const draggingId = ref<number | null>(null)
  const dragOffset = ref({ x: 0, y: 0 })
  let lastPositionUpdate = 0

  /**
   * Get a player's color by their ID
   */
  const getPlayerColor = (pid: string | null): string | null => {
    if (!pid) return null
    const player = players.value.find((p) => p.id === pid)
    return player?.color || null
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
