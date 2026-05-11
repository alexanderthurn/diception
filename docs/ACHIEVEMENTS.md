# DICEPTION — Achievement System

> **22 Steam achievements** across 4 categories.
> Campaign milestones · Games played · Special combat feats · Miscellaneous

---

## Campaign Structure (File Rename Plan)

The campaign (`builtin-campaign.json`, 16 levels) splits into 4 chapter files:

| File | ID | Levels | Theme |
|---|---|---|---|
| `builtin-tutorial.json` | `tutorial` | 4 | Learn the basics |
| `builtin-chapter1.json` | `chapter1` | 1–4 | Easy AI, small maps |
| `builtin-chapter2.json` | `chapter2` | 5–8 | Easy→Medium AI, 3–4 bots |
| `builtin-chapter3.json` | `chapter3` | 9–12 | Medium AI, bigger maps |
| `builtin-chapter4.json` | `chapter4` | 13–16 | Hard AI, epic battles |

---

## All 22 Achievements

Authoritative definitions, thresholds, and event names live in **`src/core/achievements.js`**. The tables below are a design summary; if they drift, trust the source file.

### 🎓 Campaign (5)

| # | API Name | Display Name | Description |
|---|---|---|---|
| 1 | `ACH_TUTORIAL` | **First Steps** | Complete the Tutorial |
| 2 | `ACH_CHAPTER1` | **Recruit** | Complete Chapter 1 |
| 3 | `ACH_CHAPTER2` | **Soldier** | Complete Chapter 2 |
| 4 | `ACH_CHAPTER3` | **Commander** | Complete Chapter 3 |
| 5 | `ACH_CHAPTER4` | **General** | Complete all 16 campaign levels |

---

### 🎲 Games Played (10)

| # | API Name | Display Name | Description |
|---|---|---|---|
| 6 | `ACH_GAMES_10` | **Warming Up** | Play 10 games |
| 7 | `ACH_GAMES_50` | **Getting Serious** | Play 50 games |
| 8 | `ACH_GAMES_100` | **Centurion** | Play 100 games |
| 9 | `ACH_GAMES_150` | **Seasoned** | Play 150 games |
| 10 | `ACH_GAMES_200` | **Veteran** | Play 200 games |
| 11 | `ACH_GAMES_300` | **Warlord** | Play 300 games |
| 12 | `ACH_GAMES_400` | **Battle-Hardened** | Play 400 games |
| 13 | `ACH_GAMES_500` | **500 Battles** | Play 500 games |
| 14 | `ACH_GAMES_1000` | **The Thousand** | Play 1,000 games |
| 15 | `ACH_GAMES_10000` | **Immortal** | Play 10,000 games |

---

### ⚔️ Special Combat (7)

| # | API Name | Display Name | Description |
|---|---|---|---|
| 16 | `ACH_FIRST_WIN` | **First Blood** | Win your first game |
| 17 | `ACH_UNDERDOG_5` | **Against All Odds** | Win 5 attacks where your win chance was below 33% |
| 18 | `ACH_UNDERDOG_10` | **Daredevil** | Win 10 attacks where your win chance was below 33% |
| 19 | `ACH_UNDERDOG_100` | **Miracle Worker** | Win 100 attacks where your win chance was below 33% |
| 20 | `ACH_DAVID` | **David vs Goliath** | Win an attack with 4 dice against 6 dice |
| 21 | `ACH_STREAK_5` | **Dominator** | Win 5 consecutive attacks in a single turn |
| 22 | `ACH_SURVIVOR` | **Survivor** | Win a game against 7 opponents (8-player game) |

---

## Icon Design Plan

Steam requires **two PNGs per achievement** — one color (unlocked) and one greyscale (locked).
All generated via `scripts/steam_achievements.html`.

| Spec | Value |
|---|---|
| Upload size | 512×512 px |
| Display size | 184×184 px (Steam scales it) |
| Format | PNG 32-bit |
| Count | 22 × 2 = **44 images** |

### Visual Language

| Category | Background glow | Icon | Color accent |
|---|---|---|---|
| Campaign | Purple | Shield + star rank | `#AA00FF` |
| Games Played | Blue | Stacked dice | `#0088FF` |
| Special Combat | Red/orange | Swords / dice clash | `#FF0055` |

---

## Current implementation (codebase)

### Persistence — one place for lifetime numbers

