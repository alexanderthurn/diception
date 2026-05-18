# DICEPTION — Achievement System

> **35 Steam achievements** in 3 UI sections: Campaign · Games Played · Special Combat

Authoritative definitions, thresholds, and event names live in **`src/core/achievements.js`**. Display titles live in **`src/ui/achievements-panel.js`** (`TITLES`). If this doc drifts, trust those files.

---

## All 35 achievements

### Campaign (5)

| API Name | Display Name | Unlock |
|---|---|---|
| `ACH_TUTORIAL` | First Steps | Complete the tutorial chapter |
| `ACH_CHAPTER1` | Chapter 1 Complete | Complete chapter 1 |
| `ACH_CHAPTER2` | Chapter 2 Complete | Complete chapter 2 |
| `ACH_CHAPTER3` | Chapter 3 Complete | Complete chapter 3 |
| `ACH_CHAPTER4` | Chapter 4 Complete | Complete chapter 4 |

Campaign data: `src/scenarios/tutorial.json`, `chapter1.json` … `chapter4.json` (loaded by campaign manager).

---

### Games Played (10)

All use stat `gamesPlayed` (solo-human games mirrored from `dicy_solo_stats` bucket `g`).

| API Name | Display Name | Threshold |
|---|---|---|
| `ACH_GAMES_10` | Warming Up | 10 |
| `ACH_GAMES_50` | Getting Serious | 50 |
| `ACH_GAMES_100` | Centurion | 100 |
| `ACH_GAMES_150` | Dedicated | 150 |
| `ACH_GAMES_200` | Veteran | 200 |
| `ACH_GAMES_300` | Battle-Hardened | 300 |
| `ACH_GAMES_400` | Tactician | 400 |
| `ACH_GAMES_500` | Commander | 500 |
| `ACH_GAMES_1000` | Warlord | 1,000 |
| `ACH_GAMES_10000` | Legend | 10,000 |

---

### Special Combat (20)

#### Wins & underdog

| API Name | Display Name | Type | Condition |
|---|---|---|---|
| `ACH_FIRST_WIN` | Victor | stat `gamesWon` | Win **100** games (lifetime) |
| `ACH_UNDERDOG_5` | Lucky Shot | stat `underdogWins` | 5 wins with &lt;33% odds |
| `ACH_UNDERDOG_10` | Against the Odds | stat `underdogWins` | 10 |
| `ACH_UNDERDOG_50` | Unlikely Hero | stat `underdogWins` | 50 |
| `ACH_UNDERDOG_100` | Miracle Worker | stat `underdogWins` | 100 |
| `ACH_UNDERDOG_500` | Fortune's Favorite | stat `underdogWins` | 500 |

#### One-off events

| API Name | Display Name | Event |
|---|---|---|
| `ACH_DAVID` | David vs. Goliath | `won4vs6` — win 4 dice vs 6 |
| `ACH_PURE_BOTS` | Bot Tournament | `pureBots` — bots-only game runs to completion |
| `ACH_PURE_HUMANS` | Human Only | `pureHumans` — 2+ humans, no bots |
| `ACH_SURVIVOR` | Last Standing | `won8PlayerGame` — win vs 7 opponents |

#### Chain streaks (lifetime peaks)

Solo-human only. Each **peak chain length** in a turn increments **one** counter when the chain ends (800 ms debounce). Stats `streak3` … `streak7` count how often you reached that peak (chain of 5 increments `streak5` only, not lower tiers in the same chain).

Rules (`src/ui/game-events.js`):

- Next attack must start **from the tile you last conquered** (`_streakTile`).
- Streak resets at turn start and on a failed attack.
- Minimum chain length tracked: **3**.

| Chain peak | Stat | Base tier | Threshold | Master tier (100×) | Threshold |
|---|---|---|---|---|---|
| 3+ | `streak3` | `ACH_STREAK_3` | 30 | `ACH_STREAK_3_3000` | 3,000 |
| 4+ | `streak4` | `ACH_STREAK_4` | 15 | `ACH_STREAK_4_1500` | 1,500 |
| 5+ | `streak5` | `ACH_STREAK_5` | 5 | `ACH_STREAK_5_500` | 500 |
| 6+ | `streak6` | `ACH_STREAK_6` | 2 | `ACH_STREAK_6_200` | 200 |
| 7+ | `streak7` | `ACH_STREAK_7` | 1 | `ACH_STREAK_7_100` | 100 |

Display names: On a Roll / Chain Master, Hot Streak / Unbroken Line, Unstoppable / Chain Tyrant, Relentless / Perfect Storm, Dominator / Chain Legend.

---

## Lifetime stat cap

**`LIFETIME_STAT_MAX = 10000`** (`achievements.js`). All lifetime counters clamp to **0 … 10 000** in:

- `src/core/lifetime-stat-cap.js` — `clampLifetimeStat()`
- `src/ui/highscore-manager.js` — load, increment, set
- `src/core/steam-player-stats-sync.js` — merge and push

