
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
        const isSteam = window.steam?.isSteamVersion;
        this.cursorSpeed = isSteam ? 12 : 20;
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

        // Track animation frame and disposed state for cleanup
        this.animationFrameId = null;
        this.disposed = false;

        // Bound event handlers for cleanup
        this.boundEventHandlers = {
            gamepadButtonDown: null,
            gamepadButtonUp: null,
            gamepadCursorMoveRequest: null
        };

        // Update loop for movement
        this.update = this.update.bind(this);
        this.animationFrameId = requestAnimationFrame(this.update);

        // Listen for button events from input manager
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Define and store bound handlers for cleanup
        this.boundEventHandlers.gamepadButtonDown = ({ index, button }) => {
            const cursor = this.cursors.get(index);
            if (!cursor) return;

            const isMenuOpen = !!document.querySelector('.modal:not(.hidden), .editor-overlay:not(.hidden)');

            // In menus, only the A button (0), X button (2) and Start button (9) are allowed to work
            if (isMenuOpen && button !== 0 && button !== 9 && button !== 2) return;

            if (button === 0) {
                this.simulateMouseEvent('mousedown', cursor.x, cursor.y, 0, index);
            } else if (button === 2) {
                this.simulateMouseEvent('mousedown', cursor.x, cursor.y, 2, index);
            } else if (button === 3) {
                const endTurnBtn = document.getElementById('end-turn-btn');
                if (endTurnBtn && !endTurnBtn.classList.contains('hidden')) {
                    endTurnBtn.click();
                } else {
                    this.inputManager.emit('endTurn');
                }
            } else if (button === 1) {
                this.simulateMouseEvent('mousedown', cursor.x, cursor.y, 1, index);
            } else if (button === 6) {
                this.inputManager.emit('panAnalog', { x: 0, y: 0, zoom: 1 });
                const zoomOutBtn = document.getElementById('zoom-out-btn');
                if (zoomOutBtn) zoomOutBtn.click();
            } else if (button === 7) {
                this.inputManager.emit('panAnalog', { x: 0, y: 0, zoom: -1 });
                const zoomInBtn = document.getElementById('zoom-in-btn');
                if (zoomInBtn) zoomInBtn.click();
            }
        };

        this.boundEventHandlers.gamepadButtonUp = ({ index, button }) => {
            const cursor = this.cursors.get(index);
            if (!cursor) return;

            const isMenuOpen = !!document.querySelector('.modal:not(.hidden), .editor-overlay:not(.hidden)');
            if (isMenuOpen && button !== 0 && button !== 2) return;

            if (button === 0) {
                this.simulateMouseEvent('mouseup', cursor.x, cursor.y, 0, index);
                this.simulateMouseEvent('click', cursor.x, cursor.y, 0, index);
            } else if (button === 2) {
                this.simulateMouseEvent('mouseup', cursor.x, cursor.y, 2, index);
                this.simulateMouseEvent('click', cursor.x, cursor.y, 2, index);
            } else if (button === 1) {
                this.simulateMouseEvent('mouseup', cursor.x, cursor.y, 1, index);
            }
        };

        this.boundEventHandlers.gamepadCursorMoveRequest = ({ index, x, y }) => {
            const cursor = this.cursors.get(index);
            if (!cursor) return;

            cursor.x = x;
            cursor.y = y;
            cursor.element.style.transform = `translate(${cursor.x}px, ${cursor.y}px)`;
            cursor.element.style.opacity = '0.35';
            this.simulateMouseEvent('mousemove', cursor.x, cursor.y, 0, index);
        };

        // Register the handlers
        this.inputManager.on('gamepadButtonDown', this.boundEventHandlers.gamepadButtonDown);
        this.inputManager.on('gamepadButtonUp', this.boundEventHandlers.gamepadButtonUp);
        this.inputManager.on('gamepadCursorMoveRequest', this.boundEventHandlers.gamepadCursorMoveRequest);
    }

    update() {
        if (this.disposed) return;

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
                    speedMultiplier = 2.0; // R1 Super Fast
                } else if (gp.buttons[4]?.pressed) {
                    speedMultiplier = 0.5; // L1 Faster
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
                cursor.element.style.opacity = '1.0'; // Restore full opacity for analog stick movement

                // Trigger mousemove on current position
                this.simulateMouseEvent('mousemove', cursor.x, cursor.y, 0, i);
            }

            // Scroll Logic using Right Stick
            // axes[2] is scroll horizontal, axes[3] is scroll vertical
            let sx = gp.axes[2] || 0;
            let sy = gp.axes[3] || 0;

            if (Math.abs(sx) < this.deadZone) sx = 0;
            if (Math.abs(sy) < this.deadZone) sy = 0;

            if (sx !== 0 || sy !== 0) {
                const scrollX = sx * 15; // Scroll speed
                const scrollY = sy * 15;
                const target = document.elementFromPoint(cursor.x, cursor.y);
                if (target) {
                    const scrollable = this.findScrollableParent(target);
                    if (scrollable) {
                        scrollable.scrollBy(scrollX, scrollY);
                    }
                }
            }

            // Periodically check if player info changed (e.g. game started)
            this.updateCursorColor(cursor, i);
        }

        this.animationFrameId = requestAnimationFrame(this.update);
    }

    /**
     * Clean up the cursor manager.
     * Removes all cursors, DOM elements, and event listeners.
     */
    dispose() {
        this.disposed = true;

        // Stop animation frame loop
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Remove event listeners from input manager
        if (this.inputManager) {
            if (this.boundEventHandlers.gamepadButtonDown) {
                this.inputManager.off('gamepadButtonDown', this.boundEventHandlers.gamepadButtonDown);
            }
            if (this.boundEventHandlers.gamepadButtonUp) {
                this.inputManager.off('gamepadButtonUp', this.boundEventHandlers.gamepadButtonUp);
            }
            if (this.boundEventHandlers.gamepadCursorMoveRequest) {
                this.inputManager.off('gamepadCursorMoveRequest', this.boundEventHandlers.gamepadCursorMoveRequest);
            }
        }

        // Remove all cursor elements
        for (const [index, cursor] of this.cursors) {
            if (cursor.element) {
                cursor.element.remove();
            }
        }
        this.cursors.clear();

        // Remove container from DOM
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.container = null;
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

        el.style.transition = 'opacity 0.2s ease';

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

    simulateMouseEvent(type, x, y, button = 0, gamepadIndex = 0) {
        const target = document.elementFromPoint(x, y);
        if (!target) return;

        // Map mouse events to pointer events for PixiJS
        const pointerTypeMap = {
            'mousedown': 'pointerdown',
            'mouseup': 'pointerup',
            'mousemove': 'pointermove'
        };

        const eventType = pointerTypeMap[type] || type;

        // Buttons bitmask for PointerEvent/MouseEvent:
        // 1: Left, 2: Right, 4: Middle
        let buttons = 0;
        if (button === 0) buttons = 1;      // Left
        else if (button === 1) buttons = 4; // Middle
        else if (button === 2) buttons = 2; // Right

        const eventInit = {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
            button: button,
            buttons: buttons,
            pointerId: 100 + (gamepadIndex || 0),
            pointerType: 'mouse',
            isPrimary: true,
            detail: type === 'click' ? 1 : 0
        };

        // If it's a mouse activity event, send PointerEvent (Crucial for PixiJS)
        if (pointerTypeMap[type]) {
            const event = new PointerEvent(eventType, eventInit);

            // Tag for identification
            event.isGamepadSimulated = true;
            Object.defineProperty(event, 'isGamepadSimulated', {
                value: true,
                enumerable: true,
                configurable: true
            });

            target.dispatchEvent(event);
        }

        // Always send a MouseEvent for standard HTML UI compatibility
        // Buttons: Click/Up technically have no buttons pressed, but detail is important
        const mouseEventInit = { ...eventInit };
        if (type === 'click' || type === 'mouseup') {
            mouseEventInit.buttons = 0;
        }

        const mouseEvent = new MouseEvent(type, mouseEventInit);
        mouseEvent.isGamepadSimulated = true;
        Object.defineProperty(mouseEvent, 'isGamepadSimulated', {
            value: true,
            enumerable: true,
            configurable: true
        });
        target.dispatchEvent(mouseEvent);

        if (type === 'mousedown' && button === 0 && target.focus) {
            target.focus();
        }

        if (type === 'click') {
            if (button === 0) {
                this.handleUiCycle(target, x, y, 1);
            } else if (button === 2) {
                this.handleUiCycle(target, x, y, -1);
            }
        }
    }

    /**
     * Specialized UI interaction for gamepads:
     * Clicking a SELECT cycles through options.
     * Clicking a RANGE input (slider) jumps to the clicked position.
     */
    handleUiCycle(target, x, y, direction = 1) {
        // 1. Handle <select> elements
        if (target.tagName === 'SELECT') {
            const len = target.options.length;
            const nextIndex = (target.selectedIndex + direction + len) % len;
            target.selectedIndex = nextIndex;

            // Dispatch events so the app responds to the change
            target.dispatchEvent(new Event('change', { bubbles: true }));
            target.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // 2. Handle <input type="range"> elements (Jump to point)
        else if (target.tagName === 'INPUT' && target.type === 'range') {
            const rect = target.getBoundingClientRect();
            const min = parseFloat(target.min || 0);
            const max = parseFloat(target.max || 100);
            const step = parseFloat(target.step || 1);

            // Calculate percentage based on crosshair X position
            // Subtract small padding to center the thumb better
            const padding = 10;
            const width = rect.width - (padding * 2);
            let pct = (x - (rect.left + padding)) / width;
            pct = Math.max(0, Math.min(1, pct));

            // Calculate raw value
            let val = min + pct * (max - min);

            // Snap to step
            val = Math.round(val / step) * step;

            target.value = val;

            // Dispatch events so the UI updates and the app responds
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // 3. Handle <input type="checkbox"> for completeness
        else if (target.tagName === 'INPUT' && target.type === 'checkbox') {
            target.checked = !target.checked;
            target.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    /**
     * Finds the nearest scrollable parent of an element.
     */
    findScrollableParent(el) {
        if (!el) return null;

        // Check the element itself first
        let current = el;
        while (current && current !== document.body) {
            const style = window.getComputedStyle(current);
            const overflowY = style.getPropertyValue('overflow-y');
            const overflowX = style.getPropertyValue('overflow-x');
            const overflow = style.getPropertyValue('overflow');

            const isScrollableY = (overflowY === 'auto' || overflowY === 'scroll' || overflow === 'auto' || overflow === 'scroll') && current.scrollHeight > current.clientHeight;
            const isScrollableX = (overflowX === 'auto' || overflowX === 'scroll' || overflow === 'auto' || overflow === 'scroll') && current.scrollWidth > current.clientWidth;

            if (isScrollableY || isScrollableX) {
                return current;
            }
            current = current.parentElement;
        }

        return document.documentElement; // Fallback to root scroll
    }
}
