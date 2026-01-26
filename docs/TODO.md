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

### Game Entities

- [x] Dice with rolling animation and pip visualization
- [x] Counters with increment/decrement and configurable min/max/step
- [x] Tokens (color shapes: circle, square, star, triangle; sprite icons: star, skull, coin, heart, shield, gem)
- [x] Timers with countdown and stopwatch modes
- [x] Card face-up/face-down flipping

### Host Controls

- [x] Creator/member role system
- [x] Creator-only permissions (reset table, update settings, change visibility, rename table)

### UI/UX

- [x] Toast notification system (error, success, info)
- [x] Radial menu for context actions

### Server

- [x] Persistent chat history (database storage)
- [x] Analytics dashboard (active tables, players, usage stats)
- [x] Admin panel for server monitoring (`/admin` route)

### Moderation

- [x] Spectator mode (view-only access)
- [x] Table activity log (record actions taken by players)
- [x] Kick/ban players (creator can kick or ban players from the table)

---

## Future Features 🚀

### Table Enhancements

- [ ] Ambient music/sounds
- [ ] Table templates (save/load configurations)
- [ ] Undo/redo action history

### Custom Content

- [ ] Custom card decks (upload images)
- [ ] Card annotations/markers

### Social Enhancements

- [ ] Turn system (optional turn-based mode)
- [ ] Voice/video chat (WebRTC)
- [ ] Private messaging between players

### Advanced Card Mechanics

- [ ] Card reveal (show card to specific players)
- [ ] Card flipping animation (3D rotation effect)
- [ ] Deal animation (distribute cards from deck)
- [ ] Fan spread (view all cards in stack)
- [ ] Peek at cards without revealing

### Moderation (Continued)

- [ ] Player reporting system
- [ ] Lock table (prevent new joins, spectators only, invite-only)
- [ ] Granular permission system (who can manage the table, move cards, create zones, etc.)

### Server Enhancements

- [ ] Horizontal scaling (multiple server instances)
- [ ] Automated backups of game state
