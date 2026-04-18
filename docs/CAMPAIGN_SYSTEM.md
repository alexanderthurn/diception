# Campaign System Design

This document describes the campaign-based map system that replaces individual maps with collections, reduces text input for gamepad users, and implements proper write rights via PIN authentication.

---

## 1. Goals

- **Reduce text input** – Gamepad/Steam players should not need to type names or descriptions
- **Solve write rights** – Only campaign owner can modify, protected by PIN
- **Campaign-centric model** – Maps organized in campaigns, not as individual files
- **Flexible layout** – Dynamic grid (1×1 to 12×12) based on level count

---

## 2. Data Model

### 2.1 Campaign Structure

```json
{
  "id": "a3f2b1c4d5e6...",
  "ownerId": "sha256hex64chars...",
  "ownerIdType": "steam",
  "owner": "Alexander",
  "pin": "4-3-12-15",
  "levels": [
    { "type": "config", "mapSize": "4x4", "mapStyle": "full", "gameMode": "fair", "bots": 1, "botAI": "easy", "maxDice": 8, "diceSides": 6 },
    { "type": "scenario", "width": 5, "height": 5, "maxDice": 8, "diceSides": 6, "players": [...], "tiles": [...] },
    { "type": "map", "width": 9, "height": 9, "tiles": [...] }
  ]
}
```

| Field | Purpose |
|-------|---------|
| `id` | Unique campaign identifier (derived from ownerId for user campaigns) |
| `ownerId` | SHA256 hash of platform user ID – used for auth and filenames |
| `ownerIdType` | Platform source: `steam`, `web`, `android` (reserved) |
| `owner` | Display name shown in UI |
| `pin` | 4-number PIN (e.g. "4-3-12-15"), plain in localStorage |
| `levels` | Array of levels, indexed by position (no name/description per level) |

### 2.2 Built-in Campaigns

Built-in campaigns in `src/scenarios/` have no `ownerId`, `ownerIdType`, or `pin`. They are read-only.

| File | id / owner |
|------|------------|
| `builtin-tutorial.json` | `tutorial` / `Tutorial` |
| `builtin-chapter1.json` | `chapter1` / `chapter1` |
| `builtin-chapter4.json` | `chapter4` / `chapter4` (empty placeholder) |

### 2.3 Level Types

| Type | Description |
|------|-------------|
| `config` | Procedural map – `mapSize`, `mapStyle`, `gameMode`, `bots`, `botAI`, etc. |
| `scenario` | Full preset – `width`, `height`, `players`, `tiles` with owner/dice |
| `map` | Layout only – `width`, `height`, `tiles` (no owners); players configured at game start |

### 2.4 Level Format (No Text Fields)

Levels have **no** `name` or `description` fields. Identification is by index (0, 1, 2, …).

---

## 3. User Identity

### 3.1 ownerIdType Values

| Value | Source | Notes |
|-------|--------|-------|
| `steam` | Steam client | `ownerId` = SHA256(Steam ID) as hex |
| `web` | Browser | `ownerId` = SHA256(generated persistent ID) |
| `android` | Play Store | Reserved for future implementation |

### 3.2 Steam Users

- Raw Steam ID never stored or transmitted
- `ownerId` = `sha256(steamId64)` (64 hex chars)
- `owner` = Steam display name from `getUserName()`
- Requires IPC handler to expose `getSteamId()` to frontend for hashing

### 3.3 Web Users

- Generate persistent ID on first visit (store in localStorage)
- `ownerId` = SHA256 of that ID
- `owner` = "Player_xyz" (short random) or generated display name
- If no username: pick random like "Player_a3f2"

### 3.4 Local Campaign ID

- No prefix (e.g. no `local_`)
- Campaign identified by `owner` (username)
- One campaign per user

---

## 4. PIN System

### 4.1 PIN Entry UI

- **Layout**: 4×4 grid with numbers 1–16
- **PIN**: 4 positions, e.g. `4 - 3 - 12 - 15`
- User taps 4 tiles in sequence

### 4.2 Storage

| Location | Content |
|----------|---------|
| localStorage | Plain PIN (e.g. "4-3-12-15") |
| Backend | Hash only (`pinHash` = SHA256 of PIN string) |

### 4.3 First-time Upload

- No PIN required – create new campaign
- Generate random 4-number PIN
- Display once to user
- Store in localStorage, hash on backend with campaign

### 4.4 Overwrite

- User must enter PIN
- Client sends PIN with upload request
- Backend hashes, compares to stored `pinHash`
- Match required for overwrite

### 4.5 Recovery

- If user forgets PIN: no recovery
- Can create new campaign (new ownerId/owner if needed)

---

## 5. Backend

### 5.1 File Structure

- **One file per campaign**: `campaign_{ownerId}.json`
- `ownerId` = full 64-char hex (or shortened for filenames if desired)

### 5.2 Endpoints

