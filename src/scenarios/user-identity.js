import { isTimedUnlockActive } from '../core/timed-unlock.js';

/**
 * User Identity - ownerId, ownerIdType, owner
 * Used for campaign ownership and backend auth.
 */

const STORAGE_KEY = 'dicy_userIdentity';
const WEB_ID_KEY = 'dicy_webUserId';

/**
 * Hash a string with SHA256, return hex
 * @param {string} str
 * @returns {Promise<string>} 64-char hex
 */
async function sha256Hex(str) {
    if (!crypto.subtle) {
        // Fallback for non-secure contexts (HTTP) where crypto.subtle is unavailable
        let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
        for (let i = 0, ch; i < str.length; i++) {
            ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate short random id for display (e.g. "Player_a3f2")
 */
function randomShortId() {
    return 'Player_' + Math.random().toString(36).slice(2, 6);
}

/**
 * Get or create web user ID (for non-Steam users)
 * @returns {string}
 */
function getOrCreateWebId() {
    let id = localStorage.getItem(WEB_ID_KEY);
    if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() : 'web_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(WEB_ID_KEY, id);
    }
    return id;
}

/**
 * Get current user identity
 * @returns {Promise<{ownerId: string, ownerIdType: string, owner: string}>}
 */
export async function getUserIdentity() {
    // Steam (Electron/Tauri)
    if (window.steam?.getSteamId) {
        try {
            const steamId = await window.steam.getSteamId();
            if (steamId) {
                const ownerId = await sha256Hex(String(steamId));
                const owner = await window.steam.getUserName();
                return {
                    ownerId,
                    ownerIdType: 'steam',
                    owner: owner || 'Steam Player'
                };
            }
        } catch (e) {
            console.warn('Steam identity failed, falling back to web:', e);
        }
    }

    // Web or Android fallback
    const webId = getOrCreateWebId();
    const ownerId = await sha256Hex(webId);
    let owner = localStorage.getItem('dicy_displayName');
    if (!owner) {
        owner = randomShortId();
        localStorage.setItem('dicy_displayName', owner);
    }

    if (isAndroid()) {
        return {
            ownerId,
            ownerIdType: 'android',
            owner
        };
    }

    return {
        ownerId,
        ownerIdType: 'web',
        owner
    };
}

/**
 * Check if we're in Steam context
 */
export function isSteamContext() {
    return !!(window.steam?.getSteamId);
}

/**
 * Check if we're on Android.
 * Add ?android=true to the URL to simulate Android in a browser (persists via localStorage).
 * Add ?android=false to clear the simulation.
 */
export function isAndroid() {
    const param = new URLSearchParams(window.location.search).get('android');
    if (param === 'true')  { localStorage.setItem('dicy_sim_android', '1'); return true; }
    if (param === 'false') { localStorage.removeItem('dicy_sim_android'); return false; }
    if (localStorage.getItem('dicy_sim_android')) return true;
    return /Android/i.test(navigator.userAgent);
}

/**
 * Check if we're on iOS (iPhone, iPad, iPod)
 * Includes detection for iPad Pro which reports as Macintosh
 */
export function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Check if we're on a mobile device (Android or iOS)
 */
export function isMobile() {
    return isAndroid() || isIOS();
}

/**
 * Check if we're in Tauri context
 */
export function isTauriContext() {
    return !!(window.__TAURI_INTERNALS__);
}

export function isElectronContext() {
    return !!(window.electronWin);
}

/**
 * Check if we're in any desktop or app context (Tauri, Electron, Steam, or Android)
 */
export function isDesktopContext() {
    return isTauriContext() || isElectronContext() || isSteamContext() || isAndroid();
}

const FULL_GAME_APP_ID = 4429000;

let _resolvedFull = null; // null = not yet determined

/**
 * Must be awaited once at startup (in init()) before isFullVersion() is called.
 * Resolves the Steam app ID and caches the result.
 */
export async function initFullVersionCheck() {
    const param = new URLSearchParams(window.location.search).get('full');
    if (param === 'true')  { _resolvedFull = true;  return; }
    if (param === 'false') { _resolvedFull = false; return; }
    if (!isSteamContext()) { _resolvedFull = false; return; }
    try {
        const id = await window.steam.getAppId();
        _resolvedFull = (id === FULL_GAME_APP_ID);
    } catch {
        _resolvedFull = false;
    }
}

/**
 * Whether this is the full (paid) version of the game.
 * Requires initFullVersionCheck() to have been awaited first.
 */
export function isFullVersion() {
    if (_resolvedFull === true) return true;
    return isTimedUnlockActive();
}

/**
 * Activate full version in-memory (e.g. after successful IAP).
 */
export function activateFullVersion() {
    _resolvedFull = true;
}

/**
 * Cache identity in memory to avoid repeated async calls
 */
let _cachedIdentity = null;

/**
 * Get cached identity or fetch fresh
 */
export async function getCachedIdentity() {
    if (_cachedIdentity) return _cachedIdentity;
    _cachedIdentity = await getUserIdentity();
    return _cachedIdentity;
}

/**
 * Clear cache (e.g. after logout)
 */
export function clearIdentityCache() {
    _cachedIdentity = null;
}
