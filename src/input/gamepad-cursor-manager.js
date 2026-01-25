
/**
 * GamepadCursorManager - Handles artificial cursors for gamepad players.
 * Each gamepad gets a visible crosshair that can interact with both the game
 * and HTML UI elements by simulating mouse events.
 */
export class GamepadCursorManager {
    constructor(game, inputManager) {
        this.game = game;
        this.inputManager = inputManager;
        this.cursors = new Map(); // gamepadIndex -> { x, y, element, player }
        this.cursorSpeed = 20;
        this.deadZone = 0.15;

        // Container for all virtual cursors
        this.container = document.createElement('div');
        this.container.id = 'gamepad-cursors-container';
        this.container.style.position = 'fixed';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.width = '100vw';
        this.container.style.height = '100vh';
        this.container.style.pointerEvents = 'none';
        this.container.style.zIndex = '9999';
        document.body.appendChild(this.container);

        // Update loop for movement
        this.update = this.update.bind(this);
        requestAnimationFrame(this.update);

        // Listen for button events from input manager
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.inputManager.on('gamepadButtonDown', ({ index, button }) => {
            const cursor = this.cursors.get(index);
            if (!cursor) return;

            // Mapping gamepad buttons:
            // 0: A (South) -> Left Click
            // 1: B (East) -> Right Click / Cancel
            // 3: Y (North) -> End Turn (Click button)
            // 6: L2 -> Zoom Out
            // 7: R2 -> Zoom In

            if (button === 0) {
                this.simulateMouseEvent('mousedown', cursor.x, cursor.y, 0);
            } else if (button === 1) {
                this.simulateMouseEvent('mousedown', cursor.x, cursor.y, 2);
            } else if (button === 3) {
                // Find and click end turn button if visible
                const endTurnBtn = document.getElementById('end-turn-btn');
                if (endTurnBtn && !endTurnBtn.classList.contains('hidden')) {
                    endTurnBtn.click();
                } else {
                    // Fallback to emitting event if button not visible or finding click target
                    this.inputManager.emit('endTurn');
                }
            } else if (button === 6) { // L2
                this.inputManager.emit('panAnalog', { x: 0, y: 0, zoom: 1 }); // Zoom Out
                const zoomOutBtn = document.getElementById('zoom-out-btn');
                if (zoomOutBtn) zoomOutBtn.click();
            } else if (button === 7) { // R2
                this.inputManager.emit('panAnalog', { x: 0, y: 0, zoom: -1 }); // Zoom In
                const zoomInBtn = document.getElementById('zoom-in-btn');
                if (zoomInBtn) zoomInBtn.click();
            }
        });

        this.inputManager.on('gamepadButtonUp', ({ index, button }) => {
            const cursor = this.cursors.get(index);
            if (!cursor) return;

            if (button === 0) {
                this.simulateMouseEvent('mouseup', cursor.x, cursor.y, 0);
                this.simulateMouseEvent('click', cursor.x, cursor.y, 0);
            } else if (button === 1) {
                this.simulateMouseEvent('mouseup', cursor.x, cursor.y, 2);
            }
        });
    }

    update() {
        const gamepads = navigator.getGamepads();

        for (let i = 0; i < gamepads.length; i++) {
            const gp = gamepads[i];
            if (!gp) {
                if (this.cursors.has(i)) {
                    this.removeCursor(i);
                }
                continue;
            }

            let cursor = this.cursors.get(i);
            if (!cursor) {
                cursor = this.createCursor(i);
            }

            // Move cursor based on left stick
            let dx = gp.axes[0] || 0;
            let dy = gp.axes[1] || 0;

            // Apply deadzone
            if (Math.abs(dx) < this.deadZone) dx = 0;
            if (Math.abs(dy) < this.deadZone) dy = 0;

            if (dx !== 0 || dy !== 0) {
                // Speed Boost Logic:
                // L1 (Button 4) -> Faster (2x boost)
                // R1 (Button 5) -> Super Fast (5x boost)
                let speedMultiplier = 1.0;
                if (gp.buttons[5]?.pressed) {
                    speedMultiplier = 5.0; // R1 Super Fast
                } else if (gp.buttons[4]?.pressed) {
                    speedMultiplier = 2.0; // L1 Faster
                }

                // Apply speed and update position
                const scale = (val) => Math.sign(val) * Math.pow(Math.abs(val), 1.5);

                cursor.x += scale(dx) * this.cursorSpeed * speedMultiplier;
                cursor.y += scale(dy) * this.cursorSpeed * speedMultiplier;

                // Clamp to screen bounds
                cursor.x = Math.max(0, Math.min(window.innerWidth, cursor.x));
                cursor.y = Math.max(0, Math.min(window.innerHeight, cursor.y));

                // Update DOM element
                cursor.element.style.transform = `translate(${cursor.x}px, ${cursor.y}px)`;

                // Trigger mousemove on current position
                this.simulateMouseEvent('mousemove', cursor.x, cursor.y, 0);
            }

            // Periodically check if player info changed (e.g. game started)
            this.updateCursorColor(cursor, i);
        }

        requestAnimationFrame(this.update);
    }

