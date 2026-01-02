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
}

export type Stack = {
  id: number
  cardIds: number[]
  anchorX: number
  anchorY: number
  kind: 'zone' | 'free'
}

export type DragTarget =
  | { type: 'card'; index: number }
  | { type: 'stack'; stackId: number; index: number }
  | { type: 'selection' }
  | { type: 'hand-card'; index: number }

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
