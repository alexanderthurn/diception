/**
 * Solo-human-only aggregates (exactly one human per match): plays, wins, best win turns, best win duration.
 * `localStorage` key `solo_stats` — each bucket is `[plays, wins, minTurnsToWin|null, minMsToWin|null]`.
 * Global bucket **`g`** is canonical for **games played** and **wins**; `HighscoreManager.save()` copies them into
 * `highscores.lifetime` for Steam + tools.
 *
 * Bucket ids:
 * - `g` — global
 * - `d:easy` | `d:medium` | `d:hard` | `d:custom` — per bot difficulty (strongest AI among bots)
 * - `s:small` | `s:medium` | `s:big` — map size (small max side ≤4, medium 5–7, big ≥8)
 * - `l:{campaignOwner}:{levelIndex}` — per campaign level (only when a level key is passed in)
 * - Combos: `d:*|s:*`, `d:*|l:*`, `s:*|l:*`, `d:*|s:*|l:*` when level applies
 */

export const SOLO_HUMAN_STATS_KEY = 'solo_stats';

const FORMAT_VERSION = 1;

/** @typedef {[number, number, number|null, number|null]} SoloBucketRow */

/** @returns {{ v: number, buckets: Record<string, SoloBucketRow> }} */
export function emptySoloStatsBlob() {
    return { v: FORMAT_VERSION, buckets: {} };
}

/**
 * @param {number} w
 * @param {number} h
 * @returns {'small'|'medium'|'big'}
 */
export function mapSizeGroupFromDims(w, h) {
    const m = Math.max(w | 0, h | 0);
    if (m <= 4) return 'small';
    if (m <= 7) return 'medium';
    return 'big';
}

/**
 * Strongest bot tier on the board (skirmish uses one AI for all bots).
 * @param {{ players: { isBot?: boolean, aiId?: string|null }[] }} game
 * @returns {'easy'|'medium'|'hard'|'custom'}
 */
export function dominantBotDifficulty(game) {
    const bots = game.players.filter((p) => p.isBot);
    if (bots.length === 0) return 'easy';
    let hasHard = false;
    let hasMedium = false;
    let hasCustom = false;
    for (const p of bots) {
        const id = String(p.aiId || 'easy').toLowerCase();
        if (id === 'hard') hasHard = true;
        else if (id === 'medium') hasMedium = true;
        else if (id === 'custom') hasCustom = true;
    }
    if (hasHard) return 'hard';
    if (hasMedium) return 'medium';
    if (hasCustom) return 'custom';
    return 'easy';
}

/**
 * @param {'easy'|'medium'|'hard'|'custom'} diff
 * @param {'small'|'medium'|'big'} sizeGroup
 * @param {string|null} levelKey `owner:index` or null when not in campaign
 * @returns {string[]}
 */
export function allSoloBucketIds(diff, sizeGroup, levelKey) {
    const keys = new Set(['g', `d:${diff}`, `s:${sizeGroup}`]);
    keys.add(`d:${diff}|s:${sizeGroup}`);
    if (levelKey) {
        keys.add(`l:${levelKey}`);
        keys.add(`d:${diff}|l:${levelKey}`);
        keys.add(`s:${sizeGroup}|l:${levelKey}`);
        keys.add(`d:${diff}|s:${sizeGroup}|l:${levelKey}`);
    }
    return [...keys].sort();
}

function normalizeBuckets(raw) {
    const out = emptySoloStatsBlob();
    if (!raw || typeof raw.buckets !== 'object') return out;
    for (const [id, row] of Object.entries(raw.buckets)) {
        if (!Array.isArray(row) || row.length < 4) continue;
        const plays = Math.max(0, row[0] | 0);
        const wins = Math.max(0, row[1] | 0);
        const minT = row[2] == null || row[2] === '' ? null : Math.max(0, row[2] | 0);
        const minMs = row[3] == null || row[3] === '' ? null : Math.max(0, row[3] | 0);
        out.buckets[id] = [plays, wins, minT, minMs];
    }
    return out;
}

