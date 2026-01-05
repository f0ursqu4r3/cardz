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
