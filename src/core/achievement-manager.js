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

// ── Public API ───────────────────────────────────────────────────────────────

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
}

/**
 * Increment a persistent stat counter and unlock any achievements whose
 * threshold is now met.
 */
export function incrementStat(stat, amount = 1) {
    const stats = loadStats();
    stats[stat] = (stats[stat] || 0) + amount;
    saveStats(stats);

    for (const ach of ACHIEVEMENTS) {
        if (ach.type === 'stat' && ach.stat === stat && stats[stat] >= ach.threshold) {
            unlockAchievement(ach.id);
        }
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
export function checkCampaignAchievement(campaignOwner, totalLevels) {
    const solved = getSolvedLevels(campaignOwner);
    if (solved.length < totalLevels) return;

    const ach = ACHIEVEMENTS.find(a => a.type === 'campaign' && a.campaign === campaignOwner);
    if (ach) unlockAchievement(ach.id);
}
