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

## Implementation Plan

### Step 1 — Split Campaign File

Split `src/scenarios/builtin-campaign.json` by level index:

```
builtin-chapter1.json  →  levels[0..3]   (indices 0–3)
builtin-chapter2.json  →  levels[4..7]   (indices 4–7)
builtin-chapter3.json  →  levels[8..11]  (indices 8–11)
builtin-chapter4.json  →  levels[12..15] (indices 12–15)
```

Update `campaign-manager.js` to load `chapter1` → `chapter2` → `chapter3` → `chapter4` in sequence.

---

### Step 2 — Achievement Definitions

**`src/core/achievements.js`** — single source of truth:

```js
export const ACHIEVEMENTS = [
  // ── Campaign ──────────────────────────────────────────────
  { id: 'ACH_TUTORIAL',      type: 'campaign', campaign: 'tutorial', totalLevels: 4  },
  { id: 'ACH_CHAPTER1',      type: 'campaign', campaign: 'chapter1', totalLevels: 4  },
  { id: 'ACH_CHAPTER2',      type: 'campaign', campaign: 'chapter2', totalLevels: 4  },
  { id: 'ACH_CHAPTER3',      type: 'campaign', campaign: 'chapter3', totalLevels: 4  },
  { id: 'ACH_CHAPTER4',      type: 'campaign', campaign: 'chapter4', totalLevels: 4  },

  // ── Games Played ──────────────────────────────────────────
  { id: 'ACH_GAMES_10',      type: 'stat', stat: 'gamesPlayed', threshold: 10    },
  { id: 'ACH_GAMES_50',      type: 'stat', stat: 'gamesPlayed', threshold: 50    },
  { id: 'ACH_GAMES_100',     type: 'stat', stat: 'gamesPlayed', threshold: 100   },
  { id: 'ACH_GAMES_150',     type: 'stat', stat: 'gamesPlayed', threshold: 150   },
  { id: 'ACH_GAMES_200',     type: 'stat', stat: 'gamesPlayed', threshold: 200   },
  { id: 'ACH_GAMES_300',     type: 'stat', stat: 'gamesPlayed', threshold: 300   },
  { id: 'ACH_GAMES_400',     type: 'stat', stat: 'gamesPlayed', threshold: 400   },
  { id: 'ACH_GAMES_500',     type: 'stat', stat: 'gamesPlayed', threshold: 500   },
  { id: 'ACH_GAMES_1000',    type: 'stat', stat: 'gamesPlayed', threshold: 1000  },
  { id: 'ACH_GAMES_10000',   type: 'stat', stat: 'gamesPlayed', threshold: 10000 },

  // ── Special Combat ────────────────────────────────────────
  { id: 'ACH_FIRST_WIN',     type: 'stat', stat: 'gamesWon',      threshold: 1   },
  { id: 'ACH_UNDERDOG_5',    type: 'stat', stat: 'underdogWins',  threshold: 5   },
  { id: 'ACH_UNDERDOG_10',   type: 'stat', stat: 'underdogWins',  threshold: 10  },
  { id: 'ACH_UNDERDOG_100',  type: 'stat', stat: 'underdogWins',  threshold: 100 },
  { id: 'ACH_DAVID',         type: 'event', event: 'won4vs6'                     },
  { id: 'ACH_STREAK_5',      type: 'event', event: 'attackStreak5'               },
  { id: 'ACH_SURVIVOR',      type: 'event', event: 'won8PlayerGame'              },
];
```

---

### Step 3 — Achievement Manager

**`src/core/achievement-manager.js`**:

```js
import { invoke } from '@tauri-apps/api/core';
import { ACHIEVEMENTS } from './achievements.js';

const STORAGE_KEY = 'dicy_achievements';

// ── Unlock a single achievement ──────────────────────────────
export function unlockAchievement(id) {
  const data = _load();
  if (data.unlocked.includes(id)) return;
  data.unlocked.push(id);
  _save(data);
  invoke('unlock_achievement', { achievementId: id }).catch(console.warn);
  console.log(`🏆 ACHIEVEMENT UNLOCKED: ${id}`);
}

// ── Increment a persistent stat and check thresholds ─────────
export function incrementStat(stat, amount = 1) {
  const data = _load();
  data.stats[stat] = (data.stats[stat] || 0) + amount;
  _save(data);

  for (const ach of ACHIEVEMENTS) {
    if (ach.type === 'stat' && ach.stat === stat) {
      if (data.stats[stat] >= ach.threshold) unlockAchievement(ach.id);
    }
  }
}

// ── Fire an event-based achievement ──────────────────────────
export function fireAchievementEvent(event) {
  for (const ach of ACHIEVEMENTS) {
    if (ach.type === 'event' && ach.event === event) unlockAchievement(ach.id);
  }
}

function _load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { unlocked: [], stats: {} }; }
  catch { return { unlocked: [], stats: {} }; }
}
function _save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
```

---

### Step 4 — Hook Into `game.js`

The three achievement hooks go into `game.js`. Each one has a clear comment so they are immediately visible:

