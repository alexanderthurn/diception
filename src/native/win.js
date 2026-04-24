/**
 * win.js — thin abstraction over Tauri and Electron window APIs.
 * The rest of the codebase imports from here instead of @tauri-apps/api directly.
 *
 * Tauri:    detected via window.__TAURI_INTERNALS__
 * Electron: detected via window.electronWin (injected by preload.js)
 * Browser:  all calls are no-ops / return sensible defaults
 */

const isTauri    = () => !!window.__TAURI_INTERNALS__;
const isElectron = () => !!window.electronWin;

// ── Window handle ─────────────────────────────────────────────────────────────

/**
 * Returns a window object with a unified API.
 * Under Tauri this wraps getCurrentWindow().
 * Under Electron this wraps ipcRenderer calls via window.electronWin.
 */
export async function getWindow() {
    if (isTauri()) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        return getCurrentWindow();
    }
    if (isElectron()) {
        return window.electronWin;
    }
    return _noopWin();
}

// ── Monitor list ──────────────────────────────────────────────────────────────

/**
 * Returns array of { name, position: {x,y}, size: {width,height} }
 */
export async function getMonitors() {
    if (isTauri()) {
        const { availableMonitors } = await import('@tauri-apps/api/window');
        return availableMonitors();
    }
    if (isElectron()) {
        return window.electronWin.getMonitors();
    }
    return [];
}

/**
 * Returns the monitor the window is currently on (same shape as getMonitors() entry).
 */
export async function getCurrentMonitor() {
    if (isTauri()) {
        const { currentMonitor } = await import('@tauri-apps/api/window');
        return currentMonitor();
    }
    if (isElectron()) {
        return window.electronWin.getCurrentMonitor();
    }
    return null;
}

// ── Physical position / size constructors ─────────────────────────────────────

export async function makePosition(x, y) {
    if (isTauri()) {
        const { PhysicalPosition } = await import('@tauri-apps/api/dpi');
        return new PhysicalPosition(x, y);
    }
    // Electron: plain object, electronWin methods accept {x, y}
    return { x, y };
}

export async function makeSize(w, h) {
    if (isTauri()) {
        const { PhysicalSize } = await import('@tauri-apps/api/dpi');
        return new PhysicalSize(w, h);
    }
    return { width: w, height: h };
}

// ── No-op fallback (plain browser) ────────────────────────────────────────────

function _noopWin() {
    const noop = async () => {};
    return {
        close:           noop,
        setFullscreen:   noop,
        isFullscreen:    async () => false,
        setDecorations:  noop,
        unmaximize:      noop,
        setPosition:     noop,
        setSize:         noop,
        outerPosition:   async () => ({ x: 0, y: 0 }),
        outerSize:       async () => ({ width: 800, height: 600 }),
        onMoved:         noop,
        onResized:       noop,
    };
}