| Endpoint | Purpose |
|---------|---------|
| `list_campaigns.php` | List campaigns (metadata: ownerId, owner, levelCount, filemtime) |
| `get_campaign.php?ownerId=...` | Fetch full campaign JSON |
| `upload_campaign.php` | Create or overwrite campaign (PIN required for overwrite) |
| `delete_campaign.php` | Delete campaign (ownerId + PIN required) |

### 5.3 Upload Logic

- **Create**: No existing file for ownerId → save, generate PIN, return to client
- **Overwrite**: File exists → require PIN in request, verify hash, then replace

### 5.4 Migration from Old Backend

- Old: individual map files (`fook.json`, etc.)
- New: campaign files only
- Old endpoints (`list.php`, `upload.php`, `delete.php`) deprecated or removed

---

## 6. UI Flow

### 6.1 Campaign Selection

- Single view: list of campaigns by `owner`
- Sources: built-in (3) + user's campaign (if any) + downloaded from backend
- User selects one campaign → level grid view

### 6.2 Level Grid

- **Dynamic size**: Smallest square that fits level count, up to 12×12
  - 1 level → 1×1
  - 4 levels → 2×2
  - 16 levels → 4×4
  - 144 levels → 12×12
- Empty slots shown for unused positions (up to next full square)
- Click tile → Play level

### 6.3 Own Campaign – Edit Mode

- Each level tile: Play + Edit buttons
- Next empty tile: "+" / Add – create new level
- Edit: opens map editor for that level
- Add: opens map editor for new level, appends to campaign on save

### 6.4 No Campaign Yet

- Show "Your Campaign" placeholder with 1 empty tile
- Click empty tile → create campaign with 1 level → open editor
- On first save: campaign created, level added

### 6.5 Other Users' Campaigns

- Play only, no edit/add controls

### 6.6 Gamepad UX

- D-pad/stick: navigate campaign list and level grid
- Confirm (A/X): select
- No text input except PIN entry (grid-based)

---

## 7. Map Editor Integration

### 7.1 No Standalone "New Map"

- Editor opens from campaign tile view only
- Removed: name input, description input

### 7.2 Save Flow

- Save adds or updates level in campaign
- Campaign stored in localStorage (and optionally pushed to backend)

### 7.3 Level Types in Editor

- Editor can create `map` or `scenario` types
- `config` types (procedural) may be created via a simpler config UI or template

---

## 8. Migration

### 8.1 Built-in Conversion

Built-in campaigns have been converted. Levels have no `name`/`description`. Current files:

| File | Contents |
|------|----------|
| `builtin-tutorial.json` | 4 scenario levels (intro/tutorial) |
| `builtin-chapter1.json` | 23 levels merged from original ch1 (2 scenario) + ch2 (17 map) + ch3 (4 scenario) |

### 8.2 Existing User Data

- `dicy_loadedScenario`: Clear or ignore on first load of new system
- `diceception_scenarios`: Offer import into user campaign – "Import X custom maps into Your Campaign?"

### 8.3 Backend Data

- Existing map files: Can remain; new system does not use them
- Or: one-time migration script to merge into user campaigns (complex)

---

## 9. Implementation Order

- [x] 1. **Data model & validation** – campaign format, level format, schema updates
- [x] 2. **Convert built-ins** – 3 campaign files with new format
- [x] 3. **User identity module** – Steam ID hash, web ID, ownerIdType
- [x] 4. **Campaign manager** – load/save campaigns (local + built-in)
- [x] 5. **Scenario manager refactor** – campaign-based loading instead of per-map
- [x] 6. **Level grid UI** – flexible 1×1 to 12×12 component
- [x] 7. **Campaign list UI** – replace Maps/Scenarios/Online tabs
- [x] 8. **Editor integration** – edit from tile, add from empty slot, remove name/description
- [ ] 9. **PIN system** – 4×4 grid UI, localStorage, backend hash
- [ ] 10. **Backend** – list_campaigns, get_campaign, upload_campaign, delete_campaign
- [ ] 11. **Upload/download flow** – sync user campaign with backend

---

## 10. File Reference

| Path | Purpose |
|------|---------|
| `src/scenarios/builtin-tutorial.json` | Tutorial campaign (4 scenario levels) |
| `src/scenarios/builtin-chapter1.json` | Chapter 1 campaign (scenario + map levels, merged from ch1/ch2/ch3) |
| `src/scenarios/builtin-chapter4.json` | Chapter 4 campaign (empty placeholder) |
| `src/scenarios/campaign-data.js` | Campaign format validation + grid layout helpers |
| `src/scenarios/campaign-manager.js` | Campaign load/save/list (built-in + user) |
| `src/scenarios/user-identity.js` | ownerId, ownerIdType, owner |
| `src/ui/scenario-browser.js` | Campaign list + level grid UI |
| `src/editor/map-editor.js` | Map editor (campaign context, no name/description) |
| `backend/list_campaigns.php` | (planned) |
| `backend/get_campaign.php` | (planned) |
| `backend/upload_campaign.php` | (planned) |
| `backend/delete_campaign.php` | (planned) |
