import { GAME } from '../core/constants.js';
import { isDesktopContext } from '../scenarios/user-identity.js';
import { detectControllerType, buttonIconHTML } from './controller-icons.js';

/**
 * GamepadCursorManager - Handles artificial cursors for gamepad players.
 * Each gamepad gets a visible crosshair that can interact with both the game
 * and HTML UI elements by simulating mouse events.
 */
export class GamepadCursorManager {
    // Survives instance destruction so cursors keep their position across game restarts.
    static savedPositions = new Map(); // gamepadIndex → { x, y }

    constructor(game, inputManager) {
        this.game = game;
        this.inputManager = inputManager;
        this.cursors = new Map(); // gamepadIndex -> { x, y, element, player }
        this.activatedGamepads = new Set(); // indices that have pressed at least one button
        this.onIntroSpawn = null; // optional callback: (playerIndex, screenX, screenY) => void
        const isDesktop = isDesktopContext();
        this.cursorSpeed = isDesktop ? 12 : 20;

        // Container for all virtual cursors
        this.container = document.createElement('div');
        this.container.id = 'gamepad-cursors-container';
        this.container.style.position = 'fixed';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.pointerEvents = 'none';
        this.container.style.zIndex = '100050';
        document.body.appendChild(this.container);

        // Track animation frame and disposed state for cleanup
        this.animationFrameId = null;
        this.disposed = false;
        this._modalObserver = null;

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

        // Clamp all cursors when the window resizes (e.g. resolution change)
        this._boundResize = () => this._clampAllCursors();
        window.addEventListener('resize', this._boundResize);

        // Auto-focus first element when a modal becomes visible
        this._setupModalAutoFocus();
    }

    /** Return the current UI scale factor (from CSS --ui-scale). */
    _uiScale() {
        return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
    }

    /** Position a cursor DOM element at viewport coordinates (x, y). */
    _positionCursor(cursor) {
        const s = this._uiScale();
        cursor.element.style.transform = `translate(${cursor.x / s}px, ${cursor.y / s}px)`;
    }

    /** Read current gamepad bindings from InputManager, falling back to defaults. */
    _gb() {
        const gb = this.inputManager.bindings?.gamepad ?? {};
        return {
            confirm: gb.confirm?.[0] ?? 0,
            confirmButtons: gb.confirm ?? [0, 10],
            cancel: gb.cancel?.[0] ?? 2,
            cancelButtons: gb.cancel ?? [2, 11],
            endTurn: gb.end_turn?.[0] ?? 3,
            menu: gb.menu?.[0] ?? 9,
            moveUp: gb.move_up?.[0] ?? 12,
            moveDown: gb.move_down?.[0] ?? 13,
            moveLeft: gb.move_left?.[0] ?? 14,
            moveRight: gb.move_right?.[0] ?? 15,
            drag: gb.gamepad_drag?.[0] ?? 1,
            cursorSpeedDown: gb.cursor_speed_down?.[0] ?? 4,
            cursorSpeedUp: gb.cursor_speed_up?.[0] ?? 5,
            zoomOut: gb.zoom_out?.[0] ?? 6,
            zoomIn: gb.zoom_in?.[0] ?? 7,
        };
    }

