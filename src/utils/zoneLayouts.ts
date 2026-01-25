/**
 * Shared zone layout calculation utilities
 * Used by cards.ts for positioning cards and useCardInteraction.ts for drop index calculation
 */

import type { Zone } from '@/types'
import { CARD_W, CARD_H, STACK_OFFSET_X, STACK_OFFSET_Y } from '@/types'

export interface ZoneLayoutSettings {
  cardSpacing: number
  randomOffset?: number
  randomRotation?: number
  cardScale?: number
}

export interface CardPosition {
  x: number
  y: number
  rotation: number
}

/**
 * Calculate the spacing multiplier from the 0-1 spacing value
 * 0.0 = maximum overlap (cards stacked tightly, ~30% visible)
 * 0.5 = edge-to-edge (no gap, no overlap)
 * 1.0 = maximum spread (gaps between cards)
 */
export function getSpacingMultiplier(spacing: number): number {
  return spacing < 0.5 ? 0.3 + spacing * 1.4 : 1.0 + (spacing - 0.5) * 1.4
}

/**
 * Get default settings for a zone
 */
export function getDefaultSettings(zone: Zone): ZoneLayoutSettings {
  return zone.cardSettings || { cardScale: 1.0, cardSpacing: 0.5 }
}

/**
 * Calculate row layout parameters
 */
export function getRowLayoutParams(
  zone: { width: number; height: number; x: number; y: number },
  cardCount: number,
  spacingMultiplier: number,
) {
  const step = CARD_W * spacingMultiplier
  const totalWidth = CARD_W + Math.max(0, cardCount - 1) * step
  const startX = zone.x + (zone.width - totalWidth) / 2
  const startY = zone.y + (zone.height - CARD_H) / 2
  return { step, totalWidth, startX, startY }
}

/**
 * Calculate column layout parameters
 */
export function getColumnLayoutParams(
  zone: { width: number; height: number; x: number; y: number },
  cardCount: number,
  spacingMultiplier: number,
) {
  const step = CARD_H * spacingMultiplier
  const totalHeight = CARD_H + Math.max(0, cardCount - 1) * step
  const startX = zone.x + (zone.width - CARD_W) / 2
  const startY = zone.y + (zone.height - totalHeight) / 2
  return { step, totalHeight, startX, startY }
}

/**
 * Calculate grid layout parameters
 */
export function getGridLayoutParams(
  zone: { width: number; height: number; x: number; y: number },
  cardCount: number,
  spacingMultiplier: number,
) {
  const gapX = CARD_W * spacingMultiplier
  const gapY = CARD_H * spacingMultiplier

  // Calculate ideal square grid dimensions
  const sqrtCount = Math.sqrt(cardCount)
  let cols = Math.ceil(sqrtCount)
  let rows = Math.ceil(cardCount / cols)

  // Adjust to fit within zone bounds if needed
  const maxCols = Math.max(1, Math.floor((zone.width + gapX - CARD_W) / gapX))
  const maxRows = Math.max(1, Math.floor((zone.height + gapY - CARD_H) / gapY))

  if (cols > maxCols) {
    cols = maxCols
    rows = Math.ceil(cardCount / cols)
  }
  if (rows > maxRows) {
    rows = maxRows
    cols = Math.ceil(cardCount / rows)
  }

  cols = Math.max(1, cols)
  rows = Math.ceil(cardCount / cols)

  const totalWidth = CARD_W + Math.max(0, cols - 1) * gapX
  const totalHeight = CARD_H + Math.max(0, rows - 1) * gapY
  const startX = zone.x + (zone.width - totalWidth) / 2
  const startY = zone.y + (zone.height - totalHeight) / 2

  return { gapX, gapY, cols, rows, totalWidth, totalHeight, startX, startY }
}

/**
 * Calculate fan layout parameters
 */
export function getFanLayoutParams(
  zone: { width: number; height: number; x: number; y: number },
  cardCount: number,
  spacingMultiplier: number,
) {
  const zoneCenterX = zone.x + zone.width / 2
  const zoneCenterY = zone.y + zone.height / 2
  const radius = Math.max(150, zone.height * 1.5)
  const baseArcSpan = Math.PI * 0.3 * spacingMultiplier
  const arcSpan = Math.min(baseArcSpan, cardCount * 0.12)
  const startAngle = Math.PI / 2 + arcSpan / 2
  const angleStep = cardCount > 1 ? arcSpan / (cardCount - 1) : 0
  const arcCenterX = zoneCenterX
  const arcCenterY = zoneCenterY + radius - CARD_H / 2

  return { zoneCenterX, zoneCenterY, radius, arcSpan, startAngle, angleStep, arcCenterX, arcCenterY }
}

