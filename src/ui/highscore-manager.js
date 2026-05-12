/**
 * HighscoreManager — single persistence entry point: lifetime counters, rollups,
 * embedded campaign table rows, and solo-human analytics (`solo_stats`).
 * Steam / other stores are notified via hooks where applicable.
 *
 * **Adding more persisted slices (e.g. Android 1–2 flags):** add a small module or class
 * (own `localStorage` key or Tauri bridge), keep it as a `HighscoreManager` private field,
 * and expose only narrow methods (`getX`, `setX`, `reload`, `clear` on reset). UI and
 * gameplay should call the manager — not the store or `localStorage` directly — so
 * mirroring (like solo `g` → `lifetime` on `save()`) stays in one place.
 */

import { notifyLifetimeStatChanged } from '../core/achievement-manager.js';
import { pushLifetimeStatToSteam } from '../core/steam-player-stats-sync.js';
import { SoloHumanStatsStore, emptySoloStatsBlob, SOLO_HUMAN_STATS_KEY } from '../core/solo-human-stats.js';

export const HIGHSCORE_STORAGE_KEY = 'highscores';

const LIFETIME_KEYS = [
    'gamesPlayed',
    'gamesWon',
    'underdogWins',
    'streak3',
    'streak4',
    'streak5',
    'streak6',
    'streak7',
];

function emptyLifetime() {
    const o = {};
    for (const k of LIFETIME_KEYS) o[k] = 0;
    return o;
}

function ensureLifetimeOnData(dataObj) {
    if (!dataObj.lifetime || typeof dataObj.lifetime !== 'object') {
        dataObj.lifetime = emptyLifetime();
    }
    for (const k of LIFETIME_KEYS) {
        if (typeof dataObj.lifetime[k] !== 'number' || Number.isNaN(dataObj.lifetime[k])) {
            dataObj.lifetime[k] = 0;
        }
    }
}

/**
 * Zero lifetime tallies + per-name wins + totalGames. Keeps `campaigns` and `lifetime` keys at zero.
 * Call `highscoreManager.reload()` if an instance is already in memory.
 */
export function resetHighscoreLifetimeTallyPreserveCampaigns() {
    try {
        const raw = localStorage.getItem(HIGHSCORE_STORAGE_KEY);
        const data = raw ? JSON.parse(raw) : {};
        const next = {
            wins: {},
            totalGames: 0,
            lifetime: emptyLifetime(),
            campaigns: data?.campaigns && typeof data.campaigns === 'object' ? data.campaigns : {},
        };
        localStorage.setItem(HIGHSCORE_STORAGE_KEY, JSON.stringify(next));
        try {
            localStorage.setItem(SOLO_HUMAN_STATS_KEY, JSON.stringify(emptySoloStatsBlob()));
        } catch (e2) {
            console.warn('[highscores] reset solo stats failed:', e2);
        }
    } catch (e) {
        console.warn('[highscores] reset lifetime tally failed:', e);
    }
}

export class HighscoreManager {
    constructor() {
        this.data = this._readBlob();
        /** @private Solo stats (`solo_stats`). Bucket `g` is canonical for human games played / won; copied into `lifetime` on every `save()` for Steam + tools. */
        this._soloHumanStats = new SoloHumanStatsStore();
        this.save();
    }

    _ensureLifetime() {
        if (!this.data.lifetime || typeof this.data.lifetime !== 'object') {
            this.data.lifetime = emptyLifetime();
        }
        for (const k of LIFETIME_KEYS) {
            if (typeof this.data.lifetime[k] !== 'number' || Number.isNaN(this.data.lifetime[k])) {
                this.data.lifetime[k] = 0;
            }
        }
    }

    _mirrorHumanStatsForLegacyReaders() {
        this._ensureLifetime();
        this.data.humanStats = {
            gamesPlayed: this.data.lifetime.gamesPlayed || 0,
            wins: this.data.lifetime.gamesWon || 0,
        };
    }