    setupEventListeners() {
        // Define and store bound handlers for cleanup
        this.boundEventHandlers.gamepadButtonDown = ({ index, button }) => {
            // First button press activates this gamepad's cursor
            if (!this.activatedGamepads.has(index)) {
                this.activatedGamepads.add(index);
                const gp = this.inputManager.getGamepads().find(g => g && g.index === index);
                this.createCursor(index, gp || null);
                this.inputManager.emit('gamepadActivated', { index });
            }

            const cursor = this.cursors.get(index);
            if (!cursor) return;

            // Ensure cursor is visible on button press
            cursor.element.style.opacity = '1.0';

            // Read current bindings so labels and actions follow remapping
            const b = this._gb();
            const isEditorOpen = !!document.querySelector('.editor-overlay:not(.hidden)');
            const isMenuOpen = !!document.querySelector('.modal:not(.hidden), .editor-overlay:not(.hidden)');

            // Intro mode interactions (button-specific)
            if (b.confirmButtons.includes(button) && this.onIntroSpawn) {
                const assignment = this.inputManager.getGamepadAssignment(index);
                const playerIndex = typeof assignment === 'number' ? assignment : 0;
                this.onIntroSpawn(playerIndex, cursor.x, cursor.y);
            } else if (b.cancelButtons.includes(button) && this.onIntroRemove) {
                this.onIntroRemove(cursor.x, cursor.y);
            } else if (button === b.endTurn && this.onIntroMutate) {
                this.onIntroMutate(cursor.x, cursor.y);
            }

            const gameLabels = {
                [b.confirm]: 'Select',
                [b.cancel]: 'Deselect',
                [b.endTurn]: 'End Turn',
                [b.menu]: 'Main Menu',
                [b.moveUp]: 'Attack Up',
                [b.moveDown]: 'Attack Down',
                [b.moveLeft]: 'Attack Left',
                [b.moveRight]: 'Attack Right',
                [b.drag]: 'Hold to move map',
                [b.cursorSpeedDown]: 'Cursor Speed -',
                [b.cursorSpeedUp]: 'Cursor Speed +',
                [b.zoomOut]: 'Zoom out',
                [b.zoomIn]: 'Zoom in',
            };
            const editorLabels = {
                [b.confirm]: 'Add / Paint',
                [b.cancel]: 'Remove tile',
                [b.endTurn]: 'Paint mode',
                [b.menu]: 'Main Menu',
                [b.moveUp]: 'Pan up',
                [b.moveDown]: 'Pan down',
                [b.moveLeft]: 'Dice mode',
                [b.moveRight]: 'Assign mode',
                [b.drag]: 'Hold to pan map',
                [b.cursorSpeedDown]: 'Cursor Speed -',
                [b.cursorSpeedUp]: 'Cursor Speed +',
                [b.zoomOut]: 'Zoom out',
                [b.zoomIn]: 'Zoom in',
            };

            const buttonLabels = isEditorOpen ? editorLabels : gameLabels;
            const label = buttonLabels[button];
            if (label) {
                const gameSpeed = localStorage.getItem('dicy_gameSpeed') || 'beginner';
                const isBeginner = gameSpeed === 'beginner';
                const isMainMenu = !!document.querySelector('#main-menu:not(.hidden), #setup-modal:not(.hidden)');

                // Beginner: show hints everywhere. Normal/Expert: only in the main menu.
                if (isBeginner || isMainMenu) {
                    this.showFeedback(index, label, button);
                }
            }

            // D-pad press → snap mode (no center dot), regardless of context
            if ([b.moveUp, b.moveDown, b.moveLeft, b.moveRight].includes(button)) {
                this._setCursorMode(cursor, 'dpad');
            }

            // In menu mode, only allow cursor/zoom/confirm/cancel buttons
            if (isMenuOpen) {
                const allowedInMenu = isEditorOpen
                    ? [...b.confirmButtons, ...b.cancelButtons, b.endTurn, b.drag, b.cursorSpeedDown, b.cursorSpeedUp, b.zoomOut, b.zoomIn, b.menu, b.moveUp, b.moveDown, b.moveLeft, b.moveRight]
                    : [...b.confirmButtons, ...b.cancelButtons, b.drag, b.cursorSpeedDown, b.cursorSpeedUp, b.zoomOut, b.zoomIn, b.menu, b.moveUp, b.moveDown, b.moveLeft, b.moveRight];
                if (!allowedInMenu.includes(button)) return;

                if (!isEditorOpen) {
                    // D-pad → focus navigation between dialog elements
                    if ([b.moveUp, b.moveDown, b.moveLeft, b.moveRight].includes(button)) {
                        this.navigateModal(button, cursor);
                        return;
                    }
                    // B (drag) → close the current modal
                    if (button === b.drag) {
                        this.closeCurrentModal();
                        return;
                    }
                }
            }

            // In-game action guard: non-master gamepads can only act on their assigned player's turn
            const inGame = !isMenuOpen && this.game.players.length > 0 && !this.game.gameOver;
            const currentPlayer = this.game.currentPlayer;
            const isAssignedTurn = !inGame || !currentPlayer || currentPlayer.isBot ||
                this.inputManager.canGamepadControlPlayer(index, currentPlayer.id);

            if (b.confirmButtons.includes(button)) {
                if (isAssignedTurn) this.simulateMouseEvent('mousedown', cursor.x, cursor.y, 0, index);
            } else if (b.cancelButtons.includes(button)) {
                if (isAssignedTurn) this.simulateMouseEvent('mousedown', cursor.x, cursor.y, 2, index);
            } else if (button === b.endTurn) {
                if (isEditorOpen) {
                    // In editor: end_turn button = Paint mode
                    const paintTab = document.querySelector('.editor-tab[data-mode="paint"]');
                    if (paintTab) paintTab.click();
                } else {
                    // In game: End Turn — use assignment-aware check
                    if (currentPlayer && !currentPlayer.isBot &&
                        this.inputManager.canGamepadControlPlayer(index, currentPlayer.id)) {
                        const endTurnBtn = document.getElementById('end-turn-btn');
                        if (endTurnBtn && !endTurnBtn.classList.contains('hidden')) {
                            endTurnBtn.click();
                        } else {
                            this.inputManager.emit('endTurn');
                        }
                    }
                }
            } else if (button === b.drag) {
                this.simulateMouseEvent('mousedown', cursor.x, cursor.y, 1, index);
            } else if (button === b.cursorSpeedDown) {
                // Persistent Speed: slower (0.5x)
                cursor.speedMultiplier *= 0.5;
                localStorage.setItem('dicy_gamepad_speed_' + index, cursor.speedMultiplier);
            } else if (button === b.cursorSpeedUp) {
                // Persistent Speed: faster (2x)
                cursor.speedMultiplier *= 2.0;
                localStorage.setItem('dicy_gamepad_speed_' + index, cursor.speedMultiplier);
            }
            // zoom_in / zoom_out are handled by InputManager → input-controller via 'zoom' event
        };

        this.boundEventHandlers.gamepadButtonUp = ({ index, button }) => {
            const cursor = this.cursors.get(index);
            if (!cursor) return;

            const b = this._gb();
            const isMenuOpen = !!document.querySelector('.modal:not(.hidden), .editor-overlay:not(.hidden)');
            if (isMenuOpen && !b.confirmButtons.includes(button) && !b.cancelButtons.includes(button)) return;

            const inGameUp = !isMenuOpen && this.game.players.length > 0 && !this.game.gameOver;
            const currentPlayerUp = this.game.currentPlayer;
            const isAssignedTurnUp = !inGameUp || !currentPlayerUp || currentPlayerUp.isBot ||
                this.inputManager.canGamepadControlPlayer(index, currentPlayerUp.id);

            if (b.confirmButtons.includes(button)) {
                if (isAssignedTurnUp) {
                    this.simulateMouseEvent('mouseup', cursor.x, cursor.y, 0, index);
                    this.inputManager.lastClickingGamepad = index;
                    this.simulateMouseEvent('click', cursor.x, cursor.y, 0, index);
                    this.inputManager.lastClickingGamepad = null;
                }
            } else if (b.cancelButtons.includes(button)) {
                if (isAssignedTurnUp) {
                    this.simulateMouseEvent('mouseup', cursor.x, cursor.y, 2, index);
                    this.simulateMouseEvent('click', cursor.x, cursor.y, 2, index);
                }
            } else if (button === b.drag) {
                this.simulateMouseEvent('mouseup', cursor.x, cursor.y, 1, index);
            }
        };

        this.boundEventHandlers.gamepadCursorMoveRequest = ({ index, x, y }) => {
            const cursor = this.cursors.get(index);
            if (!cursor) return;

            cursor.x = x;
            cursor.y = y;
            GamepadCursorManager.savedPositions.set(index, { x, y });
            this._positionCursor(cursor);
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

        // Use InputManager's unified gamepad source (gilrs or navigator, never both)
        const gamepads = this.inputManager.getGamepads();
        const activeIndices = new Set();

        for (const gp of gamepads) {
            if (!gp) continue;
            const idx = gp.index;
            activeIndices.add(idx);

            let cursor = this.cursors.get(idx);
            if (!cursor) {
                // Don't show a cursor until the player has pressed at least one button
                if (!this.activatedGamepads.has(idx)) continue;
                cursor = this.createCursor(idx, gp);
            }

            // Move cursor based on left stick
            let dx = gp.axes[0] || 0;
            let dy = gp.axes[1] || 0;

            // Load dynamically saved deadzone per gamepad, default to 0.15
            const savedDeadzone = localStorage.getItem('dicy_gamepad_deadzone_' + idx);
            const currentDeadZone = savedDeadzone ? parseFloat(savedDeadzone) : 0.15;

            // Apply deadzone
            if (Math.abs(dx) < currentDeadZone) dx = 0;
            if (Math.abs(dy) < currentDeadZone) dy = 0;

            if (dx !== 0 || dy !== 0) {
                const scale = (val) => Math.sign(val) * Math.pow(Math.abs(val), 1.5);
                const b = this._gb();
                const dragHeld = gp.buttons[b.drag]?.pressed ?? false;

                if (dragHeld) {
                    this.inputManager.emit('panAnalog', { x: -dx, y: -dy });
                } else {
                    this._setCursorMode(cursor, 'analog');
                    let speedMultiplier = cursor.speedMultiplier || 1.0;

                    cursor.x += scale(dx) * this.cursorSpeed * speedMultiplier;
                    cursor.y += scale(dy) * this.cursorSpeed * speedMultiplier;

                    // Clamp to screen bounds
                    cursor.x = Math.max(0, Math.min(window.innerWidth, cursor.x));
                    cursor.y = Math.max(0, Math.min(window.innerHeight, cursor.y));

                    GamepadCursorManager.savedPositions.set(idx, { x: cursor.x, y: cursor.y });

                    // Update DOM element
                    this._positionCursor(cursor);
                    cursor.element.style.opacity = '1.0';

                    // Trigger mousemove on current position
                    this.simulateMouseEvent('mousemove', cursor.x, cursor.y, 0, idx);
                }
            }

            // Scroll Logic using Right Stick
            // axes[2] is scroll horizontal, axes[3] is scroll vertical
            let sx = gp.axes[2] || 0;
            let sy = gp.axes[3] || 0;

            if (Math.abs(sx) < currentDeadZone) sx = 0;
            if (Math.abs(sy) < currentDeadZone) sy = 0;

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
            this.updateCursorColor(cursor, idx);
        }

        // Remove cursors for gamepads that are no longer connected
        for (const [idx] of this.cursors) {
            if (!activeIndices.has(idx)) {
                this.removeCursor(idx);
            }
        }

        this.animationFrameId = requestAnimationFrame(this.update);
    }

    /**
     * Clean up the cursor manager.
     * Removes all cursors, DOM elements, and event listeners.
     */
    dispose() {
        this.disposed = true;

        if (this._modalObserver) {
            this._modalObserver.disconnect();
            this._modalObserver = null;
        }

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

        // Remove resize listener
        if (this._boundResize) {
            window.removeEventListener('resize', this._boundResize);
            this._boundResize = null;
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

    /** Clamp every cursor to the current viewport bounds. */
    _clampAllCursors() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        for (const [index, cursor] of this.cursors) {
            cursor.x = Math.max(0, Math.min(w, cursor.x));
            cursor.y = Math.max(0, Math.min(h, cursor.y));
            GamepadCursorManager.savedPositions.set(index, { x: cursor.x, y: cursor.y });
            this._positionCursor(cursor);
        }
    }

    createCursor(index, gamepad) {
        if (gamepad) {
            const type = detectControllerType(gamepad);
            console.log(`[GamepadCursor] Controller ${index}: "${gamepad.id}" → ${type}`);
        }
        const el = document.createElement('div');
        el.className = 'gamepad-cursor';
        el.style.position = 'absolute';
        el.style.width = '64px'; // 2x size
        el.style.height = '64px'; // 2x size
        el.style.marginLeft = '-32px';
        el.style.marginTop = '-32px';
        el.style.transition = 'none';

        // Corner-bracket crosshair — open centre keeps tile text readable,
        // square geometry fits the rectangular game aesthetic.
        el.innerHTML = `
            <svg width="64" height="64" viewBox="0 0 64 64" style="filter: drop-shadow(0 0 5px rgba(0,0,0,0.9))">
                <path d="M 8 24 L 8 8 L 24 8"  fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"/>
                <path d="M 40 8 L 56 8 L 56 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"/>
                <path d="M 8 40 L 8 56 L 24 56"  fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"/>
                <path d="M 40 56 L 56 56 L 56 40" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"/>
                <rect class="center-dot" x="29" y="29" width="6" height="6" fill="currentColor"/>
            </svg>
            <div class="gamepad-cursor-label"></div>
        `;

        // Restore last known position, or place at player corner on first appearance.
        const saved = GamepadCursorManager.savedPositions.get(index);
        let initialX, initialY;
        if (saved) {
            initialX = Math.max(0, Math.min(window.innerWidth, saved.x));
            initialY = Math.max(0, Math.min(window.innerHeight, saved.y));
        } else {
            const humanIndex = this.inputManager.getHumanIndex(index);
            const padding = 0;
            initialX = window.innerWidth / 2;
            initialY = window.innerHeight / 2;
            if (humanIndex % 4 === 0) { initialX = padding; initialY = padding; }
            else if (humanIndex % 4 === 1) { initialX = window.innerWidth - padding; initialY = padding; }
            else if (humanIndex % 4 === 2) { initialX = padding; initialY = window.innerHeight - padding; }
            else if (humanIndex % 4 === 3) { initialX = window.innerWidth - padding; initialY = window.innerHeight - padding; }
        }

        const cursor = {
            x: initialX,
            y: initialY,
            element: el,
            label: el.querySelector('.gamepad-cursor-label'),
            controllerType: gamepad ? detectControllerType(gamepad) : 'xbox',
            lastPlayerId: -1,
            lastColor: '',
            lastLabelText: '',
            speedMultiplier: parseFloat(localStorage.getItem('dicy_gamepad_speed_' + index)) || 1.0,
            dragTarget: null,
            mode: 'dpad',
        };

        // Set initial position and opacity
        el.style.transform = `translate(${cursor.x / this._uiScale()}px, ${cursor.y / this._uiScale()}px)`;
        el.style.opacity = '1.0';

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

    /** Fully remove a gamepad from the session. They must press a button to rejoin. */
    kickGamepad(index) {
        this.activatedGamepads.delete(index);
        this.removeCursor(index);
        GamepadCursorManager.savedPositions.delete(index);
        this.inputManager.emit('gamepadAssignmentChange');
    }

    updateCursorColor(cursor, index) {
        const isMenuOpen = !!document.querySelector('.modal:not(.hidden)');
        const isMainMenu = !document.getElementById('main-menu')?.classList.contains('hidden');
        let colorHex;

        if (isMainMenu) {
            // Main menu: use auto-sequential color (existing behavior)
            const humanIndex = this.inputManager.getHumanIndex(index);
            const color = GAME.HUMAN_COLORS[humanIndex % GAME.HUMAN_COLORS.length];
            colorHex = '#' + color.toString(16).padStart(6, '0');
        } else {
            const assignment = this.inputManager.getGamepadAssignment(index);
            if (assignment === 'master') {
                colorHex = '#AAAAAA'; // grey for master
            } else {
                const color = GAME.HUMAN_COLORS[assignment % GAME.HUMAN_COLORS.length];
                colorHex = '#' + color.toString(16).padStart(6, '0');
            }
        }

        if (cursor.lastColor !== colorHex) {
            cursor.element.style.color = colorHex;
            cursor.lastColor = colorHex;
        }

        // Show controller number next to cursor only in menus with 2+ active gamepads
        if (cursor.label) {
            const labelText = String(index + 1);
            if (cursor.lastLabelText !== labelText) {
                cursor.label.textContent = labelText;
                cursor.lastLabelText = labelText;
            }
            const multipleActive = this.cursors.size > 1;
            cursor.label.style.display = (isMenuOpen && multipleActive) ? 'block' : 'none';
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
            event.gamepadIndex = gamepadIndex;
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
        mouseEvent.gamepadIndex = gamepadIndex;
        Object.defineProperty(mouseEvent, 'isGamepadSimulated', {
            value: true,
            enumerable: true,
            configurable: true
        });
        target.dispatchEvent(mouseEvent);

        if (type === 'mousedown' && button === 0) {
            if (target.focus) target.focus();
            const cursor = this.cursors.get(gamepadIndex);
            if (cursor) cursor.dragTarget = target;
        }

        if (type === 'mouseup' && button === 0) {
            const cursor = this.cursors.get(gamepadIndex);
            if (cursor) cursor.dragTarget = null;
        }

        if (type === 'mousemove') {
            const cursor = this.cursors.get(gamepadIndex);
            if (cursor && cursor.dragTarget && cursor.dragTarget.tagName === 'INPUT' && cursor.dragTarget.type === 'range') {
                this.updateSliderFromX(cursor.dragTarget, x);
            }

            // Gamepad hover highlight: apply .gamepad-focused to the element under the cursor
            const hoverOption = target.closest('.custom-select-option');
            const prevFocused = document.querySelector('.gamepad-focused');
            if (hoverOption) {
                if (prevFocused !== hoverOption) {
                    if (prevFocused) prevFocused.classList.remove('gamepad-focused');
                    hoverOption.classList.add('gamepad-focused');
                    hoverOption.focus({ preventScroll: false });
                    hoverOption.scrollIntoView({ block: 'nearest' });
                }
            } else if (prevFocused && !target.closest('.custom-select-dropdown')) {
                prevFocused.classList.remove('gamepad-focused');
            }
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
        // NOTE: <select> elements are handled by the custom-select.js mousedown
        // interceptor (installed by initCustomSelects). No handling needed here.

        // 1. Handle <input type="range"> elements (Jump to point)
        if (target.tagName === 'INPUT' && target.type === 'range') {
            this.updateSliderFromX(target, x);
        }

        // 2. Handle <input type="checkbox"> for completeness
        else if (target.tagName === 'INPUT' && target.type === 'checkbox') {
            target.checked = !target.checked;
            target.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    /**
     * Updates an <input type="range"> value based on a screen X coordinate.
     */
    updateSliderFromX(target, x) {
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

        if (target.value !== val.toString()) {
            target.value = val;
            // Dispatch events so the UI updates and the app responds
            target.dispatchEvent(new Event('input', { bubbles: true }));
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

    /**
     * Shows a temporary floating feedback label near the cursor.
     */
    showFeedback(index, text, button) {
        const cursor = this.cursors.get(index);
        if (!cursor) return;

        const feedback = document.createElement('div');
        feedback.className = 'gamepad-feedback';
        const iconHTML = (button !== undefined)
            ? (buttonIconHTML(cursor.controllerType ?? 'xbox', button) ?? '')
            : '';
        feedback.innerHTML = iconHTML + `<span>${text}</span>`;
        feedback.style.position = 'fixed';
        feedback.style.left = `${cursor.x / this._uiScale()}px`;
        feedback.style.top = `${(cursor.y - 40) / this._uiScale()}px`;
        feedback.style.transform = 'translateX(-50%)';
        feedback.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
        feedback.style.color = 'white';
        feedback.style.padding = '4px 10px';
        feedback.style.borderRadius = '12px';
        feedback.style.fontSize = '12px';
        feedback.style.fontWeight = 'bold';
        feedback.style.pointerEvents = 'none';
        feedback.style.zIndex = '100051';
        feedback.style.transition = 'all 2s cubic-bezier(0.2, 0.8, 0.2, 1)';
        feedback.style.whiteSpace = 'nowrap';
        feedback.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        feedback.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        feedback.style.opacity = '1';

        document.body.appendChild(feedback);

        // Animate and remove
        requestAnimationFrame(() => {
            feedback.style.top = `${(cursor.y - 80) / this._uiScale()}px`;
            feedback.style.opacity = '0';
        });

        setTimeout(() => {
            feedback.remove();
        }, 2000);
    }

    // -------------------------------------------------------------------------
    // Modal / dialog navigation helpers
    // -------------------------------------------------------------------------

    static get FOCUSABLE() {
        return 'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a[href], [tabindex]:not([tabindex="-1"])';
    }

    /** Return the topmost open modal/dialog container. */
    getOpenModal() {
        return (
            document.querySelector('.custom-select-overlay') ||
            document.querySelector('.dialog-overlay') ||
            document.querySelector('.modal:not(.hidden)') ||
            document.querySelector('.editor-overlay:not(.hidden)')
        );
    }

    /** Close the current modal by clicking its close button or dispatching Escape. */
    closeCurrentModal() {
        const modal = this.getOpenModal();
        if (!modal) return;
        const closeBtn = modal.querySelector('.close-btn, [aria-label="Close"], button[title="Close"]');
        if (closeBtn) { closeBtn.click(); return; }
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    }

    /** Switch a cursor between 'analog' (free-move, dot visible) and 'dpad' (snap, dot hidden). */
    _setCursorMode(cursor, mode) {
        if (cursor.mode === mode) return;
        cursor.mode = mode;
        cursor.element.classList.toggle('analog-mode', mode === 'analog');
    }

    /** Move a cursor's crosshair to the centre of a DOM element. */
    moveCursorToElement(cursor, el) {
        const rect = el.getBoundingClientRect();
        cursor.x = Math.max(0, Math.min(window.innerWidth, rect.left + rect.width / 2));
        cursor.y = Math.max(0, Math.min(window.innerHeight, rect.top + rect.height / 2));
        this._positionCursor(cursor);
        cursor.element.style.opacity = '1.0';
        this._setCursorMode(cursor, 'dpad');
        this.simulateMouseEvent('mousemove', cursor.x, cursor.y, 0);
    }

    /**
     * Move focus within the current modal using D-pad directions.
     * Uses spatial layout: elements are grouped into visual rows by Y position.
     * Left/Right navigate within a row; Up/Down move between rows (picking nearest by X).
     */
    navigateModal(button, cursor) {
        const b = this._gb();
        const modal = this.getOpenModal();
        if (!modal) return;

        const isLeft  = button === b.moveLeft;
        const isRight = button === b.moveRight;
        const isUp    = button === b.moveUp;
        const isDown  = button === b.moveDown;
        const current = document.activeElement;

        const sidePanel = document.getElementById('gamepad-side-panel');
        const sidePanelActive = sidePanel?.classList.contains('gp-panel-active');

        // Helper: build item list + row grid from a container
        const buildGrid = (container) => {
            const its = [...container.querySelectorAll(GamepadCursorManager.FOCUSABLE)]
                .filter(el => el.offsetParent !== null)
                .map(el => {
                    const r = el.getBoundingClientRect();
                    return { el, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
                })
                .sort((a, b) => a.cy - b.cy || a.cx - b.cx);
            const rws = [];
            for (const item of its) {
                const last = rws[rws.length - 1];
                if (last && Math.abs(item.cy - last[0].cy) < 20) last.push(item);
                else rws.push([item]);
            }
            for (const row of rws) row.sort((a, b) => a.cx - b.cx);
            return rws;
        };

        // Determine which container currently holds focus
        const inSidePanel = sidePanelActive && sidePanel.contains(current);
        const activeContainer = inSidePanel ? sidePanel : modal;

        const rows = buildGrid(activeContainer);
        if (!rows.length) return;

        // Find where the current element sits
        let rowIdx = -1, colIdx = -1;
        for (let r = 0; r < rows.length; r++) {
            const c = rows[r].findIndex(item => item.el === current);
            if (c !== -1) { rowIdx = r; colIdx = c; break; }
        }

        // Nothing focused yet — jump to first element
        if (rowIdx === -1) {
            const t = rows[0][0].el;
            if (current) current.classList.remove('gamepad-focused');
            t.focus({ preventScroll: false });
            t.classList.add('gamepad-focused');
            this.moveCursorToElement(cursor, t);
            return;
        }

        let target = null;

        if (isLeft || isRight) {
            const nextCol = colIdx + (isRight ? 1 : -1);
            if (nextCol >= 0 && nextCol < rows[rowIdx].length) {
                // Normal within-row move
                target = rows[rowIdx][nextCol].el;
            } else if (isRight && !inSidePanel && sidePanelActive) {
                // At right edge of modal → cross into side panel
                const spRows = buildGrid(sidePanel);
                if (spRows.length) {
                    const currentCy = rows[rowIdx][colIdx].cy;
                    // Pick the side-panel row whose centre-Y is closest
                    const closest = spRows.reduce((best, row) =>
                        Math.abs(row[0].cy - currentCy) < Math.abs(best[0].cy - currentCy) ? row : best
                    );
                    target = closest[0].el;
                }
            } else if (isLeft && inSidePanel) {
                // At left edge of side panel → cross back into modal
                const mRows = buildGrid(modal);
                if (mRows.length) {
                    const currentCy = rows[rowIdx][colIdx].cy;
                    const closest = mRows.reduce((best, row) =>
                        Math.abs(row[0].cy - currentCy) < Math.abs(best[0].cy - currentCy) ? row : best
                    );
                    target = closest[closest.length - 1].el; // rightmost = closest to side panel
                }
            }
        } else {
            // Navigate between rows; pick the element in the next row closest by X
            const nextRowIdx = rowIdx + (isDown ? 1 : -1);
            if (nextRowIdx >= 0 && nextRowIdx < rows.length) {
                const currentCx = rows[rowIdx][colIdx].cx;
                target = rows[nextRowIdx].reduce((best, item) =>
                    Math.abs(item.cx - currentCx) < Math.abs(best.cx - currentCx) ? item : best
                ).el;
            }
        }

        if (!target) return;

        if (current) current.classList.remove('gamepad-focused');
        target.focus({ preventScroll: false });
        target.classList.add('gamepad-focused');
        this.moveCursorToElement(cursor, target);
    }

    /**
     * Watch for modals becoming visible and auto-focus their first element
     * so D-pad navigation works immediately without needing an initial Tab press.
     */
    _setupModalAutoFocus() {
        const autoFocus = (container) => {
            if (this.cursors.size === 0) return; // only when gamepad is connected
            const first = container.querySelector(GamepadCursorManager.FOCUSABLE);
            if (!first) return;
            // Focus the element so D-pad navigation works immediately,
            // but don't move the cursor — the user knows where it is.
            setTimeout(() => first.focus({ preventScroll: true }), 80);
        };

        this._modalObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                // dialog-overlay or standalone modal added to DOM
                if (mutation.type === 'childList') {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType !== 1) continue;
                        if (node.classList?.contains('dialog-overlay') ||
                            node.classList?.contains('modal')) {
                            autoFocus(node);
                        }
                    }
                }
                // .modal lost its 'hidden' class → became visible
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const el = mutation.target;
                    if (el.classList?.contains('modal') && !el.classList.contains('hidden')) {
                        autoFocus(el);
                    }
                }
            }
        });

        this._modalObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class'],
        });
    }
}
