// Shared types for cardz multiplayer protocol
// Used by both client and server

// ============================================================================
// Core Types
// ============================================================================

export interface Player {
  id: string
  name: string
  connected: boolean
  color: string // For cursor/highlight color
  sessionId?: string // For reconnection after refresh
}

export interface CardState {
  id: number
  col: number
  row: number
  x: number
  y: number
  z: number
  faceUp: boolean
  stackId: number | null
  ownerId: string | null // Player who "owns" this card (e.g., in their hand)
  lockedBy: string | null // Player currently dragging this card
}

export interface StackState {
  id: number
  cardIds: number[]
  anchorX: number
  anchorY: number
  kind: 'zone' | 'free'
  zoneId?: number
  lockedBy: string | null // Player currently dragging this stack
}

export type ZoneVisibility = 'public' | 'owner' | 'hidden'

export type ZoneLayout = 'stack' | 'row' | 'column' | 'grid' | 'fan' | 'circle'

export interface ZoneCardSettings {
  cardScale: number // 0.5 to 1.5 (default 1.0)
  cardSpacing: number // 0 to 1.0 (default 0.5, percentage of card dimension)
  randomOffset?: number // 0 to 50 pixels of random position jitter (default 0)
  randomRotation?: number // 0 to 45 degrees of random rotation (default 0)
}

export interface ZoneState {
  id: number
  x: number
  y: number
  width: number
  height: number
  label: string
  faceUp: boolean
  locked: boolean
  stackId: number | null
  visibility: ZoneVisibility // Who can see cards in this zone
  ownerId: string | null // Player who owns this zone (for 'owner' visibility)
  layout: ZoneLayout // How cards are arranged in the zone
  cardSettings: ZoneCardSettings // Card size and spacing settings
}

export interface HandState {
  playerId: string
  cardIds: number[] // Only visible to owner; others see count only
}

export interface GameState {
  cards: CardState[]
  stacks: StackState[]
  zones: ZoneState[]
  hands: HandState[]
  nextStackId: number
  nextZoneId: number
  zCounter: number
}

// ============================================================================
// Room Messages (Client → Server)
// ============================================================================

export interface RoomCreate {
  type: 'room:create'
  playerName: string
  tableName?: string
  isPublic?: boolean
  sessionId?: string // For reconnection after refresh
}

export interface RoomJoin {
  type: 'room:join'
  roomCode: string
  playerName: string
  sessionId?: string // For reconnection after refresh
}

export interface RoomLeave {
  type: 'room:leave'
}

export interface RoomListRequest {
  type: 'room:list'
}

// ============================================================================
// Room Messages (Server → Client)
// ============================================================================

export interface RoomCreated {
  type: 'room:created'
  roomCode: string
  playerId: string
  state: GameState
}

export interface RoomJoined {
  type: 'room:joined'
  roomCode: string
  playerId: string
  players: Player[]
  state: GameState
  cursors: { playerId: string; x: number; y: number; state: 'default' | 'grab' | 'grabbing' }[]
}

export interface PlayerJoined {
  type: 'room:player_joined'
  player: Player
}

export interface PlayerLeft {
  type: 'room:player_left'
  playerId: string
}

export interface RoomError {
  type: 'room:error'
  code: 'NOT_FOUND' | 'FULL' | 'INVALID_CODE'
  message: string
}

export interface PublicRoomInfo {
  code: string
  name: string
  playerCount: number
  maxPlayers: number
  createdAt: number
  background?: TableBackground
}

export interface RoomListResponse {
  type: 'room:list'
  rooms: PublicRoomInfo[]
}

// ============================================================================
// Table Settings Types
// ============================================================================

export type TableBackground =
  | 'green-felt'
  | 'blue-felt'
  | 'red-felt'
  | 'wood-oak'
  | 'wood-dark'
  | 'slate'

export interface TableSettings {
  background: TableBackground
}

// ============================================================================
// Table Management Messages (Client → Server)
// ============================================================================

export interface TableReset {
  type: 'table:reset'
}

export interface TableUpdateSettings {
  type: 'table:update_settings'
  settings: Partial<TableSettings>
}

export interface TableUpdateVisibility {
  type: 'table:update_visibility'
  isPublic: boolean
}

export interface TableUpdateName {
  type: 'table:update_name'
  name: string
}

// ============================================================================
// Table Management Messages (Server → Client)
// ============================================================================

