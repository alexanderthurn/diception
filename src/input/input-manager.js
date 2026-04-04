import { isDesktopContext } from '../scenarios/user-identity.js';
import { loadBindings } from './key-bindings.js';
import { gilrsAdapter } from './gilrs-input-adapter.js';
import { FWNetwork } from '../fwnetwork/fwnetwork.js';

/**
 * InputManager - Unified input handling for keyboard and gamepad.
 * Emits semantic game events that InputController consumes.
 *
 * Uses configurable key bindings loaded from key-bindings.js.
 * Supports two gamepad backends: gilrs (native, via Tauri IPC) and
 * navigator.getGamepads() (browser, max 4).  Backend is switchable at runtime.
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

        // Gamepad backend: 'auto' | 'gilrs' | 'navigator' | 'fwnetwork' | 'gilrs+fwnetwork'
        //  auto            = gilrs if available, else navigator.getGamepads()
        //  gilrs           = force gilrs (Tauri desktop only)
        //  navigator       = force browser Gamepad API
        //  fwnetwork       = phone controllers via FW-Network only
        //  gilrs+fwnetwork = native (gilrs) + phone controllers combined
        const saved = localStorage.getItem('dicy_gamepad_backend') || 'navigator';
        // Native backends deactivated for now; force navigator if user had native saved
        const gilrsBased = saved === 'auto' || saved === 'gilrs' || saved === 'gilrs+fwnetwork';
        const backend = gilrsBased ? 'navigator' : saved;
        this._backend = backend;
        this._useGilrs = this._resolveGilrs(backend);
        // Pending gilrs poll result (updated asynchronously)
        this._gilrsPending = false;
        this._gilrsGamepads = [];
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

    /** Resolve whether to use gilrs given a backend preference string. */
    _resolveGilrs(mode) {
        if (mode === 'navigator') return false;
        if (mode === 'fwnetwork') return false;
        // 'auto', 'gilrs', 'gilrs+fwnetwork'
        return gilrsAdapter.isAvailable;
    }

    get _useFwNetwork() {
        return this._backend === 'fwnetwork' || this._backend === 'gilrs+fwnetwork';
    }

    /**
     * Switch gamepad backend at runtime.
     * @param {'auto'|'gilrs'|'navigator'|'fwnetwork'|'gilrs+fwnetwork'} mode
     */
    setBackend(mode) {
        this._backend = mode;
        this._useGilrs = this._resolveGilrs(mode);
        localStorage.setItem('dicy_gamepad_backend', mode);
        if (this._useFwNetwork) {
            FWNetwork.getInstance().hostRoom();
        }
        // Reset gamepad state so stale data doesn't linger
        this.gamepadStates.clear();
        this.connectedGamepadIndices = new Set();
        this.gamepadToHumanMap.clear();
        this._gilrsGamepads = [];
        this.emit('gamepadChange', []);
    }

    /** Return the current backend mode string. */
    get backend() { return this._backend; }

    /**
     * Return a normalised array of connected gamepads from the active backend.
     * Each entry has: { index, id, buttons: [{pressed}], axes: number[] }
     * Other code should use this instead of navigator.getGamepads() directly
     * to avoid duplicate gamepads when gilrs and the browser see different
     * views of the same physical controller.
     */
    getGamepads() {
        if (this._useGilrs) {
            const gilrsGps = this._gilrsGamepads.map(gp => ({
                index: gp.id,
                id: gp.name || `gilrs-${gp.id}`,
                buttons: gp.buttons.map(b => ({ pressed: b })),
                axes: gp.axes,
            }));
            if (this._backend === 'gilrs+fwnetwork') {
                const nwGps = FWNetwork.getInstance().getNetworkGamepads();
                const baseIdx = Math.max(4, this._gilrsGamepads.length);
                nwGps.forEach((gp, i) => { gp.index = baseIdx + i; });
                return [...gilrsGps, ...nwGps];
            }
            return gilrsGps;
        }
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
        if (this._useGilrs) {
            // Use cached gilrs data (updated asynchronously)
            // Kick off next async poll if not already pending
            if (!this._gilrsPending) {
                this._gilrsPending = true;
                gilrsAdapter.poll().then(snapshots => {
                    this._gilrsPending = false;
                    this._gilrsGamepads = snapshots;
                }).catch(() => {
                    this._gilrsPending = false;
                });
            }
            if (this._backend === 'gilrs+fwnetwork') {
                // Merge gilrs gamepads with phone gamepads from FW-Network
                const nw = FWNetwork.getInstance();
                const nwGps = nw.getNetworkGamepads();
                // Assign network gamepad indices starting above the gilrs range
                const baseIdx = Math.max(4, this._gilrsGamepads.length);
                nwGps.forEach((gp, i) => { gp.index = baseIdx + i; gp._isFwNetwork = true; });
                gpList = [...this._gilrsGamepads, ...nwGps];
            } else {
                gpList = this._gilrsGamepads;
            }
        } else if (this._backend === 'fwnetwork') {
            gpList = FWNetwork.getInstance().getAllGamepads();
        } else {
            // Standard W3C Gamepad API
            gpList = navigator.getGamepads();
        }

        const currentIndices = new Set();

        for (const gp of gpList) {
            if (!gp) continue;

            // Normalise: gilrs snapshots use { id, name, buttons: bool[], axes: number[] }
            // FWNetworkGamepad and navigator gamepads use { index, buttons: GamepadButton[], axes: number[] }
            const gpIndex = gp.index ?? gp.id;
            currentIndices.add(gpIndex);

            const prevState = this.gamepadStates.get(gpIndex) || {
                buttons: new Array(16).fill(false),
                axes: [0, 0, 0, 0],
                moveRepeat: { active: false, dir: null, started: 0, lastFire: 0 },
                stickRepeat: { active: false, dir: null, started: 0, lastFire: 0 }
            };

            // gilrs items have bool[] buttons; everything else has GamepadButton[] buttons
            const isGilrsItem = this._useGilrs && !gp._isFwNetwork;
            const normalised = isGilrsItem
                ? {
                    index: gpIndex,
                    buttons: gp.buttons.map(b => ({ pressed: b })),
                    axes: gp.axes,
                }
                : { index: gpIndex, buttons: gp.buttons, axes: [...(gp.axes || [0, 0, 0, 0])] };

            // For gilrs: apply pressed_events as virtual presses for buttons that
            // were briefly tapped and already released by the time the IPC returned.
            // Without this, any press shorter than the IPC round-trip is silently lost.
            const forcedButtons = new Set();
            if (isGilrsItem && gp.pressed_events) {
                for (const idx of gp.pressed_events) {
                    if (!normalised.buttons[idx]?.pressed && !prevState.buttons[idx]) {
                        normalised.buttons[idx] = { pressed: true };
                        forcedButtons.add(idx);
                    }
                }
            }

            this.processGamepadButtons(normalised, prevState);
            this.processGamepadMovement(normalised, prevState);
            this.processGamepadPan(normalised);

            // Restore forced buttons to their actual state (not pressed) so prevState
            // records false — preventing spurious button-up events on the next frame.
            for (const idx of forcedButtons) {
                normalised.buttons[idx] = { pressed: false };
            }

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
            const savedDeadzone = localStorage.getItem('dicy_gamepad_deadzone_' + gp.index);
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

        const savedDeadzone = localStorage.getItem('dicy_gamepad_deadzone_' + gp.index);
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
