import { isMobile } from '../scenarios/user-identity.js';

/**
 * InputController - Handles game input and tile interactions
 * Now uses InputManager for unified keyboard/gamepad support
 */
export class InputController {
    constructor(game, renderer, inputManager) {
        this.game = game;
        this.renderer = renderer;
        this.inputManager = inputManager;
        this.selectedTile = null;

        // Cursor state for keyboard/gamepad navigation
        this.cursorX = null;
        this.cursorY = null;
        this.cursorVisible = false;

        // Bind interaction events (mouse/touch)
        this.renderer.app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        this.renderer.app.stage.eventMode = 'static';
        this.renderer.app.stage.hitArea = this.renderer.app.screen;

        // Using pointer down/up for unified mouse/touch
        this.renderer.app.stage.on('pointerdown', this.onPointerDown.bind(this));
        this.renderer.app.stage.on('pointermove', this.onPointerMove.bind(this));
        this.renderer.app.stage.on('pointerup', this.onPointerUp.bind(this));
        this.renderer.app.stage.on('pointerupoutside', this.onPointerUp.bind(this));

        this.waitTillNoTouch = false;

        // Zoom listener (Wheel)
        this.renderer.app.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.renderer.zoom(e.deltaY, e.clientX, e.clientY);
        }, { passive: false });

        // Multi-touch state
        this.activePointers = new Map(); // pointerId -> { x, y }
        this.lastPinchDistance = null;
        this.isDragging = false;
        this.lastPos = null;
        this.panPointerId = null;

        // Subscribe to InputManager events
        this.setupInputManager();

        // Listen for turn transitions
        this.game.on('turnStart', () => this.onTurnStart());
    }



    setupInputManager() {
        if (!this.inputManager) return;

        this.inputManager.on('move', (dir) => this.onMove(dir));
        this.inputManager.on('confirm', () => this.onConfirm());
        this.inputManager.on('cancel', () => this.onCancel());
        this.inputManager.on('endTurn', (data) => this.onEndTurn(data));
        this.inputManager.on('pan', (dir) => this.onPan(dir));
        this.inputManager.on('panAnalog', (dir) => this.onPanAnalog(dir));
    }

    onMove(data) {
        if (this.renderer.editorActive) return;
        const { x: dx, y: dy, index } = data;
        if (!this.game.players || this.game.players.length === 0) return;
        if (this.game.gameOver) return;
        if (this.game.currentPlayer.isBot) return;

        // Hide mouse hover, show keyboard cursor
        this.cursorVisible = true;
        this.renderer.setHover(null, null);

        // If tile is selected, try to attack/interact in direction
        if (this.selectedTile) {
            this.handleKeyboardAttack(dx, dy, index);
            return;
        }

        // No tile selected - move cursor
        if (this.cursorX === null || this.cursorY === null) {
            // Initialize cursor at nearest owned tile
            this.initCursorAtNearestTile(index);
            return;
        }

        // Move cursor to next valid tile in direction
        this.moveCursor(dx, dy, index);
    }

    initCursorAtNearestTile(gamepadIndex = -1) {
        const playerId = this.game.currentPlayer.id;
        const ownedTiles = [];

        // Find all owned tiles
        for (let y = 0; y < this.game.map.height; y++) {
            for (let x = 0; x < this.game.map.width; x++) {
                const tile = this.game.map.getTile(x, y);
                if (tile && tile.owner === playerId) {
                    ownedTiles.push({ x, y, dice: tile.dice });
                }
            }
        }

        if (ownedTiles.length === 0) return;

        // Prefer tiles with dice > 1 (can attack)
        const attackableTiles = ownedTiles.filter(t => t.dice > 1);
        const candidates = attackableTiles.length > 0 ? attackableTiles : ownedTiles;

        // Find tile closest to center of map
        const centerX = this.game.map.width / 2;
        const centerY = this.game.map.height / 2;

        let closest = candidates[0];
        let minDist = Infinity;

        for (const t of candidates) {
            const dist = Math.abs(t.x - centerX) + Math.abs(t.y - centerY);
            if (dist < minDist) {
                minDist = dist;
                closest = t;
            }
        }

        this.cursorX = closest.x;
        this.cursorY = closest.y;
        this.renderer.setCursor(this.cursorX, this.cursorY);

        if (gamepadIndex !== -1) {
            this.syncGamepadCursor(gamepadIndex);
        }
    }

    moveCursor(dx, dy, gamepadIndex = -1) {
        // Allow moving to any position within map bounds, even if blocked
        const newX = Math.max(0, Math.min(this.game.map.width - 1, this.cursorX + dx));
        const newY = Math.max(0, Math.min(this.game.map.height - 1, this.cursorY + dy));

        if (newX !== this.cursorX || newY !== this.cursorY) {
            this.cursorX = newX;
            this.cursorY = newY;
            this.renderer.setCursor(this.cursorX, this.cursorY);

            if (gamepadIndex !== -1) {
                this.syncGamepadCursor(gamepadIndex);
            }
        }
    }

    onConfirm() {
        if (!this.game.players || this.game.players.length === 0) return;
        if (this.game.gameOver) return;
        if (this.game.currentPlayer.isBot) return;

        // If cursor not visible, initialize it
        if (!this.cursorVisible || this.cursorX === null) {
            this.cursorVisible = true;
            this.initCursorAtNearestTile();
            return;
        }

        const tile = this.game.map.getTile(this.cursorX, this.cursorY);
        if (!tile) return;

        // If nothing selected, try to select tile at cursor
        if (!this.selectedTile) {
            if (tile.owner === this.game.currentPlayer.id && tile.dice > 1) {
                this.select(this.cursorX, this.cursorY);
            }
            return;
        }

        // If something selected, handle like a click on cursor position
        this.handleTileClick(tile, this.cursorX, this.cursorY, index);
    }

    onCancel() {
        if (this.selectedTile) {
            this.deselect();
        } else if (this.cursorVisible) {
            // Hide cursor
            this.cursorVisible = false;
            this.renderer.setCursor(null, null);
        }
    }

    onEndTurn(data) {
        // Emit end turn event (main.js will handle the actual end turn)
        // We need to use a callback or event for this
        if (this.onEndTurnCallback) {
            this.onEndTurnCallback(data);
        }
    }

    setEndTurnCallback(callback) {
        this.onEndTurnCallback = callback;
    }

    onPan(dir) {
        // Keyboard panning (IJKL) - dir is { x: -1/0/1, y: -1/0/1 }
        const panSpeed = 10;
        this.renderer.pan(dir.x * panSpeed, dir.y * panSpeed);
    }

    onPanAnalog(dir) {
        // Gamepad right stick panning - dir is { x: -1 to 1, y: -1 to 1 }
        const panSpeed = 15;
        this.renderer.pan(dir.x * panSpeed, dir.y * panSpeed);

        // Handle analog zoom (from R1/R2 buttons)
        if (dir.zoom) {
            this.renderer.zoom(dir.zoom * 20, window.innerWidth / 2, window.innerHeight / 2);
        }
    }

    onPointerDown(e) {
        if (this.waitTillNoTouch) return;

        // Track the pointer
        this.activePointers.set(e.pointerId, { x: e.global.x, y: e.global.y });

        // Mouse interaction hides keyboard cursor
        this.cursorVisible = false;
        this.renderer.setCursor(null, null);

        // Check input types
        const isRightClick = e.button === 2;
        const isMiddleClick = e.button === 1;
        const isShiftHeld = e.shiftKey || (e.originalEvent && e.originalEvent.shiftKey);

        if (isRightClick) {
            this.deselect();
            return;
        }

        // When editor is open and using mouse: left click must NOT pan (editor handles it)
        const isEditorMouse = this.renderer.editorActive && e.pointerType === 'mouse' && e.button === 0;
        if (isEditorMouse) {
            // Don't start drag - editor will handle left click for tile editing
        } else
            // Handle initial pinch state
            if (this.activePointers.size === 2 && !isMobile()) {
                this.lastPinchDistance = this.calculatePinchDistance();
                this.isDragging = false; // Stop dragging when pinch starts
                this.panPointerId = null;
            } else if (this.activePointers.size === 1) {
                // Drag Logic:
                // - Allow Middle Click
                // - Allow Left Click (if NOT holding Shift AND NOT a simulated gamepad event)
                // - Skip Left Click when editor is open + mouse (editor handles it)
                const isSimulated = (e.nativeEvent && e.nativeEvent.isGamepadSimulated) ||
                    (e.originalEvent && e.originalEvent.isGamepadSimulated) ||
                    e.isGamepadSimulated;
                const canDrag = isMiddleClick || (!isShiftHeld && e.button === 0 && !isSimulated && !isEditorMouse);

                if (canDrag) {
                    this.isDragging = true;
                    this.lastPos = { x: e.global.x, y: e.global.y };
                    this.panPointerId = e.pointerId;
                }
            }

        const globalPos = e.global;
        const localPos = this.renderer.grid.container.toLocal(globalPos);
        const tileX = Math.floor(localPos.x / (this.renderer.grid.tileSize + this.renderer.grid.gap));
        const tileY = Math.floor(localPos.y / (this.renderer.grid.tileSize + this.renderer.grid.gap));
        const tile = this.game.map.getTile(tileX, tileY);

        this.clickTarget = tile ? { tile, x: tileX, y: tileY } : null;
        this.startDragPos = { x: e.global.x, y: e.global.y };
    }

    onPointerMove(e) {
        // Update pointer position
        if (this.activePointers.has(e.pointerId)) {
            this.activePointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
        }

        if (this.activePointers.size === 2 && !isMobile()) {
            // Handle Pinch-to-Zoom
            const currentDistance = this.calculatePinchDistance();
            if (this.lastPinchDistance !== null && currentDistance > 0) {
                // Pinched distance changed?
                const diff = Math.abs(currentDistance - this.lastPinchDistance);

                // Only zoom if the movement is significant (at least 2 pixels)
                if (diff > 2) {
                    const ratio = this.lastPinchDistance / currentDistance;

                    // Use the center of the fingers as the zoom anchor
                    const pointers = Array.from(this.activePointers.values());
                    const centerX = (pointers[0].x + pointers[1].x) / 2;
                    const centerY = (pointers[0].y + pointers[1].y) / 2;

                    // Zoom factor is inverted because deltaY > 0 means zoom out in renderer.zoom
                    // Reduced sensitivity: only trigger zoom if ratio is far enough from 1
                    if (ratio > 1.02) { // Fingers moved closer - Zoom Out
                        this.renderer.zoom(1, centerX, centerY);
                        this.lastPinchDistance = currentDistance;
                    } else if (ratio < 0.98) { // Fingers moved apart - Zoom In
                        this.renderer.zoom(-1, centerX, centerY);
                        this.lastPinchDistance = currentDistance;
                    }
                }
            } else {
                this.lastPinchDistance = currentDistance;
            }
        } else if (this.isDragging && e.pointerId === this.panPointerId) {
            // Stable Panning: only follow the first finger
            const dx = e.global.x - this.lastPos.x;
            const dy = e.global.y - this.lastPos.y;

            this.renderer.pan(dx, dy);
            this.lastPos = { x: e.global.x, y: e.global.y };
        } else if (this.activePointers.size <= 1) {
            // Hover Logic - only if cursor not in keyboard mode and NOT dragging
            if (this.cursorVisible) return;

            const globalPos = e.global;
            const localPos = this.renderer.grid.container.toLocal(globalPos);

            const tileX = Math.floor(localPos.x / (this.renderer.grid.tileSize + this.renderer.grid.gap));
            const tileY = Math.floor(localPos.y / (this.renderer.grid.tileSize + this.renderer.grid.gap));

            const tileRaw = this.game.map.getTileRaw(tileX, tileY);
            if (tileRaw) {
                this.renderer.setHover(tileX, tileY);
            } else {
                this.renderer.setHover(null, null);
            }
        }
    }

    onPointerUp(e) {
        this.activePointers.delete(e.pointerId);

        if (this.activePointers.size === 0) {
            this.waitTillNoTouch = false;
        }

        if (this.activePointers.size < 2) {
            this.lastPinchDistance = null;
        }

        if (e.pointerId === this.panPointerId) {
            this.isDragging = false;
            this.panPointerId = null;
        }

        // Guard against missing startDragPos
        if (!this.startDragPos) {
            this.clickTarget = null;
            return;
        }

        // Check if it was a click (little movement)
        const dist = Math.abs(e.global.x - this.startDragPos.x) + Math.abs(e.global.y - this.startDragPos.y);

        // Only handle clicks for LEFT mouse button (0)
        // Middle button (1) is for pan only
        // When editor is open + mouse: editor handles clicks, not the game
        const isEditorMouseClick = this.renderer.editorActive && e.pointerType === 'mouse' && e.button === 0;
        const isSimulated = (e.nativeEvent && e.nativeEvent.isGamepadSimulated) ||
            (e.originalEvent && e.originalEvent.isGamepadSimulated) ||
            e.isGamepadSimulated;
        if (!isEditorMouseClick && (dist < 10 || isSimulated) && e.button === 0) {
            // It's a click (and not editor mode)
            const gamepadIndex = (e.nativeEvent && e.nativeEvent.gamepadIndex !== undefined) ? e.nativeEvent.gamepadIndex :
                (e.originalEvent && e.originalEvent.gamepadIndex !== undefined) ? e.originalEvent.gamepadIndex :
                    e.gamepadIndex;

            if (this.clickTarget) {
                this.handleTileClick(this.clickTarget.tile, this.clickTarget.x, this.clickTarget.y);
            } else {
                this.deselect();
            }
        }

        this.clickTarget = null;
    }

    handleTileClick(tile, x, y) {
        if (this.game.gameOver) return;
        if (this.game.currentPlayer.isBot) return;

        // 1. If nothing selected, try to select
        if (!this.selectedTile) {
            if (!tile) return;
            const owner = this.game.players.find(p => p.id === tile.owner);
            const isEnemy = owner && owner.id !== this.game.currentPlayer.id;

            // Direct attack shortcut: If clicking enemy tile with exactly ONE adjacent attacker
            if (isEnemy) {
                const attackers = [];
                const neighbors = [
                    { x: x, y: y - 1 }, { x: x, y: y + 1 },
                    { x: x - 1, y: y }, { x: x + 1, y: y }
                ];

                for (const n of neighbors) {
                    const nTile = this.game.map.getTile(n.x, n.y);
                    if (nTile && nTile.owner === this.game.currentPlayer.id && nTile.dice > 1) {
                        attackers.push(n);
                    }
                }

                if (attackers.length === 1) {
                    const attacker = attackers[0];
                    const result = this.game.attack(attacker.x, attacker.y, x, y);
                    if (result && !result.error && result.won) {
                        this.select(x, y);
                    }
                    return;
                }
            }

            // Standard selection: Allow any human player to select any of their tiles
            if (owner && !owner.isBot) {
                this.select(x, y);
            }
            return;
        }

        // 2. If something selected, handle action
        if (!tile) {
            this.deselect();
            return;
        }

        if (this.selectedTile.x === x && this.selectedTile.y === y) {
            this.deselect();
            return;
        }

        const fromTile = this.game.map.getTile(this.selectedTile.x, this.selectedTile.y);
        if (!fromTile) {
            this.deselect();
            return;
        }

        // A. Clicked another tile owned by a human (not necessarily the current one) -> Change selection
        const targetOwner = this.game.players.find(p => p.id === tile.owner);
        if (targetOwner && !targetOwner.isBot && tile.owner === fromTile.owner) {
            this.select(x, y);
            return;
        }

        // B. Try Attack (if it's the current player's turn and tile is a neighbor)
        if (fromTile.owner === this.game.currentPlayer.id) {
            const isAdjacent = Math.abs(this.selectedTile.x - x) + Math.abs(this.selectedTile.y - y) === 1;

            if (isAdjacent && tile.owner !== fromTile.owner && fromTile.dice > 1) {
                const result = this.game.attack(this.selectedTile.x, this.selectedTile.y, x, y);

                if (result && !result.error) {
                    if (result.won) {
                        this.select(x, y);
                    } else {
                        this.deselect();
                    }
                }
                return;
            }
        }

        // C. Default: deselect if clicking elsewhere
        this.deselect();
    }

    handleKeyboardAttack(dx, dy, gamepadIndex = -1) {
        if (this.game.gameOver || !this.selectedTile || this.game.currentPlayer.isBot) return;

        const targetX = this.selectedTile.x + dx;
        const targetY = this.selectedTile.y + dy;

        const targetTile = this.game.map.getTile(targetX, targetY);
        if (!targetTile) return;

        this.handleTileClick(targetTile, targetX, targetY);

        // Update cursor position to the target of the attack/click
        if (gamepadIndex !== -1) {
            // After an attack, the "highlight" usually moves to the won tile anyway in select()
            // but we ensure it here too for consistency
            this.syncGamepadCursor(gamepadIndex);
        }
    }

    select(x, y) {
        this.selectedTile = { x, y };
        this.cursorX = x;
        this.cursorY = y;
        this.renderer.setSelection(x, y);
        if (this.cursorVisible) {
            this.renderer.setCursor(x, y);
        }
        // Note: we don't sync gamepad cursor here blindly because select() is called
        // by multiple things (mouse clicks too). onMove handles the gamepad syncing.
    }

    syncGamepadCursor(index) {
        if (this.cursorX === null || this.cursorY === null) return;

        const screenPos = this.renderer.getTileScreenPosition(this.cursorX, this.cursorY);
        if (screenPos) {
            this.inputManager.emit('gamepadCursorMoveRequest', {
                index: index,
                x: screenPos.x,
                y: screenPos.y
            });
        }
    }

    calculatePinchDistance() {
        const pointers = Array.from(this.activePointers.values());
        if (pointers.length < 2) return 0;
        const dx = pointers[0].x - pointers[1].x;
        const dy = pointers[0].y - pointers[1].y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    deselect() {
        this.selectedTile = null;
        this.renderer.setSelection(null, null);
    }

    onTurnStart() {
        if (this.selectedTile) {
            const tile = this.game.map.getTile(this.selectedTile.x, this.selectedTile.y);

            // If the current player is a bot, just hide the selection visually (keep it internally)
            if (this.game.currentPlayer.isBot) {
                this.renderer.setSelection(null, null);
                return;
            }

            // Deselect if tile doesn't exist or is not owned by the CURRENT player
            if (!tile || tile.owner !== this.game.currentPlayer.id) {
                this.deselect();
            } else {
                // Restore the visual selection for the human player
                this.renderer.setSelection(this.selectedTile.x, this.selectedTile.y);
            }
        }

        if (this.cursorX !== null && this.cursorY !== null) {
            const tile = this.game.map.getTile(this.cursorX, this.cursorY);
            if (!tile) {
                this.cursorX = null;
                this.cursorY = null;
                this.renderer.setCursor(null, null);
            }
        }
    }
}