function loadBlob() {
    try {
        const raw = localStorage.getItem(SOLO_HUMAN_STATS_KEY);
        if (!raw) return emptySoloStatsBlob();
        const o = JSON.parse(raw);
        if (!o || o.v !== FORMAT_VERSION) return emptySoloStatsBlob();
        return normalizeBuckets(o);
    } catch {
        return emptySoloStatsBlob();
    }
}

export class SoloHumanStatsStore {
    constructor() {
        /** @type {{ v: number, buckets: Record<string, SoloBucketRow> }} */
        this._data = loadBlob();
    }

    reload() {
        this._data = loadBlob();
    }

    clear() {
        this._data = emptySoloStatsBlob();
        this._persist();
    }

    exportPayloadString() {
        const sorted = { v: this._data.v, buckets: {} };
        for (const k of Object.keys(this._data.buckets).sort()) {
            sorted.buckets[k] = [...this._data.buckets[k]];
        }
        return JSON.stringify(sorted);
    }

    getBlob() {
        const buckets = {};
        for (const k of Object.keys(this._data.buckets).sort()) {
            buckets[k] = [...this._data.buckets[k]];
        }
        return { v: this._data.v, buckets };
    }

    /** @returns {[number, number, number|null, number|null]} */
    getGlobalRow() {
        const r = this._data.buckets.g;
        return r ? [...r] : [0, 0, null, null];
    }

    /**
     * @param {'gamesPlayed'|'gamesWon'} stat
     * @param {number} v
     */
    setGlobalPlaysOrWins(stat, v) {
        const row = this.getGlobalRow();
        const n = Math.max(0, Math.floor(Number(v) || 0));
        if (stat === 'gamesPlayed') row[0] = n;
        else if (stat === 'gamesWon') row[1] = n;
        this._data.buckets.g = row;
        this._persist();
    }

    /**
     * @param {number} plays
     * @param {number} wins
     */
    setGlobalPlaysWins(plays, wins) {
        const row = this.getGlobalRow();
        row[0] = Math.max(0, plays | 0);
        row[1] = Math.max(0, wins | 0);
        this._data.buckets.g = row;
        this._persist();
    }

    /**
     * @param {{ map?: { width: number, height: number }, players: { isBot?: boolean, aiId?: string|null }[] }} game
     * @param {{ humanWon: boolean, turns: number, durationMs: number|null, levelKey: string|null }} ctx
     */
    recordSoloSession(game, ctx) {
        if (!game?.map || !game.players) return;
        const humans = game.players.filter((p) => !p.isBot);
        if (humans.length !== 1) return;

        const diff = dominantBotDifficulty(game);
        const sizeGroup = mapSizeGroupFromDims(game.map.width, game.map.height);
        const levelKey =
            typeof ctx.levelKey === 'string' && ctx.levelKey.length > 0 ? ctx.levelKey : null;

        const ids = allSoloBucketIds(diff, sizeGroup, levelKey);
        const turns = Math.max(1, Math.floor(Number(ctx.turns)) || 1);
        const won = !!ctx.humanWon;
        const durationMs = ctx.durationMs != null && Number.isFinite(ctx.durationMs) ? Math.max(0, ctx.durationMs | 0) : null;

        for (const id of ids) {
            let row = this._data.buckets[id];
            if (!row) row = [0, 0, null, null];
            row[0]++;
            if (won) {
                row[1]++;
                if (row[2] == null || turns < row[2]) row[2] = turns;
                if (durationMs != null && (row[3] == null || durationMs < row[3])) row[3] = durationMs;
            }
            this._data.buckets[id] = row;
        }
        this._persist();
    }

    _persist() {
        try {
            localStorage.setItem(SOLO_HUMAN_STATS_KEY, JSON.stringify(this._data));
        } catch (e) {
            console.warn('[solo-stats] persist failed:', e);
        }
    }
}
