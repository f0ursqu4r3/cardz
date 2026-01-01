# cardz

A card manipulation sandbox with drag-and-drop interactions, stacking mechanics, and deck management.

---

## Entities

### Card

A single playing card that can be moved, stacked, and organized.

| Property   | Type             | Description                                 |
| ---------- | ---------------- | ------------------------------------------- |
| `id`       | `number`         | Unique identifier                           |
| `col`      | `number`         | Sprite column in tilemap (0-4)              |
| `row`      | `number`         | Sprite row in tilemap (0-4)                 |
| `x`        | `number`         | X position on canvas (pixels)               |
| `y`        | `number`         | Y position on canvas (pixels)               |
| `z`        | `number`         | Base z-index for rendering order            |
| `stackId`  | `number \| null` | ID of stack this card belongs to, or `null` |
| `isInDeck` | `boolean`        | Whether card is part of any stack           |

### Stack

A collection of cards sharing a common anchor position.

| Property  | Type               | Description                              |
| --------- | ------------------ | ---------------------------------------- |
| `id`      | `number`           | Unique identifier                        |
| `cardIds` | `number[]`         | Ordered list of card IDs (bottom to top) |
| `anchorX` | `number`           | X position of stack anchor               |
| `anchorY` | `number`           | Y position of stack anchor               |
| `kind`    | `'zone' \| 'free'` | Stack type (see below)                   |

**Stack Kinds:**

- `zone` — Anchored to a UI element (e.g., deck zone). Position updates when UI moves.
- `free` — Anchored to canvas coordinates. Created when cards are stacked freely.

### Canvas

The play area where cards exist and can be manipulated.

| Property | Type     | Description             |
| -------- | -------- | ----------------------- |
| `width`  | `number` | Canvas width in pixels  |
| `height` | `number` | Canvas height in pixels |

### Deck Zone

A designated drop target for organizing cards.

| Property | Type     | Description                 |
| -------- | -------- | --------------------------- |
| `x`      | `number` | Position relative to canvas |
| `y`      | `number` | Position relative to canvas |
| `width`  | `number` | Hit area width              |
| `height` | `number` | Hit area height             |

---

## Interactions

### Card → Canvas

| Action   | Trigger              | Result                                       |
| -------- | -------------------- | -------------------------------------------- |
| **Drag** | Pointer down + move  | Card follows pointer, z-index elevated       |
| **Drop** | Pointer up on canvas | Card stays at drop position, z-index updated |

### Card → Card

| Action          | Trigger                                                  | Result                                       |
| --------------- | -------------------------------------------------------- | -------------------------------------------- |
| **Hover Stack** | Hold card over another card for `STACK_HOVER_MS` (250ms) | Target card shows stack indicator            |
| **Stack**       | Release while hover-ready                                | Cards form a `free` stack at target position |

### Card → Stack

| Action           | Trigger                         | Result                                |
| ---------------- | ------------------------------- | ------------------------------------- |
| **Pull Top**     | Drag card that is top of stack  | Card removed from stack, becomes free |
| **Pull Middle**  | Drag card not on top            | Blocked — only top card can be pulled |
| **Add to Stack** | Hover + release on stacked card | Card added to top of existing stack   |

### Card → Deck Zone

| Action          | Trigger                     | Result                                       |
| --------------- | --------------------------- | -------------------------------------------- |
| **Add to Deck** | Release card over deck zone | Card added to deck stack (creates if needed) |

### Stack → Canvas

| Action         | Trigger                                              | Result                                |
| -------------- | ---------------------------------------------------- | ------------------------------------- |
| **Drag Stack** | Long press (`LONG_PRESS_MS` = 500ms) on stacked card | Entire stack follows pointer          |
| **Drop Stack** | Release on canvas                                    | Stack anchor updated to drop position |

### Stack → Deck Zone

| Action            | Trigger                      | Result                                |
| ----------------- | ---------------------------- | ------------------------------------- |
| **Merge to Deck** | Release stack over deck zone | All cards in stack move to deck stack |

---

## Z-Index Hierarchy

Cards are rendered with the following z-index priority (highest on top):

| Priority | Condition             | Z-Index Range               |
| -------- | --------------------- | --------------------------- |
| 1        | Dragging stack        | `2000 + pos`                |
| 2        | Actively dragged card | `1900`                      |
| 3        | Card in stack         | `1000 + stackIdx*100 + pos` |
| 4        | Free card             | `10 + card.z`               |

---

## Constants

| Name             | Value | Description                                   |
| ---------------- | ----- | --------------------------------------------- |
| `CARD_W`         | `42`  | Card width in pixels                          |
| `CARD_H`         | `60`  | Card height in pixels                         |
| `STACK_HOVER_MS` | `250` | Time to hover before stack-ready (ms)         |
| `LONG_PRESS_MS`  | `500` | Time to hold before stack drag initiates (ms) |
| `STACK_OFFSET_X` | `1.5` | Horizontal offset per card in stack (px)      |
| `STACK_OFFSET_Y` | `2`   | Vertical offset per card in stack (px)        |

---

## Visual States

### Card States

| State        | Class           | Visual                                        |
| ------------ | --------------- | --------------------------------------------- |
| Default      | `.card`         | Drop shadow, grab cursor                      |
| Dragging     | `.dragging`     | Grabbing cursor, elevated z-index             |
| In Stack     | `.in-deck`      | Part of a stack                               |
| Stack Target | `.stack-target` | Yellow outline + glow (hover-ready indicator) |

---

## Event Flow

```mermaid
flowchart TD
    subgraph DOWN["POINTER DOWN"]
        D1[Pointer down on card] --> D2{Card in stack?}
        D2 -->|Yes| D3[Start long-press timer]
        D2 -->|No| D4[Start CARD DRAG]
        D3 --> D5{Timer fires?}
        D5 -->|Yes| D6[Start STACK DRAG]
        D5 -->|No - moved| D7[Cancel timer]
        D7 --> D4
    end

    subgraph MOVE["POINTER MOVE"]
        M1[Pointer move] --> M2[Update pending position]
        M2 --> M3{Drag type?}
        M3 -->|Card| M4[Check hover target]
        M4 --> M5[Update hover timer]
        M3 -->|Stack| M6[Skip hover check]
        M5 --> M7[Schedule RAF]
        M6 --> M7
    end

    subgraph UP["POINTER UP"]
        U1[Pointer up] --> U2{Drag type?}
        U2 -->|Stack| U3{Over deck zone?}
        U3 -->|Yes| U4[Merge all cards to deck]
        U3 -->|No| U5[Update stack anchor]
        U2 -->|Card| U6{Hover ready?}
        U6 -->|Yes| U7[Stack on target card]
        U6 -->|No| U8{Over deck zone?}
        U8 -->|Yes| U9[Add to deck]
        U8 -->|No| U10[Leave at position]
        U4 --> U11[Cleanup & reset]
        U5 --> U11
        U7 --> U11
        U9 --> U11
        U10 --> U11
    end

    DOWN --> MOVE
    MOVE --> UP
```

---

## Future Considerations

- [ ] **Shuffle** — Randomize card order in a stack
- [ ] **Deal** — Animate cards from deck to positions
- [ ] **Flip** — Show card face/back
- [ ] **Fan** — Spread stack for visibility
- [ ] **Multi-select** — Drag multiple free cards
- [ ] **Snap zones** — Predefined drop areas with rules
- [ ] **Undo/Redo** — Action history
