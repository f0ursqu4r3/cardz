# Multiplayer Protocol Specification

Server-authoritative multiplayer architecture for cardz.

---

## Architecture Overview

```text
┌─────────────────┐     WebSocket     ┌─────────────────┐
│   Client A      │◄─────────────────►│                 │
└─────────────────┘                   │                 │
                                      │     Server      │
┌─────────────────┐     WebSocket     │  (Authoritative)│
│   Client B      │◄─────────────────►│                 │
└─────────────────┘                   │                 │
                                      │                 │
┌─────────────────┐     WebSocket     │                 │
│   Client N      │◄─────────────────►│                 │
└─────────────────┘                   └─────────────────┘
```

### Design Principles

1. **Server-Authoritative**: Server is the single source of truth for all game state
2. **Optimistic Updates**: Clients may show immediate feedback, but server confirms/rejects
3. **Event Sourcing**: All state changes are represented as discrete actions
4. **Eventual Consistency**: Clients sync to server state on reconnection

---

## Connection & Session

### Room Management

| Message              | Direction | Description                      |
| -------------------- | --------- | -------------------------------- |
| `room:create`        | C→S       | Create a new room                |
| `room:join`          | C→S       | Join existing room by code       |
| `room:leave`         | C→S       | Leave current room               |
| `room:created`       | S→C       | Room created, includes room code |
| `room:joined`        | S→C       | Successfully joined room         |
| `room:player_joined` | S→C       | Another player joined            |
| `room:player_left`   | S→C       | Another player left              |
| `room:error`         | S→C       | Room operation failed            |

### Session Messages

```typescript
// Client → Server
interface RoomCreate {
  type: 'room:create'
  playerName: string
}

interface RoomJoin {
  type: 'room:join'
  roomCode: string
  playerName: string
}

interface RoomLeave {
  type: 'room:leave'
}

// Server → Client
interface RoomCreated {
  type: 'room:created'
  roomCode: string
  playerId: string
  state: GameState
}

interface RoomJoined {
  type: 'room:joined'
  roomCode: string
  playerId: string
  players: Player[]
  state: GameState
}

interface PlayerJoined {
  type: 'room:player_joined'
  player: Player
}

interface PlayerLeft {
  type: 'room:player_left'
  playerId: string
}

interface RoomError {
  type: 'room:error'
  code: 'NOT_FOUND' | 'FULL' | 'INVALID_CODE'
  message: string
}
```

---

## Shared Types

```typescript
interface Player {
  id: string
  name: string
  connected: boolean
  color: string // For cursor/highlight color
}

interface CardState {
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

interface StackState {
  id: number
  cardIds: number[]
  anchorX: number
  anchorY: number
  kind: 'zone' | 'free'
  zoneId?: number
  lockedBy: string | null // Player currently dragging this stack
}

interface ZoneState {
  id: number
  x: number
  y: number
  width: number
  height: number
  label: string
  faceUp: boolean
  locked: boolean
  stackId: number | null
}

interface HandState {
  playerId: string
  cardIds: number[] // Only visible to owner; others see count only
}

interface GameState {
  cards: CardState[]
  stacks: StackState[]
  zones: ZoneState[]
  hands: HandState[]
  nextStackId: number
  nextZoneId: number
  zCounter: number
}
```

---

## Card Actions

### Move Card

Player drags a single card to a new position.

```typescript
// Client → Server (Intent)
interface CardMoveIntent {
  type: 'card:move'
  cardId: number
  x: number
  y: number
}

// Server → All Clients (Confirmed)
interface CardMoved {
  type: 'card:moved'
  cardId: number
  x: number
  y: number
  z: number
  playerId: string // Who moved it
}

// Server → Client (Rejected)
interface CardMoveRejected {
  type: 'card:move_rejected'
  cardId: number
  reason: 'LOCKED' | 'NOT_FOUND' | 'IN_HAND'
  currentState: { x: number; y: number } // Snap back position
}
```

