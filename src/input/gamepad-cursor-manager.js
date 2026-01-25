
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
        this.cursorSpeed = 10;
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

            // Mapping gamepad buttons to mouse actions
            // 0: A (South) -> Left Click
            // 1: B (East) -> Right Click / Cancel
            // 3: Y (North) -> Middle Click (if needed)

            if (button === 0) {
                this.simulateMouseEvent('mousedown', cursor.x, cursor.y, 0);
            } else if (button === 1) {
                this.simulateMouseEvent('mousedown', cursor.x, cursor.y, 2);
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
        let changed = false;

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
                // Apply speed and update position
                // Use a non-linear scaling for better control
                const scale = (val) => Math.sign(val) * Math.pow(Math.abs(val), 1.5);

                cursor.x += scale(dx) * this.cursorSpeed;
                cursor.y += scale(dy) * this.cursorSpeed;

                // Clamp to screen bounds
                cursor.x = Math.max(0, Math.min(window.innerWidth, cursor.x));
                cursor.y = Math.max(0, Math.min(window.innerHeight, cursor.y));

                // Update DOM element
                cursor.element.style.transform = `translate(${cursor.x}px, ${cursor.y}px)`;

                // Trigger mousemove on current position
                this.simulateMouseEvent('mousemove', cursor.x, cursor.y, 0);

                changed = true;
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
        el.style.width = '32px';
        el.style.height = '32px';
        el.style.marginLeft = '-16px';
        el.style.marginTop = '-16px';
        el.style.transition = 'none';

        // Crosshair design
        el.innerHTML = `
            <svg width="32" height="32" viewBox="0 0 32 32" style="filter: drop-shadow(0 0 2px rgba(0,0,0,0.5))">
                <line x1="16" y1="0" x2="16" y2="10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                <line x1="16" y1="22" x2="16" y2="32" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                <line x1="0" y1="16" x2="10" y2="16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                <line x1="22" y1="16" x2="32" y2="16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                <circle cx="16" cy="16" r="3" fill="none" stroke="currentColor" stroke-width="1.5" />
                <circle cx="16" cy="16" r="1" fill="currentColor" />
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
        // Find if there's a human player for this gamepad index
        // Simple mapping: Gamepad 0 -> Human Player with ID 0, etc.
        // We need to check game.players
        if (!this.game || !this.game.players) {
            cursor.element.style.color = '#ffffff';
            return;
        }

        // Try to find a human player that matches this index
        // Note: This logic depends on how players are assigned.
        // Usually index 0 is first human, index 1 is second, etc.
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
        // Find the element under the cursor
        // We must hide the container temporarily or use pointer-events: none on the cursors
        // Since container has pointer-events: none and SVG doesn't capture, we should be fine.

        const target = document.elementFromPoint(x, y);
        if (!target) return;

        const event = new MouseEvent(type, {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            button: button,
            buttons: button === 0 ? 1 : (button === 2 ? 2 : 0)
        });

        target.dispatchEvent(event);

        // Special handling for focus
        if (type === 'mousedown' && button === 0) {
            if (target.focus) target.focus();
        }
    }
}