    /** Load `highscores` from localStorage and normalize `lifetime`. */
    _readBlob() {
        let data;
        try {
            data = JSON.parse(localStorage.getItem(HIGHSCORE_STORAGE_KEY)) || {};
        } catch {
            data = {};
        }

        const base = {
            wins: data.wins && typeof data.wins === 'object' ? data.wins : {},
            totalGames: typeof data.totalGames === 'number' ? data.totalGames : 0,
            campaigns: data.campaigns && typeof data.campaigns === 'object' ? data.campaigns : {},
            lifetime: { ...emptyLifetime(), ...(data.lifetime && typeof data.lifetime === 'object' ? data.lifetime : {}) },
        };
        ensureLifetimeOnData(base);
        return base;
    }

    save() {
        const row = this._soloHumanStats.getGlobalRow();
        this._ensureLifetime();
        this.data.lifetime.gamesPlayed = row[0] | 0;
        this.data.lifetime.gamesWon = row[1] | 0;
        this._mirrorHumanStatsForLegacyReaders();
        localStorage.setItem(HIGHSCORE_STORAGE_KEY, JSON.stringify(this.data));
    }

    reload() {
        this.data = this._readBlob();
        this._soloHumanStats.reload();
        this.save();
    }

    /**
     * Solo games only (exactly one human). Updates global, per-difficulty, per map-size, per level,
     * and all relevant combinations (see `solo-human-stats.js`).
     * @param {{ map?: { width: number, height: number }, players: { isBot?: boolean, aiId?: string|null }[] }} game
     * @param {{ humanWon: boolean, turns: number, durationMs: number|null, levelKey: string|null }} ctx
     */
    recordSoloHumanSessionEnd(game, ctx) {
        const before = this._soloHumanStats.getGlobalRow();
        this._soloHumanStats.recordSoloSession(game, ctx);
        const after = this._soloHumanStats.getGlobalRow();
        this.save();
        if (after[0] !== before[0]) {
            notifyLifetimeStatChanged('gamesPlayed', after[0]);
            pushLifetimeStatToSteam('gamesPlayed', after[0]);
        }
        if (after[1] !== before[1]) {
            notifyLifetimeStatChanged('gamesWon', after[1]);
            pushLifetimeStatToSteam('gamesWon', after[1]);
        }
    }

    /** Minified JSON of `solo_stats` for a future server upload. */
    exportSoloHumanStatsPayload() {
        return this._soloHumanStats.exportPayloadString();
    }

    /** @returns {{ v: number, buckets: Record<string, [number, number, number|null, number|null]> }} */
    getSoloHumanStatsBlob() {
        return this._soloHumanStats.getBlob();
    }

    getLifetimeStat(stat) {
        if (stat === 'gamesPlayed' || stat === 'gamesWon') {
            const row = this._soloHumanStats.getGlobalRow();
            return stat === 'gamesPlayed' ? row[0] | 0 : row[1] | 0;
        }
        this._ensureLifetime();
        return this.data.lifetime[stat] || 0;
    }

    getLifetimeStats() {
        this._ensureLifetime();
        const row = this._soloHumanStats.getGlobalRow();
        return {
            ...this.data.lifetime,
            gamesPlayed: row[0] | 0,
            gamesWon: row[1] | 0,
        };
    }

    /**
     * Used by Steam reconcile — does not push to Steam (caller handles that).
     */
    setLifetimeStatMerged(stat, value) {
        this._ensureLifetime();
        const v = Math.max(0, Math.floor(Number(value) || 0));
        if (stat === 'gamesPlayed' || stat === 'gamesWon') {
            const cur = stat === 'gamesPlayed' ? this._soloHumanStats.getGlobalRow()[0] : this._soloHumanStats.getGlobalRow()[1];
            if (cur === v) return;
            this._soloHumanStats.setGlobalPlaysOrWins(stat, v);
            this.save();
            notifyLifetimeStatChanged(stat, v);
            return;
        }
        if (this.data.lifetime[stat] === v) return;
        this.data.lifetime[stat] = v;
        this.save();
        notifyLifetimeStatChanged(stat, v);
    }

    incrementLifetime(stat, amount = 1) {
        if (stat === 'gamesPlayed' || stat === 'gamesWon') {
            const n = Math.max(0, Math.floor(Number(amount) || 0));
            if (n === 0) return;
            const row = this._soloHumanStats.getGlobalRow();
            const idx = stat === 'gamesPlayed' ? 0 : 1;
            const nv = (row[idx] | 0) + n;
            this._soloHumanStats.setGlobalPlaysOrWins(stat, nv);
            this.save();
            notifyLifetimeStatChanged(stat, nv);
            pushLifetimeStatToSteam(stat, nv);
            return;
        }
        this._ensureLifetime();
        const n = Math.max(0, Math.floor(Number(amount) || 0));
        if (n === 0) return;
        this.data.lifetime[stat] = (this.data.lifetime[stat] || 0) + n;
        const v = this.data.lifetime[stat];
        this.save();
        pushLifetimeStatToSteam(stat, v);
        notifyLifetimeStatChanged(stat, v);
    }

