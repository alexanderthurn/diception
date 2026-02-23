/**
 * Storage wrapper — sync-compatible, platform-aware.
 *
 * On Tauri/Steam  : localStorage is the runtime cache.
 *                   On startup, `initStorage()` seeds localStorage from
 *                   `diception_save.sav` (Steam Cloud syncs that file).
 *                   Every localStorage write schedules a debounced flush (100 ms).
 *                   Call `flushStorage()` before any reload() or quit().
 * On Web/Android  : pure localStorage, both functions are no-ops.
 */

import { isTauriContext } from '../scenarios/user-identity.js';

export const SAVE_FILENAME = 'diception_save.sav';

const DEBOUNCE_MS = 100; // flush shortly after each write

let _debounceTimer = null;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call once at the very start of init() — before any localStorage reads.
 * Merges the on-disk save into localStorage (Steam Cloud data wins).
 */
export async function initStorage() {
    if (!isTauriContext()) {
        console.log('[storage] Web/Android — localStorage only');
        return;
    }

    console.log('[storage] Tauri — file-backed storage initialising');

    try {
        const json = await window.__TAURI_INTERNALS__.invoke('storage_read_all');
        const data = JSON.parse(json || '{}');
        for (const [key, value] of Object.entries(data)) {
            localStorage.setItem(key, value);
        }
        console.log(`[storage] Loaded ${Object.keys(data).length} keys from ${SAVE_FILENAME}`);
    } catch (e) {
        console.error('[storage] storage_read_all failed — Rust not recompiled?', e);
    }

    // Log the exact save path so Steam Cloud config can be verified
    try {
        const path = await window.__TAURI_INTERNALS__.invoke('storage_get_path');
        console.log('[storage] Save path:', path);
    } catch (_) { /* optional helper command */ }

    // Patch localStorage so every write triggers a debounced flush automatically.
    // This covers all existing code without requiring any call-site changes.
    _patchLocalStorage();

    window.addEventListener('beforeunload', () => {
        // Fire-and-forget — best effort if process hasn't been killed yet
        _invokeWrite().catch(() => {});
    });
}

/**
 * Await this before window.location.reload() or steam.quit() / app close.
 * Ensures the save file is written before the process exits.
 */
export async function flushStorage() {
    if (!isTauriContext()) return;
    if (_debounceTimer) {
        clearTimeout(_debounceTimer);
        _debounceTimer = null;
    }
    await _flush();
}

// ─── Internals ────────────────────────────────────────────────────────────────

function _scheduleFlush() {
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(_flush, DEBOUNCE_MS);
}

async function _flush() {
    _debounceTimer = null;
    if (!isTauriContext()) return;
    try {
        await _invokeWrite();
    } catch (e) {
        console.error('[storage] Flush failed:', e);
    }
}

function _invokeWrite() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        data[key] = localStorage.getItem(key);
    }
    return window.__TAURI_INTERNALS__.invoke('storage_write_all', {
        data: JSON.stringify(data),
    });
}

let _patched = false;

function _patchLocalStorage() {
    if (_patched) return;
    _patched = true;

    const proto = Object.getPrototypeOf(localStorage); // Storage.prototype

    const orig_setItem    = proto.setItem;
    const orig_removeItem = proto.removeItem;
    const orig_clear      = proto.clear;

    proto.setItem = function(key, value) {
        orig_setItem.call(this, key, value);
        _scheduleFlush();
    };
    proto.removeItem = function(key) {
        orig_removeItem.call(this, key);
        _scheduleFlush();
    };
    proto.clear = function() {
        orig_clear.call(this);
        _scheduleFlush();
    };
}
