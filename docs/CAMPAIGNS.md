# Campaign & Scenario Creation Guide

This guide describes the actual JSON format used by built-in campaign files in `src/scenarios/`.

---

## Files

| File | Purpose |
|------|---------|
| `src/scenarios/builtin-tutorial.json` | Tutorial campaign (4 levels, scenario type) |
| `src/scenarios/builtin-chapter1.json` | Chapter 1 campaign (scenario + map levels) |
| `src/scenarios/builtin-chapter4.json` | Chapter 4 campaign (empty, placeholder) |

---

## Campaign Format

```json
{
  "id": "chapter1",
  "owner": "chapter1",
  "levels": [ ... ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique identifier string |
| `owner` | yes | Display name shown in UI |
| `levels` | yes | Array of level objects |

Levels have **no** `name` or `description` — they are identified by index only.

---

## Level Type: `scenario`

Full hand-crafted map with all players, owners, and dice pre-set.

```json
{
  "type": "scenario",
  "width": 5,
  "height": 5,
  "maxDice": 8,
  "diceSides": 6,
  "gameMode": "classic",
  "turnTimeLimit": 0,
  "players": [
    { "id": 0, "isBot": false, "color": 11141375, "storedDice": 0, "aiId": null },
    { "id": 1, "isBot": true,  "color": 16711765, "storedDice": 0, "aiId": "easy" }
  ],
  "tiles": [
    { "x": 0, "y": 2, "owner": 0, "dice": 3 },
    { "x": 1, "y": 2, "owner": 1, "dice": 4 }
  ]
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `width`, `height` | yes | Map grid dimensions |
| `maxDice` | yes | Maximum dice per tile |
| `diceSides` | yes | Number of sides per die (usually 6) |
| `gameMode` | no | `"classic"` (default) |
| `turnTimeLimit` | no | Legacy time limit — `0` disables it |
| `attacksPerTurn` | no | Max attacks per turn (0 = unlimited) |
| `secondsPerTurn` | no | Wall-clock seconds per turn (0 = unlimited) |
| `secondsPerAttack` | no | Wall-clock seconds per attack (0 = unlimited) |
| `humanStartsFirst` | no | `true` forces human to go first |
| `startingPlayerId` | no | Player ID to go first (integer) |

### Player fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Player index (0-based) |
| `isBot` | yes | `false` = human, `true` = AI |
| `color` | yes | Decimal color (e.g. `0xAA00FF` = `11141375`) |
| `storedDice` | yes | Starting stored dice (usually `0`) |
| `aiId` | no | `"easy"`, `"medium"`, `"hard"` — used for UI display only; actual AI difficulty is set from the setup panel |

### Tile fields

| Field | Required | Description |
|-------|----------|-------------|
| `x`, `y` | yes | Grid coordinates |
| `owner` | yes | Player `id` who owns this tile |
| `dice` | yes | Starting dice count (1 to `maxDice`) |

> Tiles not listed in the array are treated as holes (blocked/impassable).

---

## Level Type: `map`

Layout-only map — player assignment and dice are generated at game start.

```json
{
  "type": "map",
  "width": 6,
  "height": 6,
  "bots": 2,
  "botAI": "easy",
  "maxDice": 9,
  "diceSides": 6,
  "gameMode": "classic",
  "turnTimeLimit": 0,
  "tiles": [
    { "x": 0, "y": 0 },
    { "x": 1, "y": 0 }
  ]
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `width`, `height` | yes | Map grid dimensions |
| `bots` | no | Number of bot players (default: 1) |
| `botAI` | no | AI difficulty: `"easy"`, `"medium"`, `"hard"` (default: `"easy"`) |
| `maxDice` | no | Maximum dice per tile (default: 9) |
| `diceSides` | no | Sides per die (default: 6) |
| `gameMode` | no | Shown in setup panel: `"classic"`, `"fair"`, etc. |
| `turnTimeLimit` | no | Legacy time limit — `0` disables it |
| `attacksPerTurn` | no | Max attacks per turn |
| `secondsPerTurn` | no | Wall-clock seconds per turn |
| `humanStartsFirst` | no | `true` forces human to go first |
| `startingPlayerId` | no | Player ID to go first |
| `seed` | no | Map generation seed (integer) |

### Tile fields (map type)

| Field | Required | Description |
|-------|----------|-------------|
| `x`, `y` | yes | Grid coordinates of an active tile |

No `owner` or `dice` — those are assigned randomly at game start.

---

## Colors Reference

Common player colors used in built-in campaigns (decimal values):

| Color | Hex | Used for |
|-------|-----|----------|
| `11141375` | `0xAA00FF` | Human player (purple) |
| `16711765` | `0xFF0055` | Bot player 1 (red/pink) |
| `5635925` | `0x560055` | Bot player 2 (dark purple-green) |
| `16750848` | `0xFF9900` | Bot player 3 (orange) |
| `35071` | `0x008FFF` | Bot player (blue) |
| `5635840` | `0x560000` | Bot player (dark red) |
| `16768256` | `0xFFB300` | Bot player (amber) |

---

## Adding a New Built-in Campaign

1. Create `src/scenarios/builtin-chapterN.json` with `id`, `owner`, and `levels`.
2. Import and add to `builtinCampaigns` array in `src/scenarios/campaign-manager.js`.
3. Validate with `validateCampaign(data, { isBuiltIn: true })` from `campaign-data.js`.

---

## Progress Storage

Campaign progress is stored in localStorage as a sparse array of completed level indexes:

```json
{ "campaigns": { "chapter1": [0, 2, 5] } }
```

See `src/scenarios/campaign-progress.js` for the implementation.