### Lock/Unlock Card (Drag Start/End)

Prevents other players from manipulating the same card.

```typescript
// Client → Server
interface CardLock {
  type: 'card:lock'
  cardId: number
}

interface CardUnlock {
  type: 'card:unlock'
  cardId: number
}

// Server → All Clients
interface CardLocked {
  type: 'card:locked'
  cardId: number
  playerId: string
}

interface CardUnlocked {
  type: 'card:unlocked'
  cardId: number
}
```

### Flip Card

```typescript
// Client → Server
interface CardFlip {
  type: 'card:flip'
  cardId: number
}

// Server → All Clients
interface CardFlipped {
  type: 'card:flipped'
  cardId: number
  faceUp: boolean
  playerId: string
}
```

---

## Stack Actions

### Create Stack

When cards are stacked together.

```typescript
// Client → Server
interface StackCreate {
  type: 'stack:create'
  cardIds: number[]
  anchorX: number
  anchorY: number
}

// Server → All Clients
interface StackCreated {
  type: 'stack:created'
  stack: StackState
  cardUpdates: { cardId: number; x: number; y: number; z: number }[]
  playerId: string
}
```

### Move Stack

```typescript
// Client → Server
interface StackMove {
  type: 'stack:move'
  stackId: number
  anchorX: number
  anchorY: number
}

// Server → All Clients
interface StackMoved {
  type: 'stack:moved'
  stackId: number
  anchorX: number
  anchorY: number
  cardUpdates: { cardId: number; x: number; y: number }[]
  playerId: string
}
```

### Lock/Unlock Stack

```typescript
// Client → Server
interface StackLock {
  type: 'stack:lock'
  stackId: number
}

interface StackUnlock {
  type: 'stack:unlock'
  stackId: number
}

// Server → All Clients
interface StackLocked {
  type: 'stack:locked'
  stackId: number
  playerId: string
}

interface StackUnlocked {
  type: 'stack:unlocked'
  stackId: number
}
```

### Add Card to Stack

```typescript
// Client → Server
interface StackAddCard {
  type: 'stack:add_card'
  stackId: number
  cardId: number
}

// Server → All Clients
interface StackCardAdded {
  type: 'stack:card_added'
  stackId: number
  cardId: number
  cardState: { x: number; y: number; z: number; faceUp: boolean }
  playerId: string
}
```

### Remove Card from Stack

```typescript
// Client → Server
interface StackRemoveCard {
  type: 'stack:remove_card'
  cardId: number
}

// Server → All Clients
interface StackCardRemoved {
  type: 'stack:card_removed'
  stackId: number
  cardId: number
  stackDeleted: boolean // If stack is now empty
  playerId: string
}
```

### Merge Stacks

```typescript
// Client → Server
interface StackMerge {
  type: 'stack:merge'
  sourceStackId: number
  targetStackId: number
}

// Server → All Clients
interface StacksMerged {
  type: 'stack:merged'
  sourceStackId: number // Deleted
  targetStackId: number
  targetStack: StackState
  cardUpdates: { cardId: number; x: number; y: number; z: number }[]
  playerId: string
}
```

### Shuffle Stack

```typescript
// Client → Server
interface StackShuffle {
  type: 'stack:shuffle'
  stackId: number
}

// Server → All Clients
interface StackShuffled {
  type: 'stack:shuffled'
  stackId: number
  newOrder: number[] // New card ID order
  cardUpdates: { cardId: number; x: number; y: number }[]
  playerId: string
}
```

### Flip Stack

```typescript
// Client → Server
interface StackFlip {
  type: 'stack:flip'
  stackId: number
}

// Server → All Clients
interface StackFlipped {
  type: 'stack:flipped'
  stackId: number
  cardUpdates: { cardId: number; faceUp: boolean }[]
  playerId: string
}
```

---