```js
// At top of game.js, add:
import { getWinProbability } from './probability.js';
import { incrementStat, fireAchievementEvent } from './achievement-manager.js';

// ── In attack() — before resolveAttack ────────────────────────────────────
attack(fromX, fromY, toX, toY) {
    const attackerDice = this.map.getTile(fromX, fromY).dice;
    const defenderDice = this.map.getTile(toX, toY).dice;
    const winChance = getWinProbability(attackerDice, defenderDice, this.diceSides);

    const result = this.combat.resolveAttack(...);

    // 🏆 ACHIEVEMENT: ACH_UNDERDOG_5 / ACH_UNDERDOG_10 / ACH_UNDERDOG_100
    if (result.won && winChance < 1/3) {
        incrementStat('underdogWins');
    }

    // 🏆 ACHIEVEMENT: ACH_DAVID
    if (result.won && attackerDice === 4 && defenderDice === 6) {
        fireAchievementEvent('won4vs6');
    }

    // 🏆 ACHIEVEMENT: ACH_STREAK_5
    if (result.won) {
        this._attackStreak = (this._attackStreak || 0) + 1;
        if (this._attackStreak >= 5) fireAchievementEvent('attackStreak5');
    } else {
        this._attackStreak = 0;
    }

    this.checkWinCondition();
    this.emit('attackResult', result);
    return result;
}

// ── In endTurn() — reset streak counter ──────────────────────────────────
endTurn() {
    // 🏆 ACHIEVEMENT: ACH_STREAK_5 — reset streak on turn end
    this._attackStreak = 0;
    // ... rest of endTurn
}

// ── In checkWinCondition() — on game over ─────────────────────────────────
// After: this.emit('gameOver', { winner: this.winner })

// 🏆 ACHIEVEMENT: ACH_GAMES_10 / 50 / 100 / ... / 10000
incrementStat('gamesPlayed');

if (this.winner?.id === HUMAN_PLAYER_ID) {
    // 🏆 ACHIEVEMENT: ACH_FIRST_WIN / ACH_GAMES_PLAYED (wins)
    incrementStat('gamesWon');

    // 🏆 ACHIEVEMENT: ACH_SURVIVOR
    if (this.players.length >= 8) fireAchievementEvent('won8PlayerGame');
}
```

---

### Step 5 — Campaign Achievements Hook

In `campaign-manager.js`, after a chapter is fully solved:

```js
import { unlockAchievement } from '../core/achievement-manager.js';

// After marking a level solved and checking if chapter is complete:

// 🏆 ACHIEVEMENT: ACH_TUTORIAL / ACH_CHAPTER1 / ACH_CHAPTER2 / ACH_CHAPTER3 / ACH_CHAPTER4
if (allLevelsSolvedInChapter(campaignId)) {
    const achId = {
        tutorial: 'ACH_TUTORIAL',
        chapter1: 'ACH_CHAPTER1',
        chapter2: 'ACH_CHAPTER2',
        chapter3: 'ACH_CHAPTER3',
        chapter4: 'ACH_CHAPTER4',
    }[campaignId];
    if (achId) unlockAchievement(achId);
}
```

---

### Step 6 — Tauri Rust Command

In `src-tauri/src/main.rs`, expose a Tauri command that calls steamworks:

```rust
#[tauri::command]
fn unlock_achievement(achievement_id: String) -> Result<(), String> {
    // steamworks-rs: set + store
    if let Some(client) = STEAM_CLIENT.get() {
        client.user_stats().set_achievement(&achievement_id)
            .map_err(|e| e.to_string())?;
        client.user_stats().store_stats()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

---

### Step 7 — Icon Generator

Create `scripts/steam_achievements.html` — same canvas/font stack as `steam_assets.html`.

- Renders all 22 icons at 512×512
- Shows unlocked (color) + locked (greyscale) side by side
- Download All exports 44 PNGs ready for Steamworks upload

---

## Full File Summary

```
Files to CREATE:
├── src/scenarios/builtin-chapter1.json      split from builtin-campaign.json
├── src/scenarios/builtin-chapter2.json
├── src/scenarios/builtin-chapter3.json
├── src/scenarios/builtin-chapter4.json
├── src/core/achievements.js                 achievement definitions
├── src/core/achievement-manager.js          unlock + stat logic
└── scripts/steam_achievements.html          icon generator (44 PNGs)

Files to MODIFY:
├── src/core/game.js                         3 hook sites (attack, endTurn, checkWin)
├── src/scenarios/campaign-manager.js        chapter complete → unlock achievement
└── src-tauri/src/main.rs                    Tauri command: unlock_achievement
```

---

## Quick Reference — Where Each Achievement Fires

| Achievement | File | Hook |
|---|---|---|
| `ACH_TUTORIAL` … `ACH_CHAPTER4` | `campaign-manager.js` | after chapter fully solved |
| `ACH_GAMES_*` | `game.js` → `checkWinCondition` | `incrementStat('gamesPlayed')` |
| `ACH_FIRST_WIN` | `game.js` → `checkWinCondition` | `incrementStat('gamesWon')` |
| `ACH_UNDERDOG_*` | `game.js` → `attack()` | `incrementStat('underdogWins')` |
| `ACH_DAVID` | `game.js` → `attack()` | `fireAchievementEvent('won4vs6')` |
| `ACH_STREAK_5` | `game.js` → `attack()` | `fireAchievementEvent('attackStreak5')` |
| `ACH_SURVIVOR` | `game.js` → `checkWinCondition` | `fireAchievementEvent('won8PlayerGame')` |