/**
 * Calculate circle layout parameters
 */
export function getCircleLayoutParams(
  zone: { width: number; height: number; x: number; y: number },
  cardCount: number,
  spacingMultiplier: number,
) {
  const centerX = zone.x + zone.width / 2
  const centerY = zone.y + zone.height / 2
  const baseRadius = Math.min(zone.width, zone.height) / 2 - CARD_W / 2 - 10
  const radius = baseRadius * spacingMultiplier
  // Use ~330 degrees (11/12 of circle) to leave a gap at the bottom
  const arcSpan = Math.PI * 2 * (11 / 12)
  const angleStep = cardCount > 1 ? arcSpan / (cardCount - 1) : 0
  const startAngle = -Math.PI / 2 - arcSpan / 2 // Center the arc at top

  return { centerX, centerY, radius, arcSpan, startAngle, angleStep }
}

/**
 * Calculate stack layout anchor position (for centering stack in zone)
 */
export function getStackLayoutAnchor(
  zone: { width: number; height: number; x: number; y: number },
  cardCount: number,
) {
  const totalOffsetY = Math.max(0, cardCount - 1) * Math.abs(STACK_OFFSET_Y)
  const centerX = zone.x + (zone.width - CARD_W) / 2
  const centerY = zone.y + (zone.height - CARD_H) / 2
  const anchorY = centerY + totalOffsetY / 2
  return { anchorX: centerX, anchorY }
}

/**
 * Calculate position for a card at a given index in a zone layout
 */
export function getCardPositionInZone(
  zone: Zone,
  cardIndex: number,
  cardCount: number,
): CardPosition | null {
  const layout = zone.layout || 'stack'
  const settings = getDefaultSettings(zone)
  const spacingMultiplier = getSpacingMultiplier(settings.cardSpacing)

  if (layout === 'stack') {
    const { anchorX, anchorY } = getStackLayoutAnchor(zone, cardCount)
    return {
      x: anchorX + cardIndex * STACK_OFFSET_X,
      y: anchorY + cardIndex * STACK_OFFSET_Y,
      rotation: 0,
    }
  } else if (layout === 'row') {
    const { step, startX, startY } = getRowLayoutParams(zone, cardCount, spacingMultiplier)
    return { x: startX + cardIndex * step, y: startY, rotation: 0 }
  } else if (layout === 'column') {
    const { step, startX, startY } = getColumnLayoutParams(zone, cardCount, spacingMultiplier)
    return { x: startX, y: startY + cardIndex * step, rotation: 0 }
  } else if (layout === 'grid') {
    const { gapX, gapY, cols, startX, startY } = getGridLayoutParams(
      zone,
      cardCount,
      spacingMultiplier,
    )
    const col = cardIndex % cols
    const row = Math.floor(cardIndex / cols)
    return { x: startX + col * gapX, y: startY + row * gapY, rotation: 0 }
  } else if (layout === 'fan') {
    const { radius, startAngle, angleStep, arcCenterX, arcCenterY } = getFanLayoutParams(
      zone,
      cardCount,
      spacingMultiplier,
    )
    const angle = startAngle - cardIndex * angleStep
    const x = arcCenterX + Math.cos(angle) * radius - CARD_W / 2
    const y = arcCenterY - Math.sin(angle) * radius - CARD_H / 2
    const rotation = (Math.PI / 2 - angle) * (180 / Math.PI)
    return { x, y, rotation }
  } else if (layout === 'circle') {
    const { centerX, centerY, radius, startAngle, angleStep } = getCircleLayoutParams(
      zone,
      cardCount,
      spacingMultiplier,
    )
    const angle = startAngle + cardIndex * angleStep
    const x = centerX + Math.cos(angle) * radius - CARD_W / 2
    const y = centerY + Math.sin(angle) * radius - CARD_H / 2
    const rotation = (angle + Math.PI / 2) * (180 / Math.PI)
    return { x, y, rotation }
  }

  return null
}

/**
 * Calculate the drop index for a position in a zone layout (used for reordering)
 */