## Zone Actions

### Create Zone

```typescript
// Client → Server
interface ZoneCreate {
  type: 'zone:create'
  x: number
  y: number
  width: number
  height: number
  label: string
  faceUp: boolean
}

// Server → All Clients
interface ZoneCreated {
  type: 'zone:created'
  zone: ZoneState
  playerId: string
}
```

### Update Zone

```typescript
// Client → Server
interface ZoneUpdate {
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
  }
}

// Server → All Clients
interface ZoneUpdated {
  type: 'zone:updated'
  zoneId: number
  zone: ZoneState
  stackUpdate?: { stackId: number; anchorX: number; anchorY: number }
  cardUpdates?: { cardId: number; x: number; y: number }[]
  playerId: string
}
```

### Delete Zone

```typescript
// Client → Server
interface ZoneDelete {
  type: 'zone:delete'
  zoneId: number
}

// Server → All Clients
interface ZoneDeleted {
  type: 'zone:deleted'
  zoneId: number
  stackDeleted: number | null // Stack ID if one was deleted
  scatteredCards: { cardId: number; x: number; y: number }[]
  playerId: string
}
```

### Add Card to Zone

```typescript
// Client → Server
interface ZoneAddCard {
  type: 'zone:add_card'
  zoneId: number
  cardId: number
}

// Server → All Clients
interface ZoneCardAdded {
  type: 'zone:card_added'
  zoneId: number
  stackId: number
  stackCreated: boolean
  cardState: { cardId: number; x: number; y: number; z: number; faceUp: boolean }
  playerId: string
}
```

---

## Hand Actions

### Add to Hand

```typescript
// Client → Server
interface HandAdd {
  type: 'hand:add'
  cardId: number
}

// Server → Requesting Client (Full info)
interface HandCardAdded {
  type: 'hand:card_added'
  cardId: number
  cardState: CardState
}

// Server → Other Clients (Hidden info)
interface HandCardAddedOther {
  type: 'hand:card_added_other'
  playerId: string
  handCount: number // Just the count, not the card
}
```

### Remove from Hand

```typescript
// Client → Server
interface HandRemove {
  type: 'hand:remove'
  cardId: number
  x: number
  y: number
}

// Server → All Clients
interface HandCardRemoved {
  type: 'hand:card_removed'
  playerId: string
  cardState: CardState // Now visible to all
}
```

### Reorder Hand

```typescript
// Client → Server
interface HandReorder {
  type: 'hand:reorder'
  fromIndex: number
  toIndex: number
}

// Server → Client (Confirmation only, others don't see)
interface HandReordered {
  type: 'hand:reordered'
  newOrder: number[]
}
```

### Add Stack to Hand

```typescript
// Client → Server
interface HandAddStack {
  type: 'hand:add_stack'
  stackId: number
}

// Server → Requesting Client
interface HandStackAdded {
  type: 'hand:stack_added'
  cardIds: number[]
  newHand: number[]
}

// Server → Other Clients
interface HandStackAddedOther {
  type: 'hand:stack_added_other'
  playerId: string
  stackDeleted: number
  handCount: number
}
```

---

## Selection Actions

Selections are client-local and don't need synchronization, **except** when performing operations on selected cards.

### Stack Selection

```typescript
// Client → Server
interface SelectionStack {
  type: 'selection:stack'
  cardIds: number[]
  anchorX: number
  anchorY: number
}

// Server → All Clients
interface SelectionStacked {
  type: 'selection:stacked'
  stack: StackState
  cardUpdates: { cardId: number; x: number; y: number; z: number }[]
  playerId: string
}
```

---

## Presence & Cursors (Optional)

Real-time cursor positions for collaborative feel.

```typescript
// Client → Server (Throttled, ~10-20 Hz)
interface CursorUpdate {
  type: 'cursor:update'
  x: number
  y: number
}

// Server → Other Clients
interface CursorUpdated {
  type: 'cursor:updated'
  playerId: string
  x: number
  y: number
}
```

