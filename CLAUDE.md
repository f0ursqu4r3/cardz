# CLAUDE.md

## Project Overview

**cardz** — A real-time multiplayer card manipulation sandbox (virtual tabletop). Players can drag, stack, shuffle, flip cards, manage zones, hands, counters, tokens, dice, and timers in shared rooms via WebSocket.

## Tech Stack

- **Frontend:** Vue 3 (Composition API, `<script setup>`), TypeScript, Pinia, Vue Router, Vite
- **Backend:** Bun runtime, native Bun WebSocket API, Zod validation, SQLite persistence
- **Shared:** `shared/types.ts` defines protocol types used by both client and server
- **Testing:** Vitest (frontend), Bun test runner (backend)
- **Linting:** Oxlint + ESLint (dual pass), Prettier
- **Package manager:** `bun`

## Project Structure

```
src/                  # Vue 3 frontend
  components/         # Vue components (PascalCase, *Comp.vue suffix)
  composables/        # use* composition functions
  stores/             # Pinia stores (composition API style)
  views/              # Route views
  types/              # Frontend types
  __tests__/          # Vitest tests (*.spec.ts)
server-src/           # Bun WebSocket server
  handlers/           # Message handlers by domain
  utils/              # Server utilities
  __tests__/          # Bun tests (*.test.ts)
shared/               # Shared types between client/server
  types.ts            # Protocol contracts (CardState, GameState, etc.)
docs/                 # SPEC.md, MULTIPLAYER.md, TODO.md
```

## Commands

```bash
# Frontend
bun install            # Install dependencies
bun dev                # Vite dev server
bun run build          # Type-check + build
bun run type-check     # vue-tsc type checking
bun run lint           # Oxlint then ESLint
bun run format         # Prettier
bun test:unit          # Vitest

# Backend (run from server-src/)
bun run dev            # Watch mode server
bun run typecheck      # TypeScript check
bun run test           # Bun test runner

# Combined (from root)
bun run dev:server     # Server in watch mode
bun run start          # Production start
```

## Code Conventions

- **No semicolons**, single quotes, 100 char print width (Prettier)
- **Components:** `<script setup lang="ts">`, scoped styles, PascalCase filenames with `Comp` suffix
- **Composables:** `use` prefix, return reactive refs/computed, accept options objects
- **Pinia stores:** Composition API (`defineStore('name', () => { ... })`), use `ref()` / `computed()` / functions
- **Server handlers:** `(ws, msg, manager, room) => void` signature, Zod validation before processing
- **Imports:** `@/` alias maps to `src/`, shared types via `../shared/types`
- **Tests:** `describe` / `it` / `expect` pattern; frontend `.spec.ts`, backend `.test.ts`
- **Indent:** 2 spaces, LF line endings

## Architecture

- **Server-authoritative:** Client sends actions, server validates with Zod, updates state, broadcasts
- **Optimistic updates** with server reconciliation on the client
- **Lock-based concurrency** (LockManager) prevents race conditions on server
- **Rate limiting** per WebSocket connection
- **Session persistence** via localStorage sessionId with auto-rejoin
- **Viewport-based broadcasting** to reduce network traffic
- **CSS variable-driven rendering** for card sprites and theming
