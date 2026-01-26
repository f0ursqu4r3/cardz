// Shared types for cardz multiplayer protocol
// Used by both client and server

// ============================================================================
// Core Types
// ============================================================================

export type PlayerRole = 'creator' | 'member' | 'spectator'

export interface Player {
  id: string
  name: string
  connected: boolean
  color: string // For cursor/highlight color
  sessionId?: string // For reconnection after refresh
  role: PlayerRole // 'creator' can manage table settings, 'member' is regular player
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

// ============================================================================
// Counter Types
// ============================================================================

export interface CounterState {
  id: number
  x: number
  y: number
  z: number // Z-order for stacking
  label: string // Custom text label (e.g., "Life", "Score")
  value: number // Current counter value
  min?: number // Optional minimum (default: no limit)
  max?: number // Optional maximum (default: no limit)
  step: number // Increment/decrement amount (default: 1)
  color: string // Display color (hex)
  lockedBy: string | null // Player currently dragging
}

// ============================================================================
// Token Types
// ============================================================================

export type TokenShape = 'circle' | 'square' | 'star' | 'triangle'
export type TokenSprite = 'star' | 'skull' | 'coin' | 'heart' | 'shield' | 'gem'
export type TokenSize = 'small' | 'medium' | 'large'

export interface TokenState {
  id: number
  x: number
  y: number
  z: number // Z-order for stacking
  kind: 'color' | 'sprite' // Color shape or sprite-based token
  shape?: TokenShape // For color tokens (circle, square, etc.)
  color: string // Display color (hex)
  label?: string // Optional text label
  sprite?: TokenSprite // For sprite tokens (star, skull, etc.)
  size: TokenSize // small/medium/large
  lockedBy: string | null // Player currently dragging
}

// ============================================================================
// Die Types
// ============================================================================

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6

export interface DieState {
  id: number
  x: number
  y: number
  z: number // Z-order for stacking
  value: DieValue // Current face value (1-6)
  isRolling: boolean // True while animation is playing
  color: string // Die color (hex)
  lockedBy: string | null // Player currently dragging
}

// ============================================================================
// Timer Types
// ============================================================================

export type TimerMode = 'countdown' | 'stopwatch'
export type TimerStatus = 'stopped' | 'running' | 'paused' | 'finished'

export interface TimerState {
  id: number
  x: number
  y: number
  z: number // Z-order for stacking
  mode: TimerMode // 'countdown' or 'stopwatch'
  durationMs: number // For countdown: initial duration; for stopwatch: ignored
  elapsedMs: number // Current elapsed time (paused value)
  status: TimerStatus // 'stopped' | 'running' | 'paused' | 'finished'
  startedAt: number | null // Server timestamp when started/resumed (null when paused/stopped)
  label: string // Display label
  lockedBy: string | null // Player currently dragging
}

export interface GameState {
  cards: CardState[]
  stacks: StackState[]
  zones: ZoneState[]
  hands: HandState[]
  counters: CounterState[]
  tokens: TokenState[]
  dice: DieState[]
  timers: TimerState[]
  nextStackId: number
  nextZoneId: number
  nextCounterId: number
  nextTokenId: number
  nextDieId: number
  nextTimerId: number
  zCounter: number
  stateVersion: number // Incremented on each mutation for client/server consistency
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
  deviceId?: string // Persistent device identifier
}

export interface RoomJoin {
  type: 'room:join'
  roomCode: string
  playerName: string
  sessionId?: string // For reconnection after refresh
  deviceId?: string // Persistent device identifier
  asSpectator?: boolean // Join as view-only spectator
}

export interface RoomLeave {
  type: 'room:leave'
}

export interface RoomListRequest {
  type: 'room:list'
}

export interface PlayerKick {
  type: 'player:kick'
  targetPlayerId: string
}

export interface PlayerBan {
  type: 'player:ban'
  targetPlayerId: string
}

// ============================================================================
// Room Messages (Server → Client)
// ============================================================================

export interface RoomCreated {
  type: 'room:created'
  roomCode: string
  playerId: string
  state: GameState
  sessionToken: string // HMAC-signed token for reconnection
}

export interface RoomJoined {
  type: 'room:joined'
  roomCode: string
  playerId: string
  players: Player[]
  state: GameState
  cursors: { playerId: string; x: number; y: number; state: 'default' | 'grab' | 'grabbing' }[]
  sessionToken: string // HMAC-signed token for reconnection
}

export interface PlayerJoined {
  type: 'room:player_joined'
  player: Player
}

export interface PlayerLeft {
  type: 'room:player_left'
  playerId: string
}

export interface PlayerReconnected {
  type: 'room:player_reconnected'
  player: Player
}

export interface PlayerKicked {
  type: 'room:player_kicked'
  playerId: string
  playerName: string
  kickedBy: string // Name of the player who kicked
}

export interface PlayerBanned {
  type: 'room:player_banned'
  playerId: string
  playerName: string
  bannedBy: string // Name of the player who banned
}

export interface RoomError {
  type: 'room:error'
  code: 'NOT_FOUND' | 'FULL' | 'INVALID_CODE' | 'BANNED'
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

export interface StackSetFaces {
  type: 'stack:set_faces'
  stackId: number
  faceUp: boolean
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

export interface StackFacesSet {
  type: 'stack:faces_set'
  stackId: number
  faceUp: boolean
  cardIds: number[]
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
  convertedStack: { stackId: number; anchorX: number; anchorY: number } | null
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
// Counter Messages (Client → Server)
// ============================================================================

export interface CounterCreate {
  type: 'counter:create'
  x: number
  y: number
  label: string
  value?: number
  min?: number
  max?: number
  step?: number
  color?: string
}

export interface CounterUpdate {
  type: 'counter:update'
  counterId: number
  updates: {
    x?: number
    y?: number
    label?: string
    value?: number
    min?: number
    max?: number
    step?: number
    color?: string
  }
}

export interface CounterIncrement {
  type: 'counter:increment'
  counterId: number
  delta: number // +step or -step typically
}

export interface CounterDelete {
  type: 'counter:delete'
  counterId: number
}

export interface CounterLock {
  type: 'counter:lock'
  counterId: number
}

export interface CounterUnlock {
  type: 'counter:unlock'
  counterId: number
}

// ============================================================================
// Counter Messages (Server → Client)
// ============================================================================

export interface CounterCreated {
  type: 'counter:created'
  counter: CounterState
  playerId: string
}

export interface CounterUpdated {
  type: 'counter:updated'
  counterId: number
  counter: CounterState
  playerId: string
}

export interface CounterIncremented {
  type: 'counter:incremented'
  counterId: number
  value: number
  playerId: string
}

export interface CounterDeleted {
  type: 'counter:deleted'
  counterId: number
  playerId: string
}

export interface CounterLocked {
  type: 'counter:locked'
  counterId: number
  playerId: string
}

export interface CounterUnlocked {
  type: 'counter:unlocked'
  counterId: number
}

// ============================================================================
// Token Messages (Client → Server)
// ============================================================================

export interface TokenCreate {
  type: 'token:create'
  x: number
  y: number
  kind: 'color' | 'sprite'
  shape?: TokenShape
  color?: string
  label?: string
  sprite?: TokenSprite
  size?: TokenSize
}

export interface TokenUpdate {
  type: 'token:update'
  tokenId: number
  updates: {
    x?: number
    y?: number
    shape?: TokenShape
    color?: string
    label?: string
    sprite?: TokenSprite
    size?: TokenSize
  }
}

export interface TokenDelete {
  type: 'token:delete'
  tokenId: number
}

export interface TokenLock {
  type: 'token:lock'
  tokenId: number
}

export interface TokenUnlock {
  type: 'token:unlock'
  tokenId: number
}

// ============================================================================
// Token Messages (Server → Client)
// ============================================================================

export interface TokenCreated {
  type: 'token:created'
  token: TokenState
  playerId: string
}

export interface TokenUpdated {
  type: 'token:updated'
  tokenId: number
  token: TokenState
  playerId: string
}

export interface TokenDeleted {
  type: 'token:deleted'
  tokenId: number
  playerId: string
}

export interface TokenLocked {
  type: 'token:locked'
  tokenId: number
  playerId: string
}

export interface TokenUnlocked {
  type: 'token:unlocked'
  tokenId: number
}

// ============================================================================
// Die Messages (Client → Server)
// ============================================================================

export interface DieCreate {
  type: 'die:create'
  x: number
  y: number
  color?: string
}

export interface DieRoll {
  type: 'die:roll'
  dieId: number
}

export interface DieUpdate {
  type: 'die:update'
  dieId: number
  updates: {
    x?: number
    y?: number
    color?: string
  }
}

export interface DieDelete {
  type: 'die:delete'
  dieId: number
}

export interface DieLock {
  type: 'die:lock'
  dieId: number
}

export interface DieUnlock {
  type: 'die:unlock'
  dieId: number
}

// ============================================================================
// Die Messages (Server → Client)
// ============================================================================

export interface DieCreated {
  type: 'die:created'
  die: DieState
  playerId: string
}

export interface DieRolled {
  type: 'die:rolled'
  dieId: number
  value: DieValue // Server-generated random value
  playerId: string
}

export interface DieUpdated {
  type: 'die:updated'
  dieId: number
  die: DieState
  playerId: string
}

export interface DieDeleted {
  type: 'die:deleted'
  dieId: number
  playerId: string
}

export interface DieLocked {
  type: 'die:locked'
  dieId: number
  playerId: string
}

export interface DieUnlocked {
  type: 'die:unlocked'
  dieId: number
}

// ============================================================================
// Timer Messages (Client → Server)
// ============================================================================

export interface TimerCreate {
  type: 'timer:create'
  x: number
  y: number
  mode: TimerMode
  durationMs?: number // For countdown mode
  label?: string
}

export interface TimerStart {
  type: 'timer:start'
  timerId: number
}

export interface TimerPause {
  type: 'timer:pause'
  timerId: number
}

export interface TimerReset {
  type: 'timer:reset'
  timerId: number
}

export interface TimerUpdate {
  type: 'timer:update'
  timerId: number
  updates: {
    x?: number
    y?: number
    mode?: TimerMode
    durationMs?: number
    label?: string
  }
}

export interface TimerDelete {
  type: 'timer:delete'
  timerId: number
}

export interface TimerLock {
  type: 'timer:lock'
  timerId: number
}

export interface TimerUnlock {
  type: 'timer:unlock'
  timerId: number
}

// ============================================================================
// Timer Messages (Server → Client)
// ============================================================================

export interface TimerCreated {
  type: 'timer:created'
  timer: TimerState
  playerId: string
}

export interface TimerStarted {
  type: 'timer:started'
  timerId: number
  startedAt: number // Server timestamp
  playerId: string
}

export interface TimerPaused {
  type: 'timer:paused'
  timerId: number
  elapsedMs: number // Elapsed time when paused
  playerId: string
}

export interface TimerResetDone {
  type: 'timer:reset'
  timerId: number
  playerId: string
}

export interface TimerFinished {
  type: 'timer:finished'
  timerId: number
}

export interface TimerUpdated {
  type: 'timer:updated'
  timerId: number
  timer: TimerState
  playerId: string
}

export interface TimerDeleted {
  type: 'timer:deleted'
  timerId: number
  playerId: string
}

export interface TimerLocked {
  type: 'timer:locked'
  timerId: number
  playerId: string
}

export interface TimerUnlocked {
  type: 'timer:unlocked'
  timerId: number
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
// Viewport Messages (for selective broadcasting optimization)
// ============================================================================

export interface Viewport {
  x: number
  y: number
  width: number
  height: number
}

export interface ViewportUpdate {
  type: 'viewport:update'
  viewport: Viewport
}

// ============================================================================
// Selection Messages (for showing other players' card selections)
// ============================================================================

export interface SelectionUpdate {
  type: 'selection:update'
  cardIds: number[] // List of selected card IDs (empty to clear)
}

export interface SelectionUpdated {
  type: 'selection:updated'
  playerId: string
  playerColor: string
  cardIds: number[]
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
  stateVersion: number
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

export interface ChatTyping {
  type: 'chat:typing'
  isTyping: boolean
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

export interface ChatTypingStatus {
  type: 'chat:typing_status'
  playerId: string
  playerName: string
  isTyping: boolean
}

// ============================================================================
// Activity Log Types
// ============================================================================

export type ActivityType =
  | 'player_joined'
  | 'player_left'
  | 'player_spectating'
  | 'player_kicked'
  | 'player_banned'
  | 'card_placed'
  | 'stack_created'
  | 'stack_shuffled'
  | 'stack_flipped'
  | 'zone_created'
  | 'zone_deleted'
  | 'die_rolled'
  | 'counter_changed'
  | 'timer_started'
  | 'timer_stopped'
  | 'table_reset'
  | 'settings_changed'

export interface ActivityLogEntry {
  id: number
  playerId: string | null
  playerName: string | null
  actionType: ActivityType
  actionData?: Record<string, unknown>
  timestamp: number
}

// ============================================================================
// Activity Log Messages (Server → Client)
// ============================================================================

export interface ActivityLogged {
  type: 'activity:logged'
  entry: ActivityLogEntry
}

export interface ActivityHistory {
  type: 'activity:history'
  entries: ActivityLogEntry[]
}

// ============================================================================
// Heartbeat Messages (for connection health monitoring)
// ============================================================================

export interface Ping {
  type: 'ping'
  timestamp: number
}

export interface Pong {
  type: 'pong'
  timestamp: number
}

// ============================================================================
// Error Messages
// ============================================================================

export interface ActionError {
  type: 'error'
  originalAction: string
  code: ErrorCode
  message: string
  requestId?: string // Echoed from client message for correlation
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
  | 'PERMISSION_DENIED'
  | 'SPECTATOR_READONLY'
  | 'KICKED'
  | 'BANNED'

// ============================================================================
// Union Types for Message Handling
// ============================================================================

// Base client message union (internal)
type ClientMessageBase =
  | RoomCreate
  | RoomJoin
  | RoomLeave
  | RoomListRequest
  | PlayerKick
  | PlayerBan
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
  | StackSetFaces
  | StackReorder
  | ZoneCreate
  | ZoneUpdate
  | ZoneDelete
  | ZoneAddCard
  | ZoneAddCards
  | CounterCreate
  | CounterUpdate
  | CounterIncrement
  | CounterDelete
  | CounterLock
  | CounterUnlock
  | TokenCreate
  | TokenUpdate
  | TokenDelete
  | TokenLock
  | TokenUnlock
  | DieCreate
  | DieRoll
  | DieUpdate
  | DieDelete
  | DieLock
  | DieUnlock
  | TimerCreate
  | TimerStart
  | TimerPause
  | TimerReset
  | TimerUpdate
  | TimerDelete
  | TimerLock
  | TimerUnlock
  | HandAdd
  | HandRemove
  | HandReorder
  | HandAddStack
  | SelectionStack
  | CursorUpdate
  | SelectionUpdate
  | ViewportUpdate
  | StateRequest
  | TableReset
  | TableUpdateSettings
  | TableUpdateVisibility
  | TableUpdateName
  | ChatSend
  | ChatTyping
  | Pong

// All client messages can optionally include a requestId for error correlation
export type ClientMessage = ClientMessageBase & { requestId?: string }

// Base server message union (internal)
type ServerMessageBase =
  | RoomCreated
  | RoomJoined
  | PlayerJoined
  | PlayerLeft
  | PlayerReconnected
  | PlayerKicked
  | PlayerBanned
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
  | StackFacesSet
  | StackReordered
  | ZoneCreated
  | ZoneUpdated
  | ZoneDeleted
  | ZoneCardAdded
  | ZoneCardsAdded
  | CounterCreated
  | CounterUpdated
  | CounterIncremented
  | CounterDeleted
  | CounterLocked
  | CounterUnlocked
  | TokenCreated
  | TokenUpdated
  | TokenDeleted
  | TokenLocked
  | TokenUnlocked
  | DieCreated
  | DieRolled
  | DieUpdated
  | DieDeleted
  | DieLocked
  | DieUnlocked
  | TimerCreated
  | TimerStarted
  | TimerPaused
  | TimerResetDone
  | TimerFinished
  | TimerUpdated
  | TimerDeleted
  | TimerLocked
  | TimerUnlocked
  | HandCardAdded
  | HandCardAddedOther
  | HandCardRemoved
  | HandReordered
  | HandStackAdded
  | HandStackAddedOther
  | SelectionStacked
  | CursorUpdated
  | SelectionUpdated
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
  | ChatTypingStatus
  | ActivityLogged
  | ActivityHistory
  | Ping

// All server messages can optionally include a requestId echoed from the client for correlation
export type ServerMessage = ServerMessageBase & { requestId?: string }

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
