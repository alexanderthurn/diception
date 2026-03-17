import { isMobile } from '../scenarios/user-identity.js';

/**
 * InputController - Handles game input and tile interactions
 * Per-source selection: each gamepad and mouse/keyboard has independent state.
 * sourceId: 'mouse' for keyboard/mouse, 'gamepad-N' for gamepad index N.
 */
export class InputController {
    constructor(game, renderer, inputManager) {
        this.game = game;
        this.renderer = renderer;
        this.inputManager = inputManager;

        // Per-source state: Map<sourceId, {x, y, visible}>
        this.cursorStates = new Map();
        // Per-source selection: Map<sourceId, {x, y}>
        this.selectedTiles = new Map();

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

        // Zoom listener (Wheel) - also detect trackpad vs mouse for editor pan behavior
        this.renderer.app.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const looksLikeMouseStep = e.deltaMode === 0 && Math.abs(e.deltaY) > 4 && Math.abs(e.deltaX) === 0;
            const isPinch = e.ctrlKey || e.metaKey;
            if (!isPinch) {
                this.renderer.likelyTrackpad = !looksLikeMouseStep;
            }
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

    /** Get or create cursor state for a source */
    _getCursorState(sourceId) {
        if (!this.cursorStates.has(sourceId)) {
            this.cursorStates.set(sourceId, { x: null, y: null, visible: false });
        }
        return this.cursorStates.get(sourceId);
    }

    /** Derive sourceId from gamepad index (-1 = keyboard/mouse) */
    _sourceId(gamepadIndex) {
        return gamepadIndex >= 0 ? 'gamepad-' + gamepadIndex : 'mouse';
    }

    setupInputManager() {
        if (!this.inputManager) return;

        this.inputManager.on('move', (dir) => this.onMove(dir));
        this.inputManager.on('confirm', (data) => this.onConfirm(data));
        this.inputManager.on('cancel', (data) => this.onCancel(data));
        this.inputManager.on('endTurn', (data) => this.onEndTurn(data));
        this.inputManager.on('pan', (dir) => this.onPan(dir));
        this.inputManager.on('panAnalog', (dir) => this.onPanAnalog(dir));
        this.inputManager.on('zoom', (data) => this.onZoom(data));
    }

    onMove(data) {
        if (this.renderer.editorActive) return;
        const { x: dx, y: dy, index } = data;
        if (!this.game.players || this.game.players.length === 0) return;
        if (this.game.gameOver) return;
        if (!this._sourceCanAct(index)) return;

        const sourceId = this._sourceId(index);
        const cursorState = this._getCursorState(sourceId);

        // Show D-pad cursor, hide same-source hover
        cursorState.visible = true;
        this.renderer.setHover(null, null, sourceId);

        // If tile is selected for this source, try to attack in direction
        if (this.selectedTiles.has(sourceId)) {
            this.handleKeyboardAttack(dx, dy, index, sourceId);
            return;
        }

        // No tile selected - move cursor
        if (cursorState.x === null || cursorState.y === null) {
            this.initCursorAtNearestTile(index, sourceId);
            return;
        }

        this.moveCursor(dx, dy, index, sourceId);
    }

    initCursorAtNearestTile(gamepadIndex = -1, sourceId = 'mouse') {
        const playerId = this.game.currentPlayer.id;
        const ownedTiles = [];

        for (let y = 0; y < this.game.map.height; y++) {
            for (let x = 0; x < this.game.map.width; x++) {
                const tile = this.game.map.getTile(x, y);
                if (tile && tile.owner === playerId) {
                    ownedTiles.push({ x, y, dice: tile.dice });
                }
            }
        }

        if (ownedTiles.length === 0) return;

        const attackableTiles = ownedTiles.filter(t => t.dice > 1);
        const candidates = attackableTiles.length > 0 ? attackableTiles : ownedTiles;

        const centerX = this.game.map.width / 2;
        const centerY = this.game.map.height / 2;

        let closest = candidates[0];
        let minDist = Infinity;
        for (const t of candidates) {
            const dist = Math.abs(t.x - centerX) + Math.abs(t.y - centerY);
            if (dist < minDist) { minDist = dist; closest = t; }
        }

        const cursorState = this._getCursorState(sourceId);
        cursorState.x = closest.x;
        cursorState.y = closest.y;
        this.renderer.setCursor(cursorState.x, cursorState.y, sourceId);

        if (gamepadIndex !== -1) {
            this.syncGamepadCursor(gamepadIndex, sourceId);
        }
    }

    moveCursor(dx, dy, gamepadIndex = -1, sourceId = 'mouse') {
        const cursorState = this._getCursorState(sourceId);
        const newX = Math.max(0, Math.min(this.game.map.width - 1, cursorState.x + dx));
        const newY = Math.max(0, Math.min(this.game.map.height - 1, cursorState.y + dy));

        if (newX !== cursorState.x || newY !== cursorState.y) {
            cursorState.x = newX;
            cursorState.y = newY;
            this.renderer.setCursor(cursorState.x, cursorState.y, sourceId);
        }

        if (gamepadIndex !== -1) {
            this.syncGamepadCursor(gamepadIndex, sourceId);
        }
    }

    onConfirm(data) {
        if (!this.game.players || this.game.players.length === 0) return;
        if (this.game.gameOver) return;
        const gpIndex = data?.source === 'gamepad' ? (data?.index ?? -1) : -1;
        if (!this._sourceCanAct(gpIndex)) return;

        const source = data?.source ?? 'keyboard';
        const index = source === 'gamepad' ? (data?.index ?? -1) : -1;
        const sourceId = this._sourceId(index);
        const cursorState = this._getCursorState(sourceId);

        // Analog cursor mode: GamepadCursorManager fires pointer events for this button — skip D-pad handling.
        if (source === 'gamepad') {
            const gcm = this.inputManager.gamepadCursorManager;
            if (gcm?.cursors?.get(index)?.mode === 'analog') return;
        }

        if (!cursorState.visible) {
            cursorState.visible = true;
            if (cursorState.x === null || cursorState.y === null) {
                this.initCursorAtNearestTile(index, sourceId);
            } else {
                this.renderer.setCursor(cursorState.x, cursorState.y, sourceId);
            }
            return;
        }

        const tile = this.game.map.getTile(cursorState.x, cursorState.y);
        if (!tile) return;

        if (!this.selectedTiles.has(sourceId)) {
            const isParallelConfirm = ['parallel', 'parallel-s'].includes(this.game.playMode);
            const owner = this.game.players.find(p => p.id === tile.owner);
            const canSelect = isParallelConfirm
                ? (owner && !owner.isBot && this._sourceCanControlPlayer(sourceId, tile.owner))
                : (tile.owner === this.game.currentPlayer.id);
            if (canSelect && tile.dice > 1) {
                this.select(cursorState.x, cursorState.y, sourceId);
            }
            return;
        }

        this.handleTileClick(tile, cursorState.x, cursorState.y, sourceId);
    }

    onCancel(data) {
        const index = data?.source === 'gamepad' ? (data?.index ?? -1) : -1;
        const sourceId = this._sourceId(index);
        const cursorState = this._getCursorState(sourceId);

        if (this.selectedTiles.has(sourceId)) {
            this.deselect(sourceId);
        } else if (cursorState.visible) {
            cursorState.visible = false;
            this.renderer.setCursor(null, null, sourceId);
        }
    }

    onEndTurn(data) {
        if (this.onEndTurnCallback) {
            this.onEndTurnCallback(data);
        }
    }

    setEndTurnCallback(callback) {
        this.onEndTurnCallback = callback;
    }

    onPan(dir) {
        const panSpeed = 4;
        this.renderer.pan(dir.x * panSpeed, dir.y * panSpeed);
    }

    onZoom(data) {
        this.renderer.zoom(data.direction, window.innerWidth / 2, window.innerHeight / 2);
    }

    onPanAnalog(dir) {
        const panSpeed = 15;
        this.renderer.pan(dir.x * panSpeed, dir.y * panSpeed);

        if (dir.zoom) {
            this.renderer.zoom(dir.zoom * 20, window.innerWidth / 2, window.innerHeight / 2);
        }
    }

    /** Detect gamepad-simulated pointer events (distinct from real mouse/touch) */
    _isGamepadSimulated(e) {
        return e.isGamepadSimulated ||
            (e.nativeEvent && e.nativeEvent.isGamepadSimulated) ||
            (e.originalEvent && e.originalEvent.isGamepadSimulated);
    }

    onPointerDown(e) {
        if (this.waitTillNoTouch) return;

        // Gamepads inject simulated pointer events tagged with isGamepadSimulated.
        // Do NOT use pointerId >= 100 here: iOS Safari touch pointerId can exceed 100.
        const isSimulatedDown = this._isGamepadSimulated(e);
        if (!isSimulatedDown) {
            this.activePointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
        }

        // Real mouse pointer: hide 'mouse' D-pad bracket cursor
        if (!isSimulatedDown) {
            const mouseState = this._getCursorState('mouse');
            mouseState.visible = false;
            this.renderer.setCursor(null, null, 'mouse');
        }

        const isRightClick = e.button === 2;
        const isMiddleClick = e.button === 1;
        const isShiftHeld = e.shiftKey || (e.originalEvent && e.originalEvent.shiftKey);

        if (isRightClick) {
            const sourceId = isSimulatedDown ? 'gamepad-' + this._getEventGamepadIndex(e) : 'mouse';
            this.deselect(sourceId);
            return;
        }

        const isEditorMouse = this.renderer.editorActive && e.pointerType === 'mouse' && e.button === 0 && !this.renderer.likelyTrackpad;
        if (isEditorMouse) {
            // Don't start drag - editor will handle left click for tile editing
        } else if (this.activePointers.size === 2 && !isMobile()) {
            this.lastPinchDistance = this.calculatePinchDistance();
            this.isDragging = false;
            this.panPointerId = null;
        } else if (this.activePointers.size === 1) {
            const isTouch = e.pointerType === 'touch';
            const canDrag = isMiddleClick || (!isShiftHeld && (e.button === 0 || isTouch) && !isSimulatedDown && !isEditorMouse);

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
        if (this.activePointers.has(e.pointerId)) {
            this.activePointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
        }

        if (this.activePointers.size === 2 && !isMobile()) {
            const currentDistance = this.calculatePinchDistance();
            if (this.lastPinchDistance !== null && currentDistance > 0) {
                const diff = Math.abs(currentDistance - this.lastPinchDistance);
                if (diff > 2) {
                    const ratio = this.lastPinchDistance / currentDistance;
                    const pointers = Array.from(this.activePointers.values());
                    const centerX = (pointers[0].x + pointers[1].x) / 2;
                    const centerY = (pointers[0].y + pointers[1].y) / 2;
                    if (ratio > 1.02) {
                        this.renderer.zoom(1, centerX, centerY);
                        this.lastPinchDistance = currentDistance;
                    } else if (ratio < 0.98) {
                        this.renderer.zoom(-1, centerX, centerY);
                        this.lastPinchDistance = currentDistance;
                    }
                }
            } else {
                this.lastPinchDistance = currentDistance;
            }
        } else if (this.isDragging && e.pointerId === this.panPointerId) {
            const dx = e.global.x - this.lastPos.x;
            const dy = e.global.y - this.lastPos.y;
            this.renderer.pan(dx, dy);
            this.lastPos = { x: e.global.x, y: e.global.y };
        } else if (this.activePointers.size <= 1) {
            const isSimulated = this._isGamepadSimulated(e);

            // Real mouse move: hide 'mouse' D-pad bracket cursor
            if (!isSimulated) {
                const mouseState = this._getCursorState('mouse');
                if (mouseState.visible) {
                    mouseState.visible = false;
                    this.renderer.setCursor(null, null, 'mouse');
                }
            }

            // Derive cursor ID: gamepads use pointerId 100+index (see gamepad-cursor-manager.js)
            const cursorId = isSimulated ? 'gamepad-' + (e.pointerId - 100) : 'mouse';

            const globalPos = e.global;
            const localPos = this.renderer.grid.container.toLocal(globalPos);
            const tileX = Math.floor(localPos.x / (this.renderer.grid.tileSize + this.renderer.grid.gap));
            const tileY = Math.floor(localPos.y / (this.renderer.grid.tileSize + this.renderer.grid.gap));

            const tileRaw = this.game.map.getTileRaw(tileX, tileY);
            if (tileRaw) {
                this.renderer.setHover(tileX, tileY, cursorId);
            } else {
                this.renderer.setHover(null, null, cursorId);
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

        if (!this.startDragPos) {
            this.clickTarget = null;
            return;
        }

        const dist = Math.abs(e.global.x - this.startDragPos.x) + Math.abs(e.global.y - this.startDragPos.y);
        const isEditorMouseClick = this.renderer.editorActive && e.pointerType === 'mouse' && e.button === 0;
        const isSimulated = this._isGamepadSimulated(e);

        const isTouch = e.pointerType === 'touch';
        // Touch events may report button=-1 on iOS; treat touch like left-click for selection
        const isPrimaryButton = e.button === 0 || isTouch;
        if (!isEditorMouseClick && (dist < 10 || isSimulated) && isPrimaryButton) {
            const sourceId = isSimulated ? 'gamepad-' + this._getEventGamepadIndex(e) : 'mouse';

            // D-pad mode: onConfirm handles selection — skip pointer event click handling to avoid double-processing
            const gcm = this.inputManager?.gamepadCursorManager;
            const cursorMode = isSimulated ? gcm?.cursors?.get(e.pointerId - 100)?.mode : null;
            if (cursorMode === 'dpad') {
                this.clickTarget = null;
                return;
            }

            if (this.clickTarget) {
                this.handleTileClick(this.clickTarget.tile, this.clickTarget.x, this.clickTarget.y, sourceId);
            } else {
                this.deselect(sourceId);
            }
        }

        this.clickTarget = null;
    }

    /** Extract gamepad index from a Pixi pointer event. Gamepads use pointerId = 100 + rawIndex. */
    _getEventGamepadIndex(e) {
        if (e.pointerId >= 100) return e.pointerId - 100;
        return -1;
    }

    handleTileClick(tile, x, y, sourceId = 'mouse') {
        if (this.game.gameOver) return;

        const playMode = this.game.playMode || 'classic';
        const isParallel = playMode === 'parallel' || playMode === 'parallel-s';
        const gpIdx = sourceId.startsWith('gamepad-') ? parseInt(sourceId.slice('gamepad-'.length)) : -1;

        if (!isParallel) {
            // Classic: only act when it's a human's turn and this source controls that player
            if (this.game.currentPlayer.isBot) return;
            if (gpIdx >= 0 && !this.inputManager.canGamepadControlPlayer(gpIdx, this.game.currentPlayer.id)) return;
        }

        const selTile = this.selectedTiles.get(sourceId);
        const owner = tile ? this.game.players.find(p => p.id === tile.owner) : null;

        // Expert-mode direct-attack shortcut (classic only — parallel handles selection differently)
        const gamepadsConnected = this.inputManager?.connectedGamepadIndices?.size > 0;
        if (!isParallel && owner && owner.id !== this.game.currentPlayer.id &&
                this.renderer.gameSpeed === 'expert' && tile && !tile.blocked && !gamepadsConnected) {
            let attacker = null;
            let selectedWasAttacker = false;

            if (selTile) {
                const isAdjacent = Math.abs(selTile.x - x) + Math.abs(selTile.y - y) === 1;
                const fromTile = this.game.map.getTile(selTile.x, selTile.y);
                if (isAdjacent && fromTile && fromTile.owner === this.game.currentPlayer.id && fromTile.dice > 1) {
                    attacker = { x: selTile.x, y: selTile.y };
                    selectedWasAttacker = true;
                }
            }

            if (!attacker) {
                const neighbors = [
                    { x: x, y: y - 1 }, { x: x, y: y + 1 },
                    { x: x - 1, y: y }, { x: x + 1, y: y }
                ];
                const attackers = neighbors
                    .map(n => ({ ...n, t: this.game.map.getTile(n.x, n.y) }))
                    .filter(n => n.t && n.t.owner === this.game.currentPlayer.id && n.t.dice > 1)
                    .map(n => ({ x: n.x, y: n.y }));
                attacker = this.renderer.grid.pickBestAttackerForExpert(attackers, selTile);
            }

            if (attacker) {
                const result = this.game.attack(attacker.x, attacker.y, x, y);
                if (result && !result.error && result.won) {
                    if (selectedWasAttacker) this.select(x, y, sourceId);
                    else this.deselect(sourceId);
                } else if (result && !result.error) {
                    this.deselect(sourceId);
                }
                return;
            }
        }

        // Standard Interaction Logic
        if (!selTile) {
            // Only allow selecting a human player's tile that this source can control
            if (owner && !owner.isBot) {
                const canControl = isParallel
                    ? this._sourceCanControlPlayer(sourceId, owner.id)
                    : owner.id === this.game.currentPlayer.id;
                if (canControl) this.select(x, y, sourceId);
            }
            return;
        }

        if (!tile || (selTile.x === x && selTile.y === y)) {
            this.deselect(sourceId);
            return;
        }

        const fromTile = this.game.map.getTile(selTile.x, selTile.y);
        if (!fromTile) { this.deselect(sourceId); return; }

        // Determine the acting player (owner of the selected from-tile)
        const actingPlayerId = isParallel ? fromTile.owner : this.game.currentPlayer.id;

        // A. Clicked another tile of the same acting player -> change selection
        if (tile.owner === actingPlayerId) {
            // In parallel, only allow if this source controls that player
            if (!isParallel || this._sourceCanControlPlayer(sourceId, actingPlayerId)) {
                this.select(x, y, sourceId);
            }
            return;
        }

        // B. Standard Attack
        const isAdjacent = Math.abs(selTile.x - x) + Math.abs(selTile.y - y) === 1;

        // In parallel: source must control the from-tile's owner, and that owner must be human
        const fromOwner = isParallel ? this.game.players.find(p => p.id === fromTile.owner) : null;
        const canActFrom = isParallel
            ? (fromOwner && !fromOwner.isBot && this._sourceCanControlPlayer(sourceId, fromOwner.id))
            : (fromTile.owner === this.game.currentPlayer.id);

        // Parallel-S: cannot attack the currently-active player's tiles
        const canAttackTarget = playMode !== 'parallel-s' || tile.owner !== this.game.currentPlayer.id;

        if (isAdjacent && tile.owner !== fromTile.owner && fromTile.dice > 1 && canActFrom && canAttackTarget) {
            const result = this.game.attack(selTile.x, selTile.y, x, y,
                isParallel ? fromTile.owner : undefined);
            if (result && !result.error) {
                if (result.won) this.select(x, y, sourceId);
                else this.deselect(sourceId);
            }
            return;
        }

        this.deselect(sourceId);
    }

    /**
     * Returns true if the given input source (gamepadIndex -1 = keyboard/mouse) is allowed to act.
     * In classic mode: only when currentPlayer is human and the source controls them.
     * In parallel mode: always for keyboard/mouse; for gamepads: only if assigned to a live human.
     */
    _sourceCanAct(gpIndex) {
        const isParallel = ['parallel', 'parallel-s'].includes(this.game.playMode);
        if (!isParallel) {
            if (this.game.currentPlayer.isBot) return false;
            if (gpIndex >= 0 && !this.inputManager.canGamepadControlPlayer(gpIndex, this.game.currentPlayer.id)) return false;
            return true;
        }
        // Parallel: keyboard/mouse always ok; gamepad must map to a living human
        if (gpIndex < 0) return true;
        const assignment = this.inputManager.getGamepadAssignment(gpIndex);
        if (assignment === 'master') return true;
        const player = this.game.players.find(p => p.id === assignment);
        return !!(player && !player.isBot && player.alive);
    }

    /** Returns true if this source can control the given player (by id). */
    _sourceCanControlPlayer(sourceId, playerId) {
        if (!sourceId.startsWith('gamepad-')) return true; // keyboard/mouse = master
        const gpIdx = parseInt(sourceId.slice('gamepad-'.length));
        return this.inputManager.canGamepadControlPlayer(gpIdx, playerId);
    }

    handleKeyboardAttack(dx, dy, gamepadIndex = -1, sourceId = 'mouse') {
        if (this.game.gameOver || !this.selectedTiles.has(sourceId)) return;
        if (!this._sourceCanAct(gamepadIndex)) return;

        const selTile = this.selectedTiles.get(sourceId);
        const targetX = selTile.x + dx;
        const targetY = selTile.y + dy;

        const targetTile = this.game.map.getTile(targetX, targetY);
        if (!targetTile) return;

        this.handleTileClick(targetTile, targetX, targetY, sourceId);

        if (gamepadIndex !== -1) {
            this.syncGamepadCursor(gamepadIndex, sourceId);
        }
    }

    select(x, y, sourceId = 'mouse') {
        this.selectedTiles.set(sourceId, { x, y });
        const cursorState = this._getCursorState(sourceId);
        cursorState.x = x;
        cursorState.y = y;
        this.renderer.setSelection(x, y, sourceId);
        if (cursorState.visible) {
            this.renderer.setCursor(x, y, sourceId);
        }
    }

    syncGamepadCursor(index, sourceId = 'mouse') {
        const cursorState = this._getCursorState(sourceId);
        if (cursorState.x === null || cursorState.y === null) return;

        const screenPos = this.renderer.getTileScreenPosition(cursorState.x, cursorState.y);
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

    deselect(sourceId = 'mouse') {
        this.selectedTiles.delete(sourceId);
        const cursorState = this._getCursorState(sourceId);
        cursorState.visible = false;
        this.renderer.setSelection(null, null, sourceId);
        this.renderer.setCursor(null, null, sourceId);
    }

    onTurnStart() {
        // In parallel mode: selections are validated at the time of use, not on turn transitions
        const isParallel = ['parallel', 'parallel-s'].includes(this.game.playMode);
        if (isParallel || this.game.currentPlayer.isBot) {
            return;
        }

        // Validate each source's selection for the new current player
        for (const [sourceId, selTile] of [...this.selectedTiles]) {
            const tile = this.game.map.getTile(selTile.x, selTile.y);
            if (!tile || tile.owner !== this.game.currentPlayer.id) {
                this.deselect(sourceId);
            } else {
                this.renderer.setSelection(selTile.x, selTile.y, sourceId);
            }
        }

        // Validate cursor positions
        for (const [sourceId, cursor] of this.cursorStates) {
            if (cursor.x !== null && cursor.y !== null) {
                const tile = this.game.map.getTile(cursor.x, cursor.y);
                if (!tile) {
                    cursor.x = null;
                    cursor.y = null;
                    this.renderer.setCursor(null, null, sourceId);
                }
            }
        }
    }
}
