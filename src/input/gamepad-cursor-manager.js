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
        this._pressedWithoutModal = new Map(); // gamepadIndex -> Set of buttons pressed while no modal was open
        this._inUIFocus = new Set(); // gamepadIndices currently in UI button focus (cursor hidden)
        this._pendingUIClick = new Map(); // gamepadIndex → button element to click on button-up
        this._sliderEditMode = new Map(); // gamepadIndex → <input type="range"> being edited
        this.onIntroSpawn = null; // optional callback: (playerIndex, screenX, screenY) => void
        this.getTileScreenSize = null; // injected by main.js: () => number
        this._attackOverlay = document.getElementById('attack-overlay');
        this._diceResultHud = document.getElementById('dice-result-hud');
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
            gamepadCursorMoveRequest: null,
            gamepadUIFocus: null,
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
        this.boundEventHandlers.gamepadButtonDown = ({ index, button, virtual }) => {
            // Virtual D-pad events (from analog stick): only handle menu navigation + slider editing
            if (virtual) {
                const cursor = this.cursors.get(index);
                if (!cursor) return;
                const b = this._gb();
                const isMenuOpen = !!document.querySelector('.modal:not(.hidden), .editor-overlay:not(.hidden)');
                const isEditorOpen = !!document.querySelector('.editor-overlay:not(.hidden)');
                if (isMenuOpen && !isEditorOpen && [b.moveUp, b.moveDown, b.moveLeft, b.moveRight].includes(button)) {
                    if (this.inputManager.isGamepadAllowedGlobalAction(index)) {
                        if (this._sliderEditMode.has(index)) {
                            if (button === b.moveLeft || button === b.moveRight) {
                                this._adjustSlider(index, button === b.moveRight ? 1 : -1);
                                return;
                            }
                            this._exitSliderEditMode(index); // up/down: exit edit mode then navigate
                        }
                        this.navigateModal(button, cursor);
                    }
                }
                return;
            }

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

            // Track which buttons were pressed while no modal was open (for swallowing spurious button-up clicks)
            if (!this._pressedWithoutModal.has(index)) this._pressedWithoutModal.set(index, new Set());
            if (!isMenuOpen) this._pressedWithoutModal.get(index).add(button);
            else this._pressedWithoutModal.get(index).delete(button);

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
            if (label && document.querySelector('#main-menu:not(.hidden)') && !this.inputManager.isGamepadAllowedGlobalAction(index)) {
                this.showFeedback(index, label, button);
            }

            // D-pad press → snap mode (no center dot), regardless of context
            if ([b.moveUp, b.moveDown, b.moveLeft, b.moveRight].includes(button)) {
                this._setCursorMode(cursor, 'dpad');
                this._lastDpadGamepad = index;
            }

            // In menu mode, only allow cursor/zoom/confirm/cancel buttons
            if (isMenuOpen) {
                const allowedInMenu = isEditorOpen
                    ? [...b.confirmButtons, ...b.cancelButtons, b.endTurn, b.drag, b.cursorSpeedDown, b.cursorSpeedUp, b.zoomOut, b.zoomIn, b.menu, b.moveUp, b.moveDown, b.moveLeft, b.moveRight]
                    : [...b.confirmButtons, ...b.cancelButtons, b.drag, b.cursorSpeedDown, b.cursorSpeedUp, b.zoomOut, b.zoomIn, b.menu, b.moveUp, b.moveDown, b.moveLeft, b.moveRight];
                if (!allowedInMenu.includes(button)) return;

                if (!isEditorOpen) {
                    // D-pad → master navigates menu; non-master nudges cursor
                    if ([b.moveUp, b.moveDown, b.moveLeft, b.moveRight].includes(button)) {
                        if (this.inputManager.isGamepadAllowedGlobalAction(index)) {
                            if (this._sliderEditMode.has(index)) {
                                if (button === b.moveLeft || button === b.moveRight) {
                                    this._adjustSlider(index, button === b.moveRight ? 1 : -1);
                                    return;
                                }
                                this._exitSliderEditMode(index); // up/down: exit edit mode then navigate
                            }
                            this.navigateModal(button, cursor);
                        } else {
                            const nudge = 80;
                            if (button === b.moveUp)    cursor.y -= nudge;
                            if (button === b.moveDown)  cursor.y += nudge;
                            if (button === b.moveLeft)  cursor.x -= nudge;
                            if (button === b.moveRight) cursor.x += nudge;
                            cursor.x = Math.max(0, Math.min(window.innerWidth, cursor.x));
                            cursor.y = Math.max(0, Math.min(window.innerHeight, cursor.y));
                            this._positionCursor(cursor);
                        }
                        return;
                    }
                    // Confirm on a focused range slider → enter/exit slider edit mode
                    if (b.confirmButtons.includes(button) && this.inputManager.isGamepadAllowedGlobalAction(index)) {
                        const active = document.activeElement;
                        if (active?.tagName === 'INPUT' && active.type === 'range') {
                            if (this._sliderEditMode.has(index)) {
                                this._exitSliderEditMode(index);
                            } else {
                                this._sliderEditMode.set(index, active);
                                active.classList.add('gamepad-slider-editing');
                            }
                            return;
                        }
                    }
                    // Cancel or B (drag) while in slider edit mode → exit edit mode only
                    if (this._sliderEditMode.has(index) &&
                        (b.cancelButtons.includes(button) || button === b.drag)) {
                        this._exitSliderEditMode(index);
                        return;
                    }
                    // B (drag) → close the current modal (master-mode restricted)
                    if (button === b.drag) {
                        if (this.inputManager.isGamepadAllowedGlobalAction(index)) {
                            this.closeCurrentModal();
                        }
                        return;
                    }
                    // START (menu) in a menu → only master-assigned gamepads allowed
                    if (button === b.menu && !this.inputManager.isGamepadAllowedGlobalAction(index)) {
                        return;
                    }
                }
            }

            // Non-master in menu: confirm/cancel cycle assignment (pause only), endTurn kicks
            if (isMenuOpen && !this.inputManager.isGamepadAllowedGlobalAction(index)) {
                const isAssignmentMenu = !!document.querySelector('#pause-modal:not(.hidden), #setup-modal:not(.hidden)');
                if (isAssignmentMenu && b.confirmButtons.includes(button)) { this._cycleAssignment(index, 1); return; }
                if (isAssignmentMenu && b.cancelButtons.includes(button))  { this._cycleAssignment(index, -1); return; }
                if (button === b.endTurn)               { this.kickGamepad(index); return; }
                return;
            }

            // In-game action guard: non-master gamepads can only act on their assigned player's turn
            const inGame = !isMenuOpen && this.game.players.length > 0 && !this.game.gameOver;
            const currentPlayer = this.game.currentPlayer;
            const isAssignedTurn = !inGame || !currentPlayer || currentPlayer.isBot ||
                this.inputManager.canGamepadControlPlayer(index, currentPlayer.id);

            if (b.confirmButtons.includes(button)) {
                if (isAssignedTurn && !this._inUIFocus.has(index)) this.simulateMouseEvent('mousedown', cursor.x, cursor.y, 0, index);
            } else if (b.cancelButtons.includes(button)) {
                if (isAssignedTurn && !this._inUIFocus.has(index)) this.simulateMouseEvent('mousedown', cursor.x, cursor.y, 2, index);
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
            } else if (button === b.drag && this.inputManager.isGamepadAllowedGlobalAction(index)) {
                this.simulateMouseEvent('mousedown', cursor.x, cursor.y, 1, index);
            } else if (button === b.cursorSpeedDown) {
                cursor.speedMultiplier = Math.max(0.25, parseFloat((cursor.speedMultiplier - 0.25).toFixed(2)));
                localStorage.setItem('dicy_gamepad_speed_' + index, cursor.speedMultiplier);
                this.showFeedback(index, `Speed ×${cursor.speedMultiplier}`, button);
            } else if (button === b.cursorSpeedUp) {
                cursor.speedMultiplier = Math.min(3, parseFloat((cursor.speedMultiplier + 0.25).toFixed(2)));
                localStorage.setItem('dicy_gamepad_speed_' + index, cursor.speedMultiplier);
                this.showFeedback(index, `Speed ×${cursor.speedMultiplier}`, button);
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

            // Swallow button-up click only when: button was pressed outside a modal AND a modal is now open
            // (meaning this press caused the modal to open). Buttons pressed inside a modal always fire normally.
            const pressedOutsideModal = this._pressedWithoutModal.get(index)?.has(button) ?? false;
            this._pressedWithoutModal.get(index)?.delete(button);
            const swallow = pressedOutsideModal && isMenuOpen;

            // Don't simulate clicks on range sliders — confirm/cancel are handled for slider edit mode
            const activeEl = document.activeElement;
            const onRangeSlider = isMenuOpen && activeEl?.tagName === 'INPUT' && activeEl.type === 'range';

            if (b.confirmButtons.includes(button)) {
                // Fire deferred UI button click (set on button-down by input-controller)
                if (this._pendingUIClick.has(index)) {
                    const btn = this._pendingUIClick.get(index);
                    this._pendingUIClick.delete(index);
                    btn.click();
                } else if (!onRangeSlider && isAssignedTurnUp && !swallow && !this._inUIFocus.has(index)) {
                    this.simulateMouseEvent('mouseup', cursor.x, cursor.y, 0, index);
                    this.inputManager.lastClickingGamepad = index;
                    this.simulateMouseEvent('click', cursor.x, cursor.y, 0, index);
                    this.inputManager.lastClickingGamepad = null;
                }
            } else if (b.cancelButtons.includes(button)) {
                if (!onRangeSlider && isAssignedTurnUp && !swallow && !this._inUIFocus.has(index)) {
                    this.simulateMouseEvent('mouseup', cursor.x, cursor.y, 2, index);
                    this.simulateMouseEvent('click', cursor.x, cursor.y, 2, index);
                }
            } else if (button === b.drag && this.inputManager.isGamepadAllowedGlobalAction(index)) {
                this.simulateMouseEvent('mouseup', cursor.x, cursor.y, 1, index);
            }
        };

        this.boundEventHandlers.gamepadCursorMoveRequest = ({ index, x, y, tileSize }) => {
            const cursor = this.cursors.get(index);
            if (!cursor) return;

            cursor.x = x;
            cursor.y = y;
            GamepadCursorManager.savedPositions.set(index, { x, y });
            // Size cursor to tile
            if (this.getTileScreenSize) {
                const sz = Math.round(this.getTileScreenSize() / this._uiScale());
                this._resizeCursor(cursor, sz, sz, 0.20);
            }
            this._positionCursor(cursor);
            cursor.element.style.opacity = '0.35';
            this.simulateMouseEvent('mousemove', cursor.x, cursor.y, 0, index);
        };

        this.boundEventHandlers.gamepadUIFocus = ({ sourceId, active }) => {
            const idx = sourceId?.startsWith('gamepad-') ? parseInt(sourceId.slice('gamepad-'.length)) : -1;
            if (idx < 0) return;
            const cursor = this.cursors.get(idx);
            if (active) {
                this._inUIFocus.add(idx);
                if (cursor) cursor.element.style.visibility = 'hidden';
            } else {
                this._inUIFocus.delete(idx);
                if (cursor) cursor.element.style.visibility = '';
            }
        };

        // Register the handlers
        this.inputManager.on('gamepadButtonDown', this.boundEventHandlers.gamepadButtonDown);
        this.inputManager.on('gamepadButtonUp', this.boundEventHandlers.gamepadButtonUp);
        this.inputManager.on('gamepadCursorMoveRequest', this.boundEventHandlers.gamepadCursorMoveRequest);
        this.inputManager.on('gamepadUIFocus', this.boundEventHandlers.gamepadUIFocus);
    }

    update() {
        if (this.disposed) return;

        // Hide all cursors when fullscreen attack overlay or beginner dice HUD is shown
        const attackVisible = this._attackOverlay && !this._attackOverlay.classList.contains('hidden');
        const diceVisible   = this._diceResultHud && !this._diceResultHud.classList.contains('hidden') &&
                              (localStorage.getItem('dicy_gameSpeed') || 'beginner') === 'beginner';
        this.container.style.visibility = (attackVisible || diceVisible) ? 'hidden' : '';

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

            // Left stick pan (drag held) — tile movement is handled by input-manager processGamepadMovement
            {
                const b = this._gb();
                let lx = gp.axes[0] || 0;
                let ly = gp.axes[1] || 0;
                const savedDeadzone = localStorage.getItem('dicy_gamepad_deadzone_' + idx);
                const dz = savedDeadzone ? parseFloat(savedDeadzone) : 0.40;
                if (Math.abs(lx) < dz) lx = 0;
                if (Math.abs(ly) < dz) ly = 0;
                const dragHeld = gp.buttons[b.drag]?.pressed ?? false;
                if (dragHeld && (lx !== 0 || ly !== 0) && this.inputManager.isGamepadAllowedGlobalAction(idx)) {
                    this.inputManager.emit('panAnalog', { x: -lx, y: -ly });
                }
            }

            // Scroll Logic using Right Stick
            // axes[2] is scroll horizontal, axes[3] is scroll vertical
            let sx = gp.axes[2] || 0;
            let sy = gp.axes[3] || 0;
            const savedDeadzoneScroll = localStorage.getItem('dicy_gamepad_deadzone_' + idx);
            const currentDeadZone = savedDeadzoneScroll ? parseFloat(savedDeadzoneScroll) : 0.40;

            if (Math.abs(sx) < currentDeadZone) sx = 0;
            if (Math.abs(sy) < currentDeadZone) sy = 0;

            if (sx !== 0 || sy !== 0) {
                const scrollX = sx * 15 * cursor.speedMultiplier;
                const scrollY = sy * 15 * cursor.speedMultiplier;
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

            cursor.element.style.opacity = '1.0';
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
            if (this.boundEventHandlers.gamepadUIFocus) {
                this.inputManager.off('gamepadUIFocus', this.boundEventHandlers.gamepadUIFocus);
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
        el.style.width = '44px';
        el.style.height = '44px';
        el.style.marginLeft = '-22px';
        el.style.marginTop = '-22px';
        el.style.transition = 'none';

        // Corner-bracket crosshair — open centre keeps tile text readable,
        // square geometry fits the rectangular game aesthetic.
        el.innerHTML = `
            <svg viewBox="0 0 64 64">
                <path d="M 0 20 L 0 0 L 20 0"  fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="square" stroke-linejoin="miter"/>
                <path d="M 44 0 L 64 0 L 64 20" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="square" stroke-linejoin="miter"/>
                <path d="M 0 44 L 0 64 L 20 64"  fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="square" stroke-linejoin="miter"/>
                <path d="M 44 64 L 64 64 L 64 44" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="square" stroke-linejoin="miter"/>
            </svg>
        `;

        // Restore last known position, or place at player corner on first appearance.
        const saved = GamepadCursorManager.savedPositions.get(index);
        let initialX, initialY;
        if (saved) {
            initialX = Math.max(0, Math.min(window.innerWidth, saved.x));
            initialY = Math.max(0, Math.min(window.innerHeight, saved.y));
        } else {
            const humanIndex = this.inputManager.getHumanIndex(index);
            const qx = window.innerWidth * 0.25;
            const qy = window.innerHeight * 0.25;
            initialX = window.innerWidth / 2;
            initialY = window.innerHeight / 2;
            if (humanIndex % 4 === 0)      { initialX = qx; initialY = qy; }
            else if (humanIndex % 4 === 1) { initialX = window.innerWidth - qx; initialY = qy; }
            else if (humanIndex % 4 === 2) { initialX = qx; initialY = window.innerHeight - qy; }
            else if (humanIndex % 4 === 3) { initialX = window.innerWidth - qx; initialY = window.innerHeight - qy; }
        }

        const cursor = {
            x: initialX,
            y: initialY,
            element: el,
            controllerType: gamepad ? detectControllerType(gamepad) : 'xbox',
            lastPlayerId: -1,
            lastColor: '',
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

    /** Cycle this gamepad's player assignment forward (+1) or backward (-1). */
    _cycleAssignment(index, direction) {
        const inGame = this.game?.players?.length > 0 && !this.game?.gameOver;
        const humanCount = inGame
            ? this.game.players.filter(p => !p.isBot).length
            : parseInt(document.getElementById('human-count')?.value ?? '0') || 1;
        const slots = [...Array.from({ length: humanCount }, (_, i) => i), 'master'];
        const current = this.inputManager.getGamepadAssignment(index);
        const currentSlot = slots.indexOf(current);
        const safeSlot = currentSlot === -1 ? 0 : currentSlot;
        const nextSlot = slots[(safeSlot + direction + slots.length) % slots.length];
        this.inputManager.setGamepadAssignment(index, nextSlot);
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
        // Non-game screens: use sequential humanIndex color (same as settings dialog)
        const isNonGameScreen = !!(
            document.querySelector('#main-menu:not(.hidden)') ||
            document.querySelector('#settings-modal:not(.hidden)') ||
            document.querySelector('#howto-modal:not(.hidden)') ||
            document.querySelector('#about-modal:not(.hidden)') ||
            document.querySelector('#achievements-modal:not(.hidden)')
        );
        let colorHex;

        if (isNonGameScreen || !isMenuOpen) {
            // Non-game menus or no menu: use auto-sequential color
            const humanIndex = this.inputManager.getHumanIndex(index);
            const color = GAME.HUMAN_COLORS[humanIndex % GAME.HUMAN_COLORS.length];
            colorHex = '#' + color.toString(16).padStart(6, '0');
        } else {
            // Game context (setup, in-game, pause): use assignment color
            const assignment = this.inputManager.getGamepadAssignment(index);
            if (assignment === 'master') {
                colorHex = '#FFFFFF';
            } else {
                const color = GAME.HUMAN_COLORS[assignment % GAME.HUMAN_COLORS.length];
                colorHex = '#' + color.toString(16).padStart(6, '0');
            }
        }

        if (cursor.lastColor !== colorHex) {
            cursor.element.style.color = colorHex;
            cursor.lastColor = colorHex;
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
        const wasAnalog = cursor.mode === 'analog';
        cursor.mode = mode;
        cursor.element.classList.toggle('analog-mode', mode === 'analog');
        // Transitioning from analog → dpad: clear stale DOM focus so navigateModal
        // treats the first D-pad press as 'nothing focused' (direction-aware).
        if (wasAnalog && mode === 'dpad') {
            const prev = document.querySelector('.gamepad-focused');
            if (prev) prev.classList.remove('gamepad-focused');
            if (document.activeElement && document.activeElement !== document.body) {
                document.activeElement.blur();
            }
        }
    }

    /** Resize the cursor element to w×h CSS pixels and update SVG bracket paths. */
    _resizeCursor(cursor, w, h = w, insetPct = 0.10) {
        const inset = Math.max(w * insetPct, h * insetPct);
        w = Math.round(w - inset);
        h = Math.round(h - inset);
        const key = `${w}x${h}`;
        if (cursor._lastSz === key) return;
        cursor._lastSz = key;
        cursor.element.style.width = w + 'px';
        cursor.element.style.height = h + 'px';
        cursor.element.style.marginLeft = (-w / 2) + 'px';
        cursor.element.style.marginTop = (-h / 2) + 'px';
        const svg = cursor.element.querySelector('svg');
        if (!svg) return;
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        const b = Math.round(Math.min(w, h) * 0.3); // bracket arm length = 30% of shorter side
        const W = w, H = h;
        const paths = svg.querySelectorAll('path');
        const d = [
            `M 0 ${b} L 0 0 L ${b} 0`,
            `M ${W - b} 0 L ${W} 0 L ${W} ${b}`,
            `M 0 ${H - b} L 0 ${H} L ${b} ${H}`,
            `M ${W - b} ${H} L ${W} ${H} L ${W} ${H - b}`,
        ];
        paths.forEach((p, i) => { if (d[i]) p.setAttribute('d', d[i]); });
    }

    /** Move a cursor's crosshair to the centre of a DOM element. */
    moveCursorToElement(cursor, el) {
        const rect = el.getBoundingClientRect();
        cursor.x = Math.max(0, Math.min(window.innerWidth, rect.left + rect.width / 2));
        cursor.y = Math.max(0, Math.min(window.innerHeight, rect.top + rect.height / 2));
        // Size cursor to match the focused element exactly
        const s = this._uiScale();
        const w = Math.max(24, Math.round(rect.width / s));
        const h = Math.max(24, Math.round(rect.height / s));
        this._resizeCursor(cursor, w, h);
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

        // Nothing focused yet — direction-aware: Up → last element, otherwise → first
        if (rowIdx === -1) {
            const lastRow = rows[rows.length - 1];
            const t = isUp
                ? lastRow[lastRow.length - 1].el
                : rows[0][0].el;
            if (current) current.classList.remove('gamepad-focused');
            t.focus({ preventScroll: true });
            t.classList.add('gamepad-focused');
            t.scrollIntoView({ block: 'nearest', behavior: 'instant' });
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
            } else if (isDown && nextRowIdx >= rows.length) {
                // Scroll remaining content first; wrap only when already at the bottom
                const sc = activeContainer.querySelector('.howto-content') || activeContainer;
                const canScroll = sc.scrollHeight > sc.clientHeight;
                const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4;
                if (canScroll && !atBottom) {
                    sc.scrollBy({ top: 160, behavior: 'instant' });
                    return;
                }
                target = rows[0][0].el;
            } else if (isUp && nextRowIdx < 0) {
                // Scroll up first; wrap only when already at the top
                const sc = activeContainer.querySelector('.howto-content') || activeContainer;
                const canScroll = sc.scrollHeight > sc.clientHeight;
                if (canScroll && sc.scrollTop > 4) {
                    sc.scrollBy({ top: -160, behavior: 'instant' });
                    return;
                }
                const lastRow = rows[rows.length - 1];
                target = lastRow[lastRow.length - 1].el;
            }
        }

        if (!target) return;

        if (current) current.classList.remove('gamepad-focused');
        target.focus({ preventScroll: true });
        target.classList.add('gamepad-focused');
        target.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        this.moveCursorToElement(cursor, target);
    }

    /**
     * Watch for modals becoming visible and auto-focus their first element
     * so D-pad navigation works immediately without needing an initial Tab press.
     */
    _clearUIFocusOnModalOpen() {
        if (this._inUIFocus.size === 0 && this._sliderEditMode.size === 0) return;
        for (const idx of [...this._inUIFocus]) {
            this._inUIFocus.delete(idx);
            const cursor = this.cursors.get(idx);
            if (cursor) cursor.element.style.visibility = '';
        }
        for (const idx of [...this._sliderEditMode.keys()]) {
            this._exitSliderEditMode(idx);
        }
        // Tell input-controller to clear its uiFocusStates (removes gamepad-focused classes etc.)
        this.inputManager.emit('gamepadClearUIFocus');
    }

    _exitSliderEditMode(index) {
        const slider = this._sliderEditMode.get(index);
        if (slider) slider.classList.remove('gamepad-slider-editing');
        this._sliderEditMode.delete(index);
    }

    _adjustSlider(index, direction) {
        const slider = this._sliderEditMode.get(index);
        if (!slider) return;
        const min  = parseFloat(slider.min)  || 0;
        const max  = parseFloat(slider.max)  || 100;
        const base = parseFloat(slider.step) || 1;
        // Use at least 1/20th of the range per press so large-range sliders aren't tedious
        const step = Math.max(base, (max - min) / 20);
        const newVal = Math.min(max, Math.max(min, parseFloat(slider.value) + direction * step));
        slider.value = newVal;
        slider.dispatchEvent(new Event('input',  { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
    }

    _setupModalAutoFocus() {
        const autoFocus = (container) => {
            if (this.cursors.size === 0) return; // only when gamepad is connected
            const first = container.querySelector('[data-gamepad-autofocus]') ||
                          container.querySelector(GamepadCursorManager.FOCUSABLE);
            if (!first) return;
            setTimeout(() => {
                first.focus({ preventScroll: true });
                first.classList.add('gamepad-focused');
                // Snap ALL cursors to the focused element, regardless of mode.
                // moveCursorToElement transitions analog→dpad internally, which may
                // blur the element — so we re-focus and re-add the class afterwards.
                for (const [, cursor] of this.cursors) {
                    this.moveCursorToElement(cursor, first);
                }
                first.focus({ preventScroll: true });
                first.classList.add('gamepad-focused');
            }, 80);
        };

        this._modalObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                // dialog-overlay or standalone modal added to DOM
                if (mutation.type === 'childList') {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType !== 1) continue;
                        if (node.classList?.contains('dialog-overlay') ||
                            node.classList?.contains('modal')) {
                            this._clearUIFocusOnModalOpen();
                            autoFocus(node);
                        }
                    }
                }
                // .modal lost its 'hidden' class → became visible
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const el = mutation.target;
                    if (el.classList?.contains('modal') && !el.classList.contains('hidden')) {
                        this._clearUIFocusOnModalOpen();
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