    createCursor(index) {
        const el = document.createElement('div');
        el.className = 'gamepad-cursor';
        el.style.position = 'absolute';
        el.style.width = '64px'; // 2x size
        el.style.height = '64px'; // 2x size
        el.style.marginLeft = '-32px';
        el.style.marginTop = '-32px';
        el.style.transition = 'none';

        // Crosshair design
        el.innerHTML = `
            <svg width="64" height="64" viewBox="0 0 64 64" style="filter: drop-shadow(0 0 4px rgba(0,0,0,0.5))">
                <line x1="32" y1="0" x2="32" y2="20" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
                <line x1="32" y1="44" x2="32" y2="64" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
                <line x1="0" y1="32" x2="20" y2="32" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
                <line x1="44" y1="32" x2="64" y2="32" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
                <circle cx="32" cy="32" r="6" fill="none" stroke="currentColor" stroke-width="3" />
                <circle cx="32" cy="32" r="2" fill="currentColor" />
            </svg>
        `;

        const cursor = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            element: el,
            lastPlayerId: -1
        };

        this.container.appendChild(el);
        this.cursors.set(index, cursor);
        this.updateCursorColor(cursor, index);

        return cursor;
    }

    removeCursor(index) {
        const cursor = this.cursors.get(index);
        if (cursor) {
            cursor.element.remove();
            this.cursors.delete(index);
        }
    }

    updateCursorColor(cursor, index) {
        if (!this.game || !this.game.players) {
            cursor.element.style.color = '#ffffff';
            return;
        }

        const humanPlayers = this.game.players.filter(p => !p.isBot);
        const player = humanPlayers[index];

        if (player) {
            if (cursor.lastPlayerId !== player.id) {
                const colorHex = '#' + player.color.toString(16).padStart(6, '0');
                cursor.element.style.color = colorHex;
                cursor.lastPlayerId = player.id;
            }
        } else {
            cursor.element.style.color = '#ffffff';
            cursor.lastPlayerId = -1;
        }
    }

    simulateMouseEvent(type, x, y, button = 0) {
        const target = document.elementFromPoint(x, y);
        if (!target) return;

        // Use PointerEvent if possible for better PixiJS compatibility
        const eventInit = {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            button: button,
            buttons: button === 0 ? 1 : (button === 2 ? 2 : 0),
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true
        };

        let event;
        if (type.startsWith('pointer')) {
            event = new PointerEvent(type, eventInit);
        } else {
            // Also dispatch PointerEvents for mouse actions to satisfy PixiJS
            const pointerTypeMap = {
                'mousedown': 'pointerdown',
                'mouseup': 'pointerup',
                'mousemove': 'pointermove',
                'click': 'pointerup' // Click is usually accompanied by pointerup
            };

            if (pointerTypeMap[type]) {
                const pEvent = new PointerEvent(pointerTypeMap[type], eventInit);
                pEvent.isGamepadSimulated = true;
                target.dispatchEvent(pEvent);
            }

            event = new MouseEvent(type, eventInit);
            event.isGamepadSimulated = true;
        }

        target.dispatchEvent(event);

        if (type === 'mousedown' && button === 0 && target.focus) {
            target.focus();
        }
    }
}