export interface TableResetComplete {
  type: 'table:reset'
  state: GameState
}

export interface TableSettingsUpdated {
  type: 'table:settings_updated'
  settings: TableSettings
  playerId: string
}

export interface TableVisibilityUpdated {
  type: 'table:visibility_updated'
  isPublic: boolean
  playerId: string
}

export interface TableNameUpdated {
  type: 'table:name_updated'
  name: string
  playerId: string
}

export interface TableInfo {
  type: 'table:info'
  name: string
  isPublic: boolean
  settings: TableSettings
  createdAt: number
  createdBy: string
}

// ============================================================================
// Card Messages (Client → Server)
// ============================================================================

export interface CardMoveIntent {
  type: 'card:move'
  cardId: number
  x: number
  y: number
  vx?: number
  vy?: number
}

export interface CardLock {
  type: 'card:lock'
  cardId: number
}

export interface CardUnlock {
  type: 'card:unlock'
  cardId: number
}

export interface CardFlip {
  type: 'card:flip'
  cardId: number
}

// ============================================================================
// Card Messages (Server → Client)
// ============================================================================

export interface CardMoved {
  type: 'card:moved'
  cardId: number
  x: number
  y: number
  z: number
  playerId: string
  vx?: number
  vy?: number
}

export interface CardMoveRejected {
  type: 'card:move_rejected'
  cardId: number
  reason: 'LOCKED' | 'NOT_FOUND' | 'IN_HAND'
  currentState: { x: number; y: number }
}

export interface CardLocked {
  type: 'card:locked'
  cardId: number
  playerId: string
}

export interface CardUnlocked {
  type: 'card:unlocked'
  cardId: number
}

export interface CardFlipped {
  type: 'card:flipped'
  cardId: number
  faceUp: boolean
  playerId: string
}

// ============================================================================
// Stack Messages (Client → Server)
// ============================================================================

export interface StackCreate {
  type: 'stack:create'
  cardIds: number[]
  anchorX: number
  anchorY: number
}

export interface StackMove {
  type: 'stack:move'
  stackId: number
  anchorX: number
  anchorY: number
  detachFromZone?: boolean // If true, detach the stack from its current zone
}

export interface StackLock {
  type: 'stack:lock'
  stackId: number
}

export interface StackUnlock {
  type: 'stack:unlock'
  stackId: number
}

export interface StackAddCard {
  type: 'stack:add_card'
  stackId: number
  cardId: number
}

export interface StackRemoveCard {
  type: 'stack:remove_card'
  cardId: number
}

export interface StackMerge {
  type: 'stack:merge'
  sourceStackId: number
  targetStackId: number
}

export interface StackShuffle {
  type: 'stack:shuffle'
  stackId: number
}

export interface StackFlip {
  type: 'stack:flip'
  stackId: number
}

export interface StackReorder {
  type: 'stack:reorder'
  stackId: number
  fromIndex: number
  toIndex: number
}

// ============================================================================
// Stack Messages (Server → Client)
// ============================================================================

export interface StackCreated {
  type: 'stack:created'
  stack: StackState
  cardUpdates: { cardId: number; x: number; y: number; z: number }[]
  playerId: string
}

export interface StackMoved {
  type: 'stack:moved'
  stackId: number
  anchorX: number
  anchorY: number
  cardUpdates: { cardId: number; x: number; y: number }[]
  zoneDetached?: { zoneId: number } // Present if stack was detached from a zone
  playerId: string
}

export interface StackLocked {
  type: 'stack:locked'
  stackId: number
  playerId: string
}

export interface StackUnlocked {
  type: 'stack:unlocked'
  stackId: number
}

export interface StackCardAdded {
  type: 'stack:card_added'
  stackId: number
  cardId: number
  cardState: { x: number; y: number; z: number; faceUp: boolean }
  playerId: string
}

export interface StackCardRemoved {
  type: 'stack:card_removed'
  stackId: number
  cardId: number
  stackDeleted: boolean
  playerId: string
}

export interface StacksMerged {
  type: 'stack:merged'
  sourceStackId: number
  targetStackId: number
  targetStack: StackState
  cardUpdates: { cardId: number; x: number; y: number; z: number }[]
  playerId: string
}

