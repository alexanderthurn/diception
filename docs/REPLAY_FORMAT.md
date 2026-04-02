# Binary Replay Format

> **Status:** Design only — not yet implemented.
> Replays are planned for **challenge mode** only (e.g. share how you beat a specific scenario).
> The daily-challenge feature and chapter levels are prerequisites; implementation is deferred.

---

## Overview

Diception's seed system makes every game fully deterministic: given the same seed, map, mods, and sequence of human moves, a game will play out identically every time. Bot moves are computed from the same seed, so they do not need to be stored.

A replay is therefore just:

```
seed + map reference + mod overrides + human move sequence
```

The entire package is small enough to embed in a URL query string.

---

## Top-Level Structure

A replay is encoded as a **base64url** string (no padding `=`) composed of three concatenated sections:

| Section | Encoding | Description |
|---------|----------|-------------|
| Header  | binary (fixed) | Format version, seed, map ID, map dimensions |
| Config  | TLV binary | Non-default mod/config values |
| Moves   | Uint32Array binary | Human player move sequence |

All multi-byte integers are **little-endian**.

### Header (16 bytes, fixed)

| Offset | Size | Field |
|--------|------|-------|
| 0 | 1 | Format version (currently `1`) |
| 1 | 1 | Map width (tiles) |
| 2 | 1 | Map height (tiles) |
| 3 | 1 | Number of players |
| 4 | 4 | Seed (uint32) |
| 8 | 4 | Config section length in bytes (uint32) |
| 12 | 4 | Moves section length in bytes (uint32) |

This is exactly 16 bytes regardless of game content.

---

## Config Section — TLV Encoding

The config section stores only **non-default** mod values. Unknown tags are always safely skippable.

### Tag Byte

```
 7  6  5  4  3  2  1  0
[T  T][I  I  I  I  I  I]
```

- Bits 7–6 (`TT`): value type
  - `00` = uint8 (value is 1 byte)
  - `01` = uint16 (value is 2 bytes, little-endian)
  - `10` = uint32 (value is 4 bytes, little-endian)
  - `11` = blob (next byte is length N, then N bytes of payload)
- Bits 5–0 (`IIIIII`): tag ID (0–63)

A decoder that sees an unknown tag can always skip it: read 1 byte for type `00`/`01`/`02`, or read the length byte for type `11`.

### Defined Tags

| ID | Type | Field | Default |
|----|------|-------|---------|
| 1  | uint8 | `maxDice` | 8 |
| 2  | uint8 | `diceSides` | 6 |
| 3  | uint8 | `attacksPerTurn` | 0 (unlimited) |
| 4  | uint8 | `secondsPerTurn` | 0 (off) |
| 5  | uint8 | `secondsPerAttack` | 0 (off) |
| 6  | uint8 | `attackRule` (enum) | 0 = classic |
| 7  | uint8 | `supplyRule` (enum) | 0 = classic |
| 8  | uint8 | `playMode` (enum) | 0 = classic |
| 9  | blob  | `mapId` (UTF-8 string) | — |
| 10 | uint8 | player count override | — |

New tags can be assigned freely in the `11–63` range. Old clients skip unknown tags and replay correctly as long as the moves are unchanged.

### Enum Values

**attackRule**: `0` = classic, `1` = blitz
**supplyRule**: `0` = classic, `1` = border-only
**playMode**: `0` = classic, `1` = fog-of-war

---

## Moves Section — Attack Encoding

### Tile Index

Tiles are addressed by a single integer:

```
idx = y * mapWidth + x
```

For a 10×8 map: tile (3, 2) → `idx = 2 * 10 + 3 = 23`.
Maximum map size supported: **256 × 256** (idx fits in 16 bits).

### Attack Word (uint32)

One attack is packed into a single 32-bit word:

```
bits 31–16: fromIdx  (uint16)
bits 15–0:  toIdx    (uint16)
```

```js
const word = (fromIdx << 16) | toIdx;
```

### End-of-Round Sentinel

`0xFFFFFFFF` marks the end of a human player's round (i.e. they pressed "End Turn").

