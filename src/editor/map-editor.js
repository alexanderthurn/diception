/**
 * MapEditor - Interactive map/scenario editor
 * 
 * Uses the same PixiJS renderer as the game for consistent visuals.
 * Creates adapter classes to make editor state look like a game.
 */

import { generateScenarioId } from '../scenarios/scenario-data.js';

// Default player colors
const DEFAULT_COLORS = [
    0xAA00FF, 0xFF00AA, 0x00FFFF, 0xFFFFFF,
    0xFF0055, 0x55FF00, 0xFFDD00, 0xFF8800
];

/**
 * Adapter to make editor state look like a MapManager
 */
class EditorMapAdapter {
    constructor(editorState) {
        this.editorState = editorState;
        this.tiles = []; // Will be synced from editorState
        this.maxDice = 9;
    }

    get width() { return this.editorState.width; }
    get height() { return this.editorState.height; }

    /**
     * Sync tiles array from editor state (Map) to array format
     */
    syncTiles() {
        const { width, height, tiles } = this.editorState;
        this.tiles = new Array(width * height).fill(null).map((_, idx) => {
            const x = idx % width;
            const y = Math.floor(idx / width);
            const key = `${x},${y}`;
            const tile = tiles.get(key);

            if (tile) {
                return { blocked: false, owner: tile.owner, dice: tile.dice || 1 };
            } else {
                return { blocked: true, owner: null, dice: 0 };
            }
        });
        this.maxDice = this.editorState.maxDice;
    }

    getTileRaw(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
        return this.tiles[y * this.width + x];
    }

    getTile(x, y) {
        const tile = this.getTileRaw(x, y);
        if (!tile || tile.blocked) return null;
        return tile;
    }

    getTileIndex(x, y) {
        return y * this.width + x;
    }

    getAdjacentTiles(x, y) {
        const adjacent = [];
        const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];

        for (const [dx, dy] of directions) {
            const tile = this.getTile(x + dx, y + dy);
            if (tile) {
                adjacent.push({ x: x + dx, y: y + dy, ...tile });
            }
        }
        return adjacent;
    }

    getTilesByOwner(playerId) {
        return this.tiles.filter(t => !t.blocked && t.owner === playerId);
    }

    findLargestConnectedRegion(playerId) {
        const visited = new Set();
        let maxRegionSize = 0;

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const idx = this.getTileIndex(x, y);
                const tile = this.tiles[idx];

                if (!tile.blocked && tile.owner === playerId && !visited.has(idx)) {
                    const size = this.measureRegion(x, y, playerId, visited);
                    if (size > maxRegionSize) {
                        maxRegionSize = size;
                    }
                }
            }
        }
        return maxRegionSize;
    }

    measureRegion(startX, startY, playerId, visited) {
        let size = 0;
        const stack = [{ x: startX, y: startY }];
        const startIdx = this.getTileIndex(startX, startY);
        visited.add(startIdx);

        while (stack.length > 0) {
            const { x, y } = stack.pop();
            size++;

            const neighbors = this.getAdjacentTiles(x, y);
            for (const n of neighbors) {
                const nIdx = this.getTileIndex(n.x, n.y);
                if (n.owner === playerId && !visited.has(nIdx)) {
                    visited.add(nIdx);
                    stack.push({ x: n.x, y: n.y });
                }
            }
        }

        return size;
    }
}

/**
 * Adapter to make editor state look like a Game
 */
class EditorGameAdapter {
    constructor(editorState) {
        this.editorState = editorState;
        this.map = new EditorMapAdapter(editorState);
        this.listeners = {};
    }

    get players() {
        return this.editorState.players.map(p => ({
            ...p,
            alive: true,
            storedDice: 0
        }));
    }

    get currentPlayer() {
        // In editor, highlight all players equally or first player
        return this.players[0] || null;
    }

    get maxDice() { return this.editorState.maxDice; }
    get diceSides() { return this.editorState.diceSides; }

    syncFromState() {
        this.map.syncTiles();
    }

    // Event system (not really used in editor but needed for interface)
    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }
}

