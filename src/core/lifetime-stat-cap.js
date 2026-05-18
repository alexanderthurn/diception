import { LIFETIME_STAT_MAX } from './achievements.js';

/** Clamp lifetime stat values to Steam / in-game max (0 … LIFETIME_STAT_MAX). */
export function clampLifetimeStat(value) {
    const n = Math.floor(Number(value) || 0);
    if (n < 0) return 0;
    if (n > LIFETIME_STAT_MAX) return LIFETIME_STAT_MAX;
    return n;
}
