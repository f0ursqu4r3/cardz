import { z } from 'zod'

// ============================================================================
// Base Schemas
// ============================================================================

export const PlayerSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(32),
  connected: z.boolean(),
  color: z.string(),
})

export const CardStateSchema = z.object({
  id: z.number().int(),
  col: z.number().int().min(0).max(12),
  row: z.number().int().min(0).max(3),
  x: z.number(),
  y: z.number(),
  z: z.number().int(),
  faceUp: z.boolean(),
  stackId: z.number().int().nullable(),
  ownerId: z.string().nullable(),
  lockedBy: z.string().nullable(),
})

export const StackStateSchema = z.object({
  id: z.number().int(),
  cardIds: z.array(z.number().int()),
  anchorX: z.number(),
  anchorY: z.number(),
  kind: z.enum(['zone', 'free']),
  zoneId: z.number().int().optional(),
  lockedBy: z.string().nullable(),
})

export const ZoneStateSchema = z.object({
  id: z.number().int(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  label: z.string(),
  faceUp: z.boolean(),
  locked: z.boolean(),
  stackId: z.number().int().nullable(),
})

export const HandStateSchema = z.object({
  playerId: z.string(),
  cardIds: z.array(z.number().int()),
})

export const GameStateSchema = z.object({
  cards: z.array(CardStateSchema),
  stacks: z.array(StackStateSchema),
  zones: z.array(ZoneStateSchema),
  hands: z.array(HandStateSchema),
  nextStackId: z.number().int(),
  nextZoneId: z.number().int(),
  zCounter: z.number().int(),
})

// ============================================================================
// Room Message Schemas (Client → Server)
// ============================================================================

export const RoomCreateSchema = z.object({
  type: z.literal('room:create'),
  playerName: z.string().min(1).max(32),
  tableName: z.string().min(1).max(50).optional(),
  isPublic: z.boolean().optional(),
  sessionId: z.string().optional(),
})

export const RoomJoinSchema = z.object({
  type: z.literal('room:join'),
  roomCode: z
    .string()
    .length(6)
    .regex(/^[A-Z0-9]+$/),
  playerName: z.string().min(1).max(32),
  sessionId: z.string().optional(),
})

export const RoomLeaveSchema = z.object({
  type: z.literal('room:leave'),
})

export const RoomListSchema = z.object({
  type: z.literal('room:list'),
})

// ============================================================================
// Card Message Schemas (Client → Server)
// ============================================================================

export const CardMoveIntentSchema = z.object({
  type: z.literal('card:move'),
  cardId: z.number().int().min(0).max(51),
  x: z.number(),
  y: z.number(),
  vx: z.number().optional(),
  vy: z.number().optional(),
})

export const CardLockSchema = z.object({
  type: z.literal('card:lock'),
  cardId: z.number().int().min(0).max(51),
})

export const CardUnlockSchema = z.object({
  type: z.literal('card:unlock'),
  cardId: z.number().int().min(0).max(51),
})

export const CardFlipSchema = z.object({
  type: z.literal('card:flip'),
  cardId: z.number().int().min(0).max(51),
})

// ============================================================================
// Stack Message Schemas (Client → Server)
// ============================================================================

export const StackCreateSchema = z.object({
  type: z.literal('stack:create'),
  cardIds: z.array(z.number().int().min(0).max(51)).min(2),
  anchorX: z.number(),
  anchorY: z.number(),
})

export const StackMoveSchema = z.object({
  type: z.literal('stack:move'),
  stackId: z.number().int(),
  anchorX: z.number(),
  anchorY: z.number(),
  detachFromZone: z.boolean().optional(),
})

export const StackLockSchema = z.object({
  type: z.literal('stack:lock'),
  stackId: z.number().int(),
})

export const StackUnlockSchema = z.object({
  type: z.literal('stack:unlock'),
  stackId: z.number().int(),
})

export const StackAddCardSchema = z.object({
  type: z.literal('stack:add_card'),
  stackId: z.number().int(),
  cardId: z.number().int().min(0).max(51),
})

export const StackRemoveCardSchema = z.object({
  type: z.literal('stack:remove_card'),
  cardId: z.number().int().min(0).max(51),
})

export const StackMergeSchema = z.object({
  type: z.literal('stack:merge'),
  sourceStackId: z.number().int(),
  targetStackId: z.number().int(),
})

export const StackShuffleSchema = z.object({
  type: z.literal('stack:shuffle'),
  stackId: z.number().int(),
})

export const StackFlipSchema = z.object({
  type: z.literal('stack:flip'),
  stackId: z.number().int(),
})

export const StackSetFacesSchema = z.object({
  type: z.literal('stack:set_faces'),
  stackId: z.number().int(),
  faceUp: z.boolean(),
})

export const StackReorderSchema = z.object({
  type: z.literal('stack:reorder'),
  stackId: z.number().int(),
  fromIndex: z.number().int().min(0),
  toIndex: z.number().int().min(0),
})

// ============================================================================
// Zone Message Schemas (Client → Server)
// ============================================================================

export const ZoneCreateSchema = z.object({
  type: z.literal('zone:create'),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  label: z.string().max(32),
  faceUp: z.boolean(),
})

export const ZoneUpdateSchema = z.object({
  type: z.literal('zone:update'),
  zoneId: z.number().int(),
  updates: z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    label: z.string().max(32).optional(),
    faceUp: z.boolean().optional(),
    locked: z.boolean().optional(),
    visibility: z.enum(['public', 'owner', 'hidden']).optional(),
    ownerId: z.string().nullable().optional(),
    layout: z.enum(['stack', 'row', 'column', 'grid', 'fan', 'circle']).optional(),
    cardSettings: z
      .object({
        cardScale: z.number().min(0.5).max(1.5),
        cardSpacing: z.number().min(0).max(1),
        randomOffset: z.number().min(0).max(50).optional(),
        randomRotation: z.number().min(0).max(45).optional(),
      })
      .optional(),
  }),
})