export class MapEditor {
    constructor(scenarioManager, aiRegistry) {
        this.scenarioManager = scenarioManager;
        this.aiRegistry = aiRegistry;

        // Editor state
        this.state = this.createEmptyState();

        // Game adapter for renderer
        this.gameAdapter = new EditorGameAdapter(this.state);

        // Reference to the main renderer (will be set from main.js)
        this.renderer = null;

        // UI elements (cached after init)
        this.elements = {};

        // Interaction state
        this.isPainting = false;
        this.lastPaintedTile = null;

        // Callback for when editor closes
        this.onClose = null;

        // Store original game reference to restore
        this.originalGame = null;
    }

    createEmptyState(width = 7, height = 7) {
        return {
            id: null,
            name: 'New Map',
            description: '',
            width,
            height,
            tiles: new Map(), // "x,y" -> { owner, dice }
            players: [
                { id: 0, isBot: false, color: DEFAULT_COLORS[0], aiId: null },
                { id: 1, isBot: true, color: DEFAULT_COLORS[1], aiId: 'easy' }
            ],
            maxDice: 9,
            diceSides: 6,

            // Editor-only state
            currentMode: 'paint',
            selectedPlayer: 0,
            secondarySelectedPlayer: 1,
            paintMode: 'add', // 'add' or 'remove'
            diceBrushValue: 2,
            secondaryDiceBrushValue: 1,
            isDirty: false,
            originalId: null // Track if editing existing
        };
    }

    /**
     * Set the renderer reference (call from main.js)
     */
    setRenderer(renderer) {
        this.renderer = renderer;
    }

    /**
     * Initialize DOM bindings
     */
    init() {
        // Inject custom styles for secondary selection
        if (!document.getElementById('editor-custom-styles')) {
            const style = document.createElement('style');
            style.id = 'editor-custom-styles';
            style.textContent = `
                .secondary-selected {
                    border: 2px dashed #ffffff !important;
                    box-shadow: 0 0 5px #ffffff !important;
                    position: relative;
                }
                .secondary-selected::after {
                    content: '';
                    position: absolute;
                    top: -4px;
                    right: -4px;
                    width: 8px;
                    height: 8px;
                    background: #fff;
                    border-radius: 50%;
                }
            `;
            document.head.appendChild(style);
        }

        // Cache elements
        this.elements = {
            overlay: document.getElementById('editor-overlay'),
            closeBtn: document.getElementById('editor-close-btn'),
            backBtn: document.getElementById('editor-back-btn'),

            // Settings
            nameInput: document.getElementById('editor-name'),
            descriptionInput: document.getElementById('editor-description'),
            widthSlider: document.getElementById('editor-width'),
            widthVal: document.getElementById('editor-width-val'),
            heightSlider: document.getElementById('editor-height'),
            heightVal: document.getElementById('editor-height-val'),
            maxDiceSelect: document.getElementById('editor-max-dice'),
            diceSidesSelect: document.getElementById('editor-dice-sides'),

            // Mode tabs
            modeTabs: document.querySelectorAll('.editor-tab'),
            paintToolbar: document.getElementById('paint-toolbar'),
            assignToolbar: document.getElementById('assign-toolbar'),
            diceToolbar: document.getElementById('dice-toolbar'),

            // Palettes
            paintPalette: document.getElementById('paint-palette'),
            playerPalette: document.getElementById('player-palette'),
            dicePalette: document.getElementById('dice-palette'),

            // Players
            playerList: document.getElementById('editor-player-list'),
            playerCountDisplay: document.getElementById('player-count-display'),
            addPlayerBtn: document.getElementById('add-player-btn'),

            // Actions
            saveAsMapBtn: document.getElementById('save-as-map-btn'),
            saveAsScenarioBtn: document.getElementById('save-as-scenario-btn'),
            clearBtn: document.getElementById('editor-clear-btn'),
            fillBtn: document.getElementById('editor-fill-btn'),
            randomizeBtn: document.getElementById('editor-randomize-btn'),

            // Elements to hide/show
            gamePanel: document.querySelector('.game-panel'),
            endTurnBtn: document.getElementById('end-turn-btn'),
            aiToggleBtn: document.getElementById('ai-toggle-btn'),
            setupModal: document.getElementById('setup-modal')
        };

        this.bindEvents();
    }

