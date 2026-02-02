# Campaign & Scenario Creation Guide

This guide explains how to create custom campaigns and scenarios for DICEPTION.

## File Location

| File | Purpose |
|------|---------|
| `src/scenarios/builtin-campaign.json` | Campaign definitions with all levels (self-contained) |

---

## Campaign Format

Campaigns are self-contained files with ordered levels. Each level is either a **procedural config** (generated at runtime) or a **full scenario** (complete tile data).

```json
{
  "id": "classic",
  "name": "Classic Campaign",
  "description": "Master the basics",
  "levels": [...]
}
```

---

## Level Type: Config (Procedural)

Use for randomized maps with specific settings:

```json
{
  "name": "First Steps",
  "description": "Learn the basics",
  "type": "config",
  "mapSize": "4x4",
  "mapStyle": "full",
  "gameMode": "fair",
  "bots": 1,
  "botAI": "easy",
  "maxDice": 8,
  "diceSides": 6
}
```

**Parameters:**

| Parameter | Values |
|-----------|--------|
| `mapSize` | `"3x3"` to `"12x12"` |
| `mapStyle` | `random`, `full`, `continents`, `caves`, `islands`, `maze`, `tunnels`, `swiss` |
| `gameMode` | `classic`, `fair`, `madness`, `2of2` |
| `bots` | 1-7 |
| `botAI` | `easy`, `medium`, `hard`, `custom` |
| `maxDice` | 2-16 |
| `diceSides` | 1-16 |

---

## Level Type: Scenario (Full Data)

Use for hand-crafted maps with complete tile data:

```json
{
  "name": "Classic Duel",
  "description": "A balanced 1v1",
  "type": "scenario",
  "width": 5,
  "height": 5,
  "maxDice": 8,
  "diceSides": 6,
  "players": [
    { "id": 0, "isBot": false, "color": 11141375, "storedDice": 0 },
    { "id": 1, "isBot": true, "color": 16711765, "storedDice": 0 }
  ],
  "tiles": [
    { "x": 0, "y": 2, "owner": 0, "dice": 3 },
    { "x": 1, "y": 2, "owner": 1, "dice": 4 }
  ]
}
```

**Fields:**

| Field | Description |
|-------|-------------|
| `width`, `height` | Map dimensions |
| `players[].id` | Unique player ID (0-indexed) |
| `players[].isBot` | `false` = human, `true` = AI |
| `players[].color` | Decimal color (e.g., `0xAA00FF` = `11141375`) |
| `tiles[].x`, `y` | Grid coordinates |
| `tiles[].owner` | Player ID who owns tile |
| `tiles[].dice` | Starting dice count |

> **Tip**: Omit coordinates to create holes in the map.

---

## Progress Storage

Campaign progress stored in localStorage as sparse array of won level indexes:

```json
{ "campaigns": { "classic": [0, 2, 5] } }
```

---

## Creating via In-Game Editor

1. Click **📋 (Scenarios)** → **+ New Map**
2. Use editor tools: Paint, Assign owners, Set dice
3. Save and copy the JSON output for campaign use
