/**
 * HighscoreManager — single persistence for lifetime game counters, rollups,
 * and embedded campaign table rows. Steam / other stores are notified via hooks.
 */

import { notifyLifetimeStatChanged } from '../core/achievement-manager.js';
import { pushLifetimeStatToSteam } from '../core/steam-player-stats-sync.js';

export const HIGHSCORE_STORAGE_KEY = 'dicy_highscores';

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
    } catch (e) {
        console.warn('[highscores] reset lifetime tally failed:', e);
    }
}

export class HighscoreManager {
    constructor() {
        this.data = this._readBlob();
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

    /** Load `dicy_highscores` from localStorage and normalize `lifetime`. */
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

        base.humanStats = {
            gamesPlayed: base.lifetime.gamesPlayed || 0,
            wins: base.lifetime.gamesWon || 0,
        };

        return base;
    }

    save() {
        this._mirrorHumanStatsForLegacyReaders();
        localStorage.setItem(HIGHSCORE_STORAGE_KEY, JSON.stringify(this.data));
    }

    reload() {
        this.data = this._readBlob();
    }

    getLifetimeStat(stat) {
        this._ensureLifetime();
        return this.data.lifetime[stat] || 0;
    }

    getLifetimeStats() {
        this._ensureLifetime();
        return { ...this.data.lifetime };
    }

    /**
     * Used by Steam reconcile — does not push to Steam (caller handles that).
     */
    setLifetimeStatMerged(stat, value) {
        this._ensureLifetime();
        const v = Math.max(0, Math.floor(Number(value) || 0));
        if (this.data.lifetime[stat] === v) return;
        this.data.lifetime[stat] = v;
        this.save();
        notifyLifetimeStatChanged(stat, v);
    }

    incrementLifetime(stat, amount = 1) {
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
        this._ensureLifetime();
        const v = Math.max(0, Math.floor(Number(value) || 0));
        this.data.lifetime[stat] = v;
        this.save();
        pushLifetimeStatToSteam(stat, v);
        notifyLifetimeStatChanged(stat, v);
    }

    /**
     * Record a game result (per-winner table + totalGames + lifetime human games/wins).
     */
    recordWin(winnerName, humanPlayed = false, humanWon = false) {
        this.data.wins[winnerName] = (this.data.wins[winnerName] || 0) + 1;
        this.data.totalGames = (this.data.totalGames || 0) + 1;

        if (humanPlayed) {
            this.incrementLifetime('gamesPlayed', 1);
            if (humanWon) {
                this.incrementLifetime('gamesWon', 1);
            }
        } else {
            this.save();
        }
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

    /** Human TOTAL row — same source as achievements (`lifetime`). */
    getHumanStats() {
        this._ensureLifetime();
        const gamesPlayed = this.data.lifetime.gamesPlayed || 0;
        const wins = this.data.lifetime.gamesWon || 0;
        return {
            gamesPlayed,
            wins,
            winRate: gamesPlayed === 0 ? 0 : Math.round((wins / gamesPlayed) * 100),
        };
    }

    /** Clears `wins`, `totalGames`, and all `lifetime` counters; keeps `campaigns`. */
    resetLifetimeRollupsPreserveCampaigns() {
        this.data.wins = {};
        this.data.totalGames = 0;
        this.data.lifetime = emptyLifetime();
        this._mirrorHumanStatsForLegacyReaders();
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
