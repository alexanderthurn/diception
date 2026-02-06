/**
 * InputManager - Unified input handling for keyboard and gamepad
 * Emits semantic game events that InputController consumes
 */
export class InputManager {
    constructor() {
        this.listeners = {};

        // Gamepad state
        this.gamepadStates = new Map();
        this.connectedGamepadIndices = new Set();
        this.gamepadToHumanMap = new Map(); // raw gamepad index -> human player index (0, 1, 2, ...)
        this.deadZone = 0.4;

        // Steam version often has higher polling rates or different timing, adjust accordingly
        const isSteam = window.steam?.isSteamVersion;
        this.repeatDelay = isSteam ? 300 : 250;  // ms before repeat starts
        this.repeatRate = isSteam ? 160 : 120;   // ms between repeats

        // Key repeat state
        this.heldDirections = new Map(); // key -> { direction, lastFire, started }
        this.heldKeys = new Set();

        // Pan state for continuous panning
        this.panState = { x: 0, y: 0 }; // -1, 0, or 1 for each axis

        // Track animation frame and bound handlers for cleanup
        this.animationFrameId = null;
        this.boundKeyDown = (e) => this.onKeyDown(e);
        this.boundKeyUp = (e) => this.onKeyUp(e);
        this.disposed = false;

        // Bind keyboard events
        this.setupKeyboard();

        // Start gamepad polling
        this.pollGamepads();
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

        const key = e.key.toLowerCase();

        // Prevent default for game keys
        const gameKeys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
            'e', 'q', ' ', 'escape', 'enter', 'i', 'j', 'k', 'l', 'shift'];
        if (gameKeys.includes(key)) {
            e.preventDefault();
        }

        // Track held keys for repeat
        if (this.heldKeys.has(key)) return; // Already held
        this.heldKeys.add(key);

        // Direction keys (movement)
        const directionMap = {
            'w': { x: 0, y: -1 },
            'arrowup': { x: 0, y: -1 },
            's': { x: 0, y: 1 },
            'arrowdown': { x: 0, y: 1 },
            'a': { x: -1, y: 0 },
            'arrowleft': { x: -1, y: 0 },
            'd': { x: 1, y: 0 },
            'arrowright': { x: 1, y: 0 }
        };

        // Pan keys (camera)
        const panMap = {
            'i': { x: 0, y: -1 },
            'k': { x: 0, y: 1 },
            'j': { x: -1, y: 0 },
            'l': { x: 1, y: 0 }
        };