Steam partner portal: set **`STAT_STREAK_3`** … **`STAT_STREAK_7`** (and other INT stats) max to **10 000**.

---

## Steam stats vs achievements

One Steam **stat** per chain length; multiple **achievements** per stat (base + master tier):

| Local field | Steam stat |
|---|---|
| `gamesPlayed` | `STAT_GAMES_PLAYED` |
| `gamesWon` | `STAT_GAMES_WON` |
| `underdogWins` | `STAT_UNDERDOG_WINS` |
| `streak3` | `STAT_STREAK_3` |
| `streak4` | `STAT_STREAK_4` |
| `streak5` | `STAT_STREAK_5` |
| `streak6` | `STAT_STREAK_6` |
| `streak7` | `STAT_STREAK_7` |

Master achievement API names: `ACH_STREAK_3_3000`, `ACH_STREAK_4_1500`, `ACH_STREAK_5_500`, `ACH_STREAK_6_200`, `ACH_STREAK_7_100`.

---

## Icons

Steam requires **two PNGs per achievement** (color + locked greyscale). Generated via **`scripts/steam_achievements.html`**.

| Spec | Value |
|---|---|
| Upload size | 512×512 px |
| Display size | 184×184 px (Steam scales) |
| Format | PNG 32-bit |
| Count | 35 × 2 = **70 images** |

After export: place under `public/assets/gfx/achievements/`, rebuild **`scripts/spritesheet.tps`**, run **`node scripts/generate-css.js`** → updates **`public/assets/gfx/sprites.css`**.

In-game CSS class: achievement id with `_` → `-` (e.g. `ACH_STREAK_3_3000` → `.ACH-STREAK-3-3000`).

---

## Persistence

| Key | Contents |
|-----|----------|
| **`localStorage` `dicy_highscores`** | JSON: **`lifetime`** (stat counters), **`wins`**, **`totalGames`**, **`campaigns`**, mirrored **`humanStats`** |
| **`localStorage` `dicy_solo_stats`** | Solo buckets; **`g`** = canonical games played/won (mirrored to `lifetime` on save) |
| **`localStorage` `dicy_ach_unlocked`** | Unlocked achievement API ids |

---

## Modules

| File | Role |
|------|------|
| **`src/core/achievements.js`** | `ACHIEVEMENTS`, `LIFETIME_STAT_MAX` |
| **`src/ui/highscore-manager.js`** | `incrementLifetime`, `setLifetimeStat`, clamp on persist |
| **`src/core/steam-player-stats-sync.js`** | `STEAM_STAT_NAMES`, reconcile/push with clamp |
| **`src/core/achievement-manager.js`** | `unlockAchievement`, `notifyLifetimeStatChanged`, **`recheckStatAchievements`** |
| **`src/ui/game-events.js`** | Underdog / streak hooks, chain VFX |
| **`src/ui/achievements-panel.js`** | Modal UI, progress bars, localhost cheats |
| **`scripts/steam_achievements.html`** | Icon generator + Steam metadata tables |

### Startup (`src/main.js`)

1. `initStorage()`
2. `new HighscoreManager()`
3. Steam merge for `dicy_ach_unlocked`
4. `reconcileLifetimeWithSteam(highscoreManager)`
5. **`recheckStatAchievements(highscoreManager)`** — unlocks tiers already met after sync

---

## Where achievements fire

| Group | Location |
|-------|----------|
| Campaign | `checkCampaignAchievement` after `markLevelSolved` |
| `ACH_GAMES_*`, `ACH_FIRST_WIN` | Solo `recordSoloHumanSessionEnd` → `lifetime` → `notifyLifetimeStatChanged` |
| `ACH_UNDERDOG_*`, `ACH_STREAK_*` | `game-events.js` → `incrementLifetime('underdogWins' \| 'streakN')` |
| `ACH_DAVID`, `ACH_PURE_*`, `ACH_SURVIVOR` | `game-events.js` → `fireAchievementEvent(...)` |

---

## Adding a new stat-based achievement

1. Add row in **`achievements.js`** (`type: 'stat'`, `stat`, `threshold`).
2. New Steam counter: add to **`LIFETIME_KEYS`** in **`highscore-manager.js`**, **`STEAM_STAT_NAMES`** in **`steam-player-stats-sync.js`**, register in Steamworks (max ≤ 10 000 unless you raise `LIFETIME_STAT_MAX`).
3. Bump from gameplay via **`highscoreManager.incrementLifetime(...)`**.
4. **`TITLES`** + section filter if needed in **`achievements-panel.js`**.
5. Renderer + `ACH_MIN` / `ACH_MAX` / `ACH_STAT_API` in **`steam_achievements.html`**; export PNGs; spritesheet + **`generate-css.js`**.

See **`CLAUDE.md`** (Achievement System) for the same checklist in agent rules.