export function getDropIndexInZone(
  zone: Zone,
  cardCount: number,
  dropX: number,
  dropY: number,
): number {
  const layout = zone.layout || 'stack'
  const settings = getDefaultSettings(zone)
  const spacingMultiplier = getSpacingMultiplier(settings.cardSpacing)

  // Relative position within zone
  const relX = dropX - zone.x
  const relY = dropY - zone.y

  if (layout === 'row') {
    const step = CARD_W * spacingMultiplier
    const totalWidth = CARD_W + Math.max(0, cardCount - 1) * step
    const startX = (zone.width - totalWidth) / 2
    const posInRow = relX - startX
    const idx = Math.round(posInRow / step)
    return Math.max(0, Math.min(cardCount - 1, idx))
  } else if (layout === 'column') {
    const step = CARD_H * spacingMultiplier
    const totalHeight = CARD_H + Math.max(0, cardCount - 1) * step
    const startY = (zone.height - totalHeight) / 2
    const posInCol = relY - startY
    const idx = Math.round(posInCol / step)
    return Math.max(0, Math.min(cardCount - 1, idx))
  } else if (layout === 'grid') {
    const gapX = CARD_W * spacingMultiplier
    const gapY = CARD_H * spacingMultiplier
    const sqrtCount = Math.sqrt(cardCount)
    let cols = Math.ceil(sqrtCount)
    const maxCols = Math.max(1, Math.floor((zone.width + gapX - CARD_W) / gapX))
    if (cols > maxCols) cols = maxCols
    cols = Math.max(1, cols)
    const rows = Math.ceil(cardCount / cols)
    const totalWidth = CARD_W + Math.max(0, cols - 1) * gapX
    const totalHeight = CARD_H + Math.max(0, rows - 1) * gapY
    const startX = (zone.width - totalWidth) / 2
    const startY = (zone.height - totalHeight) / 2

    const col = Math.round((relX - startX) / gapX)
    const row = Math.round((relY - startY) / gapY)
    const clampedCol = Math.max(0, Math.min(cols - 1, col))
    const clampedRow = Math.max(0, Math.min(rows - 1, row))
    const idx = clampedRow * cols + clampedCol
    return Math.max(0, Math.min(cardCount - 1, idx))
  } else if (layout === 'fan') {
    const zoneCenterX = zone.width / 2
    const zoneCenterY = zone.height / 2
    const radius = Math.max(150, zone.height * 1.5)
    const baseArcSpan = Math.PI * 0.3 * spacingMultiplier
    const arcSpan = Math.min(baseArcSpan, cardCount * 0.12)
    const startAngle = Math.PI / 2 + arcSpan / 2
    const angleStep = cardCount > 1 ? arcSpan / (cardCount - 1) : 0

    // Arc center is below the zone center
    const arcCenterX = zoneCenterX
    const arcCenterY = zoneCenterY + radius - CARD_H / 2

    // Calculate angle from arc center to drop position
    const dx = relX - arcCenterX
    const dy = arcCenterY - relY // Inverted because arc goes upward
    const dropAngle = Math.atan2(dy, dx)

    if (angleStep === 0) return 0
    const idx = Math.round((startAngle - dropAngle) / angleStep)
    return Math.max(0, Math.min(cardCount - 1, idx))
  } else if (layout === 'circle') {
    const centerX = zone.width / 2
    const centerY = zone.height / 2
    const arcSpan = Math.PI * 2 * (11 / 12)
    const angleStep = cardCount > 1 ? arcSpan / (cardCount - 1) : 0
    const startAngle = -Math.PI / 2 - arcSpan / 2

    const dx = relX - centerX
    const dy = relY - centerY
    const dropAngle = Math.atan2(dy, dx)

    if (angleStep === 0) return 0
    const idx = Math.round((dropAngle - startAngle) / angleStep)
    return Math.max(0, Math.min(cardCount - 1, idx))
  }

  // For stack layout or unknown, return 0 (caller should handle distance-based logic if needed)
  return 0
}

/**
 * Apply random offset and rotation to a position using card ID as seed
 */
export function applyRandomization(
  cardId: number,
  baseX: number,
  baseY: number,
  baseRotation: number,
  randomOffset: number,
  randomRotation: number,
): CardPosition {
  if (randomOffset === 0 && randomRotation === 0) {
    return { x: baseX, y: baseY, rotation: baseRotation }
  }

  // Use card ID as seed for consistent randomization
  const seed = cardId * 1000
  const pseudoRandom1 = Math.sin(seed) * 10000
  const pseudoRandom2 = Math.sin(seed + 1) * 10000
  const pseudoRandom3 = Math.sin(seed + 2) * 10000

  const offsetX = randomOffset > 0 ? (pseudoRandom1 % 1) * randomOffset * 2 - randomOffset : 0
  const offsetY = randomOffset > 0 ? (pseudoRandom2 % 1) * randomOffset * 2 - randomOffset : 0
  const rotOffset =
    randomRotation > 0 ? (pseudoRandom3 % 1) * randomRotation * 2 - randomRotation : 0

  return {
    x: baseX + offsetX,
    y: baseY + offsetY,
    rotation: baseRotation + rotOffset,
  }
}
