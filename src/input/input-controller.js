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

        // Zoom listener (Wheel)
        this.renderer.app.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.renderer.zoom(e.deltaY, e.clientX, e.clientY);
        }, { passive: false });

        // === Touches ===
        // We only care about single touch for dragging/clicking.
        // Pinch-to-zoom is removed in favor of UI buttons.

        this.renderer.app.canvas.addEventListener('touchstart', (e) => {
            // Prevent browser zoom/scroll if multiple touches
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        }, { passive: false });

        this.renderer.app.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        }, { passive: false });

        // Zoom/Pan state
        this.isDragging = false;
        this.lastPos = null;

        // Subscribe to InputManager events
        this.setupInputManager();
    }



    setupInputManager() {
        if (!this.inputManager) return;

        this.inputManager.on('move', (dir) => this.onMove(dir));
        this.inputManager.on('confirm', () => this.onConfirm());
        this.inputManager.on('cancel', () => this.onCancel());
        this.inputManager.on('endTurn', () => this.onEndTurn());
        this.inputManager.on('pan', (dir) => this.onPan(dir));
        this.inputManager.on('panAnalog', (dir) => this.onPanAnalog(dir));
    }

    onMove(dir) {
        if (!this.game.players || this.game.players.length === 0) return;
        if (this.game.gameOver) return;
        if (this.game.currentPlayer.isBot) return;

        // Hide mouse hover, show keyboard cursor
        this.cursorVisible = true;
        this.renderer.setHover(null, null);

        // If tile is selected, try to attack/interact in direction
        if (this.selectedTile) {
            this.handleKeyboardAttack(dir.x, dir.y);
            return;
        }

        // No tile selected - move cursor
        if (this.cursorX === null || this.cursorY === null) {
            // Initialize cursor at nearest owned tile
            this.initCursorAtNearestTile();
            return;
        }

        // Move cursor to next valid tile in direction
        this.moveCursor(dir.x, dir.y);
    }

    initCursorAtNearestTile() {
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
    }

    moveCursor(dx, dy) {
        // Allow moving to any position within map bounds, even if blocked
        const newX = Math.max(0, Math.min(this.game.map.width - 1, this.cursorX + dx));
        const newY = Math.max(0, Math.min(this.game.map.height - 1, this.cursorY + dy));

        if (newX !== this.cursorX || newY !== this.cursorY) {
            this.cursorX = newX;
            this.cursorY = newY;
            this.renderer.setCursor(this.cursorX, this.cursorY);
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
        this.handleTileClick(tile, this.cursorX, this.cursorY);
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

    onEndTurn() {
        // Emit end turn event (main.js will handle the actual end turn)
        // We need to use a callback or event for this
        if (this.onEndTurnCallback) {
            this.onEndTurnCallback();
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
        this.renderer.pan(-dir.x * panSpeed, -dir.y * panSpeed);
    }

    onPointerDown(e) {
        // Mouse interaction hides keyboard cursor
        this.cursorVisible = false;
        this.renderer.setCursor(null, null);

        // Check input types
        const isRightClick = e.button === 2;
        const isMiddleClick = e.button === 1;

        // Fix: Check modifiers correctly on Pixi FederatedPointerEvent
        // It has .shiftKey directly, or we fall back to originalEvent
        const isShiftHeld = e.shiftKey || (e.originalEvent && e.originalEvent.shiftKey);

        if (isRightClick) { // Right click
            this.deselect();
            return;
        }

        // Drag Logic:
        // - Allow Middle Click
        // - Allow Left Click (if NOT holding Shift)
        // - If Shift is held, we NEVER drag (it's for editor painting or other interactions)
        const canDrag = isMiddleClick || (!isShiftHeld && e.button === 0);

        if (canDrag) {
            this.isDragging = true;
            this.lastPos = { x: e.global.x, y: e.global.y };
        }

        const globalPos = e.global;
        // Convert to local grid coordinates
        const localPos = this.renderer.grid.container.toLocal(globalPos);

        const tileX = Math.floor(localPos.x / (this.renderer.grid.tileSize + this.renderer.grid.gap));
        const tileY = Math.floor(localPos.y / (this.renderer.grid.tileSize + this.renderer.grid.gap));

        const tile = this.game.map.getTile(tileX, tileY);

        // Store potential click target (don't select yet, wait for Up to distinguish click vs drag)
        this.clickTarget = tile ? { tile, x: tileX, y: tileY } : null;
        this.startDragPos = { x: e.global.x, y: e.global.y };
    }

    onPointerMove(e) {
        if (this.isDragging) {
            const dx = e.global.x - this.lastPos.x;
            const dy = e.global.y - this.lastPos.y;

            this.renderer.pan(dx, dy);
            this.lastPos = { x: e.global.x, y: e.global.y };
        } else {
            // Hover Logic - only if cursor not in keyboard mode
            if (this.cursorVisible) return;

            const globalPos = e.global;
            const localPos = this.renderer.grid.container.toLocal(globalPos);

            const tileX = Math.floor(localPos.x / (this.renderer.grid.tileSize + this.renderer.grid.gap));
            const tileY = Math.floor(localPos.y / (this.renderer.grid.tileSize + this.renderer.grid.gap));

            // Use getTileRaw to keep hover active even on blocked tiles
            const tileRaw = this.game.map.getTileRaw(tileX, tileY);
            if (tileRaw) {
                this.renderer.setHover(tileX, tileY);
            } else {
                this.renderer.setHover(null, null);
            }
        }
    }

    onPointerUp(e) {
        this.isDragging = false;

        // Check if it was a click (little movement)
        const dist = Math.abs(e.global.x - this.startDragPos.x) + Math.abs(e.global.y - this.startDragPos.y);

        // Only handle clicks for LEFT mouse button (0)
        // Middle button (1) is for pan only
        if (dist < 10 && e.button === 0) {
            // It's a click
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
        if (this.game.currentPlayer.isBot) return; // Wait for bot

        // 1. If nothing selected, try to select
        if (!this.selectedTile) {
            if (tile && tile.owner === this.game.currentPlayer.id && tile.dice > 1) {
                this.select(x, y);
            }
            return;
        }

        // 2. If something selected and clicked "nothing" (blocked or out of bounds)
        if (!tile) {
            this.deselect();
            return;
        }

        const prevX = this.selectedTile.x;
        const prevY = this.selectedTile.y;

        // A. Clicked same tile -> Deselect
        if (prevX === x && prevY === y) {
            this.deselect();
            return;
        }

        // B. Clicked another own tile -> Change selection
        if (tile.owner === this.game.currentPlayer.id) {
            if (tile.dice > 1) {
                this.select(x, y);
            } else {
                this.deselect();
            }
            return;
        }

        // C. Clicked enemy -> Try Attack
        const result = this.game.attack(prevX, prevY, x, y);

        if (result && !result.error) {
            // Haptic feedback
            if (this.inputManager) {
                this.inputManager.vibrate(result.won ? 'win' : 'lose');
            }

            if (result.won) {
                this.select(x, y);
                // Move cursor to new position
                this.cursorX = x;
                this.cursorY = y;
            } else {
                this.deselect();
            }
        } else {
            console.log("Invalid attack");
        }
    }

    handleKeyboardAttack(dx, dy) {
        if (this.game.gameOver || !this.selectedTile || this.game.currentPlayer.isBot) return;

        const targetX = this.selectedTile.x + dx;
        const targetY = this.selectedTile.y + dy;

        const targetTile = this.game.map.getTile(targetX, targetY);
        if (!targetTile) return;

        // Reuse the logic from tile click (handle enemy vs own tile)
        this.handleTileClick(targetTile, targetX, targetY);
    }

    select(x, y) {
        this.selectedTile = { x, y };
        this.cursorX = x;
        this.cursorY = y;
        this.renderer.setSelection(x, y);
        if (this.cursorVisible) {
            this.renderer.setCursor(x, y);
        }
    }

    deselect() {
        this.selectedTile = null;
        this.renderer.setSelection(null, null);
    }

    // Reset cursor on turn change
    onTurnStart() {
        // Validate existing selection
        if (this.selectedTile) {
            const tile = this.game.map.getTile(this.selectedTile.x, this.selectedTile.y);
            if (!tile || tile.owner !== this.game.currentPlayer.id || tile.dice <= 1) {
                this.deselect();
            }
        }

        // Validate cursor position
        if (this.cursorX !== null && this.cursorY !== null) {
            const tile = this.game.map.getTile(this.cursorX, this.cursorY);
            if (!tile) {
                // Cursor on invalid tile, reset on next move
                this.cursorX = null;
                this.cursorY = null;
                this.renderer.setCursor(null, null);
            }
        }
    }
}