---

## State Synchronization

### Full Sync

Used on join and reconnection.

```typescript
// Server → Client
interface StateSync {
  type: 'state:sync'
  state: GameState
  yourHand: number[] // Full card IDs for this player
  handCounts: { playerId: string; count: number }[] // Others' hand sizes
}
```

### Delta Sync (Optional Optimization)

For bandwidth optimization on slow connections.

```typescript
// Server → Client
interface StateDelta {
  type: 'state:delta'
  sequence: number
  changes: StateChange[]
}

type StateChange =
  | { op: 'card:update'; cardId: number; changes: Partial<CardState> }
  | { op: 'stack:update'; stackId: number; changes: Partial<StackState> }
  | { op: 'stack:delete'; stackId: number }
  | { op: 'zone:update'; zoneId: number; changes: Partial<ZoneState> }
  | { op: 'zone:delete'; zoneId: number }
```

---

## Error Handling

### Generic Error

```typescript
interface ActionError {
  type: 'error'
  originalAction: string
  code: ErrorCode
  message: string
}

type ErrorCode =
  | 'CARD_LOCKED'
  | 'STACK_LOCKED'
  | 'NOT_FOUND'
  | 'INVALID_ACTION'
  | 'NOT_IN_HAND'
  | 'NOT_YOUR_CARD'
  | 'ZONE_LOCKED'
  | 'RATE_LIMITED'
```

---

## Message Flow Examples

### Example: Player A Drags Card

```
1. Client A → Server:  { type: 'card:lock', cardId: 5 }
2. Server → All:       { type: 'card:locked', cardId: 5, playerId: 'A' }
3. Client A → Server:  { type: 'card:move', cardId: 5, x: 200, y: 150 }
4. Server → All:       { type: 'card:moved', cardId: 5, x: 200, y: 150, z: 105, playerId: 'A' }
5. Client A → Server:  { type: 'card:unlock', cardId: 5 }
6. Server → All:       { type: 'card:unlocked', cardId: 5 }
```

### Example: Player B Creates Stack

```
1. Client B hovers card 3 over card 7 for 250ms
2. Client B → Server:  { type: 'stack:create', cardIds: [7, 3], anchorX: 100, anchorY: 200 }
3. Server validates both cards are free (not locked, not in hand)
4. Server → All:       { type: 'stack:created', stack: {...}, cardUpdates: [...], playerId: 'B' }
```

### Example: Concurrent Conflict

```
1. Client A → Server:  { type: 'card:lock', cardId: 5 }
2. Client B → Server:  { type: 'card:lock', cardId: 5 }  (arrives 5ms later)
3. Server → All:       { type: 'card:locked', cardId: 5, playerId: 'A' }
4. Server → Client B:  { type: 'error', code: 'CARD_LOCKED', message: 'Card is locked by another player' }
```

### Example: Hand Privacy

```
1. Client A → Server:  { type: 'hand:add', cardId: 10 }
2. Server removes card 10 from table state
3. Server → Client A:  { type: 'hand:card_added', cardId: 10, cardState: {...} }
4. Server → Clients B,C: { type: 'hand:card_added_other', playerId: 'A', handCount: 3 }
```

---

## Server Implementation Notes

### Locking Strategy

- Cards and stacks can be locked by at most one player
- Locks should auto-expire after timeout (e.g., 30 seconds) to handle disconnects
- Lock holder can perform move operations without re-acquiring lock

### State Validation

Server must validate:

- Card/stack exists
- Card/stack is not locked by another player
- Card is not in another player's hand
- Stack operations only on top card (for pull operations)
- Zone bounds are within canvas

### Broadcast Optimization

- Card moves during drag: Consider throttling or only sending on release
- Cursor updates: Throttle to ~60-100ms intervals
- Batch multiple changes into single message when possible

