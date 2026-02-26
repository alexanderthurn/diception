/**
 * input-mode.js
 * Shared helper for resolving the active controller input mode.
 *
 * Modes:
 *   'auto'    – use Steam Input when window.steam is present, else browser
 *   'browser' – always use navigator.getGamepads()
 *   'steam'   – always use Steam Input (only valid in the Steam/Tauri build)
 *
 * The *resolved* mode is always either 'steam' or 'browser' (never 'auto').
 */

const STORAGE_KEY = 'dicy_inputMode';

/** Return the stored raw mode string ('auto' | 'browser' | 'steam'). */
export function getStoredInputMode() {
    return localStorage.getItem(STORAGE_KEY) || 'auto';
}

/** Persist a mode choice. */
export function setStoredInputMode(mode) {
    localStorage.setItem(STORAGE_KEY, mode);
}

/**
 * Resolve the effective input mode.
 * @returns {'steam'|'browser'}
 */
export function resolveInputMode() {
    const mode = getStoredInputMode();
    if (mode === 'steam')   return 'steam';
    if (mode === 'browser') return 'browser';
    // auto: use Steam when the Tauri Steam bridge is present
    return (typeof window !== 'undefined' && !!window.steam) ? 'steam' : 'browser';
}