    /**
     * Bind all event handlers
     */
    bindEvents() {
        // Close buttons
        this.elements.closeBtn?.addEventListener('click', () => this.close());
        this.elements.backBtn?.addEventListener('click', () => this.close());

        // Settings changes
        this.elements.nameInput?.addEventListener('input', (e) => {
            this.state.name = e.target.value;
            this.state.isDirty = true;
        });

        this.elements.descriptionInput?.addEventListener('input', (e) => {
            this.state.description = e.target.value;
            this.state.isDirty = true;
        });

        // Size sliders
        this.elements.widthSlider?.addEventListener('input', (e) => {
            const newWidth = parseInt(e.target.value);
            this.elements.widthVal.textContent = newWidth;
            this.resizeGrid(newWidth, this.state.height);
        });

        this.elements.heightSlider?.addEventListener('input', (e) => {
            const newHeight = parseInt(e.target.value);
            this.elements.heightVal.textContent = newHeight;
            this.resizeGrid(this.state.width, newHeight);
        });

        // Max dice and dice sides
        this.elements.maxDiceSelect?.addEventListener('change', (e) => {
            this.state.maxDice = parseInt(e.target.value);
            if (this.state.diceBrushValue > this.state.maxDice) {
                this.state.diceBrushValue = this.state.maxDice;
            }
            this.renderDicePalette();
            this.state.isDirty = true;
        });

        this.elements.diceSidesSelect?.addEventListener('change', (e) => {
            this.state.diceSides = parseInt(e.target.value);
            this.renderer?.setDiceSides(this.state.diceSides);
            this.state.isDirty = true;
            this.renderToCanvas();
        });

        // Mode tabs
        this.elements.modeTabs?.forEach(tab => {
            tab.addEventListener('click', () => {
                const mode = tab.dataset.mode;
                this.setMode(mode);
            });
        });

        // Add player button
        this.elements.addPlayerBtn?.addEventListener('click', () => this.addPlayer());

        // Save buttons
        this.elements.saveAsMapBtn?.addEventListener('click', () => this.saveAsMap());
        this.elements.saveAsScenarioBtn?.addEventListener('click', () => this.saveAsScenario());

        // Quick actions
        this.elements.clearBtn?.addEventListener('click', () => this.clearGrid());
        this.elements.fillBtn?.addEventListener('click', () => this.fillGrid());
        this.elements.randomizeBtn?.addEventListener('click', () => this.randomizeDice());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (!this.isOpen) return;

            // Ignore if typing in input fields
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.key === 'Escape') {
                this.close();
            } else if (e.key.toLowerCase() === 'y') {
                this.setMode('paint');
            } else if (e.key.toLowerCase() === 'x') {
                this.setMode('assign');
            } else if (e.key.toLowerCase() === 'c') {
                this.setMode('dice');
            }
        });
    }

    /**
     * Setup canvas mouse events for painting
     */
    setupCanvasEvents() {
        if (!this.renderer?.app?.canvas) return;

        const canvas = this.renderer.app.canvas;

        // Remove old listeners if any
        canvas.removeEventListener('mousedown', this.handleCanvasMouseDown);
        canvas.removeEventListener('mousemove', this.handleCanvasMouseMove);
        canvas.removeEventListener('mouseup', this.handleCanvasMouseUp);
        canvas.removeEventListener('touchstart', this.handleCanvasTouchStart);
        canvas.removeEventListener('touchmove', this.handleCanvasTouchMove);
        canvas.removeEventListener('touchend', this.handleCanvasTouchEnd);

        // Bind methods
        this.handleCanvasMouseDown = this.onCanvasMouseDown.bind(this);
        this.handleCanvasMouseMove = this.onCanvasMouseMove.bind(this);
        this.handleCanvasMouseUp = this.onCanvasMouseUp.bind(this);
        this.handleCanvasTouchStart = this.onCanvasTouchStart.bind(this);
        this.handleCanvasTouchMove = this.onCanvasTouchMove.bind(this);
        this.handleCanvasTouchEnd = this.onCanvasTouchEnd.bind(this);

        // Add listeners
        canvas.addEventListener('mousedown', this.handleCanvasMouseDown);
        canvas.addEventListener('mousemove', this.handleCanvasMouseMove);
        canvas.addEventListener('mouseup', this.handleCanvasMouseUp);
        canvas.addEventListener('touchstart', this.handleCanvasTouchStart, { passive: false });
        canvas.addEventListener('touchmove', this.handleCanvasTouchMove, { passive: false });
        canvas.addEventListener('touchend', this.handleCanvasTouchEnd);
    }

    /**
     * Convert screen coordinates to tile coordinates
     */
    screenToTile(screenX, screenY) {
        if (!this.renderer?.rootContainer || !this.renderer?.grid) return null;

        const root = this.renderer.rootContainer;
        const tileSize = this.renderer.grid.tileSize;
        const gap = this.renderer.grid.gap;

        // Convert screen coords to world coords
        const worldX = (screenX - root.x) / root.scale.x;
        const worldY = (screenY - root.y) / root.scale.y;

        // Convert world coords to tile coords
        const tileX = Math.floor(worldX / (tileSize + gap));
        const tileY = Math.floor(worldY / (tileSize + gap));

        // Check bounds
        if (tileX < 0 || tileX >= this.state.width || tileY < 0 || tileY >= this.state.height) {
            return null;
        }

        return { x: tileX, y: tileY };
    }

    onCanvasMouseDown(e) {
        if (!this.isOpen) return;

        // Middle click (1) is for panning (handled by InputController)
        if (e.button === 1) return;

        const tile = this.screenToTile(e.clientX, e.clientY);
        if (tile) {
            this.isPainting = true;
            this.handleTileInteraction(tile.x, tile.y, e.button, e.shiftKey);
            this.lastPaintedTile = `${tile.x},${tile.y}`;
            this.currentInteractionButton = e.button;
            this.currentInteractionShift = e.shiftKey;
        }
    }

    onCanvasMouseMove(e) {
        if (!this.isOpen || !this.isPainting) return;

        const tile = this.screenToTile(e.clientX, e.clientY);
        if (tile) {
            const key = `${tile.x},${tile.y}`;
            if (this.lastPaintedTile !== key) {
                this.handleTileInteraction(tile.x, tile.y, this.currentInteractionButton, this.currentInteractionShift);
                this.lastPaintedTile = key;
            }
        }
    }

    onCanvasMouseUp() {
        this.isPainting = false;
        this.lastPaintedTile = null;
        this.currentInteractionButton = null;
        this.currentInteractionShift = false;
    }

    onCanvasTouchStart(e) {
        if (!this.isOpen) return;

        const touch = e.touches[0];
        const tile = this.screenToTile(touch.clientX, touch.clientY);
        if (tile) {
            e.preventDefault();
            this.isPainting = true;
            // Treat touch as left click (button 0), pass shift key if held
            this.currentInteractionButton = 0;
            this.currentInteractionShift = e.shiftKey;
            this.handleTileInteraction(tile.x, tile.y, 0, e.shiftKey);
            this.lastPaintedTile = `${tile.x},${tile.y}`;
        }
    }

    onCanvasTouchMove(e) {
        if (!this.isOpen || !this.isPainting) return;

        const touch = e.touches[0];
        const tile = this.screenToTile(touch.clientX, touch.clientY);
        if (tile) {
            e.preventDefault();
            const key = `${tile.x},${tile.y}`;
            if (this.lastPaintedTile !== key) {
                this.handleTileInteraction(tile.x, tile.y, 0, this.currentInteractionShift);
                this.lastPaintedTile = key;
            }
        }
    }

    onCanvasTouchEnd() {
        this.isPainting = false;
        this.lastPaintedTile = null;
        this.currentInteractionShift = false;
    }

    /**
     * Open editor with optional existing scenario
     */
    open(scenario = null) {
        if (scenario) {
            this.importFromScenario(scenario);
        } else {
            this.state = this.createEmptyState();
        }

        // Update game adapter reference
        this.gameAdapter = new EditorGameAdapter(this.state);

        // Store original game and switch renderer to editor mode
        if (this.renderer) {
            this.originalGame = this.renderer.game;
            this.renderer.game = this.gameAdapter;
            this.renderer.grid.game = this.gameAdapter;
            this.renderer.setDiceSides(this.state.diceSides);
        }

        // Hide game UI, show editor UI
        this.elements.gamePanel?.classList.add('hidden');
        this.elements.endTurnBtn?.classList.add('hidden');
        this.elements.aiToggleBtn?.classList.add('hidden');
        this.elements.setupModal?.classList.add('hidden');
        this.elements.overlay?.classList.remove('hidden');

        // Update UI to match state
        this.updateUIFromState();
        this.renderPlayerList();
        this.renderPaintPalette();
        this.renderPlayerPalette();
        this.renderDicePalette();
        this.setMode('paint');

        // Render to canvas and fit camera on initial open
        this.renderToCanvas(true);

        // Setup canvas interaction
        this.setupCanvasEvents();

        this.isOpen = true;
    }

    /**
     * Close editor
     */
    close() {
        // Restore original game
        if (this.renderer && this.originalGame) {
            this.renderer.game = this.originalGame;
            this.renderer.grid.game = this.originalGame;
            this.renderer.draw();
        }

        // Hide editor UI, show game UI
        this.elements.overlay?.classList.add('hidden');
        this.elements.gamePanel?.classList.remove('hidden');
        this.elements.endTurnBtn?.classList.remove('hidden');
        this.elements.aiToggleBtn?.classList.remove('hidden');

        this.isOpen = false;

        if (this.onClose) {
            this.onClose();
        }
    }

    /**
     * Render current state to canvas using the game renderer
     * @param {boolean} fitCamera - Whether to auto-fit camera (default false)
     */
    renderToCanvas(fitCamera = false) {
        if (!this.renderer) return;

        // Sync editor state to game adapter
        this.gameAdapter.syncFromState();

        // Draw using the renderer
        this.renderer.draw();

        // Only auto-fit camera when explicitly requested (e.g., on open or resize)
        if (fitCamera) {
            this.renderer.autoFitCamera();
        }
    }

    /**
     * Show a temporary status message
     */
    showStatus(message, type = 'info') {
        let status = document.getElementById('editor-status');
        if (!status) {
            status = document.createElement('div');
            status.id = 'editor-status';
            status.className = 'editor-status';
            this.elements.overlay?.appendChild(status);
        }

        status.textContent = message;
        status.className = `editor-status ${type}`;
        status.classList.add('visible');

        clearTimeout(this.statusTimeout);
        this.statusTimeout = setTimeout(() => {
            status.classList.remove('visible');
        }, 2000);
    }

    /**
     * Update UI elements from state
     */
    updateUIFromState() {
        if (this.elements.nameInput) this.elements.nameInput.value = this.state.name;
        if (this.elements.descriptionInput) this.elements.descriptionInput.value = this.state.description;
        if (this.elements.widthSlider) this.elements.widthSlider.value = this.state.width;
        if (this.elements.widthVal) this.elements.widthVal.textContent = this.state.width;
        if (this.elements.heightSlider) this.elements.heightSlider.value = this.state.height;
        if (this.elements.heightVal) this.elements.heightVal.textContent = this.state.height;
        if (this.elements.maxDiceSelect) this.elements.maxDiceSelect.value = this.state.maxDice;
        if (this.elements.diceSidesSelect) this.elements.diceSidesSelect.value = this.state.diceSides;
    }

    /**
     * Render the paint mode palette (add/remove tile buttons)
     */
    renderPaintPalette() {
        const container = this.elements.paintPalette;
        if (!container) return;
        container.innerHTML = '';

        const addBtn = document.createElement('div');
        addBtn.className = 'paint-swatch add-tile';
        if (this.state.paintMode === 'add') addBtn.classList.add('selected');
        addBtn.title = 'Add tiles';
        addBtn.addEventListener('click', () => {
            this.state.paintMode = 'add';
            this.renderPaintPalette();
        });
        container.appendChild(addBtn);

        const removeBtn = document.createElement('div');
        removeBtn.className = 'paint-swatch remove-tile';
        if (this.state.paintMode === 'remove') removeBtn.classList.add('selected');
        removeBtn.title = 'Remove tiles';
        removeBtn.addEventListener('click', () => {
            this.state.paintMode = 'remove';
            this.renderPaintPalette();
        });
        container.appendChild(removeBtn);
    }

    /**
     * Render the dice palette (1 to maxDice buttons)
     */
    renderDicePalette() {
        const container = this.elements.dicePalette;
        if (!container) return;
        container.innerHTML = '';

        for (let i = 1; i <= this.state.maxDice; i++) {
            const btn = document.createElement('div');
            btn.className = 'dice-swatch';
            btn.textContent = i;
            if (this.state.diceBrushValue === i) btn.classList.add('selected');
            if (this.state.secondaryDiceBrushValue === i) btn.classList.add('secondary-selected');

            btn.addEventListener('click', () => {
                this.state.diceBrushValue = i;
                this.renderDicePalette();
            });

            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.state.secondaryDiceBrushValue = i;
                this.renderDicePalette();
            });

            container.appendChild(btn);
        }
    }

    /**
     * Handle tile click/drag interaction
     */
    handleTileInteraction(x, y, button = 0, shiftKey = false) {
        const key = `${x},${y}`;
        const tile = this.state.tiles.get(key);

        let mode = this.state.currentMode;
        // Shift key temporarily enables paint mode logic
        if (shiftKey) {
            mode = 'paint';
        }

        const isRightClick = button === 2;

        switch (mode) {
            case 'paint':
                // Left click = Add, Right click = Remove
                const shouldRemove = isRightClick || (this.state.paintMode === 'remove' && !isRightClick);

                if (!shouldRemove) {
                    this.state.tiles.set(key, {
                        owner: this.state.selectedPlayer,
                        dice: this.state.diceBrushValue
                    });
                } else {
                    this.state.tiles.delete(key);
                }
                break;

            case 'assign':
                const targetOwner = isRightClick ? this.state.secondarySelectedPlayer : this.state.selectedPlayer;
                if (tile) {
                    tile.owner = targetOwner;
                } else {
                    this.state.tiles.set(key, {
                        owner: targetOwner,
                        dice: this.state.diceBrushValue
                    });
                }
                break;

            case 'dice':
                const targetDice = isRightClick ? this.state.secondaryDiceBrushValue : this.state.diceBrushValue;
                if (tile) {
                    tile.dice = targetDice;
                }
                break;
        }

        this.state.isDirty = true;
        this.renderToCanvas();
    }

    /**
     * Switch editor mode
     */
    setMode(mode) {
        this.state.currentMode = mode;

        this.elements.modeTabs?.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.mode === mode);
        });

        this.elements.paintToolbar?.classList.toggle('hidden', mode !== 'paint');
        this.elements.assignToolbar?.classList.toggle('hidden', mode !== 'assign');
        this.elements.diceToolbar?.classList.toggle('hidden', mode !== 'dice');
    }

    /**
     * Add a new player
     */
    addPlayer() {
        if (this.state.players.length >= 8) return;

        const newId = this.state.players.length;
        this.state.players.push({
            id: newId,
            isBot: true,
            color: DEFAULT_COLORS[newId % DEFAULT_COLORS.length],
            aiId: 'easy'
        });

        this.state.isDirty = true;
        this.renderPlayerList();
        this.renderPlayerPalette();
    }

    /**
     * Remove a player
     */
    removePlayer(id) {
        if (this.state.players.length <= 2) return;

        for (const tile of this.state.tiles.values()) {
            if (tile.owner === id) {
                tile.owner = 0;
            }
        }

        this.state.players = this.state.players.filter(p => p.id !== id);

        this.state.players.forEach((p, i) => {
            const oldId = p.id;
            p.id = i;
            for (const tile of this.state.tiles.values()) {
                if (tile.owner === oldId) {
                    tile.owner = i;
                }
            }
        });

        if (this.state.selectedPlayer >= this.state.players.length) {
            this.state.selectedPlayer = 0;
        }

        this.state.isDirty = true;
        this.renderPlayerList();
        this.renderPlayerPalette();
        this.renderToCanvas();
    }

    /**
     * Update player properties
     */
    updatePlayer(id, changes) {
        const player = this.state.players.find(p => p.id === id);
        if (player) {
            Object.assign(player, changes);
            this.state.isDirty = true;
            this.renderPlayerList();
            this.renderPlayerPalette();
            this.renderToCanvas();
        }
    }

    /**
     * Render the player list in settings panel
     */
    renderPlayerList() {
        const container = this.elements.playerList;
        if (!container) return;
        container.innerHTML = '';

        if (this.elements.playerCountDisplay) {
            this.elements.playerCountDisplay.textContent = `(${this.state.players.length})`;
        }

        const ais = this.aiRegistry.getAllAIs();

        this.state.players.forEach(player => {
            const row = document.createElement('div');
            row.className = 'editor-player-row';

            const colorHex = '#' + player.color.toString(16).padStart(6, '0');

            row.innerHTML = `
                <div class="editor-player-color" style="background-color: ${colorHex}"></div>
                <span class="editor-player-label">P${player.id + 1}</span>
                <select class="editor-player-type" data-player-id="${player.id}">
                    <option value="human" ${!player.isBot ? 'selected' : ''}>Human</option>
                    <option value="bot" ${player.isBot ? 'selected' : ''}>Bot</option>
                </select>
                <select class="editor-player-ai ${!player.isBot ? 'hidden' : ''}" data-player-id="${player.id}">
                    ${ais.map(ai => `<option value="${ai.id}" ${player.aiId === ai.id ? 'selected' : ''}>${ai.name}</option>`).join('')}
                </select>
                <span class="editor-player-remove" data-player-id="${player.id}" title="Remove player">×</span>
            `;

            container.appendChild(row);

            const typeSelect = row.querySelector('.editor-player-type');
            const aiSelect = row.querySelector('.editor-player-ai');
            const removeBtn = row.querySelector('.editor-player-remove');

            typeSelect.addEventListener('change', (e) => {
                const isBot = e.target.value === 'bot';
                this.updatePlayer(player.id, { isBot, aiId: isBot ? 'easy' : null });
            });

            aiSelect.addEventListener('change', (e) => {
                this.updatePlayer(player.id, { aiId: e.target.value });
            });

            removeBtn.addEventListener('click', () => {
                this.removePlayer(player.id);
            });
        });

        if (this.elements.addPlayerBtn) {
            this.elements.addPlayerBtn.style.display = this.state.players.length >= 8 ? 'none' : '';
        }
    }

    /**
     * Render the player palette for assign mode
     */
    renderPlayerPalette() {
        const container = this.elements.playerPalette;
        if (!container) return;
        container.innerHTML = '';

        this.state.players.forEach(player => {
            const swatch = document.createElement('div');
            swatch.className = 'player-swatch';
            if (player.id === this.state.selectedPlayer) {
                swatch.classList.add('selected');
            }
            if (player.id === this.state.secondarySelectedPlayer) {
                swatch.classList.add('secondary-selected');
            }

            const colorHex = '#' + player.color.toString(16).padStart(6, '0');
            swatch.style.backgroundColor = colorHex;
            swatch.textContent = player.id + 1;
            swatch.title = `Player ${player.id + 1}`;

            swatch.addEventListener('click', () => {
                this.state.selectedPlayer = player.id;
                this.renderPlayerPalette();
            });

            swatch.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.state.secondarySelectedPlayer = player.id;
                this.renderPlayerPalette();
            });

            container.appendChild(swatch);
        });
    }

    /**
     * Clear all tiles from grid
     */
    clearGrid() {
        this.state.tiles.clear();
        this.state.isDirty = true;
        this.renderToCanvas();
    }

    /**
     * Fill entire grid with tiles
     */
    fillGrid() {
        const { width, height, players } = this.state;
        const playerCount = players.length;

        let playerIndex = 0;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const key = `${x},${y}`;
                this.state.tiles.set(key, {
                    owner: players[playerIndex % playerCount].id,
                    dice: this.state.diceBrushValue
                });
                playerIndex++;
            }
        }

        this.state.isDirty = true;
        this.renderToCanvas();
    }

    /**
     * Randomize dice counts on existing tiles
     */
    randomizeDice() {
        for (const tile of this.state.tiles.values()) {
            tile.dice = Math.floor(Math.random() * this.state.maxDice) + 1;
        }

        this.state.isDirty = true;
        this.renderToCanvas();
    }

    /**
     * Resize the grid
     */
    resizeGrid(newWidth, newHeight) {
        for (const [key] of this.state.tiles) {
            const [x, y] = key.split(',').map(Number);
            if (x >= newWidth || y >= newHeight) {
                this.state.tiles.delete(key);
            }
        }

        this.state.width = newWidth;
        this.state.height = newHeight;
        this.state.isDirty = true;
        // Fit camera when grid size changes
        this.renderToCanvas(true);
    }

    /**
     * Save as map (tiles only, no ownership)
     */
    saveAsMap() {
        if (this.state.tiles.size === 0) {
            this.showStatus('Add at least one tile first', 'error');
            return null;
        }

        let name = this.state.name.trim();
        if (!name) {
            name = 'Untitled Map';
            this.state.name = name;
            if (this.elements.nameInput) this.elements.nameInput.value = name;
        }

        const mapData = {
            id: this.state.originalId || generateScenarioId(),
            name: name,
            description: this.state.description,
            type: 'map',
            isBuiltIn: false,
            author: 'User',
            createdAt: Date.now(),
            width: this.state.width,
            height: this.state.height,
            tiles: Array.from(this.state.tiles.entries()).map(([key]) => {
                const [x, y] = key.split(',').map(Number);
                return { x, y };
            })
        };

        try {
            this.scenarioManager.saveEditorScenario(mapData);
            this.state.isDirty = false;
            this.state.originalId = mapData.id;
            this.showStatus('Map saved!', 'success');
            return mapData;
        } catch (e) {
            console.error('Failed to save map:', e);
            this.showStatus('Failed to save', 'error');
            return null;
        }
    }

    /**
     * Save as scenario (includes players, ownership, dice)
     */
    saveAsScenario() {
        if (this.state.tiles.size === 0) {
            this.showStatus('Add at least one tile first', 'error');
            return null;
        }

        let name = this.state.name.trim();
        if (!name) {
            name = 'Untitled Scenario';
            this.state.name = name;
            if (this.elements.nameInput) this.elements.nameInput.value = name;
        }

        for (const [key, tile] of this.state.tiles) {
            if (tile.owner === undefined || tile.owner === null || tile.owner < 0) {
                tile.owner = 0;
            } else if (!this.state.players.find(p => p.id === tile.owner)) {
                tile.owner = 0;
            }
        }

        const tileCounts = {};
        this.state.players.forEach(p => tileCounts[p.id] = 0);
        for (const tile of this.state.tiles.values()) {
            tileCounts[tile.owner]++;
        }

        const playersWithNoTiles = this.state.players.filter(p => tileCounts[p.id] === 0);
        if (playersWithNoTiles.length > 0) {
            const tilesArray = Array.from(this.state.tiles.values());
            for (const player of playersWithNoTiles) {
                for (let i = 0; i < tilesArray.length; i++) {
                    if (tilesArray[i].owner === 0 && tileCounts[0] > 1) {
                        tilesArray[i].owner = player.id;
                        tileCounts[0]--;
                        tileCounts[player.id]++;
                        break;
                    }
                }
            }
            this.renderToCanvas();
        }

        const scenarioData = {
            id: this.state.originalId || generateScenarioId(),
            name: name,
            description: this.state.description,
            type: 'scenario',
            isBuiltIn: false,
            author: 'User',
            createdAt: Date.now(),
            width: this.state.width,
            height: this.state.height,
            maxDice: this.state.maxDice,
            diceSides: this.state.diceSides,
            players: this.state.players.map(p => ({
                id: p.id,
                isBot: p.isBot,
                color: p.color,
                storedDice: 0,
                aiId: p.aiId
            })),
            tiles: Array.from(this.state.tiles.entries()).map(([key, tile]) => {
                const [x, y] = key.split(',').map(Number);
                return { x, y, owner: tile.owner, dice: tile.dice || 1 };
            })
        };

        try {
            this.scenarioManager.saveEditorScenario(scenarioData);
            this.state.isDirty = false;
            this.state.originalId = scenarioData.id;
            this.showStatus('Scenario saved!', 'success');
            return scenarioData;
        } catch (e) {
            console.error('Failed to save scenario:', e);
            this.showStatus('Failed to save', 'error');
            return null;
        }
    }

    /**
     * Import from existing scenario/map
     */
    importFromScenario(scenario) {
        this.state = this.createEmptyState(scenario.width || 7, scenario.height || 7);

        this.state.originalId = scenario.isBuiltIn ? null : scenario.id;
        this.state.name = scenario.isBuiltIn ? scenario.name + ' (Copy)' : scenario.name;
        this.state.description = scenario.description || '';
        this.state.maxDice = scenario.maxDice || 9;
        this.state.diceSides = scenario.diceSides || 6;

        if (scenario.players && scenario.players.length > 0) {
            this.state.players = scenario.players.map(p => ({
                id: p.id,
                isBot: p.isBot !== undefined ? p.isBot : true,
                color: p.color || DEFAULT_COLORS[p.id % DEFAULT_COLORS.length],
                aiId: p.aiId || (p.isBot ? 'easy' : null)
            }));
        }

        this.state.tiles.clear();
        if (scenario.tiles && scenario.tiles.length > 0) {
            for (const tile of scenario.tiles) {
                const key = `${tile.x},${tile.y}`;
                this.state.tiles.set(key, {
                    owner: tile.owner !== undefined ? tile.owner : 0,
                    dice: tile.dice || 1
                });
            }
        }

        this.state.isDirty = false;
    }
}
