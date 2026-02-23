/**
 * Storage wrapper — sync-compatible, platform-aware.
 *
 * On Tauri/Steam  : localStorage is the runtime cache.
 *                   On startup, `initStorage()` seeds localStorage from
 *                   `diception_save.json` (Steam Cloud syncs that file).
 *                   Every write schedules a flush back to disk.
 * On Web/Android  : pure localStorage, initStorage() is a no-op.
 *
 * All existing code that calls localStorage.getItem/setItem/removeItem
 * continues to work unchanged — this module only needs to be imported
 * once (in main.js) to wire up the flush mechanism.
 */

import { isTauriContext } from '../scenarios/user-identity.js';

/** Filename written into the Tauri app-data directory and synced by Steam Cloud. */
export const SAVE_FILENAME = 'diception_save.sav';

const FLUSH_DELAY_MS = 1000;    // debounce writes
const FLUSH_INTERVAL_MS = 10000; // periodic safety flush

let _flushTimer = null;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call once at app startup (before any localStorage reads) when running on Tauri.
 * Reads `diception_save.json` from disk and merges its contents into localStorage
 * so that Steam Cloud data takes precedence over stale local WebView storage.
 */
export async function initStorage() {
    if (!isTauriContext()) return;

    try {
        const json = await window.__TAURI_INTERNALS__.invoke('storage_read_all');
        const data = JSON.parse(json || '{}');
        // File keys override localStorage keys (cloud data wins)
        for (const [key, value] of Object.entries(data)) {
            localStorage.setItem(key, value);
        }
        console.log('[storage] Loaded from', SAVE_FILENAME);
    } catch (e) {
        console.warn('[storage] Could not load save file, using localStorage as-is:', e);
    }

    // Intercept all future localStorage mutations so every write triggers a flush
    _patchLocalStorage();

    // Safety net: flush periodically even if patch misses something
    setInterval(_flush, FLUSH_INTERVAL_MS);

    // Flush on close/reload
    window.addEventListener('beforeunload', () => {
        _cancelScheduled();
        _flushSync(); // best-effort synchronous write on unload
    });
}

/**
 * Force an immediate async flush to disk.
 * Call before intentional app exits if you want guaranteed durability.
 */
export async function flushStorage() {
    _cancelScheduled();
    await _flush();
}

// ─── Internals ────────────────────────────────────────────────────────────────

function _scheduleFlush() {
    if (!isTauriContext()) return;
    if (_flushTimer) clearTimeout(_flushTimer);
    _flushTimer = setTimeout(_flush, FLUSH_DELAY_MS);
}

function _cancelScheduled() {
    if (_flushTimer) {
        clearTimeout(_flushTimer);
        _flushTimer = null;
    }
}

async function _flush() {
    _flushTimer = null;
    if (!isTauriContext()) return;
    try {
        const data = _snapshotLocalStorage();
        await window.__TAURI_INTERNALS__.invoke('storage_write_all', {
            data: JSON.stringify(data),
        });
    } catch (e) {
        console.warn('[storage] Flush failed:', e);
    }
}

/** Best-effort synchronous flush used in beforeunload (fire-and-forget). */
function _flushSync() {
    if (!isTauriContext()) return;
    const data = _snapshotLocalStorage();
    // invoke() returns a Promise — we kick it off without awaiting
    window.__TAURI_INTERNALS__
        .invoke('storage_write_all', { data: JSON.stringify(data) })
        .catch(() => {});
}

function _snapshotLocalStorage() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        data[key] = localStorage.getItem(key);
    }
    return data;
}

let _patched = false;

/**
 * Wrap the three mutating localStorage methods so every change triggers a flush.
 * We patch the prototype once; all calls (even from existing code) go through.
 */
function _patchLocalStorage() {
    if (_patched || !isTauriContext()) return;
    _patched = true;

    const proto = Object.getPrototypeOf(localStorage);

    const _setItem = proto.setItem.bind(localStorage);
    proto.setItem = function(key, value) {
        _setItem(key, value);
        _scheduleFlush();
    };

    const _removeItem = proto.removeItem.bind(localStorage);
    proto.removeItem = function(key) {
        _removeItem(key);
        _scheduleFlush();
    };

    const _clear = proto.clear.bind(localStorage);
    proto.clear = function() {
        _clear();
        _scheduleFlush();
    };
}
