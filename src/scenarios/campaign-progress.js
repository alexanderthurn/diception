/**
 * Campaign progress - which levels a user has solved
 * Stored in localStorage as { campaignOwner: [index, ...] }
 */

const STORAGE_KEY = 'dicy_campaignProgress';

export function getSolvedLevels(campaignOwner) {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const data = JSON.parse(raw);
        const arr = data[campaignOwner];
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

export function markLevelSolved(campaignOwner, levelIndex) {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const data = raw ? JSON.parse(raw) : {};
        let arr = data[campaignOwner];
        if (!Array.isArray(arr)) arr = [];
        if (!arr.includes(levelIndex)) {
            arr = [...arr, levelIndex].sort((a, b) => a - b);
            data[campaignOwner] = arr;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
    } catch (e) {
        console.warn('Failed to save campaign progress:', e);
    }
}

export function isLevelSolved(campaignOwner, levelIndex) {
    return getSolvedLevels(campaignOwner).includes(levelIndex);
}
