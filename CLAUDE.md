# DICEPTION — Claude Code Rules

## Project
- Vite + vanilla JS frontend, Tauri desktop backend (src-tauri/)
- Working dir: `/Users/alexanderthurn/Documents/projects/diception/dev`
- Use `python` not `python3`

## CSS Rules

### No inline styles in HTML or JS
- All static styles belong in `styles.css`
- The only acceptable inline style in JS is a **runtime-calculated value** (e.g. `style="width:${pct}%"`)
- Never use `element.style.cssText = ...` for static layout — create a CSS class instead

### Class naming
- Use kebab-case: `.ach-card`, `.pause-content`, `.ach-progress-fill`
- Modifier pattern: `.ach-card.unlocked` not `.ach-card-unlocked`
- JS toggles state via `classList.add/remove` only — never by setting `.style.*` for static properties

### Modal system — two layers, same visual language
- **`.modal`** — HTML-defined menus (setup, pause, howto, settings, achievements, about)
- **`.dialog-box`** — JS-created dialogs (confirm, keybinding, level preview)
- Both share the same background (`rgba(0,0,5,0.90)`), `border-top`, `box-shadow`, `backdrop-filter`
- Never add a second close button to modals that use `global-back-btn` for navigation (achievements-modal is one of these)

### Scrollable modal content
- Use `.howto-content` inside `.large-modal` for scrollable areas
- `.large-modal .howto-content` sets `max-height: calc(90vh - 120px)` — do not add per-modal overrides unless truly different
- Custom scrollbar styles are on `.howto-content::-webkit-scrollbar`

### Responsive grids
- Use `minmax(min(Xpx, 100%), 1fr)` for auto-fill grids so they don't overflow on small screens
- The achievements grid uses `minmax(min(260px, 100%), 1fr)`

### Button hover effects
- Do NOT use `transform: translateX()` on hover — it clips left borders
- `transform: scale()` on `:active` is fine (centered, no clipping)

### Stats tables
- Use `max-width: 320px` on stat summary tables — they look bad stretched full-width on desktop

### Where to add new CSS
- Add new component classes in the **"Global Modal Visual Polish"** block near the bottom of `styles.css` (around line 5750+), keeping related rules together
- Keep the top of `styles.css` (variables, resets, game UI) stable

## Achievement System

### Files
- `src/core/achievements.js` — single source of truth for all achievement definitions
- `src/core/achievement-manager.js` — achievement unlock state + threshold checks
- `src/ui/highscore-manager.js` — lifetime counters (`dicy_highscores.lifetime`), rollups, campaign table in blob
- `src/core/steam-player-stats-sync.js` — Steam `STAT_*` reconcile + push (no game rules)
- `src/ui/achievements-panel.js` — renders the achievements modal
- `scripts/steam_achievements.html` — generates Steam achievement icons (open in browser)

### Adding a new achievement
1. Add definition to `achievements.js` (type: `stat` | `event` | `campaign`)
2. If stat-based: add the counter key to `LIFETIME_KEYS` in `highscore-manager.js`, add Steam mapping in `STEAM_STAT_NAMES` in `steam-player-stats-sync.js`, and bump it from gameplay (usually `HighscoreManager.incrementLifetime` from `game-events.js` or `recordWin`)
3. Add title/description to `TITLES` and `DESCRIPTIONS` in `achievements-panel.js`
4. Add to `ACH_MIN`, `ACH_MAX`, `ACH_STAT_API` in `steam_achievements.html`
5. Add a renderer function and entry in `RENDERERS` in `steam_achievements.html`
6. Register stat + achievement in Steamworks partner portal

### Stat-based achievements
- Progress is tracked in `localStorage` under `dicy_highscores` → `lifetime` (via `HighscoreManager`)
- Unlocked set is in `localStorage` key `dicy_ach_unlocked`
- Steam stats are synced bidirectionally on startup (local ↔ Steam API, taking the max)
- Stat names map (`gamesPlayed` → `STAT_GAMES_PLAYED`, etc.): `STEAM_STAT_NAMES` in `steam-player-stats-sync.js`

### Streak detection (src/ui/game-events.js)
- Only counts if the next attack originates FROM the last conquered tile (`_streakTile`)
- Only the **peak streak** of each chain fires — debounced 800ms (`_pendingStreakCount`)
- Resets on turn start and on loss, flushing pending streak first

## General Rules
- No unnecessary abstractions — if something is used once, don't extract it
- No backwards-compat shims or `// removed` comments — just delete dead code
- Prefer editing existing files over creating new ones
- Always check existing patterns before adding something new (modal, button, dialog)
- Match section heading style from `steam_achievements.html` exactly when adding Steam metadata