### Persistence (Optional)

- Room state can be persisted for reconnection
- Action log enables replay/undo functionality
- Consider Redis for real-time state, PostgreSQL for persistence

---

## Client Implementation Notes

### Optimistic Updates

For responsive feel:

For responsive feel:

1. Apply change locally immediately
2. Send intent to server
3. If rejected, rollback to server state

### Reconnection

1. On disconnect, show connection indicator
2. On reconnect, request full state sync
3. Re-apply any pending local changes

### Visual Feedback

- Show colored highlight/cursor for other players' locked items
- Dim cards locked by others
- Show player name tooltip on hover of locked items

---

## Recommended Tech Stack

### Runtime & Framework

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Runtime** | Bun | Faster than Node, native TypeScript, built-in test runner |
| **WebSocket** | uWebSockets.js | C++ backed, handles 1M+ connections, used by Discord |
| **Validation** | Zod | Runtime type checking, shared with client |
| **State Store** | Redis | Pub/sub for scaling, fast in-memory state |

### Why TypeScript

1. **Shared Types** - Protocol types work on both client and server
2. **Ecosystem Familiarity** - Same tooling as the Vue client
3. **Monorepo Friendly** - Share validation, constants, and types
4. **Developer Velocity** - Faster iteration than Rust with good-enough performance

### Project Structure

```text
cardz/
├── src/                    # Vue client (existing)
├── server-src/             # Game server
│   ├── index.ts            # Entry point, uWS setup
│   ├── room.ts             # Room management
│   ├── game-state.ts       # Authoritative game state
│   ├── handlers/           # Message handlers
│   │   ├── card.ts
│   │   ├── stack.ts
│   │   ├── zone.ts
│   │   ├── hand.ts
│   │   └── room.ts
│   ├── validation.ts       # Zod schemas for messages
│   └── utils/
│       ├── broadcast.ts    # Send to room/player helpers
│       └── locks.ts        # Lock management with TTL
├── shared/                 # Shared between client & server
│   └── types.ts            # Protocol types (extract from docs)
└── package.json            # Workspace config
```

### Scaling Architecture

```text
                    Load Balancer (sticky sessions by room)
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
    ┌─────────┐                ┌─────────┐                ┌─────────┐
    │Server 1 │                │Server 2 │                │Server N │
    │ Rooms   │                │ Rooms   │                │ Rooms   │
    │ A, B, C │                │ D, E, F │                │ G, H, I │
    └────┬────┘                └────┬────┘                └────┬────┘
         │                          │                          │
         └──────────────────────────┼──────────────────────────┘
                                    ▼
                             ┌─────────────┐
                             │    Redis    │
                             │   Cluster   │
                             ├─────────────┤
                             │ • Pub/Sub   │
                             │ • Room list │
                             │ • Presence  │
                             └─────────────┘
```

### Key Dependencies

```json
{
  "dependencies": {
    "uWebSockets.js": "github:uNetworking/uWebSockets.js#v20.44.0",
    "zod": "^3.22.0",
    "redis": "^4.6.0",
    "nanoid": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/bun": "latest"
  }
}
```

### Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Connections/server | 10,000+ | With uWebSockets.js |
| Message latency | <50ms p99 | Same-region |
| Rooms/server | 1,000+ | ~10 players/room avg |
| Memory/connection | ~10KB | Excluding game state |

---

## Future Considerations

- [ ] **Spectator Mode**: Read-only observers
- [ ] **Turn System**: Optional turn-based mode
- [ ] **Card Reveal**: Show card to specific player(s)
- [ ] **Private Zones**: Areas only visible to zone owner
- [ ] **Action History**: Undo/redo with server validation
- [ ] **Permissions**: Host controls (kick, lock table, etc.)
- [ ] **Voice/Video**: WebRTC integration
- [ ] **Mobile Gestures**: Touch-specific protocol extensions
