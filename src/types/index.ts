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

export const CARD_W = 42
export const CARD_H = 60
export const STACK_HOVER_MS = 250
export const LONG_PRESS_MS = 500
export const STACK_OFFSET_X = 1.5
export const STACK_OFFSET_Y = 2

// Card back sprite position in tilemap
export const CARD_BACK_COL = 13
export const CARD_BACK_ROW = 1