export interface StackShuffled {
  type: 'stack:shuffled'
  stackId: number
  newOrder: number[]
  cardUpdates: { cardId: number; x: number; y: number }[]
  playerId: string
}

export interface StackFlipped {
  type: 'stack:flipped'
  stackId: number
  cardUpdates: { cardId: number; faceUp: boolean }[]
  playerId: string
}

export interface StackReordered {
  type: 'stack:reordered'
  stackId: number
  newOrder: number[]
  cardUpdates: { cardId: number; x: number; y: number }[]
  playerId: string
}

// ============================================================================
// Zone Messages (Client → Server)
// ============================================================================

export interface ZoneCreate {
  type: 'zone:create'
  x: number
  y: number
  width: number
  height: number
  label: string
  faceUp: boolean
  visibility?: ZoneVisibility
  ownerId?: string | null
  layout?: ZoneLayout
  cardSettings?: ZoneCardSettings
}

export interface ZoneUpdate {
  type: 'zone:update'
  zoneId: number
  updates: {
    x?: number
    y?: number
    width?: number
    height?: number
    label?: string
    faceUp?: boolean
    locked?: boolean
    visibility?: ZoneVisibility
    ownerId?: string | null
    layout?: ZoneLayout
    cardSettings?: ZoneCardSettings
  }
}

export interface ZoneDelete {
  type: 'zone:delete'
  zoneId: number
}

export interface ZoneAddCard {
  type: 'zone:add_card'
  zoneId: number
  cardId: number
}

export interface ZoneAddCards {
  type: 'zone:add_cards'
  zoneId: number
  cardIds: number[]
}

// ============================================================================
// Zone Messages (Server → Client)
// ============================================================================

export interface ZoneCreated {
  type: 'zone:created'
  zone: ZoneState
  playerId: string
}

export interface ZoneUpdated {
  type: 'zone:updated'
  zoneId: number
  zone: ZoneState
  stackUpdate?: { stackId: number; anchorX: number; anchorY: number }
  cardUpdates?: { cardId: number; x: number; y: number }[]
  playerId: string
}

export interface ZoneDeleted {
  type: 'zone:deleted'
  zoneId: number
  stackDeleted: number | null
  scatteredCards: { cardId: number; x: number; y: number }[]
  playerId: string
}

export interface ZoneCardAdded {
  type: 'zone:card_added'
  zoneId: number
  stackId: number
  stackCreated: boolean
  cardState: { cardId: number; x: number; y: number; z: number; faceUp: boolean }
  playerId: string
}

export interface ZoneCardsAdded {
  type: 'zone:cards_added'
  zoneId: number
  stackId: number
  stackCreated: boolean
  cardStates: { cardId: number; x: number; y: number; z: number; faceUp: boolean }[]
  playerId: string
}

// ============================================================================
// Hand Messages (Client → Server)
// ============================================================================

export interface HandAdd {
  type: 'hand:add'
  cardId: number
}

export interface HandRemove {
  type: 'hand:remove'
  cardId: number
  x: number
  y: number
  faceUp: boolean
}

export interface HandReorder {
  type: 'hand:reorder'
  fromIndex: number
  toIndex: number
}

export interface HandAddStack {
  type: 'hand:add_stack'
  stackId: number
}

// ============================================================================
// Hand Messages (Server → Client)
// ============================================================================

export interface HandCardAdded {
  type: 'hand:card_added'
  cardId: number
  cardState: CardState
}

export interface HandCardAddedOther {
  type: 'hand:card_added_other'
  playerId: string
  cardId: number
  handCount: number
}

export interface HandCardRemoved {
  type: 'hand:card_removed'
  playerId: string
  cardState: CardState
}

export interface HandReordered {
  type: 'hand:reordered'
  newOrder: number[]
}

export interface HandStackAdded {
  type: 'hand:stack_added'
  cardIds: number[]
  newHand: number[]
}

export interface HandStackAddedOther {
  type: 'hand:stack_added_other'
  playerId: string
  cardIds: number[]
  stackDeleted: number
  handCount: number
}

// ============================================================================
// Selection Messages
// ============================================================================

export interface SelectionStack {
  type: 'selection:stack'
  cardIds: number[]
  anchorX: number
  anchorY: number
}

export interface SelectionStacked {
  type: 'selection:stacked'
  stack: StackState
  cardUpdates: { cardId: number; x: number; y: number; z: number }[]
  playerId: string
}

