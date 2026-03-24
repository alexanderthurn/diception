/**
 * Achievement Manager
 *
 * Persists stats + unlocked set in localStorage (auto-synced to Steam Cloud
 * via the existing storage.js patching).
 * Calls window.steam.unlockAchievement() when on Steam desktop.
 */

import { ACHIEVEMENTS } from './achievements.js';
import { getSolvedLevels } from '../scenarios/campaign-progress.js';

const STATS_KEY    = 'dicy_ach_stats';
const UNLOCKED_KEY = 'dicy_ach_unlocked';

// Maps localStorage stat key → Steam stat API name
const STEAM_STAT_NAMES = {
    gamesPlayed:  'STAT_GAMES_PLAYED',
    gamesWon:     'STAT_GAMES_WON',
    underdogWins: 'STAT_UNDERDOG_WINS',
    streak3:      'STAT_STREAK_3',
    streak4:      'STAT_STREAK_4',
    streak5:      'STAT_STREAK_5',
    streak6:      'STAT_STREAK_6',
    streak7:      'STAT_STREAK_7',
};

// ── Internal helpers ─────────────────────────────────────────────────────────

function loadStats() {
    try { return JSON.parse(localStorage.getItem(STATS_KEY)) || {}; } catch { return {}; }
}

function saveStats(stats) {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function loadUnlocked() {
    try { return JSON.parse(localStorage.getItem(UNLOCKED_KEY)) || []; } catch { return []; }
}

function saveUnlocked(list) {
    localStorage.setItem(UNLOCKED_KEY, JSON.stringify(list));
}

function pushStatToSteam(stat, value) {
    const steamName = STEAM_STAT_NAMES[stat];
    if (steamName && window.steam?.setStat) {
        window.steam.setStat(steamName, value);
    }
}

// ── Public API ───────────────────────────────────────────────────────────────

let _unlockCallback = null;
let _progressCallback = null;

/**
 * Register a callback fired whenever a new achievement is unlocked.
 * Called with the achievement id. Used for popup notifications.
 */
export function setUnlockCallback(fn) {
    _unlockCallback = fn;
}

/**
 * Register a callback fired whenever a stat increments and at least one
 * achievement for that stat is still locked. Called with (stat, newValue).
 */
export function setProgressCallback(fn) {
    _progressCallback = fn;
}

/**
 * Unlock a single achievement by ID.
 * Idempotent — safe to call multiple times.
 */
export function unlockAchievement(id) {
    const unlocked = loadUnlocked();
    if (unlocked.includes(id)) return;

    unlocked.push(id);
    saveUnlocked(unlocked);

    // Push to Steam (no-op if not on Steam desktop)
    window.steam?.unlockAchievement(id);

    console.log(`🏆 ACHIEVEMENT UNLOCKED: ${id}`);

    if (_unlockCallback) _unlockCallback(id);
}

/**
 * Increment a persistent stat counter and unlock any achievements whose
 * threshold is now met.
 */
export function incrementStat(stat, amount = 1) {
    const stats = loadStats();
    stats[stat] = (stats[stat] || 0) + amount;
    saveStats(stats);
    pushStatToSteam(stat, stats[stat]);

    for (const ach of ACHIEVEMENTS) {
        if (ach.type === 'stat' && ach.stat === stat && stats[stat] >= ach.threshold) {
            unlockAchievement(ach.id);
        }
    }

    // Fire progress callback if any achievement for this stat is still unfinished
    if (_progressCallback) {
        const unlocked = loadUnlocked();
        const stillPending = ACHIEVEMENTS.some(
            ach => ach.type === 'stat' && ach.stat === stat && !unlocked.includes(ach.id)
        );
        if (stillPending) _progressCallback(stat, stats[stat]);
    }
}

/**
 * Fire an event-based achievement by event name.
 */
export function fireAchievementEvent(event) {
    for (const ach of ACHIEVEMENTS) {
        if (ach.type === 'event' && ach.event === event) {
            unlockAchievement(ach.id);
        }
    }
}

/**
 * Check campaign chapter completion and unlock the matching achievement.
 * Call this after markLevelSolved().
 *
 * @param {string} campaignOwner - campaign.owner (e.g. 'chapter1')
 * @param {number} totalLevels   - total levels in the campaign
 */
/**
 * Remove a single achievement by ID (cheat/test use only).
 * Removes from localStorage; Steam state is not cleared automatically.
 */
export function removeAchievement(id) {
    const unlocked = loadUnlocked().filter(u => u !== id);
    saveUnlocked(unlocked);
    console.log(`🗑️ ACHIEVEMENT REMOVED: ${id}`);
}

/**
 * Directly set a stat value and re-check all thresholds (cheat/test use only).
 */
export function setStatValue(stat, value) {
    const stats = loadStats();
    stats[stat] = Math.max(0, value);
    saveStats(stats);
    pushStatToSteam(stat, stats[stat]);
    for (const ach of ACHIEVEMENTS) {
        if (ach.type === 'stat' && ach.stat === stat && stats[stat] >= ach.threshold) {
            unlockAchievement(ach.id);
        }
    }
}

/**
 * Reset all achievements and stats to zero — both localStorage and Steam.
 * Used by "Clear Storage" so testing always starts from a clean slate.
 */
export async function resetAllAchievementsAndStats() {
    // Clear localStorage
    localStorage.removeItem(STATS_KEY);
    localStorage.removeItem(UNLOCKED_KEY);

    // Reset Steam achievements and stats if on Steam desktop
    if (window.steam) {
        const achPromises = ACHIEVEMENTS.map(a => window.steam.clearAchievement(a.id).catch(() => {}));
        const statPromises = Object.values(STEAM_STAT_NAMES).map(name =>
            window.steam.setStat(name, 0).catch(() => {})
        );
        await Promise.all([...achPromises, ...statPromises]);
    }
}

export function checkCampaignAchievement(campaignOwner, totalLevels) {
    const solved = getSolvedLevels(campaignOwner);
    if (solved.length < totalLevels) return;

    const ach = ACHIEVEMENTS.find(a => a.type === 'campaign' && a.campaign === campaignOwner);
    if (ach) unlockAchievement(ach.id);
}
