import { isDesktopContext } from '../scenarios/user-identity.js';
import { loadBindings } from './key-bindings.js';
import { FWNetwork } from '../fwnetwork/fwnetwork.js';

/**
 * InputManager - Unified input handling for keyboard and gamepad.
 * Emits semantic game events that InputController consumes.
 *
 * Uses configurable key bindings loaded from key-bindings.js.
 * Supports two gamepad backends: navigator.getGamepads() and FW-Network phone controllers.
 */
export class InputManager {
    constructor() {
        this.listeners = {};

        // Gamepad state
        this.gamepadStates = new Map();
        this.connectedGamepadIndices = new Set();
        this.gamepadToHumanMap = new Map(); // raw gamepad index -> human player index (0, 1, 2, ...)
        this.gamepadAssignments = new Map(); // raw index -> 'master' | playerIndex (session-only, not persisted)
        this.deadZone = 0.4;

        // Desktop version (Steam/Tauri) often has higher polling rates or different timing
        const isDesktop = isDesktopContext();
        this.repeatDelay = isDesktop ? 300 : 250;  // ms before repeat starts
        this.repeatRate = isDesktop ? 160 : 120;  // ms between repeats

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
        this.boundKeyUp = (e) => this.onKeyUp(e);
        this.disposed = false;

        // Load bindings and build lookup maps
        this.bindings = loadBindings();
        this._buildMaps();

        // Gamepad backend: 'navigator' | 'fwnetwork'
        const saved = localStorage.getItem('dicy_gamepad_backend') || 'navigator';
        this._backend = (saved === 'navigator' || saved === 'fwnetwork') ? saved : 'navigator';
        // Start FWNetwork hosting if the resolved backend uses it
        if (this._useFwNetwork) {
            FWNetwork.getInstance().hostRoom();
        }

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
            move_up: { x: 0, y: -1 },
            move_down: { x: 0, y: 1 },
            move_left: { x: -1, y: 0 },
            move_right: { x: 1, y: 0 },
        };

        // Pan actions -> vector
        this._panVectors = {
            pan_up: { x: 0, y: -1 },
            pan_down: { x: 0, y: 1 },
            pan_left: { x: -1, y: 0 },
            pan_right: { x: 1, y: 0 },
        };

