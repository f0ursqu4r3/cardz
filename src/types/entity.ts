import type { Counter, Token, Die, Timer } from './index'

/**
 * Entity type literal union for the 4 simple draggable entity types
 */
export type EntityType = 'counter' | 'token' | 'die' | 'timer'

/**
 * Maps entity type strings to their concrete interfaces
 */
export interface EntityTypeMap {
  counter: Counter
  token: Token
  die: Die
  timer: Timer
}

/**
 * Base interface shared by all draggable entities
 */
export interface BaseEntity {
  id: number
  x: number
  y: number
  z: number
  lockedBy: string | null
}

/**
 * Context menu data extractors for each entity type
 */
export interface EntityContextData {
  counter: { value: number }
  token: { kind: 'color' | 'sprite' }
  die: { value: number }
  timer: { status: string; mode: string }
}