        if (directionMap[key]) {
            const dir = directionMap[key];
            this.emit('move', { ...dir, index: -1 });
            // Start repeat timer
            this.heldDirections.set(key, {
                direction: dir,
                started: Date.now(),
                lastFire: Date.now()
            });
        } else if (panMap[key]) {
            this.updatePanState(panMap[key].x, panMap[key].y, true);
        } else if (key === 'e' || e.code === 'ShiftRight') {
            this.emit('confirm');
        } else if (key === 'q') {
            this.emit('cancel');
        } else if (key === ' ' || key === 'enter') {
            this.emit('endTurn');
        } else if (key === 'escape') {
            this.emit('menu');
        }
    }

    onKeyUp(e) {
        const key = e.key.toLowerCase();
        this.heldKeys.delete(key);
        this.heldDirections.delete(key);

        // Pan keys
        const panMap = {
            'i': { x: 0, y: -1 },
            'k': { x: 0, y: 1 },
            'j': { x: -1, y: 0 },
            'l': { x: 1, y: 0 }
        };

        if (panMap[key]) {
            this.updatePanState(panMap[key].x, panMap[key].y, false);
        }
    }

    updatePanState(dx, dy, pressed) {
        if (dx !== 0) {
            this.panState.x = pressed ? dx : 0;
        }
        if (dy !== 0) {
            this.panState.y = pressed ? dy : 0;
        }
        this.emit('pan', { ...this.panState });
    }

    // Call this from requestAnimationFrame loop
    update() {
        const now = Date.now();

        // Handle keyboard repeat
        for (const [key, state] of this.heldDirections) {
            const elapsed = now - state.started;
            const sinceLast = now - state.lastFire;

            if (elapsed > this.repeatDelay && sinceLast > this.repeatRate) {
                this.emit('move', { ...state.direction, index: -1 });
                state.lastFire = now;
            }
        }

        // Poll gamepads
        this.processGamepads();
    }

    pollGamepads() {
        // Set up animation frame loop for gamepad polling
        const poll = () => {
            if (this.disposed) return;
            this.update();
            this.animationFrameId = requestAnimationFrame(poll);
        };
        this.animationFrameId = requestAnimationFrame(poll);
    }

    /**
     * Clean up all event listeners and stop polling loops.
     * Call this when the InputManager is no longer needed.
     */
    dispose() {
        this.disposed = true;

        // Stop animation frame loop
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Remove keyboard event listeners
        document.removeEventListener('keydown', this.boundKeyDown);
        document.removeEventListener('keyup', this.boundKeyUp);

        // Clear all state
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

            // Process buttons
            this.processGamepadButtons(gp, prevState);

            // Process D-pad and left stick for movement
            this.processGamepadMovement(gp, prevState);

            // Process right stick for panning
            this.processGamepadPan(gp);

            // Store state
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
        // Standard gamepad mapping:
        // 0 = A (South) = Confirm
        // 1 = B (East) = Middle Click
        // 2 = X (West) = Cancel
        // 3 = Y (North) = End Turn
        // 9 = Start = Menu

        for (let i = 0; i < gp.buttons.length; i++) {
            const pressed = gp.buttons[i].pressed;
            const wasPressed = prevState.buttons[i];

            if (pressed && !wasPressed) {
                this.emit('gamepadButtonDown', { index: gp.index, button: i });

                // Map buttons to semantic events
                if (i === 0) this.emit('confirm');
                if (i === 2) this.emit('cancel');
                if (i === 3) this.emit('endTurn', { index: gp.index });
                if (i === 9) {
                    this.emit('menu');
                }
            } else if (!pressed && wasPressed) {
                this.emit('gamepadButtonUp', { index: gp.index, button: i });
            }
        }
    }

    processGamepadMovement(gp, prevState) {
        // D-pad mapping: 12=Up, 13=Down, 14=Left, 15=Right
        const dpButtons = {
            12: { x: 0, y: -1 },
            13: { x: 0, y: 1 },
            14: { x: -1, y: 0 },
            15: { x: 1, y: 0 }
        };

        const now = Date.now();
        const repeat = prevState.moveRepeat;

        let activeDir = null;

        for (const [btnIdx, dir] of Object.entries(dpButtons)) {
            const i = parseInt(btnIdx);
            const pressed = gp.buttons[i]?.pressed;
            const wasPressed = prevState.buttons[i];

            if (pressed && !wasPressed) {
                this.emit('move', { ...dir, index: gp.index });
                // Start repeat timer
                repeat.active = true;
                repeat.dir = dir;
                repeat.started = now;
                repeat.lastFire = now;
                activeDir = dir;
            } else if (pressed) {
                activeDir = dir;
            }
        }

        // Handle repeat
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
        // Right stick: axes 2 (X), 3 (Y) - or axes 0,1 on some controllers
        // Try axes 2,3 first (most common for right stick)
        let rx = gp.axes[2] ?? 0;
        let ry = gp.axes[3] ?? 0;

        // Apply dead zone
        if (Math.abs(rx) < this.deadZone) rx = 0;
        if (Math.abs(ry) < this.deadZone) ry = 0;

        // Emit continuous pan (will be handled per-frame by consumer)
        if (rx !== 0 || ry !== 0) {
            this.emit('panAnalog', { x: rx, y: ry });
        }
    }

    // Trigger haptic feedback (disabled)
    vibrate(type = 'light') {
        // Rumble removed as per user request
    }
}