        // Zoom actions -> direction (-1 = in, +1 = out)
        this._zoomDirections = {
            zoom_in: -1,
            zoom_out: 1,
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

    get _useFwNetwork() {
        return this._backend === 'fwnetwork';
    }

    /**
     * Switch gamepad backend at runtime.
     * @param {'navigator'|'fwnetwork'} mode
     */
    setBackend(mode) {
        this._backend = mode;
        localStorage.setItem('dicy_gamepad_backend', mode);
        if (this._useFwNetwork) {
            FWNetwork.getInstance().hostRoom();
        }
        // Reset gamepad state so stale data doesn't linger
        this.gamepadStates.clear();
        this.connectedGamepadIndices = new Set();
        this.gamepadToHumanMap.clear();
        this.emit('gamepadChange', []);
    }

    /** Return the current backend mode string. */
    get backend() { return this._backend; }

    /**
     * Return a normalised array of connected gamepads from the active backend.
     * Each entry has: { index, id, buttons: [{pressed}], axes: number[] }
     */
    getGamepads() {
        if (this._backend === 'fwnetwork') {
            // Filter out null local slots wrapped as disconnected FWNetworkGamepad
            return FWNetwork.getInstance().getAllGamepads().filter(g => g?.connected);
        }
        // Standard W3C
        return Array.from(navigator.getGamepads()).filter(Boolean);
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

    // ── Gamepad assignment (which human player a gamepad controls) ────────────

    /**
     * Get assignment for a gamepad: 'master' or a human player index.
     * Defaults to sequential auto-map (existing behavior) if not explicitly set.
     */
    getGamepadAssignment(rawIndex) {
        if (this.gamepadAssignments.has(rawIndex)) {
            return this.gamepadAssignments.get(rawIndex);
        }
        return this.getHumanIndex(rawIndex);
    }

    setGamepadAssignment(rawIndex, assignment) {
        this.gamepadAssignments.set(rawIndex, assignment);
        this.emit('gamepadAssignmentChange', { index: rawIndex, assignment });
    }

    /**
     * Returns true if this gamepad may control the given player.
     * Master gamepads (and keyboard/mouse, index = -1) can control any player.
     */
    canGamepadControlPlayer(rawIndex, playerId) {
        if (rawIndex < 0) return true; // keyboard/mouse = always master
        const assignment = this.getGamepadAssignment(rawIndex);
        return assignment === 'master' || assignment === playerId;
    }

    // ── Gamepad master mode ───────────────────────────────────────────────────

    /**
     * Returns the raw index of the primary gamepad (first one to activate).
     * This gamepad controls the UI regardless of player assignment.
     * If it disconnects, the next earliest activation takes over.
     */
    getPrimaryMasterIndex() {
        const activated = this.gamepadCursorManager?.activatedGamepads;
        if (!activated || activated.size === 0) return -1;
        return activated.values().next().value;
    }

    /**
     * Returns true if this gamepad is allowed to perform global actions
     * (zoom, pan, open menu, drag map).
     * Strict mode: only the single primary master gamepad can perform global actions.
     */
    isGamepadAllowedGlobalAction(rawIndex) {
        return rawIndex === this.getPrimaryMasterIndex();
    }

    setupKeyboard() {
        document.addEventListener('keydown', this.boundKeyDown);
        document.addEventListener('keyup', this.boundKeyUp);

        // Clear all held keys when window loses focus (e.g. devtools opens,
        // Alt-Tab, etc.) to prevent stuck movement.
        this._boundBlur = () => {
            this.heldDirections.clear();
            this.heldKeys.clear();
            this.panState = { x: 0, y: 0 };
        };
        window.addEventListener('blur', this._boundBlur);
    }

    onKeyDown(e) {
        // Ignore if typing in an input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Ignore when Cmd/Ctrl/Alt are held — those are browser shortcuts
        if (e.metaKey || e.ctrlKey || e.altKey) return;

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

        if (action === 'confirm') this.emit('confirm', { source: 'keyboard' });
        if (action === 'cancel') this.emit('cancel', { source: 'keyboard' });
        if (action === 'end_turn') this.emit('endTurn');
        if (action === 'menu') this.emit('menu');

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
                const elapsed = now - state.started;
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
        if (this._boundBlur) {
            window.removeEventListener('blur', this._boundBlur);
        }

        this.listeners = {};
        this.gamepadStates.clear();
        this.gamepadToHumanMap.clear();
        this.heldDirections.clear();
        this.heldKeys.clear();
        this.panState = { x: 0, y: 0 };
    }

    processGamepads() {
        // Choose gamepad source based on backend setting
        let gpList;
        if (this._backend === 'fwnetwork') {
            gpList = FWNetwork.getInstance().getAllGamepads();
        } else {
            // Standard W3C Gamepad API
            gpList = navigator.getGamepads();
        }

        const currentIndices = new Set();

        for (const gp of gpList) {
            if (!gp) continue;

            const gpIndex = gp.index ?? gp.id;
            currentIndices.add(gpIndex);

            const prevState = this.gamepadStates.get(gpIndex) || {
                buttons: new Array(16).fill(false),
                axes: [0, 0, 0, 0],
                moveRepeat: { active: false, dir: null, started: 0, lastFire: 0 },
                stickRepeat: { active: false, dir: null, started: 0, lastFire: 0 }
            };

            const normalised = { index: gpIndex, buttons: gp.buttons, axes: [...(gp.axes || [0, 0, 0, 0])] };

            this.processGamepadButtons(normalised, prevState);
            this.processGamepadMovement(normalised, prevState);
            this.processGamepadPan(normalised);

            this.gamepadStates.set(gpIndex, {
                buttons: normalised.buttons.map(b => b.pressed),
                axes: [...normalised.axes],
                moveRepeat: prevState.moveRepeat,
                stickRepeat: prevState.stickRepeat
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
        const numButtons = gp.buttons.length;
        for (let i = 0; i < numButtons; i++) {
            const pressed = gp.buttons[i]?.pressed ?? false;
            const wasPressed = prevState.buttons[i];

            if (pressed && !wasPressed) {
                this.emit('gamepadButtonDown', { index: gp.index, button: i });

                if (!this.suspended) {
                    const action = this._gpButtonActionMap[i];
                    if (action === 'confirm') this.emit('confirm', { source: 'gamepad', index: gp.index });
                    if (action === 'cancel') this.emit('cancel', { source: 'gamepad', index: gp.index });
                    if (action === 'end_turn') this.emit('endTurn', { index: gp.index });
                    if (action === 'menu' && this.isGamepadAllowedGlobalAction(gp.index)) this.emit('menu');
                    // move_up/down/left/right handled by processGamepadMovement
                    const zoomDir = this._zoomDirections[action];
                    if (zoomDir !== undefined && this.isGamepadAllowedGlobalAction(gp.index)) this.emit('zoom', { direction: zoomDir, index: gp.index });
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

        const now = Date.now();
        const repeat = prevState.moveRepeat;
        let activeDir = null;

        for (const [btnIdx, dir] of Object.entries(dpMap)) {
            const i = parseInt(btnIdx);
            const pressed = gp.buttons[i]?.pressed ?? false;
            const wasPressed = prevState.buttons[i];

            if (pressed && !wasPressed) {
                this.emit('move', { ...dir, index: gp.index });
                repeat.active = true;
                repeat.dir = dir;
                repeat.started = now;
                repeat.lastFire = now;
                activeDir = dir;
            } else if (pressed) {
                activeDir = dir;
            }
        }

        // Left analog stick → same tile movement as D-pad
        {
            const savedDeadzone = localStorage.getItem('dicy_gamepad_deadzone_' + gp.id);
            const dz = savedDeadzone ? parseFloat(savedDeadzone) : 0.40;
            let lx = gp.axes[0] ?? 0;
            let ly = gp.axes[1] ?? 0;
            if (Math.abs(lx) < dz) lx = 0;
            if (Math.abs(ly) < dz) ly = 0;

            // Pick dominant axis, then quantise to -1/0/+1
            const stickDir = (Math.abs(lx) >= Math.abs(ly))
                ? (lx > 0 ? { x: 1, y: 0 } : lx < 0 ? { x: -1, y: 0 } : null)
                : (ly > 0 ? { x: 0, y: 1 } : ly < 0 ? { x: 0, y: -1 } : null);

            // Map stick direction → corresponding D-pad button index (for virtual events)
            const gpad = this.bindings.gamepad;
            const stickDirToBtn = (dir) => {
                if (!dir) return null;
                if (dir.x === -1) return gpad.move_left?.[0]  ?? 14;
                if (dir.x === 1)  return gpad.move_right?.[0] ?? 15;
                if (dir.y === -1) return gpad.move_up?.[0]    ?? 12;
                if (dir.y === 1)  return gpad.move_down?.[0]  ?? 13;
                return null;
            };

            const stickRepeat = prevState.stickRepeat;

            if (stickDir) {
                const dirChanged = !stickRepeat.dir || stickRepeat.dir.x !== stickDir.x || stickRepeat.dir.y !== stickDir.y;
                if (dirChanged) {
                    // Virtual button-up for previous direction, button-down for new direction
                    const oldBtn = stickDirToBtn(stickRepeat.dir);
                    if (oldBtn !== null) this.emit('gamepadButtonUp', { index: gp.index, button: oldBtn, virtual: true });
                    const newBtn = stickDirToBtn(stickDir);
                    if (newBtn !== null) this.emit('gamepadButtonDown', { index: gp.index, button: newBtn, virtual: true });
                    this.emit('move', { ...stickDir, index: gp.index });
                    stickRepeat.active = true;
                    stickRepeat.dir = stickDir;
                    stickRepeat.started = now;
                    stickRepeat.lastFire = now;
                } else if (stickRepeat.active) {
                    const elapsed = now - stickRepeat.started;
                    const sinceLast = now - stickRepeat.lastFire;
                    if (elapsed > this.repeatDelay && sinceLast > this.repeatRate) {
                        // Re-emit button-down on repeat so held stick keeps navigating menus
                        const btn = stickDirToBtn(stickDir);
                        if (btn !== null) this.emit('gamepadButtonDown', { index: gp.index, button: btn, virtual: true });
                        this.emit('move', { ...stickDir, index: gp.index });
                        stickRepeat.lastFire = now;
                    }
                }
                if (stickDir) activeDir = stickDir;
            } else {
                // Stick released: emit virtual button-up
                const oldBtn = stickDirToBtn(stickRepeat.dir);
                if (oldBtn !== null) this.emit('gamepadButtonUp', { index: gp.index, button: oldBtn, virtual: true });
                stickRepeat.active = false;
                stickRepeat.dir = null;
            }
        }

        // Handle D-pad repeat
        if (activeDir && repeat.active) {
            const elapsed = now - repeat.started;
            const sinceLast = now - repeat.lastFire;

            if (elapsed > this.repeatDelay && sinceLast > this.repeatRate) {
                this.emit('move', { ...activeDir, index: gp.index });
                repeat.lastFire = now;
            }
        } else {
            repeat.active = false;
            repeat.dir = null;
        }
    }

    processGamepadPan(gp) {
        if (this.suspended) return;
        // Only activated (joined) gamepads may pan
        if (!this.gamepadCursorManager?.activatedGamepads?.has(gp.index)) return;
        if (!this.isGamepadAllowedGlobalAction(gp.index)) return;

        // Right stick: axes 2 (X), 3 (Y)
        let rx = gp.axes[2] ?? 0;
        let ry = gp.axes[3] ?? 0;

        const savedDeadzone = localStorage.getItem('dicy_gamepad_deadzone_' + gp.id);
        const currentDeadZone = savedDeadzone ? parseFloat(savedDeadzone) : 0.40;

        if (Math.abs(rx) < currentDeadZone) rx = 0;
        if (Math.abs(ry) < currentDeadZone) ry = 0;

        rx = -rx;
        ry = -ry;

        if (rx !== 0 || ry !== 0) {
            const speedMult = this.gamepadCursorManager?.cursors?.get(gp.index)?.speedMultiplier ?? 1;
            this.emit('panAnalog', { x: rx * speedMult, y: ry * speedMult });
        }
    }

    // Trigger haptic feedback (disabled)
    vibrate(type = 'light') {
        // Rumble removed as per user request
    }
}
