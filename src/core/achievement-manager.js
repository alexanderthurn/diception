/**
 * Achievement Manager — unlock state + threshold checks.
 * Lifetime numeric counters live in HighscoreManager (`highscores.lifetime`).
 */

import { ACHIEVEMENTS } from './achievements.js';
import { getSolvedLevels } from '../scenarios/campaign-progress.js';
import { resetSteamStatsOrFallback } from './steam-player-stats-sync.js';

const UNLOCKED_KEY = 'ach_unlocked';

function loadUnlocked() {
    try { return JSON.parse(localStorage.getItem(UNLOCKED_KEY)) || []; } catch { return []; }
}

function saveUnlocked(list) {
    localStorage.setItem(UNLOCKED_KEY, JSON.stringify(list));
}

// ── Public API ───────────────────────────────────────────────────────────────

let _unlockCallback = null;
let _progressCallback = null;

export function setUnlockCallback(fn) {
    _unlockCallback = fn;
}

export function setProgressCallback(fn) {
    _progressCallback = fn;
}

/**
 * After HighscoreManager updates a lifetime counter, re-check stat achievements + progress toast.
 */
export function notifyLifetimeStatChanged(stat, newValue) {
    for (const ach of ACHIEVEMENTS) {
        if (ach.type === 'stat' && ach.stat === stat && newValue >= ach.threshold) {
            unlockAchievement(ach.id);
        }
    }

    if (_progressCallback) {
        const unlocked = loadUnlocked();
        const stillPending = ACHIEVEMENTS.some(
            ach => ach.type === 'stat' && ach.stat === stat && !unlocked.includes(ach.id)
        );
        if (stillPending) {
            _progressCallback(stat, newValue);
        } else if (/^streak\d+$/.test(stat)) {
            _progressCallback(stat, newValue, { tally: true });
        }
    }
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

    window.steam?.unlockAchievement(id);

    console.log(`🏆 ACHIEVEMENT UNLOCKED: ${id}`);

    if (_unlockCallback) _unlockCallback(id);
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
 * Remove a single achievement by ID (cheat/test use only).
 */
export function removeAchievement(id) {
    const unlocked = loadUnlocked().filter(u => u !== id);
    saveUnlocked(unlocked);
    console.log(`🗑️ ACHIEVEMENT REMOVED: ${id}`);
}

export function clearAllUnlocked() {
    localStorage.removeItem(UNLOCKED_KEY);
}

/**
 * Reset Steam stats + local achievement unlock list.
 * Used when localStorage is wiped first ("Clear all storage"); does not touch highscores JSON.
 */
export async function resetAllAchievementsAndStats() {
    await resetSteamStatsOrFallback(true);
    clearAllUnlocked();
}

/** Reset lifetime counters (local + Steam) and optionally achievement unlocks. */
export async function resetPersistedStatsAndSteam({ achievementsToo, highscoreManager }) {
    await resetSteamStatsOrFallback(achievementsToo);
    if (highscoreManager) {
        highscoreManager.resetLifetimeRollupsPreserveCampaigns();
    }
    if (achievementsToo) clearAllUnlocked();
}

/** Re-unlock stat achievements from current lifetime values (e.g. after new tiers ship). */
export function recheckStatAchievements(highscoreManager) {
    if (!highscoreManager) return;
    for (const ach of ACHIEVEMENTS) {
        if (ach.type !== 'stat') continue;
        const v = highscoreManager.getLifetimeStat(ach.stat);
        if (v >= ach.threshold) unlockAchievement(ach.id);
    }
}

export function checkCampaignAchievement(campaignOwner, totalLevels) {
    const solved = getSolvedLevels(campaignOwner);
    if (solved.length < totalLevels) return;

    const ach = ACHIEVEMENTS.find(a => a.type === 'campaign' && a.campaign === campaignOwner);
    if (ach) unlockAchievement(ach.id);
}