    /** Cheat / dev: set absolute value for a lifetime counter. */
    setLifetimeStat(stat, value) {
        const v = Math.max(0, Math.floor(Number(value) || 0));
        if (stat === 'gamesPlayed' || stat === 'gamesWon') {
            this._soloHumanStats.setGlobalPlaysOrWins(stat, v);
            this.save();
            notifyLifetimeStatChanged(stat, v);
            pushLifetimeStatToSteam(stat, v);
            return;
        }
        this._ensureLifetime();
        this.data.lifetime[stat] = v;
        this.save();
        pushLifetimeStatToSteam(stat, v);
        notifyLifetimeStatChanged(stat, v);
    }

    /**
     * Record a game result (per-winner table + totalGames). Human games played / won come only from
     * solo matches via `recordSoloHumanSessionEnd` (bucket `g`), then mirrored into `lifetime` on `save()`.
     */
    recordWin(winnerName, humanPlayed = false, humanWon = false) {
        this.data.wins[winnerName] = (this.data.wins[winnerName] || 0) + 1;
        this.data.totalGames = (this.data.totalGames || 0) + 1;
        this.save();
        return this.data;
    }

    markCampaignLevelComplete(campaignId, levelIndex) {
        if (!this.data.campaigns[campaignId]) {
            this.data.campaigns[campaignId] = [];
        }
        if (!this.data.campaigns[campaignId].includes(levelIndex)) {
            this.data.campaigns[campaignId].push(levelIndex);
            this.data.campaigns[campaignId].sort((a, b) => a - b);
        }
        this.save();
    }

    isCampaignLevelComplete(campaignId, levelIndex) {
        return this.data.campaigns[campaignId]?.includes(levelIndex) || false;
    }

    getCampaignProgress(campaignId) {
        return this.data.campaigns[campaignId] || [];
    }

    getHumanWinRate() {
        const { gamesPlayed, wins } = this.getHumanStats();
        if (gamesPlayed === 0) return 0;
        return Math.round((wins / gamesPlayed) * 100);
    }

    /** Human TOTAL row — same source as achievements: solo global `g` for played / won. */
    getHumanStats() {
        const row = this._soloHumanStats.getGlobalRow();
        const gamesPlayed = row[0] | 0;
        const wins = row[1] | 0;
        return {
            gamesPlayed,
            wins,
            winRate: gamesPlayed === 0 ? 0 : Math.round((wins / gamesPlayed) * 100),
        };
    }

    /** Clears `wins`, `totalGames`, solo stats, then `lifetime` (rebuilt from empty solo `g` on `save()`); keeps `campaigns`. */
    resetLifetimeRollupsPreserveCampaigns() {
        this.data.wins = {};
        this.data.totalGames = 0;
        this._soloHumanStats.clear();
        this.data.lifetime = emptyLifetime();
        this.save();
    }

    display(currentWinnerName) {
        const highscoreList = document.getElementById('highscore-list');
        const totalGamesEl = document.getElementById('total-games-played');

        const sortedWins = Object.entries(this.data.wins)
            .sort((a, b) => b[1] - a[1]);

        if (!highscoreList || !totalGamesEl) return;

        if (sortedWins.length === 0) {
            highscoreList.innerHTML = '<div class="highscore-item"><span class="highscore-player-name">No stats yet</span></div>';
        } else {
            highscoreList.innerHTML = sortedWins.map(([name, wins]) => {
                const isHighlighted = name === currentWinnerName ? 'highlighted' : '';
                return `
                    <div class="highscore-item ${isHighlighted}">
                        <span class="highscore-player-name">${name}</span>
                        <span class="highscore-wins">${wins} <span class="sprite-icon icon-achievements"></span></span>
                    </div>
                `;
            }).join('');
        }

        totalGamesEl.textContent = `Total Games Played: ${this.data.totalGames || 0}`;
    }
}
