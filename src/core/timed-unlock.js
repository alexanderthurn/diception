const KEY = 'dicy_timed_unlock_expiry';
export const TIMED_UNLOCK_MINUTES = 60;

export function setTimedUnlock(minutes = TIMED_UNLOCK_MINUTES) {
    localStorage.setItem(KEY, String(Date.now() + minutes * 60 * 1000));
}

export function isTimedUnlockActive() {
    const expiry = localStorage.getItem(KEY);
    if (!expiry) return false;
    if (Date.now() < Number(expiry)) return true;
    localStorage.removeItem(KEY);
    return false;
}

export function getTimedUnlockRemainingMs() {
    const expiry = localStorage.getItem(KEY);
    if (!expiry) return 0;
    return Math.max(0, Number(expiry) - Date.now());
}

export function clearTimedUnlock() {
    localStorage.removeItem(KEY);
}
