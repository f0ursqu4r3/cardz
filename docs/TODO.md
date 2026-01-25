# Todo List

## Completed Features ✅

### Table Management

- [x] Server-side persistence of tables and game state (SQLite)
- [x] Button to reset table to initial state
- [x] Table visibility (public/private)
- [x] Table settings (background themes)
- [x] Improved table browser (search, filters, sorting)
- [x] Minimap with "current view" rectangle contained within bounds
- [x] Table name editable from the table view

### Cards & Zones

- [x] Cards in-hand order preserved on server sync
- [x] Zone visibility settings (public, owner-only, hidden)
- [x] Multi-select from hand
- [x] Zone card layouts (stack, row, column, grid, fan, circle)
- [x] Zone card settings (scale, spacing, random offset, random rotation)
- [x] Cannot select cards in the middle of a stack
- [x] Stack height based on number of cards, not pixel height
- [x] Non-stack layouts support pulling any card
- [x] Shuffle stacks by shaking
- [x] Zone card reordering (drag cards within zones to reorder)

### Social Features

- [x] Hand card counts visible to other players
- [x] Chat system with history
- [x] Remote player cursors with state indicators (default, grab, grabbing)
- [x] Player names and colors
- [x] Player cursors show correctly after page refresh
- [x] Auto-rejoin room after connection drop
- [x] Spaces work in chat messages

---

## Code Audit Fixes 🔧

### 🔴 Critical Security (Fix Immediately)

- [x] Use `crypto.getRandomValues()` for room code generation (server-src/room.ts:24-31)
- [ ] Add role-based authorization (creator vs player permissions)
- [x] Validate WebSocket origin header to prevent CSRF (server-src/index.ts:115-131)
- [ ] Fix session hijacking - add HMAC-signed session tokens (server-src/room.ts:336-357)
- [x] Add rate limiting on WebSocket messages (server-src/index.ts:168-196)
- [x] Add security headers (CSP, X-Frame-Options, X-Content-Type-Options, HSTS)

### 🟠 High Priority Code Quality

- [x] Remove `as any` type casts in server handlers (server-src/index.ts:164-468)
- [x] Fix memory leak: add timer cleanup in useHand.ts (onUnmounted for longPressTimer)
- [x] Fix memory leak: add RAF cleanup in useDrag.ts (onUnmounted)
- [x] Fix memory leak: clean up message handlers in useWebSocket.ts on unmount
- [x] Fix race condition: make lock check + operation atomic (server-src/handlers/card.ts:20-30)
- [x] Deduplicate getClientData() function (defined 4x across handler files)
- [x] Deduplicate zone layout calculations (cards.ts and useCardInteraction.ts)

### 🟡 Medium Priority

- [x] Add proper error handling for silent catch blocks (server-src/index.ts:95-97)
- [x] Add database operation error handling (server-src/persistence.ts:114-141)
- [x] Add Vue error boundary component for graceful failure recovery
- [ ] Optimize O(n²) card lookups in useCardInteraction.ts:177-193
- [ ] Split useWebSocket.ts (862 lines) into focused composables
- [ ] Add request IDs to message protocol for better error correlation
- [x] Sanitize zone labels and chat messages for XSS prevention

### 🟢 Testing

- [ ] Add server-side unit tests (GameStateManager, handlers, persistence)
- [ ] Add client-server integration tests
- [ ] Add E2E multiplayer scenario tests

### 📐 Architecture Improvements

- [ ] Add state versioning for client/server consistency
- [ ] Implement viewport-based selective broadcasting
- [ ] Add heartbeat/keep-alive mechanism for connection health
- [ ] Configuration schema with validation (make timeouts/limits configurable)

---

## Future Features 🚀

### Table Management

- [ ] Table settings (ambient music/sounds)
- [ ] Table templates (save/load table configurations)
- [ ] Undo/redo action history

### Game Entities

- [ ] Additional entities (counters, tokens, dice, timers)
- [ ] Custom card decks (upload images)
- [ ] Card annotations/markers

### Social Features

- [ ] Spectator mode (read-only observers)
- [ ] Turn system (optional turn-based mode)
- [ ] Voice/video chat (WebRTC)
- [ ] Private messaging between players

### Advanced Card Mechanics

- [ ] Card reveal (show card to specific players)
- [ ] Deal animation (distribute cards from deck)
- [ ] Fan spread (view all cards in stack)
- [ ] Peek at cards without revealing

### Host Controls

- [ ] Kick/ban players
- [ ] Lock table (prevent new joins)
- [ ] Permission system (who can move cards, create zones, etc.)
