# Todo List

## Completed ✅

- [x] Table: persistence (SQLite), reset, visibility, settings, browser, minimap bounds, rename
- [x] Cards/zones: hand order sync, visibility, multi-select, layouts + settings, stack rules, shuffle, reorder
- [x] Social: chat history, cursors + names/colors, auto-rejoin, hand counts
- [x] Entities: dice (multi-select/roll), counters, tokens, timers, card flip, minimap entities
- [x] Host/mod: roles, creator permissions, spectator, activity log, kick/ban, moderator role
- [x] UI/UX: toasts, radial menu
- [x] Server/admin: analytics dashboard, admin panel
- [x] Reconnect UX + integrity (restore hands/locks, explicit reconnected state)
- [x] Role tools UI + moderation audit log visibility
- [x] Table snapshots (manual save/restore) + autosave indicator
- [x] Spectator polish (view-only cursor/chat, banner, request-to-play)

---

## Roadmap 🚀

### MVP (next 1–2 sprints)

-- all MVP items complete --

### Next (2–4 sprints)

- [ ] Undo/redo action history
- [ ] Zone templates + visibility/locking rules
- [ ] Optimize client ID maps (incremental maps vs rebuilds in card store)
- [ ] Performance settings (low-latency drag, reduce effects)
- [ ] Chat upgrades (mentions/pings, timestamps toggle, moderation queue)
- [ ] Mobile HUD + gesture improvements
- [ ] Table templates (save/load configurations)

### Later / Backlog

- [ ] Ambient music/sounds
- [ ] Custom card decks (upload images)
- [ ] Card annotations/markers
- [ ] Turn system (optional turn-based mode)
- [ ] Voice/video chat (WebRTC)
- [ ] Private messaging between players
- [ ] Card reveal (show card to specific players)
- [ ] Deal animation (distribute cards from deck)
- [ ] Fan spread (view all cards in stack)
- [ ] Peek at cards without revealing
- [ ] Player reporting system
- [ ] Lock table (prevent new joins, spectators only, invite-only)
- [ ] Granular permission system (who can manage the table, move cards, create zones, etc.)
- [ ] Horizontal scaling (multiple server instances)
- [ ] Automated backups of game state
