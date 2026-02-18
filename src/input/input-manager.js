import { isDesktopContext } from '../scenarios/user-identity.js';
import { loadBindings } from './key-bindings.js';

/**
 * InputManager - Unified input handling for keyboard and gamepad.
 * Emits semantic game events that InputController consumes.
 *
 * Uses configurable key bindings loaded from key-bindings.js.
 * Designed to be swappable: a SteamInput adapter would implement the same
 * emit() interface and bypass this binding system entirely.
 */
export class InputManager {
    constructor() {
        this.listeners = {};

        // Gamepad state
        this.gamepadStates = new Map();
        this.connectedGamepadIndices = new Set();
        this.gamepadToHumanMap = new Map(); // raw gamepad index -> human player index (0, 1, 2, ...)
        this.deadZone = 0.4;

        // Desktop version (Steam/Tauri) often has higher polling rates or different timing
        const isDesktop = isDesktopContext();
        this.repeatDelay = isDesktop ? 300 : 250;  // ms before repeat starts
        this.repeatRate  = isDesktop ? 160 : 120;  // ms between repeats

        // Key repeat state
        this.heldDirections = new Map(); // code -> { direction, lastFire, started }
        this.heldKeys = new Set();

        // Pan state for continuous panning (emitted every frame in update() while non-zero)
        this.panState = { x: 0, y: 0 }; // -1, 0, or 1 for each axis

        // Input suspension (e.g. during key-binding wizard)
        this.suspended = false;

        // Track animation frame and bound handlers for cleanup
        this.animationFrameId = null;
        this.boundKeyDown = (e) => this.onKeyDown(e);
        this.boundKeyUp   = (e) => this.onKeyUp(e);
        this.disposed = false;

        // Load bindings and build lookup maps
        this.bindings = loadBindings();
        this._buildMaps();

        // Bind keyboard events
        this.setupKeyboard();

        // Start gamepad polling
        this.pollGamepads();
    }

    /** Build fast lookup maps from current bindings. */
    _buildMaps() {
        const kb = this.bindings.keyboard;
        const gp = this.bindings.gamepad;

        // Keyboard: code -> action
        this._keyActionMap = {};
        for (const [action, codes] of Object.entries(kb)) {
            for (const code of codes) {
                this._keyActionMap[code] = action;
            }
        }

        // Gamepad: button index -> action
        this._gpButtonActionMap = {};
        for (const [action, buttons] of Object.entries(gp)) {
            for (const btn of buttons) {
                this._gpButtonActionMap[btn] = action;
            }
        }

        // Direction actions -> vector
        this._directionVectors = {
            move_up:    { x:  0, y: -1 },
            move_down:  { x:  0, y:  1 },
            move_left:  { x: -1, y:  0 },
            move_right: { x:  1, y:  0 },
        };

        // Pan actions -> vector
        this._panVectors = {
            pan_up:    { x:  0, y: -1 },
            pan_down:  { x:  0, y:  1 },
            pan_left:  { x: -1, y:  0 },
            pan_right: { x:  1, y:  0 },
        };

        // Zoom actions -> direction (-1 = in, +1 = out)
        this._zoomDirections = {
            zoom_in:  -1,
            zoom_out:  1,
        };

        // Set of all key codes that should have default browser behaviour suppressed
        this._gameKeyCodes = new Set(Object.keys(this._keyActionMap));
    }

    /**
     * Reload bindings from localStorage and rebuild lookup maps.
     * Call after saving new bindings so they take effect immediately.
     */
    reloadBindings() {
        this.bindings = loadBindings();
        this._buildMaps();
        // Clear held state so stale keys don't fire with old bindings
        this.heldDirections.clear();
        this.heldKeys.clear();
        this.panState = { x: 0, y: 0 };
        this.emit('bindingsReloaded');
    }

