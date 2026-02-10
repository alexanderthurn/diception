/**
 * MapEditor - Interactive map/scenario editor
 * 
 * Uses the same PixiJS renderer as the game for consistent visuals.
 * Creates adapter classes to make editor state look like a game.
 */

// No longer using generateScenarioId
import { Dialog } from '../ui/dialog.js';
import { GAME } from '../core/constants.js';
import { getInputHint, ACTION_ASSIGN, ACTION_DICE } from '../ui/input-hints.js';


// Default player colors
const DEFAULT_COLORS = [...GAME.HUMAN_COLORS, ...GAME.BOT_COLORS];

/**
 * Helper to decide black or white text based on background color
 */
function getContrastColor(hex) {
    // Separate RGB
    const r = (hex >> 16) & 0xFF;
    const g = (hex >> 8) & 0xFF;
    const b = hex & 0xFF;
    // Calculate brightness (luma)
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

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

// Config map size presets (slider 1-10)
const CONFIG_MAP_SIZE_PRESETS = [
    { width: 3, height: 3, label: '3×3' },
    { width: 4, height: 4, label: '4×4' },
    { width: 5, height: 5, label: '5×5' },
    { width: 6, height: 6, label: '6×6' },
    { width: 7, height: 7, label: '7×7' },
    { width: 8, height: 8, label: '8×8' },
    { width: 9, height: 9, label: '9×9' },
    { width: 10, height: 10, label: '10×10' },
    { width: 11, height: 11, label: '11×11' },
    { width: 12, height: 12, label: '12×12' }
];

// Available AI difficulties
const AVAILABLE_AIS = [
    { id: 'easy', name: 'Easy' },
    { id: 'medium', name: 'Medium' },
    { id: 'hard', name: 'Hard' }
];

export class MapEditor {
    constructor(scenarioManager) {
        this.scenarioManager = scenarioManager;

        // Editor state
        this.state = this.createEmptyState();

        // Game adapter for renderer
        this.gameAdapter = new EditorGameAdapter(this.state);

        // Reference to the main renderer (will be set from main.js)
        this.renderer = null;
        this.inputManager = null;

        // UI elements (cached after init)
        this.elements = {};

        // Interaction state
        this.isPainting = false;
        this.lastPaintedTile = null;

        // Config preview rotation
        this.configPreviewInterval = null;

        // Callback for when editor closes
        this.onClose = null;

        // Campaign context (when editing level in campaign)
        this.editorOptions = null;

        // Store original game reference to restore
        this.originalGame = null;
    }

    /**
     * Compute minimal grid bounds from painted tiles.
     * Returns { width, height, minX, minY } and normalized tile data.
     */
    computeMinimalBounds() {
        const entries = Array.from(this.state.tiles.entries());
        if (entries.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [key] of entries) {
            const [x, y] = key.split(',').map(Number);
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
        return {
            width: maxX - minX + 1,
            height: maxY - minY + 1,
            minX,
            minY
        };
    }

    createEmptyState(width = 20, height = 20) {
        return {
            name: 'New Map',
            description: '',
            author: '',
            width,
            height,
            tiles: new Map(), // "x,y" -> { owner, dice }
            players: [
                { id: 0, isBot: false, color: DEFAULT_COLORS[0], aiId: null },
                { id: 1, isBot: true, color: DEFAULT_COLORS[1], aiId: 'easy' }
            ],
            maxDice: 9,
            diceSides: 6,
            bots: 2,
            botAI: 'easy',

            // Editor-only state
            editorType: 'map', // 'map' or 'scenario'
            configData: { mapSize: '6x6', mapStyle: 'random', gameMode: 'classic' }, // For Random section
            currentMode: 'paint',
            selectedPlayer: 0,
            paintMode: 'add', // 'add' or 'remove'
            diceBrushValue: 2,
            deletedTiles: new Map(), // Cache for deleted tile data (preserves dice/owner)
            hoveredTile: null, // Currently hovered tile {x, y} for keyboard input
            isDirty: false
        };
    }

    setRenderer(renderer) {
        this.renderer = renderer;
    }

    setInputManager(inputManager) {
        this.inputManager = inputManager;
    }

    updateEditorInputHints() {
        if (!this.inputManager) return;
        const assignHint = getInputHint(ACTION_ASSIGN, this.inputManager);
        const diceHint = getInputHint(ACTION_DICE, this.inputManager);
        const assignEl = document.getElementById('editor-assign-hint');
        const diceEl = document.getElementById('editor-dice-hint');
        if (assignHint && assignEl) {
            assignEl.textContent = assignHint.label;
            assignEl.className = 'input-hint ' + assignHint.style;
        }
        if (diceHint && diceEl) {
            diceEl.textContent = diceHint.label;
            diceEl.className = 'input-hint ' + diceHint.style;
        }
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
            backBtn: document.getElementById('editor-back-btn'),

            // Editor type toggle
            editorTypeMapBtn: document.getElementById('editor-type-map'),
            editorTypeScenarioBtn: document.getElementById('editor-type-scenario'),
            mapScenarioSection: document.getElementById('editor-map-scenario-section'),
            randomDialog: document.getElementById('editor-random-dialog'),
            randomCloseBtn: document.getElementById('editor-random-close-btn'),
            randomBtn: document.getElementById('editor-random-btn'),
            quickActions: document.getElementById('editor-quick-actions'),
            saveBtn: document.getElementById('editor-save-btn'),
            randomizeBtn: document.getElementById('editor-randomize-btn'),
            editorMapSize: document.getElementById('editor-map-size'),
            editorMapSizeVal: document.getElementById('editor-map-size-val'),
            editorMapStyle: document.getElementById('editor-map-style'),
            editorGameMode: document.getElementById('editor-game-mode'),

            // Settings
            nameInput: document.getElementById('editor-name'),
            descriptionInput: document.getElementById('editor-description'),
            authorInput: document.getElementById('editor-author'),
            widthSlider: document.getElementById('editor-width'),
            widthVal: document.getElementById('editor-width-val'),
            heightSlider: document.getElementById('editor-height'),
            heightVal: document.getElementById('editor-height-val'),
            maxDiceSelect: document.getElementById('editor-max-dice'),
            maxDiceVal: document.getElementById('editor-max-dice-val'),
            diceSidesSelect: document.getElementById('editor-dice-sides'),
            diceSidesVal: document.getElementById('editor-dice-sides-val'),

            // Mode tabs and bottom bar
            bottomBar: document.querySelector('.editor-bottom-bar'),
            modeTabs: document.querySelectorAll('.editor-tab'),
            paintToolbar: document.getElementById('paint-toolbar'),
            assignToolbar: document.getElementById('assign-toolbar'),
            diceToolbar: document.getElementById('dice-toolbar'),

            // Palettes
            paintPalette: document.getElementById('paint-palette'),
            playerPalette: document.getElementById('player-palette'),
            dicePalette: document.getElementById('dice-palette'),

            // New Sections
            sharedPlayersSection: document.getElementById('editor-shared-players-section'),
            colorLegend: document.getElementById('editor-color-legend'),
            diceSettingsSection: document.getElementById('editor-dice-settings-section'),

            // Map settings
            editorSharedBots: document.getElementById('editor-shared-bots'),
            editorSharedBotAI: document.getElementById('editor-shared-bot-ai'),

            // Actions
            clearBtn: document.getElementById('editor-clear-btn'),
            fillBtn: document.getElementById('editor-fill-btn'),

            // Elements to hide/show
            gamePanel: document.querySelector('.game-panel'),
            endTurnBtn: document.getElementById('end-turn-btn'),
            aiToggleBtn: document.getElementById('ai-toggle-btn'),
            setupModal: document.getElementById('setup-modal'),

            // Cursor preview
            cursorPreview: document.getElementById('editor-cursor-preview'),
            cursorPreviewPrimary: document.querySelector('#editor-cursor-preview .preview-box.primary .preview-content'),
            cursorPreviewSecondary: document.querySelector('#editor-cursor-preview .preview-box.secondary .preview-content')
        };

        this.bindEvents();
    }

    /**
     * Bind all event handlers
     */
    bindEvents() {
        // Close/back button
        this.elements.backBtn?.addEventListener('click', () => this.close());

        // Editor type toggle
        this.elements.editorTypeMapBtn?.addEventListener('click', () => this.setEditorType('map'));
        this.elements.editorTypeScenarioBtn?.addEventListener('click', () => this.setEditorType('scenario'));

        // Random dialog toggle (button in quick-actions) and close (X)
        this.elements.randomBtn?.addEventListener('click', () => this.toggleRandomDialog());
        this.elements.randomCloseBtn?.addEventListener('click', () => this.setRandomDialogOpen(false));

        // Settings changes

        this.elements.nameInput?.addEventListener('input', (e) => {
            this.state.name = e.target.value;
            this.state.isDirty = true;
        });

        this.elements.descriptionInput?.addEventListener('input', (e) => {
            this.state.description = e.target.value;
            this.state.isDirty = true;
        });

        this.elements.authorInput?.addEventListener('input', (e) => {
            this.state.author = e.target.value;
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
        this.elements.maxDiceSelect?.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            this.state.maxDice = val;
            if (this.elements.maxDiceVal) this.elements.maxDiceVal.textContent = val;

            if (this.state.diceBrushValue > this.state.maxDice) {
                this.state.diceBrushValue = this.state.maxDice;
            }
            this.renderDicePalette();
            this.state.isDirty = true;
        });

        this.elements.diceSidesSelect?.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            this.state.diceSides = val;
            if (this.elements.diceSidesVal) this.elements.diceSidesVal.textContent = val;

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

        // Shared players (Map & Scenario)
        this.elements.editorSharedBots?.addEventListener('change', () => this.onSharedPlayersChange());
        this.elements.editorSharedBotAI?.addEventListener('change', () => this.onSharedPlayersChange());

        // Save button (calls saveAsMap or saveAsScenario based on type)
        this.elements.saveBtn?.addEventListener('click', () => this.handleSave());
        this.elements.randomizeBtn?.addEventListener('click', () => this.handleRandomize());

        // Config inputs (Random dialog) - sync and regenerate on change
        this.elements.editorMapSize?.addEventListener('input', (e) => {
            const idx = parseInt(e.target.value) - 1;
            const preset = CONFIG_MAP_SIZE_PRESETS[Math.max(0, Math.min(idx, CONFIG_MAP_SIZE_PRESETS.length - 1))];
            if (this.elements.editorMapSizeVal) this.elements.editorMapSizeVal.textContent = preset.label;
            this.handleRandomize();
        });
        this.elements.editorMapStyle?.addEventListener('change', () => this.handleRandomize());
        this.elements.editorGameMode?.addEventListener('change', () => this.handleRandomize());

        // Quick actions
        this.elements.clearBtn?.addEventListener('click', () => this.clearGrid());
        this.elements.fillBtn?.addEventListener('click', () => this.fillGrid());

        // Keyboard shortcuts (capture phase so we can handle WASD/arrows before InputManager)
        document.addEventListener('keydown', (e) => {
            if (!this.isOpen) return;

            // Ignore if typing in input fields
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const key = e.key.toLowerCase();

            // WASD and arrow keys: pan the map (inverted - W/Up pans down, etc.)
            const panMap = {
                'w': { x: 0, y: 1 }, 'arrowup': { x: 0, y: 1 },
                's': { x: 0, y: -1 }, 'arrowdown': { x: 0, y: -1 },
                'a': { x: 1, y: 0 }, 'arrowleft': { x: 1, y: 0 },
                'd': { x: -1, y: 0 }, 'arrowright': { x: -1, y: 0 }
            };
            if (panMap[key] && this.renderer) {
                const panSpeed = 15;
                this.renderer.pan(panMap[key].x * panSpeed, panMap[key].y * panSpeed);
                e.preventDefault();
                e.stopImmediatePropagation();
                return;
            }

            if (e.key === 'Escape') {
                this.close();
            } else if (key === 'y') {
                this.setMode('paint');
            } else if (key === 'r') {
                this.setMode('assign');
            } else if (key === 'f') {
                this.setMode('dice');
            } else {
                // Handle number/letter keys for direct value input
                const keyMap = {
                    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
                    'q': 10, 'e': 11, 't': 12, 'z': 13, 'u': 14, 'g': 15, 'b': 16
                };
                const value = keyMap[key];
                if (value !== undefined) {
                    this.handleNumberKey(value);
                }
            }
        }, true); // capture: true so we run before InputManager for WASD/arrows

        // Gamepad: move event for pan and D-pad Left/Right for Assign/Dice
        this.boundMoveHandler = (data) => {
            if (!this.isOpen || !this.renderer) return;
            const { x: dx, y: dy } = data;
            const panSpeed = 15;
            if (dx !== 0 && dy === 0) {
                if (dx === -1) this.setMode('dice');
                else if (dx === 1) this.setMode('assign');
            } else if (dx !== 0 || dy !== 0) {
                this.renderer.pan(-dx * panSpeed, -dy * panSpeed);
            }
        };
        this.inputManager?.on('move', this.boundMoveHandler);
    }

    /**
     * Handle number key presses to directly set tile values
     */
    handleNumberKey(value) {
        // Need a hovered tile to operate on
        if (!this.state.hoveredTile) return;

        const { x, y } = this.state.hoveredTile;
        const key = `${x},${y}`;
        const tile = this.state.tiles.get(key);

        switch (this.state.currentMode) {
            case 'assign':
                // Set player directly (0-indexed, value is player ID)
                if (value >= 0 && value < this.state.players.length) {
                    if (!tile) {
                        // Create tile if it doesn't exist
                        const cached = this.state.deletedTiles.get(key);
                        this.state.tiles.set(key, {
                            owner: value,
                            dice: cached?.dice || 1
                        });
                        this.state.deletedTiles.delete(key);
                    } else {
                        tile.owner = value;
                    }
                    this.state.isDirty = true;
                    this.renderToCanvas();
                }
                break;

            case 'dice':
                // Set dice directly (1-indexed, 0 means 1 die)
                const diceValue = value === 0 ? 1 : value;
                if (diceValue >= 1 && diceValue <= this.state.maxDice) {
                    if (!tile) {
                        // Create tile if it doesn't exist
                        const cached = this.state.deletedTiles.get(key);
                        this.state.tiles.set(key, {
                            owner: cached?.owner ?? 0,
                            dice: diceValue
                        });
                        this.state.deletedTiles.delete(key);
                    } else {
                        tile.dice = diceValue;
                    }
                    this.state.isDirty = true;
                    this.renderToCanvas();
                }
                break;
        }
    }

    /**
     * Update cursor preview position and content (disabled)
     */
    updateCursorPreview(x, y) {
        // Cursor preview disabled
        return;

        // Helper to render box content
        const renderBox = (element, type, mode, isSecondary) => {
            element.innerHTML = '';
            element.className = 'preview-content'; // Reset class

            // Determine effective values
            let player = this.state.selectedPlayer;
            let dice = this.state.diceBrushValue;

            // Handle Paint mode logic
            let action = 'add';
            if (mode === 'paint') {
                if (this.state.paintMode === 'add') {
                    // Add mode: Left=Add, Right=Remove
                    action = isSecondary ? 'remove' : 'add';
                } else {
                    // Remove mode: Both=Remove
                    action = 'remove';
                }
            } else if (mode === 'assign' || mode === 'dice') {
                action = 'modify';
            }

            // Render
            if (action === 'remove') {
                element.innerHTML = '✖';
                element.classList.add('preview-tile-remove');
                element.style.background = 'rgba(0,0,0,0.8)';
                element.style.borderColor = '#aaa';
            } else {
                // Get player color
                const pObj = this.state.players.find(p => p.id === player);
                const color = pObj ? pObj.color : 0xffffff;
                const hex = '#' + color.toString(16).padStart(6, '0');

                element.style.background = hex;
                element.style.borderColor = '#fff';
                element.style.color = getContrastColor(color); // We need a helper for contrast text

                // Content
                if (mode === 'assign') {
                    // Just show color, maybe player ID small
                    element.textContent = ''; // Just color block
                } else {
                    // Show dice number
                    element.textContent = dice;
                    element.classList.add('preview-tile-dice');
                }
            }
        };

        renderBox(this.elements.cursorPreviewPrimary, 'primary', this.state.currentMode, false);
        renderBox(this.elements.cursorPreviewSecondary, 'secondary', this.state.currentMode, true);
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
        if (this.handleCanvasMouseUpGlobal) window.removeEventListener('mouseup', this.handleCanvasMouseUpGlobal);
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

        // onCanvasMouseOut handler for hiding cursor and clearing hover
        this.handleCanvasMouseOut = () => {
            this.elements.cursorPreview?.classList.add('hidden');
            // Clear hover tile highlight and state
            this.state.hoveredTile = null;
            if (this.renderer && this.renderer.grid) {
                this.renderer.grid.setHover(null, null);
                this.renderToCanvas();
            }
        };

        // Add listeners (window mouseup catches release outside canvas)
        this.handleCanvasMouseUpGlobal = () => {
            if (this.isPainting) this.onCanvasMouseUp();
        };
        canvas.addEventListener('mousedown', this.handleCanvasMouseDown);
        canvas.addEventListener('mousemove', this.handleCanvasMouseMove);
        canvas.addEventListener('mouseup', this.handleCanvasMouseUp);
        window.addEventListener('mouseup', this.handleCanvasMouseUpGlobal);
        canvas.addEventListener('mouseout', this.handleCanvasMouseOut);
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

        // Close Random dialog when user clicks on map
        this.setRandomDialogOpen(false);

        // Middle click (1) is for panning (handled by InputController)
        if (e.button === 1) return;

        const tile = this.screenToTile(e.clientX, e.clientY);
        if (tile) {
            this.isPainting = true;
            this.mouseStrokeStartTile = { x: tile.x, y: tile.y };
            this.mouseStrokeMovedToOther = false;
            this.currentInteractionButton = e.button;
            this.currentInteractionShift = e.shiftKey;
            this.lastPaintedTile = `${tile.x},${tile.y}`;

            const isScenarioLeft = this.state.editorType === 'scenario' && e.button === 0 &&
                (this.state.currentMode === 'assign' || this.state.currentMode === 'dice');
            if (e.button === 2 || !isScenarioLeft) {
                this.handleTileInteraction(tile.x, tile.y, e.button, e.shiftKey, true);
            }
        }
    }

    onCanvasMouseMove(e) {
        if (!this.isOpen) return;

        const tile = this.screenToTile(e.clientX, e.clientY);

        // Update hovered tile state for keyboard input
        this.state.hoveredTile = tile;

        // Update hover tile highlight
        if (this.renderer && this.renderer.grid) {
            if (tile) {
                this.renderer.grid.setHover(tile.x, tile.y);
            } else {
                this.renderer.grid.setHover(null, null);
            }
            this.renderToCanvas();
        }

        if (this.isPainting && tile) {
            const key = `${tile.x},${tile.y}`;
            if (this.lastPaintedTile !== key) {
                this.mouseStrokeMovedToOther = true;
                if (this.state.editorType === 'scenario' && this.currentInteractionButton === 0 &&
                    (this.state.currentMode === 'assign' || this.state.currentMode === 'dice')) {
                    if (this.mouseBrushValue === null && this.mouseStrokeStartTile) {
                        const sk = `${this.mouseStrokeStartTile.x},${this.mouseStrokeStartTile.y}`;
                        const startTile = this.state.tiles.get(sk);
                        this.mouseBrushValue = startTile
                            ? { owner: startTile.owner, dice: startTile.dice || 1 }
                            : { owner: 0, dice: 1 };
                    }
                }
                this.handleTileInteraction(tile.x, tile.y, this.currentInteractionButton, this.currentInteractionShift, true);
                this.lastPaintedTile = key;
            }
        }

        // Update cursor preview
        this.updateCursorPreview(e.clientX, e.clientY);
    }

    onCanvasMouseUp() {
        if (this.isPainting && this.mouseStrokeStartTile && !this.mouseStrokeMovedToOther &&
            this.currentInteractionButton === 0 && this.state.editorType === 'scenario' &&
            (this.state.currentMode === 'assign' || this.state.currentMode === 'dice')) {
            const key = `${this.mouseStrokeStartTile.x},${this.mouseStrokeStartTile.y}`;
            this.handleTileInteraction(this.mouseStrokeStartTile.x, this.mouseStrokeStartTile.y, 0, false, false);
        }
        this.isPainting = false;
        this.lastPaintedTile = null;
        this.mouseStrokeStartTile = null;
        this.mouseStrokeMovedToOther = false;
        this.currentInteractionButton = null;
        this.currentInteractionShift = false;
        this.mouseBrushValue = null;
    }

    onCanvasTouchStart(e) {
        if (!this.isOpen) return;

        this.setRandomDialogOpen(false);

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
        this.mouseBrushValue = null; // Desktop scenario mode: { owner, dice } sampled from first tile
    }

    /**
     * Open editor with optional existing scenario/level
     * @param {Object|null} scenario - Level data (map/scenario) or null for new
     * @param {Object} options - { campaign, levelIndex, onSave, onClose, isNew }
     */
    async open(scenario = null, options = {}) {
        this.editorOptions = options?.campaign ? options : null;
        this.onClose = options.onClose || null;

        if (scenario) {
            this.importFromScenario(scenario);
        } else {
            this.state = this.createEmptyState();
        }

        // In campaign mode, clear name/description (not used)
        if (this.editorOptions) {
            this.state.name = '';
            this.state.description = '';
        }

        // Update game adapter reference
        this.gameAdapter = new EditorGameAdapter(this.state);

        // Store original game and switch renderer to editor mode
        if (this.renderer) {
            this.originalGame = this.renderer.game;
            this.renderer.game = this.gameAdapter;
            this.renderer.grid.game = this.gameAdapter;
            this.renderer.grid.setShowMapBounds(true);
            this.renderer.setDiceSides(this.state.diceSides);
        }

        // Hide game UI, show editor UI
        this.elements.gamePanel?.classList.add('hidden');
        this.elements.endTurnBtn?.classList.add('hidden');
        this.elements.aiToggleBtn?.classList.add('hidden');
        this.elements.setupModal?.classList.add('hidden');
        this.elements.overlay?.classList.remove('hidden');
        if (this.renderer) this.renderer.editorActive = true;

        this.updateEditorInputHints();

        // Set slider limits from GAME constants
        if (this.elements.maxDiceSelect) {
            this.elements.maxDiceSelect.max = GAME.MAX_DICE_PER_TERRITORY;
        }
        if (this.elements.diceSidesSelect) {
            this.elements.diceSidesSelect.max = GAME.MAX_DICE_SIDES;
        }

        // Update UI to match state
        this.updateUIFromState();
        this.updateCampaignModeUI();
        this.syncSharedPlayersToUI();
        this.renderPaintPalette();
        this.renderPlayerPalette();
        this.renderDicePalette();
        this.setEditorType(this.state.editorType);
        this.updateSaveButtonText();

        // New map: expand Random section and do 1 immediate random generation
        const isNewEmptyMap = this.editorOptions?.isNew && this.state.editorType === 'map' && this.state.tiles.size === 0;
        if (isNewEmptyMap) {
            this.setRandomDialogOpen(true);
            this.syncConfigFromUI();
            await this.regenerateConfigPreview();
        } else {
            this.setRandomDialogOpen(false);
        }

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
        this.stopConfigPreview();
        if (this.renderer && this.renderer.grid) {
            this.renderer.grid.setPaintMode(false);
            this.renderer.grid.setShowMapBounds(false);
        }

        // Restore original game
        if (this.renderer && this.originalGame) {
            this.renderer.game = this.originalGame;
            this.renderer.grid.game = this.originalGame;
            this.renderer.draw();
        }

        // Hide editor UI, show game UI
        if (this.renderer) this.renderer.editorActive = false;
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
            this.renderer.autoFitCamera(0.5); // Zoom out to 50% relative to fit
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
     * Show/hide name/description/author in campaign mode
     */
    updateSaveButtonText() {
        const btn = this.elements.saveBtn;
        if (!btn) return;
        const idx = this.editorOptions?.levelIndex;
        btn.textContent = idx != null ? `💾 Save #${idx + 1}` : '💾 Save';
    }

    handleSave() {
        if (this.state.editorType === 'map') return this.saveAsMap();
        if (this.state.editorType === 'scenario') return this.saveAsScenario();
    }

    async handleRandomize() {
        this.syncConfigFromUI();
        await this.regenerateConfigPreview();
        this.renderToCanvas();
    }

    setRandomDialogOpen(open) {
        if (open) {
            this.elements.randomDialog?.classList.remove('hidden');
            this.elements.randomBtn?.classList.add('active');
            if (this.state.configData) this.syncConfigToUI();
            // Initial randomize when opening
            this.syncConfigFromUI();
            this.setEditorType('map');
            this.regenerateConfigPreview().then(() => this.renderToCanvas());
        } else {
            this.elements.randomDialog?.classList.add('hidden');
            this.elements.randomBtn?.classList.remove('active');
        }
    }

    toggleRandomDialog() {
        const isOpen = !this.elements.randomDialog?.classList.contains('hidden');
        this.setRandomDialogOpen(!isOpen);
    }

    updateCampaignModeUI() {
        const inCampaign = !!this.editorOptions;
        const row = (id) => this.elements[id]?.closest('.control-group');
        const hideInCampaign = [row('nameInput'), row('descriptionInput'), row('authorInput')];
        const sizeRow = this.elements.widthSlider?.closest('.control-row');
        if (sizeRow) hideInCampaign.push(sizeRow);
        hideInCampaign.forEach(el => {
            if (el) el.style.display = inCampaign ? 'none' : '';
        });
    }

    /**
     * Update UI elements from state
     */
    updateUIFromState() {
        if (this.elements.idInput) this.elements.idInput.value = this.state.id || '';
        if (this.elements.nameInput) this.elements.nameInput.value = this.state.name;
        if (this.elements.descriptionInput) this.elements.descriptionInput.value = this.state.description;
        if (this.elements.authorInput) this.elements.authorInput.value = this.state.author || '';
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

            btn.addEventListener('click', () => {
                this.state.diceBrushValue = i;
                this.renderDicePalette();
            });

            container.appendChild(btn);
        }
    }

    /**
     * Handle tile click/drag interaction
     * @param {boolean} isMouse - true for desktop mouse (new behavior), false/undefined for touch (legacy behavior)
     */
    handleTileInteraction(x, y, button = 0, shiftKey = false, isMouse = false) {
        const key = `${x},${y}`;
        const tile = this.state.tiles.get(key);
        const isRightClick = button === 2;

        // Desktop/mouse: simplified behavior
        if (isMouse) {
            if (isRightClick) {
                this.state.tiles.delete(key);
                this.state.deletedTiles.delete(key);
            } else if (this.state.editorType === 'map') {
                this.state.tiles.set(key, { owner: 0, dice: 1 });
            } else {
                // Scenario mode: brush - sample from first tile, apply to all
                if (this.state.currentMode === 'assign' || this.state.currentMode === 'dice') {
                    if (this.mouseBrushValue === null) {
                        this.mouseBrushValue = tile
                            ? { owner: tile.owner, dice: tile.dice || 1 }
                            : { owner: 0, dice: 1 };
                    }
                    const v = this.mouseBrushValue;
                    this.state.tiles.set(key, { owner: v.owner, dice: Math.min(v.dice, this.state.maxDice) });
                    this.state.deletedTiles.delete(key);
                }
            }
            this.state.isDirty = true;
            this.renderToCanvas();
            return;
        }

        // Touch (legacy): cycle increase/decrease
        const isDecrease = isRightClick;
        if (this.state.editorType === 'map') {
            if (tile) this.state.tiles.delete(key);
            else this.state.tiles.set(key, { owner: 0, dice: 1 });
        } else {
            switch (this.state.currentMode) {
                case 'assign':
                    const playerCount = this.state.players.length;
                    if (!tile) {
                        const cached = this.state.deletedTiles.get(key);
                        if (isDecrease) {
                            this.state.tiles.set(key, { owner: playerCount - 1, dice: cached?.dice || 1 });
                        } else {
                            this.state.tiles.set(key, { owner: 0, dice: cached?.dice || 1 });
                        }
                        this.state.deletedTiles.delete(key);
                    } else {
                        if (isDecrease) {
                            if (tile.owner <= 0) {
                                this.state.deletedTiles.set(key, { ...tile });
                                this.state.tiles.delete(key);
                            } else tile.owner -= 1;
                        } else {
                            if (tile.owner >= playerCount - 1) {
                                this.state.deletedTiles.set(key, { ...tile });
                                this.state.tiles.delete(key);
                            } else tile.owner += 1;
                        }
                    }
                    break;
                case 'dice':
                    if (!tile) {
                        const cached = this.state.deletedTiles.get(key);
                        if (isDecrease) {
                            this.state.tiles.set(key, { owner: cached?.owner ?? 0, dice: this.state.maxDice });
                        } else {
                            this.state.tiles.set(key, { owner: cached?.owner ?? 0, dice: 1 });
                        }
                        this.state.deletedTiles.delete(key);
                    } else {
                        if (isDecrease) {
                            if (tile.dice <= 1) {
                                this.state.deletedTiles.set(key, { ...tile });
                                this.state.tiles.delete(key);
                            } else tile.dice -= 1;
                        } else {
                            if (tile.dice >= this.state.maxDice) {
                                this.state.deletedTiles.set(key, { ...tile });
                                this.state.tiles.delete(key);
                            } else tile.dice += 1;
                        }
                    }
                    break;
                case 'paint':
                    break;
            }
        }

        this.state.isDirty = true;
        this.renderToCanvas();
    }

    /**
     * Switch editor type (map vs scenario)
     */
    setEditorType(type) {
        this.state.editorType = type;

        // Update toggle button active states
        this.elements.editorTypeMapBtn?.classList.toggle('active', type === 'map');
        this.elements.editorTypeScenarioBtn?.classList.toggle('active', type === 'scenario');

        // Get mode tab buttons
        const paintTab = document.querySelector('.editor-tab[data-mode="paint"]');
        const assignTab = document.querySelector('.editor-tab[data-mode="assign"]');
        const diceTab = document.querySelector('.editor-tab[data-mode="dice"]');

        if (type === 'map') {
            this.elements.mapScenarioSection?.classList.remove('hidden');
            this.elements.quickActions?.classList.remove('hidden');
            this.stopConfigPreview();
            this.elements.bottomBar?.classList.add('hidden');
            this.elements.sharedPlayersSection?.classList.remove('hidden');
            this.elements.diceSettingsSection?.classList.remove('hidden');
            this.elements.saveBtn?.classList.remove('hidden');
            this.updateSaveButtonText();
            this.rebuildPlayersFromScenarioConfig();
            this.renderColorLegend();

            // Switch to paint mode internally
            this.state.currentMode = 'paint';

            // Enable paint mode on renderer (tiles render gray)
            if (this.renderer && this.renderer.grid) {
                this.renderer.grid.invalidate(); // Force full redraw
                this.renderer.grid.setPaintMode(true);
            }
        } else {
            this.elements.mapScenarioSection?.classList.remove('hidden');
            this.elements.quickActions?.classList.remove('hidden');
            this.stopConfigPreview();
            this.elements.bottomBar?.classList.remove('hidden');
            paintTab?.classList.add('hidden');
            assignTab?.classList.remove('hidden');
            diceTab?.classList.remove('hidden');
            this.elements.sharedPlayersSection?.classList.remove('hidden');
            this.elements.diceSettingsSection?.classList.remove('hidden');
            this.elements.saveBtn?.classList.remove('hidden');
            this.updateSaveButtonText();
            this.rebuildPlayersFromScenarioConfig();
            this.renderColorLegend();

            // Switch to dice mode (default for scenario)
            this.setMode('dice');

            // Disable paint mode on renderer (tiles render with colors)
            if (this.renderer && this.renderer.grid) {
                this.renderer.grid.invalidate(); // Force full redraw
                this.renderer.grid.setPaintMode(false);
            }
        }

        this.renderToCanvas();
    }

    syncSharedPlayersToUI() {
        const bots = this.state.bots ?? 2;
        const botAI = this.state.botAI ?? 'easy';
        if (this.elements.editorSharedBots) this.elements.editorSharedBots.value = String(bots);
        if (this.elements.editorSharedBotAI) this.elements.editorSharedBotAI.value = botAI;
    }

    onSharedPlayersChange() {
        this.state.bots = parseInt(this.elements.editorSharedBots?.value || '2', 10);
        this.state.botAI = this.elements.editorSharedBotAI?.value || 'easy';
        this.rebuildPlayersFromScenarioConfig();
        this.renderColorLegend();
        if (this.state.editorType === 'scenario') this.renderPlayerPalette();
        this.state.isDirty = true;
        this.renderToCanvas();
    }

    rebuildPlayersFromScenarioConfig() {
        const bots = parseInt(this.elements.editorSharedBots?.value || '2', 10);
        const humans = 1;
        const botAI = this.elements.editorSharedBotAI?.value || 'easy';
        const total = Math.max(2, Math.min(8, humans + bots));

        const players = [];
        for (let i = 0; i < total; i++) {
            const isHuman = i < humans;
            players.push({
                id: i,
                isBot: !isHuman,
                color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
                aiId: isHuman ? null : botAI
            });
        }

        const oldPlayers = this.state.players;
        const ownerRemap = {};
        oldPlayers.forEach((p, i) => { ownerRemap[p.id] = i < total ? i : 0; });

        for (const [key, tile] of this.state.tiles) {
            const newOwner = ownerRemap[tile.owner] ?? 0;
            if (newOwner !== tile.owner) tile.owner = newOwner;
        }

        this.state.players = players;
        if (this.state.selectedPlayer >= players.length) this.state.selectedPlayer = 0;
    }

    renderColorLegend() {
        const el = this.elements.colorLegend;
        if (!el) return;
        el.innerHTML = '';
        this.state.players.forEach((p, i) => {
            const colorHex = '#' + DEFAULT_COLORS[i % DEFAULT_COLORS.length].toString(16).padStart(6, '0');
            const label = p.isBot ? `P${i + 1} Bot` : `P${i + 1} Human`;
            const span = document.createElement('span');
            span.className = 'editor-legend-item';
            span.innerHTML = `<span class="editor-legend-swatch" style="background:${colorHex}"></span> ${label}`;
            el.appendChild(span);
        });
    }

    syncConfigFromUI() {
        const sliderVal = parseInt(this.elements.editorMapSize?.value || '4', 10);
        const preset = CONFIG_MAP_SIZE_PRESETS[Math.max(0, Math.min(sliderVal - 1, CONFIG_MAP_SIZE_PRESETS.length - 1))];
        const mapSize = `${preset.width}x${preset.height}`;
        this.state.configData = {
            mapSize,
            mapStyle: this.elements.editorMapStyle?.value || 'islands',
            gameMode: this.elements.editorGameMode?.value || 'classic'
        };
    }

    syncConfigToUI() {
        const cfg = this.state.configData || {};
        const mapSize = cfg.mapSize || '6x6';
        const [w, h] = mapSize.split('x').map(Number);
        const presetIdx = CONFIG_MAP_SIZE_PRESETS.findIndex(p => p.width === w && p.height === h);
        const sliderVal = presetIdx >= 0 ? presetIdx + 1 : 4;
        if (this.elements.editorMapSize) {
            this.elements.editorMapSize.value = sliderVal;
            if (this.elements.editorMapSizeVal) {
                this.elements.editorMapSizeVal.textContent = CONFIG_MAP_SIZE_PRESETS[sliderVal - 1]?.label || mapSize;
            }
        }
        if (this.elements.editorMapStyle) this.elements.editorMapStyle.value = cfg.mapStyle || 'random';
        if (this.elements.editorGameMode) this.elements.editorGameMode.value = cfg.gameMode || 'classic';
    }

    async regenerateConfigPreview() {
        const cfg = this.state.configData;
        if (!cfg) return;

        // Use current editor players (respects Bots, Bot AI from right panel)
        this.rebuildPlayersFromScenarioConfig();
        const players = this.state.players;
        const maxDice = this.state.maxDice;
        const diceSides = this.state.diceSides;

        const { MapManager } = await import('../core/map.js');
        const [genW, genH] = (cfg.mapSize || '6x6').split('x').map(Number);
        const map = new MapManager();
        map.generateMap(genW, genH, players, maxDice, cfg.mapStyle || 'random');

        // Canvas stays 20x20; place generated map centered
        const CANVAS_SIZE = 20;
        this.state.width = CANVAS_SIZE;
        this.state.height = CANVAS_SIZE;
        this.state.tiles.clear();

        const offsetX = Math.floor((CANVAS_SIZE - genW) / 2);
        const offsetY = Math.floor((CANVAS_SIZE - genH) / 2);
        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                const t = map.tiles[y * map.width + x];
                if (t && !t.blocked) {
                    const key = `${x + offsetX},${y + offsetY}`;
                    this.state.tiles.set(key, { owner: t.owner, dice: t.dice || 1 });
                }
            }
        }

        // Apply start mode (gameMode) from Random dialog
        const gameMode = cfg.gameMode || 'classic';
        this.applyGameModeToState(gameMode, maxDice);

        this.gameAdapter.syncFromState();
        if (this.renderer?.grid) this.renderer.grid.invalidate();
        this.updateUIFromState();
    }

    applyGameModeToState(gameMode, maxDice) {
        if (gameMode === 'madness') {
            for (const tile of this.state.tiles.values()) {
                tile.dice = maxDice;
            }
        } else if (gameMode === '2of2') {
            for (const tile of this.state.tiles.values()) {
                tile.dice = 2;
            }
        } else if (gameMode === 'fair') {
            const stats = this.state.players.map(p => {
                const tiles = [...this.state.tiles.entries()]
                    .filter(([, t]) => t.owner === p.id)
                    .map(([k, t]) => t);
                return { tiles, totalDice: tiles.reduce((s, t) => s + t.dice, 0) };
            });
            const minDice = Math.min(...stats.map(s => s.totalDice));
            for (const s of stats) {
                let excess = s.totalDice - minDice;
                const reducible = s.tiles.filter(t => t.dice > 1);
                while (excess > 0 && reducible.length > 0) {
                    const idx = Math.floor(Math.random() * reducible.length);
                    const tile = reducible[idx];
                    tile.dice--;
                    excess--;
                    if (tile.dice <= 1) {
                        reducible[idx] = reducible[reducible.length - 1];
                        reducible.pop();
                    }
                }
            }
        }
    }

    stopConfigPreview() {
        if (this.configPreviewInterval) {
            clearInterval(this.configPreviewInterval);
            this.configPreviewInterval = null;
        }
    }

    /**
     * Switch editor mode (paint, assign, dice)
     */
    setMode(mode) {
        this.state.currentMode = mode;

        this.elements.modeTabs?.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.mode === mode);
        });

        this.elements.paintToolbar?.classList.toggle('hidden', mode !== 'paint');
        this.elements.assignToolbar?.classList.toggle('hidden', mode !== 'assign');
        this.elements.diceToolbar?.classList.toggle('hidden', mode !== 'dice');

        this.renderToCanvas();
    }


    syncScenarioConfigToUI() {
        const bots = this.state.players.filter(p => p.isBot).length;
        const botAI = this.state.players.find(p => p.isBot)?.aiId || 'easy';
        if (this.elements.editorSharedBots) this.elements.editorSharedBots.value = String(Math.max(0, bots));
        if (this.elements.editorSharedBotAI) this.elements.editorSharedBotAI.value = botAI;
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

            const colorHex = '#' + player.color.toString(16).padStart(6, '0');
            swatch.style.backgroundColor = colorHex;
            swatch.textContent = player.id + 1;
            swatch.title = `Player ${player.id + 1}`;

            swatch.addEventListener('click', () => {
                this.state.selectedPlayer = player.id;
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
    async saveAsMap() {
        this.state.bots = parseInt(this.elements.editorSharedBots?.value || '2', 10);
        this.state.botAI = this.elements.editorSharedBotAI?.value || 'easy';
        if (this.state.tiles.size === 0) {
            this.showStatus('Add at least one tile first', 'error');
            return null;
        }

        const bounds = this.computeMinimalBounds();
        if (!bounds) return null;

        const mapData = {
            type: 'map',
            width: bounds.width,
            height: bounds.height,
            bots: this.state.bots ?? 2,
            botAI: this.state.botAI ?? 'easy',
            maxDice: this.state.maxDice ?? 9,
            diceSides: this.state.diceSides ?? 6,
            tiles: Array.from(this.state.tiles.entries()).map(([key]) => {
                const [x, y] = key.split(',').map(Number);
                return { x: x - bounds.minX, y: y - bounds.minY };
            })
        };

        if (this.editorOptions?.onSave) {
            try {
                this.editorOptions.onSave(mapData);
                this.state.isDirty = false;
                this.showStatus('Saved!', 'success');
                this.close();
                return mapData;
            } catch (e) {
                this.showStatus('Failed to save', 'error');
                return null;
            }
        }

        let name = this.state.name.trim() || 'Untitled Map';
        this.state.name = name;
        if (this.elements.nameInput) this.elements.nameInput.value = name;
        mapData.name = name;
        mapData.description = this.state.description;
        mapData.isBuiltIn = false;
        mapData.author = this.state.author || 'User';
        mapData.createdAt = Date.now();

        const existing = this.scenarioManager.getScenario(name);
        if (existing && !(await Dialog.confirm(`A map with name "${name}" already exists. Overwrite?`))) {
            return null;
        }

        try {
            this.scenarioManager.saveEditorScenario(mapData);
            this.state.isDirty = false;
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
    async saveAsScenario() {
        this.state.bots = parseInt(this.elements.editorSharedBots?.value || '2', 10);
        this.state.botAI = this.elements.editorSharedBotAI?.value || 'easy';
        this.rebuildPlayersFromScenarioConfig();
        if (this.state.tiles.size === 0) {
            this.showStatus('Add at least one tile first', 'error');
            return null;
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

        const bounds = this.computeMinimalBounds();
        if (!bounds) return null;

        const scenarioData = {
            type: 'scenario',
            width: bounds.width,
            height: bounds.height,
            maxDice: this.state.maxDice,
            diceSides: this.state.diceSides,
            players: this.state.players.map(p => ({
                id: p.id,
                isBot: p.isBot,
                color: DEFAULT_COLORS[p.id % DEFAULT_COLORS.length],
                storedDice: 0,
                aiId: p.aiId
            })),
            tiles: Array.from(this.state.tiles.entries()).map(([key, tile]) => {
                const [x, y] = key.split(',').map(Number);
                return { x: x - bounds.minX, y: y - bounds.minY, owner: tile.owner, dice: tile.dice || 1 };
            })
        };

        if (this.editorOptions?.onSave) {
            try {
                this.editorOptions.onSave(scenarioData);
                this.state.isDirty = false;
                this.showStatus('Saved!', 'success');
                this.close();
                return scenarioData;
            } catch (e) {
                this.showStatus('Failed to save', 'error');
                return null;
            }
        }

        let name = this.state.name.trim() || 'Untitled Scenario';
        this.state.name = name;
        if (this.elements.nameInput) this.elements.nameInput.value = name;
        scenarioData.name = name;
        scenarioData.description = this.state.description;
        scenarioData.isBuiltIn = false;
        scenarioData.author = this.state.author || 'User';
        scenarioData.createdAt = Date.now();

        const existing = this.scenarioManager.getScenario(name);
        if (existing && !(await Dialog.confirm(`A scenario with name "${name}" already exists. Overwrite?`))) {
            return null;
        }

        try {
            this.scenarioManager.saveEditorScenario(scenarioData);
            this.state.isDirty = false;
            this.showStatus('Scenario saved!', 'success');
            return scenarioData;
        } catch (e) {
            console.error('Failed to save scenario:', e);
            this.showStatus('Failed to save', 'error');
            return null;
        }
    }

    /**
     * Save as config (procedural level)
     */
    async saveAsConfig() {
        this.syncConfigFromUI();
        const cfg = this.state.configData;
        if (!cfg) {
            this.showStatus('Invalid config', 'error');
            return null;
        }
        const configData = {
            type: 'config',
            mapSize: cfg.mapSize || '6x6',
            mapStyle: cfg.mapStyle || 'islands',
            gameMode: cfg.gameMode || 'classic',
            bots: 2,
            botAI: 'easy',
            maxDice: 8,
            diceSides: 6
        };
        if (this.editorOptions?.onSave) {
            try {
                this.editorOptions.onSave(configData);
                this.state.isDirty = false;
                this.showStatus('Saved!', 'success');
                this.close();
                return configData;
            } catch (e) {
                this.showStatus('Failed to save', 'error');
                return null;
            }
        }
        this.showStatus('Config save only supported in campaign', 'error');
        return null;
    }

    /**
     * Import from existing scenario/map/config
     */
    importFromScenario(scenario) {
        this.state = this.createEmptyState(20, 20);

        if (scenario.type === 'config') {
            this.state.editorType = 'map';
            this.state.configData = {
                mapSize: scenario.mapSize || '6x6',
                mapStyle: scenario.mapStyle || 'islands',
                gameMode: scenario.gameMode || 'classic'
            };
        } else if (this.editorOptions?.isNew && scenario.type === 'map' && (!scenario.tiles || scenario.tiles.length === 0)) {
            this.state.editorType = 'map';
            if (!this.state.configData) {
                this.state.configData = { mapSize: '6x6', mapStyle: 'islands', gameMode: 'classic' };
            }
        } else {
            this.state.editorType = scenario.type === 'scenario' ? 'scenario' : 'map';
            const botCount = (scenario.players || []).filter(p => p.isBot).length;
            this.state.bots = scenario.bots ?? (scenario.players?.length ? botCount : 2);
            this.state.botAI = scenario.botAI ?? 'easy';
        }
        if (!this.editorOptions) {
            this.state.name = scenario.isBuiltIn ? scenario.name + ' (Copy)' : (scenario.name || '');
            this.state.description = scenario.description || '';
            this.state.author = scenario.isBuiltIn ? 'User' : (scenario.author || 'User');
        }
        this.state.maxDice = scenario.maxDice || 9;
        this.state.diceSides = scenario.diceSides || 6;

        if (scenario.players && scenario.players.length > 0) {
            this.state.players = scenario.players.map(p => ({
                id: p.id,
                isBot: p.isBot !== undefined ? p.isBot : true,
                color: DEFAULT_COLORS[p.id % DEFAULT_COLORS.length],
                aiId: p.aiId || (p.isBot ? 'easy' : null)
            }));
        }

        this.state.tiles.clear();
        if (scenario.tiles && scenario.tiles.length > 0) {
            const CANVAS_W = this.state.width;
            const CANVAS_H = this.state.height;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const tile of scenario.tiles) {
                minX = Math.min(minX, tile.x);
                minY = Math.min(minY, tile.y);
                maxX = Math.max(maxX, tile.x);
                maxY = Math.max(maxY, tile.y);
            }
            const loadedW = maxX - minX + 1;
            const loadedH = maxY - minY + 1;
            const offsetX = Math.floor((CANVAS_W - loadedW) / 2);
            const offsetY = Math.floor((CANVAS_H - loadedH) / 2);
            for (const tile of scenario.tiles) {
                const nx = tile.x - minX + offsetX;
                const ny = tile.y - minY + offsetY;
                const key = `${nx},${ny}`;
                this.state.tiles.set(key, {
                    owner: tile.owner !== undefined ? tile.owner : 0,
                    dice: tile.dice || 1
                });
            }
        }

        this.state.isDirty = false;
    }
}
