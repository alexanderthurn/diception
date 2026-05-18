/**
 * Steam-backed lifetime counters only — no game rules.
 * HighscoreManager owns persistence; this module handles ISteamUserStats I/O.
 */

import { ACHIEVEMENTS } from './achievements.js';
import { clampLifetimeStat } from './lifetime-stat-cap.js';

/** local lifetime field → Steam stat API name */
export const STEAM_STAT_NAMES = {
    gamesPlayed:  'STAT_GAMES_PLAYED',
    gamesWon:     'STAT_GAMES_WON',
    underdogWins: 'STAT_UNDERDOG_WINS',
    streak3:      'STAT_STREAK_3',
    streak4:      'STAT_STREAK_4',
    streak5:      'STAT_STREAK_5',
    streak6:      'STAT_STREAK_6',
    streak7:      'STAT_STREAK_7',
};

export function pushLifetimeStatToSteam(stat, value) {
    const steamName = STEAM_STAT_NAMES[stat];
    if (steamName && window.steam?.setStat) {
        window.steam.setStat(steamName, clampLifetimeStat(value));
    }
}

/**
 * max(local, Steam) per counter on the manager, persist, push if local was ahead.
 * @param {import('../ui/highscore-manager.js').HighscoreManager} highscoreManager
 */
export async function reconcileLifetimeWithSteam(highscoreManager) {
    if (!window.steam?.getStatI32 || !window.steam?.setStat) return;

    for (const [localKey, steamName] of Object.entries(STEAM_STAT_NAMES)) {
        let steamVal = 0;
        try {
            steamVal = await window.steam.getStatI32(steamName);
        } catch {
            steamVal = 0;
        }
        const localVal = highscoreManager.getLifetimeStat(localKey);
        const merged = clampLifetimeStat(Math.max(steamVal, localVal));

        if (merged !== localVal) {
            highscoreManager.setLifetimeStatMerged(localKey, merged);
            console.log(`[stats] Merged ${localKey}: local ${localVal}, Steam ${steamVal} → ${merged}`);
        }
        if (merged !== steamVal) {
            try {
                await window.steam.setStat(steamName, merged);
                console.log(`[stats] Pushed ${localKey} to Steam: ${steamVal} → ${merged}`);
            } catch (e) {
                console.warn(`[stats] Failed to push ${localKey} to Steam:`, e);
            }
        }
    }
}

export async function resetSteamStatsOrFallback(achievementsToo) {
    if (typeof window.steam?.resetAllStats === 'function') {
        try {
            const result = await window.steam.resetAllStats(achievementsToo);
            if (result !== false) return;
        } catch (e) {
            console.warn('[stats] resetAllStats failed, using per-stat fallback:', e);
        }
    }
    if (!window.steam?.setStat) return;
    await Promise.all(
        Object.values(STEAM_STAT_NAMES).map((name) =>
            window.steam.setStat(name, 0).catch(() => {})
        )
    );
    if (achievementsToo && window.steam?.clearAchievement) {
        await Promise.all(
            ACHIEVEMENTS.map((a) => window.steam.clearAchievement(a.id).catch(() => {}))
        );
    }
}