    /**
     * Suspend or resume input event emission.
     * While suspended, keyboard and gamepad events are ignored.
     * Used by the key-binding wizard to prevent input leaking into the game.
     */
    setSuspended(value) {
        this.suspended = value;
        if (value) {
            this.heldDirections.clear();
            this.heldKeys.clear();
            this.panState = { x: 0, y: 0 };
        }
    }

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }

    /**
     * Map raw gamepad index (from navigator.getGamepads()) to sequential human index (0, 1, 2, ...).
     * Ensures first connected gamepad = Human 0, second = Human 1, etc., regardless of raw indices.
     */
    getHumanIndex(rawGamepadIndex) {
        const mapped = this.gamepadToHumanMap.get(rawGamepadIndex);
        return mapped !== undefined ? mapped : rawGamepadIndex;
    }

    setupKeyboard() {
        document.addEventListener('keydown', this.boundKeyDown);
        document.addEventListener('keyup', this.boundKeyUp);
    }

    onKeyDown(e) {
        // Ignore if typing in an input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const code = e.code.toLowerCase();

        // Prevent default for mapped game keys
        if (this._gameKeyCodes.has(code)) {
            e.preventDefault();
        }

        if (this.suspended) return;

        // Track held keys for repeat
        if (this.heldKeys.has(code)) return; // Already held
        this.heldKeys.add(code);

        const action = this._keyActionMap[code];
        if (!action) return;

        const dirVec = this._directionVectors[action];
        if (dirVec) {
            this.emit('move', { ...dirVec, index: -1 });
            this.heldDirections.set(code, {
                direction: dirVec,
                started: Date.now(),
                lastFire: Date.now(),
            });
            return;
        }

        const panVec = this._panVectors[action];
        if (panVec) {
            this.updatePanState(panVec.x, panVec.y, true);
            return;
        }

        if (action === 'confirm')  this.emit('confirm', { source: 'keyboard' });
        if (action === 'cancel')   this.emit('cancel',  { source: 'keyboard' });
        if (action === 'end_turn') this.emit('endTurn');
        if (action === 'menu')     this.emit('menu');

        const zoomDir = this._zoomDirections[action];
        if (zoomDir !== undefined) this.emit('zoom', { direction: zoomDir });
    }

    onKeyUp(e) {
        const code = e.code.toLowerCase();
        this.heldKeys.delete(code);
        this.heldDirections.delete(code);

        if (this.suspended) return;

        const action = this._keyActionMap[code];
        if (!action) return;

        const panVec = this._panVectors[action];
        if (panVec) {
            this.updatePanState(panVec.x, panVec.y, false);
        }
    }

    updatePanState(dx, dy, pressed) {
        if (dx !== 0) {
            this.panState.x = pressed ? dx : 0;
        }
        if (dy !== 0) {
            this.panState.y = pressed ? dy : 0;
        }
        // Pan is emitted continuously in update() while panState is non-zero.
        // Emit once immediately on key-up so the renderer knows to stop.
        if (!pressed) {
            this.emit('pan', { ...this.panState });
        }
    }

    // Call this from requestAnimationFrame loop
    update() {
        if (!this.suspended) {
            const now = Date.now();

            // Handle keyboard repeat
            for (const [, state] of this.heldDirections) {
                const elapsed   = now - state.started;
                const sinceLast = now - state.lastFire;

                if (elapsed > this.repeatDelay && sinceLast > this.repeatRate) {
                    this.emit('move', { ...state.direction, index: -1 });
                    state.lastFire = now;
                }
            }

            // Continuous pan while pan keys are held
            if (this.panState.x !== 0 || this.panState.y !== 0) {
                this.emit('pan', { ...this.panState });
            }
        }

        // Always poll gamepads so GamepadCursorManager receives button events
        // even during suspension (allows clicking Skip/Cancel via the cursor).
        // processGamepadButtons guards semantic events with !this.suspended internally.
        this.processGamepads();
    }

    pollGamepads() {
        const poll = () => {
            if (this.disposed) return;
            this.update();
            this.animationFrameId = requestAnimationFrame(poll);
        };
        this.animationFrameId = requestAnimationFrame(poll);
    }

    /**
     * Clean up all event listeners and stop polling loops.
     */
    dispose() {
        this.disposed = true;

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        document.removeEventListener('keydown', this.boundKeyDown);
        document.removeEventListener('keyup', this.boundKeyUp);

        this.listeners = {};
        this.gamepadStates.clear();
        this.gamepadToHumanMap.clear();
        this.heldDirections.clear();
        this.heldKeys.clear();
        this.panState = { x: 0, y: 0 };
    }

    processGamepads() {
        const gamepads = navigator.getGamepads();
        const currentIndices = new Set();

        for (const gp of gamepads) {
            if (!gp) continue;
            currentIndices.add(gp.index);

            const prevState = this.gamepadStates.get(gp.index) || {
                buttons: new Array(gp.buttons.length).fill(false),
                axes: [0, 0, 0, 0],
                moveRepeat: { active: false, dir: null, started: 0, lastFire: 0 }
            };

            this.processGamepadButtons(gp, prevState);
            this.processGamepadMovement(gp, prevState);
            this.processGamepadPan(gp);

            this.gamepadStates.set(gp.index, {
                buttons: gp.buttons.map(b => b.pressed),
                axes: [...gp.axes],
                moveRepeat: prevState.moveRepeat
            });
        }

        // Check for changes in connected gamepads
        let changed = false;
        if (currentIndices.size !== this.connectedGamepadIndices.size) {
            changed = true;
        } else {
            for (const idx of currentIndices) {
                if (!this.connectedGamepadIndices.has(idx)) {
                    changed = true;
                    break;
                }
            }
        }

        if (changed) {
            this.connectedGamepadIndices = currentIndices;
            this.gamepadToHumanMap.clear();
            const sorted = Array.from(currentIndices).sort((a, b) => a - b);
            sorted.forEach((rawIdx, humanIdx) => {
                this.gamepadToHumanMap.set(rawIdx, humanIdx);
            });
            this.emit('gamepadChange', Array.from(this.connectedGamepadIndices));
        }
    }

    processGamepadButtons(gp, prevState) {
        for (let i = 0; i < gp.buttons.length; i++) {
            const pressed    = gp.buttons[i].pressed;
            const wasPressed = prevState.buttons[i];

            if (pressed && !wasPressed) {
                this.emit('gamepadButtonDown', { index: gp.index, button: i });

                if (!this.suspended) {
                    const action = this._gpButtonActionMap[i];
                    if (action === 'confirm')  this.emit('confirm', { source: 'gamepad', index: gp.index });
                    if (action === 'cancel')   this.emit('cancel',  { source: 'gamepad', index: gp.index });
                    if (action === 'end_turn') this.emit('endTurn', { index: gp.index });
                    if (action === 'menu')     this.emit('menu');
                    // move_up/down/left/right handled by processGamepadMovement
                    const zoomDir = this._zoomDirections[action];
                    if (zoomDir !== undefined) this.emit('zoom', { direction: zoomDir });
                }
            } else if (!pressed && wasPressed) {
                this.emit('gamepadButtonUp', { index: gp.index, button: i });
            }
        }
    }

    processGamepadMovement(gp, prevState) {
        if (this.suspended) return;

        // Build D-pad direction map from current gamepad bindings
        const kb = this.bindings.gamepad;
        const dpMap = {};
        for (const [action, buttons] of Object.entries(kb)) {
            const vec = this._directionVectors[action];
            if (!vec) continue;
            for (const btn of buttons) {
                dpMap[btn] = vec;
            }
        }

        const now    = Date.now();
        const repeat = prevState.moveRepeat;
        let activeDir = null;

        for (const [btnIdx, dir] of Object.entries(dpMap)) {
            const i = parseInt(btnIdx);
            const pressed    = gp.buttons[i]?.pressed;
            const wasPressed = prevState.buttons[i];

            if (pressed && !wasPressed) {
                this.emit('move', { ...dir, index: gp.index });
                repeat.active  = true;
                repeat.dir     = dir;
                repeat.started = now;
                repeat.lastFire = now;
                activeDir = dir;
            } else if (pressed) {
                activeDir = dir;
            }
        }

        // Handle repeat
        if (activeDir && repeat.active) {
            const elapsed   = now - repeat.started;
            const sinceLast = now - repeat.lastFire;

            if (elapsed > this.repeatDelay && sinceLast > this.repeatRate) {
                this.emit('move', { ...activeDir, index: gp.index });
                repeat.lastFire = now;
            }
        } else {
            repeat.active = false;
            repeat.dir    = null;
        }
    }

    processGamepadPan(gp) {
        if (this.suspended) return;

        // Right stick: axes 2 (X), 3 (Y)
        let rx = gp.axes[2] ?? 0;
        let ry = gp.axes[3] ?? 0;

        if (Math.abs(rx) < this.deadZone) rx = 0;
        if (Math.abs(ry) < this.deadZone) ry = 0;

        rx = -rx;
        ry = -ry;

        if (rx !== 0 || ry !== 0) {
            this.emit('panAnalog', { x: rx, y: ry });
        }
    }

    // Trigger haptic feedback (disabled)
    vibrate(type = 'light') {
        // Rumble removed as per user request
    }
}