This value cannot be a valid attack because `fromIdx == 0xFFFF` and `toIdx == 0xFFFF` would require a map of size ≥ 65535 × 65535.

### Move Sequence Layout

```
[ attack, attack, ..., 0xFFFFFFFF ]   ← human player 1, round 1
[ attack, attack, ..., 0xFFFFFFFF ]   ← human player 1, round 2
[ attack, attack, ..., 0xFFFFFFFF ]   ← human player 2, round 1  (2-player game)
...
```

- **Only human moves are recorded.** Bot turns are skipped entirely — they are recomputed deterministically from the seed when replaying.
- A round with zero attacks is just `[ 0xFFFFFFFF ]` — a single sentinel word.
- Player order within a round follows normal turn order.

### Pseudocode — Encoding

```js
function encodeReplay(seed, config, humanRounds) {
    const configBytes = encodeTLV(config);   // only non-default fields
    const words = [];

    for (const round of humanRounds) {
        for (const { from, to } of round.attacks) {
            const fromIdx = from.y * config.mapWidth + from.x;
            const toIdx   = to.y  * config.mapWidth + to.x;
            words.push((fromIdx << 16) | toIdx);
        }
        words.push(0xFFFFFFFF);  // end of round
    }

    const movesBytes = new Uint8Array(new Uint32Array(words).buffer);

    const header = buildHeader(1, config.mapWidth, config.mapHeight,
                               config.players, seed,
                               configBytes.length, movesBytes.length);

    const blob = concat([header, configBytes, movesBytes]);
    return base64url(blob);
}
```

### Pseudocode — Decoding

```js
function decodeReplay(encoded) {
    const blob  = base64urlDecode(encoded);
    const dv    = new DataView(blob.buffer);

    const version   = dv.getUint8(0);
    const mapWidth  = dv.getUint8(1);
    const mapHeight = dv.getUint8(2);
    const players   = dv.getUint8(3);
    const seed      = dv.getUint32(4, true);
    const cfgLen    = dv.getUint32(8, true);
    const movLen    = dv.getUint32(12, true);

    const config    = decodeTLV(blob.slice(16, 16 + cfgLen));
    const movesRaw  = new Uint32Array(blob.slice(16 + cfgLen, 16 + cfgLen + movLen).buffer);

    // Reconstruct human rounds
    const rounds = [];
    let current  = [];
    for (const word of movesRaw) {
        if (word === 0xFFFFFFFF) {
            rounds.push(current);
            current = [];
        } else {
            const fromIdx = (word >>> 16) & 0xFFFF;
            const toIdx   = word & 0xFFFF;
            current.push({
                from: { x: fromIdx % mapWidth, y: Math.floor(fromIdx / mapWidth) },
                to:   { x: toIdx   % mapWidth, y: Math.floor(toIdx   / mapWidth) }
            });
        }
    }

    return { version, seed, mapWidth, mapHeight, players, config, rounds };
}
```

---

## Size Estimates

| Game type | Human rounds | Avg attacks/round | Move bytes | Total (header+config+moves) |
|-----------|-------------|-------------------|------------|------------------------------|
| Solo vs 3 bots, 20 turns | 20 | 8 | ~740 B | ~780 B |
| 2 humans vs 2 bots, 30 turns each | 60 | 10 | ~2.4 KB | ~2.5 KB |
| Long game, 100 human rounds | 100 | 15 | ~6.4 KB | ~6.5 KB |

Base64url overhead is ~33%, so a typical replay URL parameter is **under 4 KB** — well within URL length limits.

---

## Use Cases

- **Challenge replays**: After beating a scenario, the game optionally generates a replay token. The player can share it; others paste it to watch the run.
- **Leaderboard ghosts** (future): embed replay token alongside a score entry.
- **No daily challenge yet**: Deferred until chapter 1, 3, 4 levels are authored.

## Non-Goals

- Maps are **not** encoded in binary — they stay as JSON. The replay references the map by its ID string (TLV tag 9).
- Replays are **not** used for undo/redo — that uses the existing `TurnHistory` snapshot system.
- No AI replay format: bots are always re-simulated, never recorded.