// ============================================================================
// Cursor/Presence Messages
// ============================================================================

export type CursorState = 'default' | 'grab' | 'grabbing'

export interface CursorUpdate {
  type: 'cursor:update'
  x: number
  y: number
  state: CursorState
}

export interface CursorUpdated {
  type: 'cursor:updated'
  playerId: string
  x: number
  y: number
  state: CursorState
}

// ============================================================================
// State Sync Messages
// ============================================================================

export interface StateRequest {
  type: 'state:request'
}

export interface StateSync {
  type: 'state:sync'
  state: GameState
  yourHand: number[]
  handCounts: { playerId: string; count: number }[]
}

export interface StateDelta {
  type: 'state:delta'
  sequence: number
  changes: StateChange[]
}

export type StateChange =
  | { op: 'card:update'; cardId: number; changes: Partial<CardState> }
  | { op: 'stack:update'; stackId: number; changes: Partial<StackState> }
  | { op: 'stack:delete'; stackId: number }
  | { op: 'zone:update'; zoneId: number; changes: Partial<ZoneState> }
  | { op: 'zone:delete'; zoneId: number }

// ============================================================================
// Chat Messages (Client → Server)
// ============================================================================

export interface ChatSend {
  type: 'chat:send'
  message: string
}

// ============================================================================
// Chat Messages (Server → Client)
// ============================================================================

export interface ChatMessage {
  type: 'chat:message'
  id: string
  playerId: string
  playerName: string
  playerColor: string
  message: string
  timestamp: number
}

export interface ChatHistory {
  type: 'chat:history'
  messages: Omit<ChatMessage, 'type'>[]
}

// ============================================================================
// Error Messages
// ============================================================================

export interface ActionError {
  type: 'error'
  originalAction: string
  code: ErrorCode
  message: string
}

export type ErrorCode =
  | 'CARD_LOCKED'
  | 'STACK_LOCKED'
  | 'NOT_FOUND'
  | 'INVALID_ACTION'
  | 'NOT_IN_HAND'
  | 'NOT_YOUR_CARD'
  | 'ZONE_LOCKED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'

// ============================================================================
// Union Types for Message Handling
// ============================================================================

export type ClientMessage =
  | RoomCreate
  | RoomJoin
  | RoomLeave
  | RoomListRequest
  | CardMoveIntent
  | CardLock
  | CardUnlock
  | CardFlip
  | StackCreate
  | StackMove
  | StackLock
  | StackUnlock
  | StackAddCard
  | StackRemoveCard
  | StackMerge
  | StackShuffle
  | StackFlip
  | StackReorder
  | ZoneCreate
  | ZoneUpdate
  | ZoneDelete
  | ZoneAddCard
  | ZoneAddCards
  | HandAdd
  | HandRemove
  | HandReorder
  | HandAddStack
  | SelectionStack
  | CursorUpdate
  | StateRequest
  | TableReset
  | TableUpdateSettings
  | TableUpdateVisibility
  | TableUpdateName
  | ChatSend

export type ServerMessage =
  | RoomCreated
  | RoomJoined
  | PlayerJoined
  | PlayerLeft
  | RoomError
  | RoomListResponse
  | CardMoved
  | CardMoveRejected
  | CardLocked
  | CardUnlocked
  | CardFlipped
  | StackCreated
  | StackMoved
  | StackLocked
  | StackUnlocked
  | StackCardAdded
  | StackCardRemoved
  | StacksMerged
  | StackShuffled
  | StackFlipped
  | StackReordered
  | ZoneCreated
  | ZoneUpdated
  | ZoneDeleted
  | ZoneCardAdded
  | ZoneCardsAdded
  | HandCardAdded
  | HandCardAddedOther
  | HandCardRemoved
  | HandReordered
  | HandStackAdded
  | HandStackAddedOther
  | SelectionStacked
  | CursorUpdated
  | StateSync
  | StateDelta
  | ActionError
  | TableResetComplete
  | TableSettingsUpdated
  | TableVisibilityUpdated
  | TableNameUpdated
  | TableInfo
  | ChatMessage
  | ChatHistory

// ============================================================================
// Constants
// ============================================================================

export const LOCK_TTL_MS = 30_000 // Auto-release locks after 30s
export const CURSOR_THROTTLE_MS = 100 // Throttle cursor updates
export const PLAYER_COLORS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
] as const
