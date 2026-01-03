export type CardData = {
  id: number
  col: number
  row: number
  x: number
  y: number
  isInDeck: boolean
  stackId: number | null
  z: number
  faceUp: boolean
  inHand: boolean
  lockedBy: string | null // Player currently grabbing this card
}

export type Stack = {
  id: number
  cardIds: number[]
  anchorX: number
  anchorY: number
  kind: 'zone' | 'free'
  zoneId?: number // Reference to parent zone if in a zone
}

export type Zone = {
  id: number
  x: number
  y: number
  width: number
  height: number
  label: string
  faceUp: boolean // Cards dropped here default to this orientation
  locked: boolean // Prevent moving/resizing when locked
  stackId: number | null // Associated stack
}

export type DragTarget =
  | { type: 'card'; index: number }
  | { type: 'stack'; stackId: number; index: number }
  | { type: 'selection' }
  | { type: 'hand-card'; index: number }
  | { type: 'zone'; zoneId: number }
  | { type: 'zone-resize'; zoneId: number; handle: 'se' }

export const CARD_W = 42
export const CARD_H = 60
export const STACK_HOVER_MS = 250
export const LONG_PRESS_MS = 500
export const STACK_OFFSET_X = 0
export const STACK_OFFSET_Y = -1

// Card back sprite position in tilemap
export const CARD_BACK_COL = 13
export const CARD_BACK_ROW = 1

// Shake detection for stacking selection
export const SHAKE_THRESHOLD = 15 // Minimum movement to count as direction
export const SHAKE_REVERSALS = 4 // Number of direction changes to trigger
export const SHAKE_WINDOW_MS = 500 // Time window for shake detection

// Hand layout
export const HAND_CARD_OVERLAP = 28 // Horizontal overlap between cards in hand
export const HAND_PADDING = 16 // Padding around hand zone

// Zone defaults
export const ZONE_MIN_WIDTH = CARD_W * 1.5
export const ZONE_MIN_HEIGHT = CARD_H * 1.5
export const ZONE_DEFAULT_WIDTH = CARD_H * 2.0 // Default zone width (card + padding)
export const ZONE_DEFAULT_HEIGHT = CARD_H * 2.0 // Default zone height (card + padding)

// Cursor updates
export const CURSOR_THROTTLE_MS = 50 // Throttle cursor updates (client-side)
