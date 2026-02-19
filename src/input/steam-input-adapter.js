/**
 * SteamInputAdapter — Optional Steam Input API layer.
 *
 * When the game runs through Steam (Tauri build), window.steam is injected by
 * the Rust backend before the page runs.  This adapter wraps that bridge and:
 *
 *   1. Initialises the Steam Input API once (call init()).
 *   2. Provides poll() — call every frame to get controller states.
 *   3. Translates Steam controller-type strings to the same tokens used by
 *      controller-icons.js ('ps4', 'ps5', 'xbox', 'switch', 'deck', …).
 *   4. Provides getGlyphs(handle) — returns a map of action → Steam PNG path.
 *   5. Provides showBindingPanel(handle) — opens Steam overlay bindings.
 *
 * When Steam is not available (browser / non-Steam build) all methods are
 * no-ops and isAvailable returns false.
 *
 * Integration notes
 * -----------------
 * • The adapter does NOT replace InputManager or GamepadCursorManager —
 *   the Gamepad API continues to handle all cursor movement and button events.
 *   Steam Input is used to get reliable controller-type detection and proper
 *   Steam-provided glyphs.
 *
 * • Call init() once from main.js (after page load).
 * • If you want full Steam Input button polling (e.g. for Steam Deck native
 *   mode), call poll() every frame and feed the results into InputManager via
 *   the helper emitEvents().
 */

// Action name → standard gamepad button index (W3C Standard Gamepad mapping).
// Used when translating Steam digital actions back into button indices so the
// rest of the codebase (gamepad-cursor-manager, input-hints) keeps working.
const ACTION_TO_BUTTON_INDEX = {
    confirm:           0,
    gamepad_drag:      1,
    cancel:            2,
    end_turn:          3,
    cursor_speed_down: 4,
    cursor_speed_up:   5,
    zoom_out:          6,
    zoom_in:           7,
    menu:              9,
    move_up:           12,
    move_down:         13,
    move_left:         14,
    move_right:        15,
};

export class SteamInputAdapter {
    constructor() {
        this._initialized = false;
        this._available   = typeof window !== 'undefined' && !!window.steam?.inputInit;

        // Per-controller previous digital state for edge detection { handle → { actionName → bool } }
        this._prevState = new Map();

        // Cached glyph maps { handle → { actionName → filePath } }
        this._glyphCache = new Map();
    }

    /** True when running inside the Steam/Tauri build. */
    get isAvailable() { return this._available; }

    /** True after init() succeeds. */
    get isInitialized() { return this._initialized; }

    /**
     * Initialise the Steam Input API.
     * Must be called once after the page finishes loading.
     * Returns true on success, false if Steam is not available.
     */
    async init() {
        if (!this._available) return false;
        try {
            await window.steam.inputInit();
            this._initialized = true;
            console.log('[SteamInput] Initialized');
            return true;
        } catch (e) {
            console.warn('[SteamInput] init() failed:', e);
            return false;
        }
    }

    /**
     * Poll all connected Steam Input controllers.
     * Returns an array of controller state objects:
     *   { handle, input_type, actions: {name: bool}, analogs: {name: [x, y]} }
     *
     * When integrated with InputManager, pass the result to emitEvents().
     */
    async poll() {
        if (!this._initialized) return [];
        try {
            return await window.steam.inputPoll();
        } catch {
            return [];
        }
    }

    /**
     * Emit InputManager-compatible events from a polled controller state.
     * Pass your InputManager instance as the second argument.
     *
     * This lets you run Steam Input and Gamepad API side-by-side:
     * only call this for controllers that are NOT appearing in navigator.getGamepads().
     */
    emitEvents(controllerState, inputManager) {
        const { handle, actions, analogs } = controllerState;

        const prev = this._prevState.get(handle) ?? {};
        const next = {};

        for (const [actionName, pressed] of Object.entries(actions)) {
            next[actionName] = pressed;
            const wasPrev = prev[actionName] ?? false;
            const btnIndex = ACTION_TO_BUTTON_INDEX[actionName];

            if (pressed && !wasPrev) {
                // Button down
                inputManager.emit('gamepadButtonDown', { index: handle, button: btnIndex });

                // Semantic events (matching InputManager.processGamepadButtons)
                if (!inputManager.suspended) {
                    if (actionName === 'confirm')  inputManager.emit('confirm',  { source: 'gamepad', index: handle });
                    if (actionName === 'cancel')   inputManager.emit('cancel',   { source: 'gamepad', index: handle });
                    if (actionName === 'end_turn') inputManager.emit('endTurn',  { index: handle });
                    if (actionName === 'menu')     inputManager.emit('menu');
                    if (actionName === 'zoom_in')  inputManager.emit('zoom',     { direction: -1 });
                    if (actionName === 'zoom_out') inputManager.emit('zoom',     { direction:  1 });

                    const dirVectors = {
                        move_up:    { x:  0, y: -1 },
                        move_down:  { x:  0, y:  1 },
                        move_left:  { x: -1, y:  0 },
                        move_right: { x:  1, y:  0 },
                    };
                    if (dirVectors[actionName]) {
                        inputManager.emit('move', { ...dirVectors[actionName], index: handle });
                    }
                }
            } else if (!pressed && wasPrev) {
                // Button up
                inputManager.emit('gamepadButtonUp', { index: handle, button: btnIndex });
            }
        }

        this._prevState.set(handle, next);

        // Right stick → panAnalog
        if (!inputManager.suspended) {
            const pan = analogs?.map_pan;
            if (pan && (Math.abs(pan[0]) > 0.15 || Math.abs(pan[1]) > 0.15)) {
                inputManager.emit('panAnalog', { x: -pan[0], y: -pan[1] });
            }
        }
    }

    /**
     * Return the controller type string for a Steam Input handle.
     * Matches the tokens used by controller-icons.js:
     *   'ps4' | 'ps5' | 'xbox360' | 'xbox' | 'switch' | 'deck' | 'steam' | 'unknown'
     */
    async getControllerType(handle) {
        if (!this._initialized) return null;
        try {
            return await window.steam.inputGetControllerType(handle);
        } catch {
            return null;
        }
    }

    /**
     * Return a map of actionName → Steam PNG file path for all digital actions.
     * Paths are absolute file paths on disk (e.g. inside the Steam installation).
     * Results are cached per controller handle.
     */
    async getGlyphs(handle) {
        if (!this._initialized) return {};
        if (this._glyphCache.has(handle)) return this._glyphCache.get(handle);
        try {
            const glyphs = await window.steam.inputGetGlyphs(handle);
            this._glyphCache.set(handle, glyphs);
            return glyphs;
        } catch {
            return {};
        }
    }

    /**
     * Clear the glyph cache for a controller (e.g. after the user remaps bindings).
     */
    clearGlyphCache(handle) {
        if (handle !== undefined) {
            this._glyphCache.delete(handle);
        } else {
            this._glyphCache.clear();
        }
    }

    /**
     * Open the Steam overlay binding panel for the given controller handle.
     * Good for a "Configure controller" button in your settings screen.
     */
    async showBindingPanel(handle) {
        if (!this._initialized) return false;
        try {
            return await window.steam.inputShowBindingPanel(handle);
        } catch {
            return false;
        }
    }
}

/** Singleton — import this everywhere instead of constructing new instances. */
export const steamInput = new SteamInputAdapter();