export const ZoneDeleteSchema = z.object({
  type: z.literal('zone:delete'),
  zoneId: z.number().int(),
})

export const ZoneAddCardSchema = z.object({
  type: z.literal('zone:add_card'),
  zoneId: z.number().int(),
  cardId: z.number().int().min(0).max(51),
})

export const ZoneAddCardsSchema = z.object({
  type: z.literal('zone:add_cards'),
  zoneId: z.number().int(),
  cardIds: z.array(z.number().int().min(0).max(51)),
})

// ============================================================================
// Hand Message Schemas (Client → Server)
// ============================================================================

export const HandAddSchema = z.object({
  type: z.literal('hand:add'),
  cardId: z.number().int().min(0).max(51),
})

export const HandRemoveSchema = z.object({
  type: z.literal('hand:remove'),
  cardId: z.number().int().min(0).max(51),
  x: z.number(),
  y: z.number(),
  faceUp: z.boolean(),
})

export const HandReorderSchema = z.object({
  type: z.literal('hand:reorder'),
  fromIndex: z.number().int().min(0),
  toIndex: z.number().int().min(0),
})

export const HandAddStackSchema = z.object({
  type: z.literal('hand:add_stack'),
  stackId: z.number().int(),
})

// ============================================================================
// Selection Message Schemas (Client → Server)
// ============================================================================

export const SelectionStackSchema = z.object({
  type: z.literal('selection:stack'),
  cardIds: z.array(z.number().int().min(0).max(51)).min(2),
  anchorX: z.number(),
  anchorY: z.number(),
})

// ============================================================================
// Cursor Message Schemas (Client → Server)
// ============================================================================

export const CursorUpdateSchema = z.object({
  type: z.literal('cursor:update'),
  x: z.number(),
  y: z.number(),
  state: z.enum(['default', 'grab', 'grabbing']),
})

// ============================================================================
// State Sync Message Schemas (Client → Server)
// ============================================================================

export const StateRequestSchema = z.object({
  type: z.literal('state:request'),
})

// ============================================================================
// Table Management Message Schemas (Client → Server)
// ============================================================================

export const TableBackgroundSchema = z.enum([
  'green-felt',
  'blue-felt',
  'red-felt',
  'wood-oak',
  'wood-dark',
  'slate',
])

export const TableSettingsSchema = z.object({
  background: TableBackgroundSchema,
})

export const TableResetSchema = z.object({
  type: z.literal('table:reset'),
})

export const TableUpdateSettingsSchema = z.object({
  type: z.literal('table:update_settings'),
  settings: z.object({
    background: TableBackgroundSchema.optional(),
  }),
})

export const TableUpdateVisibilitySchema = z.object({
  type: z.literal('table:update_visibility'),
  isPublic: z.boolean(),
})

export const TableUpdateNameSchema = z.object({
  type: z.literal('table:update_name'),
  name: z.string().min(1).max(50).trim(),
})

// ============================================================================
// Chat Message Schemas (Client → Server)
// ============================================================================

export const ChatSendSchema = z.object({
  type: z.literal('chat:send'),
  message: z.string().min(1).max(500).trim(),
})

export const ChatTypingSchema = z.object({
  type: z.literal('chat:typing'),
  isTyping: z.boolean(),
})

// ============================================================================
// Combined Client Message Schema
// ============================================================================

export const ClientMessageSchema = z.discriminatedUnion('type', [
  RoomCreateSchema,
  RoomJoinSchema,
  RoomLeaveSchema,
  RoomListSchema,
  CardMoveIntentSchema,
  CardLockSchema,
  CardUnlockSchema,
  CardFlipSchema,
  StackCreateSchema,
  StackMoveSchema,
  StackLockSchema,
  StackUnlockSchema,
  StackAddCardSchema,
  StackRemoveCardSchema,
  StackMergeSchema,
  StackShuffleSchema,
  StackFlipSchema,
  StackSetFacesSchema,
  StackReorderSchema,
  ZoneCreateSchema,
  ZoneUpdateSchema,
  ZoneDeleteSchema,
  ZoneAddCardSchema,
  ZoneAddCardsSchema,
  HandAddSchema,
  HandRemoveSchema,
  HandReorderSchema,
  HandAddStackSchema,
  SelectionStackSchema,
  CursorUpdateSchema,
  StateRequestSchema,
  TableResetSchema,
  TableUpdateSettingsSchema,
  TableUpdateVisibilitySchema,
  TableUpdateNameSchema,
  ChatSendSchema,
  ChatTypingSchema,
])

// ============================================================================
// Type exports inferred from schemas
// ============================================================================

export type ValidatedClientMessage = z.infer<typeof ClientMessageSchema>