| Key | Contents |
|-----|----------|
| **`localStorage` `dicy_highscores`** | JSON blob: **`lifetime`** (all stat-based counters), **`wins`** (per winner name), **`totalGames`**, **`campaigns`**, and a mirrored **`humanStats`** object (same totals as `lifetime` for any legacy reader) |
| **`localStorage` `dicy_ach_unlocked`** | JSON array of unlocked achievement API ids |

**`lifetime`** fields that map to Steam stats: `gamesPlayed`, `gamesWon`, `underdogWins`, `streak3` … `streak7` (see `STEAM_STAT_NAMES` in `steam-player-stats-sync.js`).

### Modules

| File | Role |
|------|------|
| **`src/core/achievements.js`** | `ACHIEVEMENTS` definitions (`stat` \| `event` \| `campaign`) |
| **`src/ui/highscore-manager.js`** | Single writer for **`dicy_highscores`**: **`recordWin`**, **`incrementLifetime`**, **`setLifetimeStat`** (cheats), **`getLifetimeStats`** / **`getHumanStats`** (WON dialog and achievements modal use the same source) |
| **`src/core/steam-player-stats-sync.js`** | Steam **`STAT_*`**: **`reconcileLifetimeWithSteam(manager)`** at startup (max local/Steam, push if local ahead), **`pushLifetimeStatToSteam`**, **`resetSteamStatsOrFallback`** |
| **`src/core/achievement-manager.js`** | **`unlockAchievement`**, **`fireAchievementEvent`**, **`checkCampaignAchievement`**, **`notifyLifetimeStatChanged`** (threshold checks + progress toast after a counter changes), reset helpers |
| **`src/ui/game-events.js`** | Hooks: underdog / streak → **`highscoreManager.incrementLifetime`**; game over → **`recordWin`** (updates `gamesPlayed` / `gamesWon`) + events / campaign checks |
| **`src/ui/achievements-panel.js`** | Renders modal; localhost cheats call **`highscoreManager.setLifetimeStat`** |
| **`scripts/steam_achievements.html`** | Icon generator; reads live **`dicy_highscores.lifetime`** for stat-based previews |

### Startup order (`src/main.js`)

1. **`initStorage()`** (file-backed / cloud → `localStorage`)
2. **`new HighscoreManager()`** (loads blob, normalizes `lifetime`)
3. Steam merge for **`dicy_ach_unlocked`**
4. **`reconcileLifetimeWithSteam(highscoreManager)`**

### Adding a new stat-based achievement

1. Add the achievement row in **`achievements.js`** (`type: 'stat'`, `stat`, `threshold`).
2. If it maps to a new Steam counter: add the field to **`LIFETIME_KEYS`** in **`highscore-manager.js`**, add **`STEAM_STAT_NAMES`** in **`steam-player-stats-sync.js`**, and register the stat in Steamworks.
3. From gameplay code, call **`highscoreManager.incrementLifetime('yourStat', amount)`** (or **`setLifetimeStat`** for cheats). **`notifyLifetimeStatChanged`** runs after each update so thresholds and the progress toast stay correct.

### Planned vs shipped — campaign JSON split

The **“Campaign Structure (File Rename Plan)”** section at the top describes splitting the built-in campaign into multiple JSON files. Until that refactor lands, the game may still ship a single campaign file; the achievement **hooks** already live in **`game-events.js`** + **`campaign-progress.js`** / scenario flow.

---

## Quick reference — where achievements fire

| Group | Actual location |
|-------|-----------------|
| Campaign chapter achievements | **`checkCampaignAchievement`** from **`game-events.js`** after **`markLevelSolved`**, using `campaign-progress` data |
| `ACH_GAMES_*`, `ACH_FIRST_WIN` (counters) | **`HighscoreManager.recordWin`** → **`incrementLifetime('gamesPlayed' \| 'gamesWon')`** → **`notifyLifetimeStatChanged`** |
| `ACH_UNDERDOG_*`, `ACH_STREAK_*` | **`game-events.js`** → **`highscoreManager.incrementLifetime('underdogWins' \| 'streakN')`** |
| `ACH_DAVID`, `ACH_PURE_*`, `ACH_SURVIVOR` | **`game-events.js`** → **`fireAchievementEvent(...)`** |

---

## Icon generator (`scripts/steam_achievements.html`)

- Renders Steam-sized icons and supports bulk export for partner upload.
- Uses **`dicy_highscores.lifetime`** (and related maps in that script) for live stat previews when run on the same origin as the game.
