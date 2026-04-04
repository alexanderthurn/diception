/**
 * MapEditor - Interactive map/scenario editor
 * 
 * Uses the same PixiJS renderer as the game for consistent visuals.
 * Creates adapter classes to make editor state look like a game.
 */

// No longer using generateScenarioId
import { Dialog } from '../ui/dialog.js';
import { GAME } from '../core/constants.js';
import { getInputHint, ACTION_ASSIGN, ACTION_DICE, ACTION_END_TURN } from '../ui/input-hints.js';
import { MapManager } from '../core/map.js';
import { mulberry32, randomSeed } from '../core/rng.js';
import { loadBindings } from '../input/key-bindings.js';
import {
    applyModsDefaultsForPrefix,
    areModsAtDefaultsForPrefix,
    syncModsFieldHighlightsForPrefix,
    setModsPanelUiOpen,
    normalizeAttackSecondsUi,
    getActiveModsSummaryFromDom,
    SETUP_MOD_DEFAULTS,
} from '../ui/mods-panel-helpers.js';

/** Mounted mods fields in editor settings (see shared-mods-fields.js). */
const EDITOR_MODS_PREFIX = 'editor-mods-';

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
        this.maxDice = parseInt(SETUP_MOD_DEFAULTS.maxDice, 10);
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
        // Trackpad mode (no middle button): tap = draw, drag = pan
        this.mouseTrackpadPendingTap = false;
        this.mouseTrackpadIsPanning = false;
        this.mouseTrackpadStartTile = null;
        this.mouseTrackpadStartX = 0;
        this.mouseTrackpadStartY = 0;

        // Callback for when editor closes
        this.onClose = null;

        // Callback for when "Test" is clicked — set by main.js
        this.onTest = null;

        // Campaign context (when editing level in campaign)
        this.editorOptions = null;

        // Saved open args so we can re-open after a test game
        this._openScenario = null;
        this._openOptions = {};

        // Store original game reference to restore
        this.originalGame = null;

        // Gamepad cursor state per source
        this._editorCursorStates = new Map(); // sourceId → { x, y }
        this._editorUIFocusStates = new Map(); // sourceId → { side, buttonIndex }
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

    createEmptyState(width = 16, height = 16) {
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
            maxDice: parseInt(SETUP_MOD_DEFAULTS.maxDice, 10),
            diceSides: parseInt(SETUP_MOD_DEFAULTS.diceSides, 10),
            gameMode: SETUP_MOD_DEFAULTS.gameMode,
            turnTimeLimit: 0,
            bots: 2,
            botAI: 'easy',

            // Editor-only state
            currentMode: 'mapview',
            selectedPlayer: 0,
            paintMode: 'add', // 'add' or 'remove'
            diceBrushValue: 2,
            deletedTiles: new Map(), // Cache for deleted tile data (preserves dice/owner)
            hoveredTile: null, // Currently hovered tile {x, y} for keyboard input
            lastPointerType: 'mouse', // 'mouse' | 'touch' - only show hover preview for mouse
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
        const assignEl = document.getElementById('editor-assign-hint');
        const diceEl = document.getElementById('editor-dice-hint');
        if (!assignEl || !diceEl) return;

        const endTurnHint = getInputHint(ACTION_END_TURN, this.inputManager);
        const isGamepad = endTurnHint?.type === 'gamepad';

        if (isGamepad) {
            // Show Y button on whichever tab Y will activate next; clear the other
            const mode = this.state?.currentMode;
            const applyHint = (el, show) => {
                if (show && endTurnHint) {
                    if (endTurnHint.html) el.innerHTML = endTurnHint.html;
                    else el.textContent = endTurnHint.label;
                    el.className = 'input-hint ' + endTurnHint.style;
                } else {
                    el.textContent = '';
                    el.className = 'input-hint';
                }
            };
            applyHint(assignEl, mode === 'dice');   // Y in dice → assign
            applyHint(diceEl,   mode === 'assign'); // Y in assign → dice
        } else {
            // Keyboard: static R / F shortcuts
            const assignHint = getInputHint(ACTION_ASSIGN, this.inputManager);
            const diceHint   = getInputHint(ACTION_DICE, this.inputManager);
            if (assignHint) { assignEl.textContent = assignHint.label; assignEl.className = 'input-hint ' + assignHint.style; }
            if (diceHint)   { diceEl.textContent   = diceHint.label;   diceEl.className   = 'input-hint ' + diceHint.style; }
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
            settingsToggle: document.getElementById('editor-settings-toggle'),
            settingsPanel: document.querySelector('.editor-settings'),

            mapScenarioSection: document.getElementById('editor-map-scenario-section'),
            randomBtn: document.getElementById('editor-random-btn'),
            randomOwnersBtn: document.getElementById('editor-random-owners-btn'),
            randomDiceBtn: document.getElementById('editor-random-dice-btn'),
            quickActions: document.getElementById('editor-quick-actions'),
            testBtn: document.getElementById('editor-test-btn'),
            saveBtn: document.getElementById('editor-save-btn'),
            editorMapSize: document.getElementById('editor-map-size'),
            editorMapSizeVal: document.getElementById('editor-map-size-val'),

            // Type segmented control (Map / Scenario)
            typeSegmented: document.getElementById('editor-type-segmented'),
            scenarioTabs: document.getElementById('editor-scenario-tabs'),
            editorModsSection: document.getElementById('editor-mods-section'),
            editorModsToggle: document.getElementById('editor-mods-toggle'),
            editorModsReset: document.getElementById('editor-mods-reset'),
            editorModsPanel: document.getElementById('editor-mods-panel'),
            editorModsBadge: document.getElementById('editor-mods-active-badge'),
            editorModsSummary: document.getElementById('editor-mods-summary'),
            editorModsMaxDice: document.getElementById('editor-mods-max-dice'),
            editorModsMaxDiceVal: document.getElementById('editor-mods-max-dice-val'),
            editorModsDiceSides: document.getElementById('editor-mods-dice-sides'),
            editorModsDiceSidesVal: document.getElementById('editor-mods-dice-sides-val'),
            editorModsMapStyle: document.getElementById('editor-mods-map-style'),
            editorModsGameMode: document.getElementById('editor-mods-game-mode'),
            editorModsPlayMode: document.getElementById('editor-mods-play-mode'),
            editorModsTurnLimit: document.getElementById('editor-mods-turn-time-limit'),
            editorModsTurnSeconds: document.getElementById('editor-mods-turn-seconds-limit'),
            editorModsAttackSeconds: document.getElementById('editor-mods-attack-seconds-limit'),
            editorModsFullBoard: document.getElementById('editor-mods-full-board-rule'),
            editorModsAttackRule: document.getElementById('editor-mods-attack-rule'),
            editorModsSupplyRule: document.getElementById('editor-mods-supply-rule'),
            editorModsSeedInput: document.getElementById('editor-seed-input'),
            editorModsSeedRerollBtn: document.getElementById('editor-seed-reroll'),

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
            cursorPreviewSecondary: document.querySelector('#editor-cursor-preview .preview-box.secondary .preview-content'),
            hoverPreview: document.getElementById('editor-hover-preview'),
            hoverPreviewContent: document.querySelector('#editor-hover-preview .editor-hover-preview-content'),
            editorHelpText: document.getElementById('editor-help-text'),
            editorHelpGamepad: document.getElementById('editor-help-gamepad')
        };

        this.bindEvents();
    }

    // ── Gamepad cursor helpers ─────────────────────────────────────────────

    _editorGetCursorState(sourceId) {
        if (!this._editorCursorStates.has(sourceId)) {
            this._editorCursorStates.set(sourceId, { x: null, y: null });
        }
        return this._editorCursorStates.get(sourceId);
    }

    _editorInitCursor(gpIndex, sourceId) {
        const cx = Math.floor((this.state.width ?? 10) / 2);
        const cy = Math.floor((this.state.height ?? 10) / 2);
        const cur = this._editorGetCursorState(sourceId);
        cur.x = cx;
        cur.y = cy;
        this.state.hoveredTile = { x: cx, y: cy };
        this.renderer?.grid?.setHover?.(cx, cy, sourceId);
        this._editorSyncCursor(gpIndex, sourceId);
    }

    _editorSyncCursor(gpIndex, sourceId) {
        if (gpIndex < 0 || !this.renderer) return;
        const cur = this._editorGetCursorState(sourceId);
        if (cur.x === null) return;
        const pos = this.renderer.getTileScreenPosition?.(cur.x, cur.y);
        if (pos) this.inputManager?.emit?.('gamepadCursorMoveRequest', { x: pos.x, y: pos.y, index: gpIndex });
    }

    _editorGetUIButtons(side) {
        if (side === 'right') {
            const panel = document.querySelector('.editor-settings');
            if (!panel) return [];
            return Array.from(panel.querySelectorAll(
                'button:not([disabled]), input[type="range"], input[type="text"], select'
            )).filter(el => !el.disabled && el.offsetParent !== null);
        }
        if (side === 'top') {
            return ['global-back-btn', 'zoom-out-btn', 'zoom-in-btn', 'editor-settings-toggle']
                .map(id => document.getElementById(id))
                .filter(el => el && el.offsetParent !== null);
        }
        return [];
    }

    _editorEnterUIFocus(gpIndex, sourceId, side) {
        const buttons = this._editorGetUIButtons(side);
        if (!buttons.length) return;
        this._editorUIFocusStates.set(sourceId, { side, buttonIndex: 0 });
        document.querySelectorAll('.gamepad-focused').forEach(el => el.classList.remove('gamepad-focused'));
        buttons[0].classList.add('gamepad-focused');
        const rect = buttons[0].getBoundingClientRect();
        if (gpIndex >= 0) {
            this.inputManager?.emit?.('gamepadCursorMoveRequest', {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
                index: gpIndex
            });
        }
    }

    _editorExitUIFocus(gpIndex, sourceId) {
        const focusState = this._editorUIFocusStates.get(sourceId);
        if (!focusState) return;
        const buttons = this._editorGetUIButtons(focusState.side);
        buttons.forEach(b => b.classList.remove('gamepad-focused'));
        this._editorUIFocusStates.delete(sourceId);
        const cur = this._editorGetCursorState(sourceId);
        if (cur.x !== null) {
            this.renderer?.grid?.setHover?.(cur.x, cur.y, sourceId);
            this._editorSyncCursor(gpIndex, sourceId);
        }
    }

    _editorNavigateUIFocus(dx, dy, gpIndex, sourceId) {
        const focusState = this._editorUIFocusStates.get(sourceId);
        if (!focusState) return;
        const { side } = focusState;
        const elements = this._editorGetUIButtons(side);
        if (!elements.length) return;

        const currentEl = elements[focusState.buttonIndex];

        // Top bar: left/right navigates linearly, down exits
        if (side === 'top') {
            if (dy === 1) { this._editorExitUIFocus(gpIndex, sourceId); return; }
            const delta = dx;
            if (delta === 0) return;
            const newIdx = Math.max(0, Math.min(elements.length - 1, focusState.buttonIndex + delta));
            if (newIdx !== focusState.buttonIndex) this._editorMoveFocusTo(focusState, elements, newIdx, gpIndex);
            return;
        }

        // Right panel: build spatial row grid (same approach as navigateModal)
        const withPos = elements.map((el, idx) => {
            const r = el.getBoundingClientRect();
            return { el, idx, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
        });
        withPos.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
        const rows = [];
        for (const item of withPos) {
            const last = rows[rows.length - 1];
            if (last && Math.abs(item.cy - last[0].cy) < 20) last.push(item);
            else rows.push([item]);
        }
        for (const row of rows) row.sort((a, b) => a.cx - b.cx);

        let rowIdx = -1, colIdx = -1;
        for (let r = 0; r < rows.length; r++) {
            const c = rows[r].findIndex(item => item.el === currentEl);
            if (c !== -1) { rowIdx = r; colIdx = c; break; }
        }
        if (rowIdx === -1) return;

        if (dx !== 0) {
            // Range/select: change value in place
            if (currentEl.tagName === 'SELECT' || currentEl.type === 'range') {
                this._editorChangeElementValue(currentEl, dx);
                return;
            }
            // Button/other: navigate within row
            const nextCol = colIdx + dx;
            if (nextCol >= 0 && nextCol < rows[rowIdx].length) {
                this._editorMoveFocusTo(focusState, elements, rows[rowIdx][nextCol].idx, gpIndex);
            } else if (dx === -1) {
                this._editorExitUIFocus(gpIndex, sourceId);
            }
            return;
        }

        if (dy !== 0) {
            const nextRowIdx = rowIdx + dy;
            if (nextRowIdx < 0) { this._editorExitUIFocus(gpIndex, sourceId); return; }
            if (nextRowIdx >= rows.length) return;
            const currentCx = rows[rowIdx][colIdx].cx;
            const target = rows[nextRowIdx].reduce((best, item) =>
                Math.abs(item.cx - currentCx) < Math.abs(best.cx - currentCx) ? item : best
            );
            this._editorMoveFocusTo(focusState, elements, target.idx, gpIndex);
        }
    }

    _editorMoveFocusTo(focusState, elements, newIdx, gpIndex) {
        elements[focusState.buttonIndex].classList.remove('gamepad-focused');
        focusState.buttonIndex = newIdx;
        elements[newIdx].classList.add('gamepad-focused');
        const rect = elements[newIdx].getBoundingClientRect();
        if (gpIndex >= 0) {
            this.inputManager?.emit?.('gamepadCursorMoveRequest', {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
                index: gpIndex
            });
        }
    }

    _editorChangeElementValue(el, direction) {
        if (el.type === 'range') {
            const step = parseFloat(el.step) || 1;
            el.value = Math.max(parseFloat(el.min) || 0,
                Math.min(parseFloat(el.max) || 100, parseFloat(el.value) + direction * step));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (el.tagName === 'SELECT') {
            const newIdx = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + direction));
            el.selectedIndex = newIdx;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    _editorMoveCursor(dx, dy, gpIndex, sourceId) {
        const cur = this._editorGetCursorState(sourceId);
        const w = this.state.width ?? 10;
        const h = this.state.height ?? 10;
        const newX = Math.max(0, Math.min(w - 1, cur.x + dx));
        const newY = Math.max(0, Math.min(h - 1, cur.y + dy));

        // Right edge → enter right panel focus
        if (dx === 1 && newX === cur.x) {
            this._editorEnterUIFocus(gpIndex, sourceId, 'right');
            return;
        }
        // Top edge → enter top toolbar focus
        if (dy === -1 && newY === cur.y) {
            this._editorEnterUIFocus(gpIndex, sourceId, 'top');
            return;
        }

        cur.x = newX;
        cur.y = newY;
        this.state.hoveredTile = { x: newX, y: newY };
        this.renderer?.grid?.setHover?.(newX, newY, sourceId);
        this._editorSyncCursor(gpIndex, sourceId);
    }

    // ── End gamepad cursor helpers ─────────────────────────────────────────

    /**
     * Bind all event handlers
     */
    bindEvents() {
        // Settings toggle (mobile: full-screen panel; same button opens and closes)
        this.elements.settingsToggle?.addEventListener('click', () => {
            this.elements.settingsPanel?.classList.toggle('editor-settings-open');
        });

        // Random: directly generate
        this.elements.randomBtn?.addEventListener('click', () => this.handleRandom());
        this.elements.randomOwnersBtn?.addEventListener('click', () => this.handleRandomOwners());
        this.elements.randomDiceBtn?.addEventListener('click', () => this.handleRandomDice());

        // Type segmented: Map / Scenario
        this.elements.typeSegmented?.querySelectorAll('.segmented-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                if (type === 'map') {
                    this.setMode('mapview');
                } else {
                    this.setMode('assign');
                }
            });
        });

        // Mods panel (shared field set with Custom Game)
        this.elements.editorModsToggle?.addEventListener('click', () => this.toggleEditorModsPanel());
        this.elements.editorModsReset?.addEventListener('click', () => this.resetEditorModsToDefaults());

        // Seed: generate an initial value and wire the reroll button
        if (this.elements.editorModsSeedInput) this.elements.editorModsSeedInput.value = 0;
        this.elements.editorModsSeedRerollBtn?.addEventListener('click', () => {
            if (this.elements.editorModsSeedInput) this.elements.editorModsSeedInput.value = randomSeed();
            this._syncEditorModsSummary(!areModsAtDefaultsForPrefix(EDITOR_MODS_PREFIX));
        });
        this.elements.editorModsSeedInput?.addEventListener('input', () => {
            this._syncEditorModsSummary(!areModsAtDefaultsForPrefix(EDITOR_MODS_PREFIX));
        });

        this.elements.editorModsMaxDice?.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            this.state.maxDice = val;
            if (this.elements.editorModsMaxDiceVal) this.elements.editorModsMaxDiceVal.textContent = String(val);

            if (this.state.diceBrushValue > this.state.maxDice) {
                this.state.diceBrushValue = this.state.maxDice;
            }
            this.renderDicePalette();
            this.state.isDirty = true;
            localStorage.setItem('dicy_maxDice', String(val));
            this.syncEditorModsExpanderLive();
        });

        this.elements.editorModsDiceSides?.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            this.state.diceSides = val;
            if (this.elements.editorModsDiceSidesVal) this.elements.editorModsDiceSidesVal.textContent = String(val);

            for (const tile of this.state.tiles.values()) {
                tile.dice = Math.max(1, Math.min(this.state.maxDice, tile.dice || 1));
            }

            this.renderer?.setDiceSides(this.state.diceSides);
            this.state.isDirty = true;
            this.renderToCanvas();
            localStorage.setItem('dicy_diceSides', String(val));
            this.syncEditorModsExpanderLive();
        });

        this.elements.editorModsMapStyle?.addEventListener('change', () => {
            localStorage.setItem('dicy_mapStyle', this.elements.editorModsMapStyle.value);
            this.syncEditorModsExpanderLive();
        });

        this.elements.editorModsGameMode?.addEventListener('change', () => {
            this.state.gameMode = this.elements.editorModsGameMode?.value || 'classic';
            localStorage.setItem('dicy_gameMode', this.state.gameMode);
            this.state.isDirty = true;
            this.syncEditorModsExpanderLive();
        });

        this.elements.editorModsPlayMode?.addEventListener('change', () => {
            localStorage.setItem('dicy_playMode', this.elements.editorModsPlayMode.value);
            this.syncEditorModsExpanderLive();
        });

        this.elements.editorModsTurnLimit?.addEventListener('change', () => {
            localStorage.setItem('dicy_attacksPerTurn', this.elements.editorModsTurnLimit.value);
            this.syncEditorModsExpanderLive();
        });

        this.elements.editorModsTurnSeconds?.addEventListener('change', () => {
            const v = parseInt(this.elements.editorModsTurnSeconds.value, 10);
            this.state.turnTimeLimit = Number.isFinite(v) ? v : 0;
            localStorage.setItem('dicy_secondsPerTurn', this.elements.editorModsTurnSeconds.value);
            this.state.isDirty = true;
            this.syncEditorModsExpanderLive();
        });

        this.elements.editorModsAttackSeconds?.addEventListener('change', () => {
            const norm = normalizeAttackSecondsUi(this.elements.editorModsAttackSeconds.value);
            if (this.elements.editorModsAttackSeconds) this.elements.editorModsAttackSeconds.value = norm;
            localStorage.setItem('dicy_secondsPerAttack', norm);
            this.syncEditorModsExpanderLive();
        });

        this.elements.editorModsFullBoard?.addEventListener('change', () => {
            localStorage.setItem('dicy_fullBoardRule', this.elements.editorModsFullBoard.value);
            this.syncEditorModsExpanderLive();
        });

        this.elements.editorModsAttackRule?.addEventListener('change', () => {
            localStorage.setItem('dicy_attackRule', this.elements.editorModsAttackRule.value);
            this.syncEditorModsExpanderLive();
        });

        this.elements.editorModsSupplyRule?.addEventListener('change', () => {
            localStorage.setItem('dicy_supplyRule', this.elements.editorModsSupplyRule.value);
            this.syncEditorModsExpanderLive();
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

        // Test button — starts a game with the current map and returns to editor on exit
        this.elements.testBtn?.addEventListener('click', () => this.testGame());

        // Save button (calls saveAsMap or saveAsScenario based on type)
        this.elements.saveBtn?.addEventListener('click', () => this.handleSave());

        // Map size label update
        this.elements.editorMapSize?.addEventListener('input', (e) => {
            const idx = parseInt(e.target.value) - 1;
            const preset = CONFIG_MAP_SIZE_PRESETS[Math.max(0, Math.min(idx, CONFIG_MAP_SIZE_PRESETS.length - 1))];
            if (this.elements.editorMapSizeVal) this.elements.editorMapSizeVal.textContent = preset.label;
        });
        // Quick actions
        this.elements.clearBtn?.addEventListener('click', () => this.clearGrid());
        this.elements.fillBtn?.addEventListener('click', () => this.fillGrid());

        // Keyboard shortcuts (capture phase so we can handle move keys before InputManager)
        document.addEventListener('keydown', (e) => {
            if (!this.isOpen) return;

            // Ignore if typing in input fields
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const code = e.code.toLowerCase();

            // Build pan map from current bindings: move_up/down/left/right keys pan the editor map.
            // Direction is inverted vs game (W pans view down so map appears to scroll up).
            const kb = loadBindings().keyboard;
            const editorPanMap = {};
            const addPan = (action, pan) => {
                for (const c of (kb[action] || [])) editorPanMap[c] = pan;
            };
            addPan('move_up',    { x:  0, y:  1 });
            addPan('move_down',  { x:  0, y: -1 });
            addPan('move_left',  { x:  1, y:  0 });
            addPan('move_right', { x: -1, y:  0 });

            if (editorPanMap[code] && this.renderer) {
                const panSpeed = 15;
                this.renderer.pan(editorPanMap[code].x * panSpeed, editorPanMap[code].y * panSpeed);
                e.preventDefault();
                e.stopImmediatePropagation();
                return;
            }

            if (code === 'escape') {
                this.close();
            } else if (code === 'keyr') {
                this.setMode('assign');
            } else if (code === 'keyf') {
                this.setMode('dice');
            } else {
                // Handle number/letter keys for direct value input (editor-specific tool shortcuts)
                const keyMap = {
                    'digit0': 0, 'digit1': 1, 'digit2': 2, 'digit3': 3, 'digit4': 4,
                    'digit5': 5, 'digit6': 6, 'digit7': 7, 'digit8': 8, 'digit9': 9,
                    'keyq': 10, 'keye': 11, 'keyt': 12, 'keyz': 13, 'keyu': 14, 'keyg': 15, 'keyb': 16
                };
                const value = keyMap[code];
                if (value !== undefined) {
                    this.handleNumberKey(value);
                }
            }
        }, true); // capture: true so we run before InputManager for move keys

        // Gamepad: move event — D-pad navigates tile cursor; analog stick still pans
        this.boundMoveHandler = (data) => {
            if (!this.isOpen || !this.renderer) return;
            // Yield to modal navigation when a .modal is open on top of the editor
            if (document.querySelector('.modal:not(.hidden)')) return;
            const { x: dx, y: dy, index } = data;
            const gpIndex = (typeof index === 'number' && index >= 0) ? index : -1;
            const sourceId = gpIndex >= 0 ? 'gamepad-' + gpIndex : 'keyboard';

            // If in UI focus mode, navigate within that panel
            if (this._editorUIFocusStates.has(sourceId)) {
                this._editorNavigateUIFocus(dx, dy, gpIndex, sourceId);
                return;
            }

            const cur = this._editorGetCursorState(sourceId);

            // First move: initialise cursor at map centre
            if (cur.x === null) {
                this._editorInitCursor(gpIndex, sourceId);
                return;
            }

            this._editorMoveCursor(dx, dy, gpIndex, sourceId);
        };
        this.inputManager?.on('move', this.boundMoveHandler);

        this.boundConfirmHandler = (data) => {
            if (!this.isOpen) return;
            if (document.querySelector('.modal:not(.hidden)')) return;
            const gpIndex = (data?.source === 'gamepad' && typeof data.index === 'number') ? data.index : -1;
            if (gpIndex < 0) return;
            const sourceId = 'gamepad-' + gpIndex;

            if (this._editorUIFocusStates.has(sourceId)) {
                const focusState = this._editorUIFocusStates.get(sourceId);
                const els = this._editorGetUIButtons(focusState.side);
                const el = els[focusState.buttonIndex];
                if (el) {
                    if (el.tagName === 'INPUT' && el.type === 'text') {
                        el.focus();
                    } else if (el.type === 'range' || el.tagName === 'SELECT') {
                        // Already interactive via left/right — confirm just clicks if button
                    } else {
                        el.click();
                    }
                }
                return;
            }

            const cur = this._editorGetCursorState(sourceId);
            if (cur.x === null) return;
            this.handleTileInteraction(cur.x, cur.y, 0, false, false);
        };
        this.inputManager?.on('confirm', this.boundConfirmHandler);

        this.boundCancelHandler = (data) => {
            if (!this.isOpen) return;
            if (document.querySelector('.modal:not(.hidden)')) return;
            const gpIndex = (data?.source === 'gamepad' && typeof data.index === 'number') ? data.index : -1;
            if (gpIndex < 0) return;
            const sourceId = 'gamepad-' + gpIndex;

            if (this._editorUIFocusStates.has(sourceId)) {
                this._editorExitUIFocus(gpIndex, sourceId);
                return;
            }

            const cur = this._editorGetCursorState(sourceId);
            if (cur.x === null) return;
            // Remove tile (right-click / cycle-decrease path)
            this.handleTileInteraction(cur.x, cur.y, 2, false, false);
        };
        this.inputManager?.on('cancel', this.boundCancelHandler);

        this.boundEndTurnHandler = () => {
            if (!this.isOpen) return;
            if (this.state.currentMode === 'mapview') return; // Y does nothing in map mode
            this.setMode(this.state.currentMode === 'assign' ? 'dice' : 'assign');
        };
        this.inputManager?.on('endTurn', this.boundEndTurnHandler);
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
                    this.updateHoverPreview();
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
                    this.updateHoverPreview();
                }
                break;
        }
    }

    /**
     * Update hover preview: HTML overlay showing what left-click would do (assign/dice mode)
     * Only shown on mouse hover - not on touch (worthless for touch users)
     */
    updateHoverPreview() {
        const grid = this.renderer?.grid;
        if (!grid) return;

        // Only preview assign/dice modes on hover, not touch or while brush-dragging
        const effectiveMode = this._shiftHeld ? (this._getAltMode() ?? this.state.currentMode) : this.state.currentMode;
        const isTouch = this.state.lastPointerType === 'touch';
        const canPreview = !isTouch &&
            (effectiveMode === 'assign' || effectiveMode === 'dice') &&
            this.state.hoveredTile &&
            !(this.isPainting && this.mouseStrokeMovedToOther);

        if (!canPreview) {
            grid.setPreviewTile(null, null, 0, 0);
            this.renderToCanvas();
            return;
        }

        const { x, y } = this.state.hoveredTile;
        const preview = this.getLeftClickPreview(x, y, effectiveMode);
        if (!preview) {
            grid.setPreviewTile(null, null, 0, 0);
            this.renderToCanvas();
            return;
        }

        // Mouse: position at cursor; gamepad/keyboard: position at tile grid coords
        const isMouse = this.state.lastPointerType === 'mouse';
        const screenX = isMouse ? this.lastMouseX : null;
        const screenY = isMouse ? this.lastMouseY : null;
        grid.setPreviewTile(x, y, preview.owner, preview.dice, screenX, screenY);
        this.renderToCanvas();
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
                element.innerHTML = '<span class="sprite-icon icon-cross"></span>';
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

        // Default mouse position (e.g. for keyboard-driven preview refresh)
        this.lastMouseX = window.innerWidth / 2;
        this.lastMouseY = window.innerHeight / 2;

        // onCanvasMouseOut handler for hiding cursor and clearing hover
        this.handleCanvasMouseOut = () => {
            this.elements.cursorPreview?.classList.add('hidden');
            // Clear hover tile highlight, preview, and state
            this.state.hoveredTile = null;
            if (this.renderer && this.renderer.grid) {
                this.renderer.grid.setHover(null, null);
                this.renderer.grid.setPreviewTile(null, null, 0, 0);
                this.renderToCanvas();
            }
        };

        // Add listeners (window mouseup catches release outside canvas)
        this.handleCanvasMouseUpGlobal = () => {
            if (this.isPainting || this.mouseTrackpadPendingTap) this.onCanvasMouseUp();
        };
        canvas.addEventListener('mousedown', this.handleCanvasMouseDown);
        canvas.addEventListener('mousemove', this.handleCanvasMouseMove);
        canvas.addEventListener('mouseup', this.handleCanvasMouseUp);
        window.addEventListener('mouseup', this.handleCanvasMouseUpGlobal);
        canvas.addEventListener('mouseout', this.handleCanvasMouseOut);
        canvas.addEventListener('touchstart', this.handleCanvasTouchStart, { passive: false });
        canvas.addEventListener('touchmove', this.handleCanvasTouchMove, { passive: false });
        canvas.addEventListener('touchend', this.handleCanvasTouchEnd);

        // Shift key: temporarily highlight alternate mode tab
        if (this.handleShiftKeyDown) window.removeEventListener('keydown', this.handleShiftKeyDown);
        if (this.handleShiftKeyUp) window.removeEventListener('keyup', this.handleShiftKeyUp);
        this.handleShiftKeyDown = (e) => {
            if (e.key === 'Shift' && this.isOpen && !this._shiftHeld) {
                this._shiftHeld = true;
                this.mouseBrushValue = null; // reset brush so it samples from the new effective mode
                this._updateTabHighlight(this._getAltMode() ?? this.state.currentMode);
                this.updateHoverPreview();
            }
        };
        this.handleShiftKeyUp = (e) => {
            if (e.key === 'Shift' && this.isOpen) {
                this._shiftHeld = false;
                this.mouseBrushValue = null; // reset brush on release too
                this._updateTabHighlight(this.state.currentMode);
                this.updateHoverPreview();
            }
        };
        window.addEventListener('keydown', this.handleShiftKeyDown);
        window.addEventListener('keyup', this.handleShiftKeyUp);
    }

    _getAltMode() {
        if (this.state.currentMode === 'assign') return 'dice';
        if (this.state.currentMode === 'dice') return 'assign';
        return null;
    }

    _updateTabHighlight(mode) {
        this.elements.modeTabs?.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.mode === mode);
        });
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
        const isTrackpadMode = this.renderer?.likelyTrackpad && e.button === 0;

        if (isTrackpadMode) {
            // Trackpad: tap = draw, drag = pan (InputController handles pan)
            this.mouseTrackpadPendingTap = !!tile;
            this.mouseTrackpadIsPanning = false;
            this.mouseTrackpadStartTile = tile ? { x: tile.x, y: tile.y } : null;
            this.mouseTrackpadStartX = e.clientX;
            this.mouseTrackpadStartY = e.clientY;
            return;
        }

        if (tile) {
            this.isPainting = true;
            this.mouseStrokeStartTile = { x: tile.x, y: tile.y };
            this.mouseStrokeMovedToOther = false;
            this.currentInteractionButton = e.button;
            this.currentInteractionShift = e.shiftKey;
            this.lastPaintedTile = `${tile.x},${tile.y}`;

            this.handleTileInteraction(tile.x, tile.y, e.button, e.shiftKey, e.button !== 0);
        }
    }

    /**
     * Get what would happen on single left click (cycle increase) for assign/dice mode
     */
    getLeftClickPreview(x, y, mode = this.state.currentMode) {
        const key = `${x},${y}`;
        const tile = this.state.tiles.get(key);
        const playerCount = this.state.players.length;

        if (mode === 'assign') {
            if (!tile) {
                const cached = this.state.deletedTiles.get(key);
                return { x, y, mode: 'assign', owner: 0, dice: cached?.dice || 1 };
            }
            if (tile.owner >= playerCount - 1) return { x, y, mode: 'assign', owner: 0, dice: tile.dice };
            return { x, y, mode: 'assign', owner: tile.owner + 1, dice: tile.dice };
        }
        if (mode === 'dice') {
            if (!tile) {
                const cached = this.state.deletedTiles.get(key);
                return { x, y, mode: 'dice', owner: cached?.owner ?? 0, dice: 1 };
            }
            if (tile.dice >= this.state.maxDice) return { x, y, mode: 'dice', owner: tile.owner, dice: 1 };
            return { x, y, mode: 'dice', owner: tile.owner, dice: (tile.dice || 1) + 1 };
        }
        return null;
    }

    onCanvasMouseMove(e) {
        if (!this.isOpen) return;

        this.state.lastPointerType = 'mouse';

        const tile = this.screenToTile(e.clientX, e.clientY);

        // Trackpad mode: detect drag → pan (InputController handles it)
        if (this.mouseTrackpadPendingTap) {
            const dx = e.clientX - this.mouseTrackpadStartX;
            const dy = e.clientY - this.mouseTrackpadStartY;
            if (Math.sqrt(dx * dx + dy * dy) > 8) {
                this.mouseTrackpadIsPanning = true;
                this.mouseTrackpadPendingTap = false;
            }
        }

        // Update hovered tile state for keyboard input
        this.state.hoveredTile = tile;

        // Store mouse position for hover preview refresh after actions
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;

        // Update hover tile highlight
        if (this.renderer && this.renderer.grid) {
            if (tile) {
                this.renderer.grid.setHover(tile.x, tile.y);
            } else {
                this.renderer.grid.setHover(null, null);
            }
            this.renderToCanvas();
        }

        // HTML hover preview (assign/dice mode)
        this.updateHoverPreview();

        if (this.isPainting && tile) {
            const key = `${tile.x},${tile.y}`;
            if (this.lastPaintedTile !== key) {
                this.mouseStrokeMovedToOther = true;
                if (this.state.currentMode !== 'mapview' && this.currentInteractionButton === 0 &&
                    (this.state.currentMode === 'assign' || this.state.currentMode === 'dice')) {
                    if (this.mouseBrushValue === null && this.mouseStrokeStartTile) {
                        const sk = `${this.mouseStrokeStartTile.x},${this.mouseStrokeStartTile.y}`;
                        const startTile = this.state.tiles.get(sk);
                        this.mouseBrushValue = startTile
                            ? { owner: startTile.owner, dice: startTile.dice || 1 }
                            : { owner: 0, dice: 1 };
                    }
                }
                this.handleTileInteraction(tile.x, tile.y, this.currentInteractionButton, this._shiftHeld || this.currentInteractionShift, true);
                this.lastPaintedTile = key;
            }
        }

        // Update cursor preview
        this.updateCursorPreview(e.clientX, e.clientY);
    }

    onCanvasMouseUp() {
        // Trackpad tap (no drag): cycle like a regular click
        if (this.mouseTrackpadPendingTap && !this.mouseTrackpadIsPanning && this.mouseTrackpadStartTile) {
            this.handleTileInteraction(this.mouseTrackpadStartTile.x, this.mouseTrackpadStartTile.y, 0, this._shiftHeld, false);
        }
        this.mouseTrackpadPendingTap = false;
        this.mouseTrackpadIsPanning = false;
        this.mouseTrackpadStartTile = null;

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

        this.state.lastPointerType = 'touch';

        const touch = e.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.touchIsPanning = false;
        this.lastMouseX = touch.clientX;
        this.lastMouseY = touch.clientY;
        const tile = this.screenToTile(touch.clientX, touch.clientY);
        this.state.hoveredTile = tile;
        this.touchStartTile = tile ? { x: tile.x, y: tile.y } : null;
        if (tile) {
            e.preventDefault();
            // Don't do tile interaction yet - wait for touchend to distinguish tap from drag
            this.touchPendingTap = true;
        }
    }

    onCanvasTouchMove(e) {
        if (!this.isOpen) return;

        const touch = e.touches[0];
        this.lastMouseX = touch.clientX;
        this.lastMouseY = touch.clientY;

        // Detect drag: if moved beyond threshold, treat as pan-only (no tile actions)
        if (this.touchPendingTap) {
            const dx = touch.clientX - this.touchStartX;
            const dy = touch.clientY - this.touchStartY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 8) {
                this.touchIsPanning = true;
                this.touchPendingTap = false;
            }
        }

        // When panning, do nothing - let InputController handle map translation
        if (this.touchIsPanning) return;
    }

    onCanvasTouchEnd(e) {
        this.isPainting = false;
        this.lastPaintedTile = null;
        this.currentInteractionShift = false;
        this.mouseBrushValue = null;

        // Tap (no drag): do single tile interaction
        if (this.touchPendingTap && !this.touchIsPanning && this.touchStartTile) {
            this.handleTileInteraction(this.touchStartTile.x, this.touchStartTile.y, 0, false, false);
        }
        this.touchPendingTap = false;
        this.touchIsPanning = false;
        this.touchStartTile = null;
    }

    /**
     * Open editor with optional existing scenario/level
     * @param {Object|null} scenario - Level data (map/scenario) or null for new
     * @param {Object} options - { campaign, levelIndex, onSave, onClose, isNew }
     */
    async open(scenario = null, options = {}) {
        this._openScenario = scenario;
        this._openOptions = options;
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
        const isDesktop = !window.matchMedia('(max-width: 900px)').matches;
        if (isDesktop) {
            this.elements.settingsPanel?.classList.add('editor-settings-open');
        } else {
            this.elements.settingsPanel?.classList.remove('editor-settings-open');
        }
        if (this.renderer) { this.renderer.editorActive = true; this.renderer.grid.editorActive = true; }
        this.elements.settingsToggle?.classList.remove('hidden');

        this.updateEditorInputHints();

        // Set slider limits from GAME constants
        if (this.elements.editorModsMaxDice) {
            this.elements.editorModsMaxDice.max = GAME.MAX_DICE_PER_TERRITORY;
        }
        if (this.elements.editorModsDiceSides) {
            this.elements.editorModsDiceSides.max = GAME.MAX_DICE_SIDES;
        }

        // Update UI to match state
        this.updateUIFromState();
        this.syncEditorModsExpanderFromStorage();
        this.updateCampaignModeUI();
        this.syncSharedPlayersToUI();
        this.renderPaintPalette();
        this.renderPlayerPalette();
        this.renderDicePalette();
        this.setMode(this.state.currentMode);
        this.updateSaveButtonText();

        // New map: immediately generate a random layout
        if (this.editorOptions?.isNew && this.state.tiles.size === 0) {
            await this.handleRandom();
        }

        // Render to canvas and fit camera on initial open
        this.renderToCanvas(true);

        // Setup canvas interaction
        this.setupCanvasEvents();

        this.isOpen = true;
        this.boundUpdateEditorHelp = () => { this.updateEditorHelpVisibility(); this.updateEditorInputHints(); };
        this.updateEditorHelpVisibility();
        window.addEventListener('resize', this.boundUpdateEditorHelp);
        this.inputManager?.on('gamepadChange', this.boundUpdateEditorHelp);
    }

    /**
     * Close editor
     */
    close() {
        this.renderer?.grid?.setPreviewTile(null, null, 0, 0);
        if (this.boundUpdateEditorHelp) {
            window.removeEventListener('resize', this.boundUpdateEditorHelp);
            this.inputManager?.off('gamepadChange', this.boundUpdateEditorHelp);
        }
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

        // Hide editor UI, show game UI only if a game is in progress
        if (this.renderer) { this.renderer.editorActive = false; this.renderer.grid.editorActive = false; }
        this.elements.overlay?.classList.add('hidden');
        this.elements.settingsToggle?.classList.add('hidden');
        this.elements.settingsPanel?.classList.remove('editor-settings-open');
        const hasActiveGame = this.originalGame?.players?.length > 0;
        if (hasActiveGame) {
            this.elements.gamePanel?.classList.remove('hidden');
            this.elements.endTurnBtn?.classList.remove('hidden');
            this.elements.aiToggleBtn?.classList.remove('hidden');
        }

        this.isOpen = false;
        this._shiftHeld = false;

        // Clean up gamepad cursor/focus state and remove any lingering focus highlights
        for (const [sourceId, focusState] of this._editorUIFocusStates) {
            const buttons = this._editorGetUIButtons(focusState.side);
            buttons.forEach(b => b.classList.remove('gamepad-focused'));
        }
        this._editorCursorStates.clear();
        this._editorUIFocusStates.clear();

        if (this.onClose && !this._suppressOnClose) {
            this.onClose();
        }
        this._suppressOnClose = false;
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
            this.renderer.autoFitCamera(1.0); // Fit canvas exactly, zoom close
        }

        this.renderColorLegend();
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
        btn.innerHTML = '<span class="sprite-icon icon-save"></span> ' + (idx != null ? `Save #${idx + 1}` : 'Save');
    }

    handleSave() {
        return this.state.currentMode === 'mapview' ? this.saveAsMap() : this.saveAsScenario();
    }

    /** Log save errors to the console (campaign validation, storage, etc.). */
    _logSaveFailure(context, err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error(`[MapEditor] Save failed (${context}): ${detail}`, err);
    }

    _buildMapSnapshot() {
        this.state.bots = parseInt(this.elements.editorSharedBots?.value || '2', 10);
        this.state.botAI = this.elements.editorSharedBotAI?.value || 'easy';
        if (this.state.tiles.size === 0) {
            this.showStatus('Add at least one tile first', 'error');
            return null;
        }
        const bounds = this.computeMinimalBounds();
        if (!bounds) return null;
        const seedEl = this.elements.editorModsSeedInput;
        const seedVal = seedEl ? parseInt(seedEl.value, 10) : NaN;
        const hasFixedSeed = Number.isFinite(seedVal) && seedVal > 0;
        return {
            type: 'map',
            width: bounds.width,
            height: bounds.height,
            bots: this.state.bots ?? 2,
            botAI: this.state.botAI ?? 'easy',
            maxDice: this.state.maxDice ?? parseInt(SETUP_MOD_DEFAULTS.maxDice, 10),
            diceSides: this.state.diceSides ?? 6,
            gameMode: this.state.gameMode ?? 'classic',
            turnTimeLimit: this.state.turnTimeLimit ?? 0,
            ...(hasFixedSeed ? { seed: seedVal >>> 0 } : {}),
            tiles: Array.from(this.state.tiles.entries()).map(([key]) => {
                const [x, y] = key.split(',').map(Number);
                return { x: x - bounds.minX, y: y - bounds.minY };
            })
        };
    }

    _buildScenarioSnapshot() {
        this.state.bots = parseInt(this.elements.editorSharedBots?.value || '2', 10);
        this.state.botAI = this.elements.editorSharedBotAI?.value || 'easy';
        this.rebuildPlayersFromScenarioConfig();
        if (this.state.tiles.size === 0) {
            this.showStatus('Add at least one tile first', 'error');
            return null;
        }

        for (const [, tile] of this.state.tiles) {
            if (tile.owner === undefined || tile.owner === null || tile.owner < 0) {
                tile.owner = 0;
            } else if (!this.state.players.find(p => p.id === tile.owner)) {
                tile.owner = 0;
            }
        }

        const tileCounts = {};
        this.state.players.forEach(p => { tileCounts[p.id] = 0; });
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

        return {
            type: 'scenario',
            width: bounds.width,
            height: bounds.height,
            maxDice: this.state.maxDice,
            diceSides: this.state.diceSides,
            gameMode: this.state.gameMode ?? 'classic',
            turnTimeLimit: this.state.turnTimeLimit ?? 0,
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
    }

    updateEditorHelpVisibility() {
        if (!this.isOpen) return;
        const el = this.elements.editorHelpText;
        const gamepadEl = this.elements.editorHelpGamepad;
        if (!el) return;

        const hasEnoughHeight = window.innerHeight >= 700;
        const hasGamepad = this.inputManager?.gamepadStates?.size > 0;

        if (hasEnoughHeight) {
            el.classList.remove('hidden');
            if (gamepadEl) gamepadEl.classList.toggle('hidden', !hasGamepad);
        } else {
            el.classList.add('hidden');
        }
    }

    updateCampaignModeUI() {
        // Name/description/author/size inputs removed from UI — nothing to hide
    }

    /**
     * Update UI elements from state
     */
    updateUIFromState() {
        this.syncEditorModsFromStateAndStorage();
    }

    syncEditorModsFromStateAndStorage() {
        const el = this.elements;
        if (el.editorModsMapStyle) el.editorModsMapStyle.value = localStorage.getItem('dicy_mapStyle') || SETUP_MOD_DEFAULTS.mapStyle;
        if (el.editorModsGameMode) el.editorModsGameMode.value = this.state.gameMode || SETUP_MOD_DEFAULTS.gameMode;
        if (el.editorModsMaxDice) {
            el.editorModsMaxDice.value = String(this.state.maxDice);
            if (el.editorModsMaxDiceVal) el.editorModsMaxDiceVal.textContent = String(this.state.maxDice);
        }
        if (el.editorModsDiceSides) {
            el.editorModsDiceSides.value = String(this.state.diceSides);
            if (el.editorModsDiceSidesVal) el.editorModsDiceSidesVal.textContent = String(this.state.diceSides);
        }

        if (el.editorModsPlayMode) {
            el.editorModsPlayMode.value = localStorage.getItem('dicy_playMode') || SETUP_MOD_DEFAULTS.playMode;
        }
        if (el.editorModsTurnLimit) {
            el.editorModsTurnLimit.value = localStorage.getItem('dicy_attacksPerTurn') ?? SETUP_MOD_DEFAULTS.attacksPerTurn;
        }

        const ttl = this.state.turnTimeLimit ?? 0;
        const secAllowed = ['0', '10', '15', '30', '60'];
        let secVal = secAllowed.includes(String(ttl)) ? String(ttl) : (localStorage.getItem('dicy_secondsPerTurn') || SETUP_MOD_DEFAULTS.secondsPerTurn);
        if (!secAllowed.includes(secVal)) secVal = SETUP_MOD_DEFAULTS.secondsPerTurn;
        if (el.editorModsTurnSeconds) el.editorModsTurnSeconds.value = secVal;

        const atkSec = normalizeAttackSecondsUi(localStorage.getItem('dicy_secondsPerAttack') || SETUP_MOD_DEFAULTS.secondsPerAttack);
        if (el.editorModsAttackSeconds) el.editorModsAttackSeconds.value = atkSec;

        if (el.editorModsFullBoard) {
            el.editorModsFullBoard.value = localStorage.getItem('dicy_fullBoardRule') || SETUP_MOD_DEFAULTS.fullBoardRule;
        }
        if (el.editorModsAttackRule) {
            el.editorModsAttackRule.value = localStorage.getItem('dicy_attackRule') || SETUP_MOD_DEFAULTS.attackRule;
        }
        if (el.editorModsSupplyRule) {
            el.editorModsSupplyRule.value = localStorage.getItem('dicy_supplyRule') || SETUP_MOD_DEFAULTS.supplyRule;
        }

        const tgi = document.getElementById(EDITOR_MODS_PREFIX + 'tournament-games');
        if (tgi) tgi.value = localStorage.getItem('dicy_tournamentGames') || SETUP_MOD_DEFAULTS.tournamentGames;
    }

    toggleEditorModsPanel() {
        const panel = this.elements.editorModsPanel;
        const toggle = this.elements.editorModsToggle;
        if (!panel || !toggle) return;
        const isOpen = !panel.classList.contains('hidden');
        setModsPanelUiOpen(!isOpen, 'editor-mods-panel', 'editor-mods-toggle');
        this._syncEditorModsSummary(!areModsAtDefaultsForPrefix(EDITOR_MODS_PREFIX));
    }

    resetEditorModsToDefaults() {
        applyModsDefaultsForPrefix(EDITOR_MODS_PREFIX);
        if (this.elements.editorModsAttackSeconds) {
            this.elements.editorModsAttackSeconds.value = normalizeAttackSecondsUi(
                this.elements.editorModsAttackSeconds.value
            );
        }
        this.state.maxDice = parseInt(this.elements.editorModsMaxDice?.value || SETUP_MOD_DEFAULTS.maxDice, 10);
        this.state.diceSides = parseInt(this.elements.editorModsDiceSides?.value || SETUP_MOD_DEFAULTS.diceSides, 10);
        this.state.gameMode = this.elements.editorModsGameMode?.value || SETUP_MOD_DEFAULTS.gameMode;
        this.state.turnTimeLimit = parseInt(this.elements.editorModsTurnSeconds?.value || SETUP_MOD_DEFAULTS.secondsPerTurn, 10);
        if (this.state.diceBrushValue > this.state.maxDice) this.state.diceBrushValue = this.state.maxDice;
        this.renderDicePalette();
        this.renderer?.setDiceSides(this.state.diceSides);
        this.state.isDirty = true;
        this.syncEditorModsExpanderFromStorage();
        this.renderToCanvas();
    }

    syncEditorModsExpanderFromStorage() {
        const nonDefault = !areModsAtDefaultsForPrefix(EDITOR_MODS_PREFIX);
        if (this.elements.editorModsBadge) this.elements.editorModsBadge.classList.toggle('hidden', !nonDefault);
        if (this.elements.editorModsReset) this.elements.editorModsReset.classList.toggle('hidden', !nonDefault);
        syncModsFieldHighlightsForPrefix(EDITOR_MODS_PREFIX);
        setModsPanelUiOpen(nonDefault, 'editor-mods-panel', 'editor-mods-toggle');
        this._syncEditorModsSummary(nonDefault);
    }

    syncEditorModsExpanderLive() {
        const nonDefault = !areModsAtDefaultsForPrefix(EDITOR_MODS_PREFIX);
        if (this.elements.editorModsBadge) this.elements.editorModsBadge.classList.toggle('hidden', !nonDefault);
        if (this.elements.editorModsReset) this.elements.editorModsReset.classList.toggle('hidden', !nonDefault);
        syncModsFieldHighlightsForPrefix(EDITOR_MODS_PREFIX);
        if (nonDefault) setModsPanelUiOpen(true, 'editor-mods-panel', 'editor-mods-toggle');
        this._syncEditorModsSummary(nonDefault);
    }

    _syncEditorModsSummary(nonDefault) {
        const summary = this.elements.editorModsSummary;
        if (!summary) return;
        const seedEl = this.elements.editorModsSeedInput;
        const seedVal = seedEl ? parseInt(seedEl.value, 10) : NaN;
        const hasFixedSeed = Number.isFinite(seedVal) && seedVal > 0;
        if (!nonDefault && !hasFixedSeed) {
            summary.classList.add('hidden');
            summary.textContent = '';
            return;
        }
        const panelOpen = this.elements.editorModsPanel && !this.elements.editorModsPanel.classList.contains('hidden');
        summary.classList.toggle('hidden', panelOpen);
        summary.textContent = getActiveModsSummaryFromDom(EDITOR_MODS_PREFIX, 'editor-seed-input');
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
            } else if (this.state.currentMode === 'mapview') {
                this.state.tiles.set(key, { owner: 0, dice: 1 });
            } else {
                // Scenario mode: brush - sample from first tile, apply to all (mode-specific: only copy relevant value)
                // Shift temporarily uses the alternate mode (assign↔dice)
                const effectiveMode = shiftKey ? (this._getAltMode() ?? this.state.currentMode) : this.state.currentMode;
                if (effectiveMode === 'assign' || effectiveMode === 'dice') {
                    if (this.mouseBrushValue === null) {
                        this.mouseBrushValue = tile
                            ? { owner: tile.owner, dice: tile.dice || 1 }
                            : { owner: 0, dice: 1 };
                    }
                    const v = this.mouseBrushValue;
                    const existing = this.state.tiles.get(key);
                    const cached = this.state.deletedTiles.get(key);
                    if (effectiveMode === 'dice') {
                        // Dice mode: only copy dice, preserve target's owner
                        this.state.tiles.set(key, {
                            owner: existing?.owner ?? cached?.owner ?? 0,
                            dice: Math.min(v.dice, this.state.maxDice)
                        });
                    } else {
                        // Assign mode: only copy owner, preserve target's dice
                        this.state.tiles.set(key, {
                            owner: v.owner,
                            dice: existing?.dice ?? cached?.dice ?? 1
                        });
                    }
                    this.state.deletedTiles.delete(key);
                }
            }
            this.state.isDirty = true;
            this.renderToCanvas();
            this.updateHoverPreview();
            return;
        }

        // Touch (legacy): cycle increase/decrease
        const isDecrease = isRightClick;
        const cycleMode = shiftKey ? (this._getAltMode() ?? this.state.currentMode) : this.state.currentMode;
        if (cycleMode === 'mapview') {
            if (tile) this.state.tiles.delete(key);
            else this.state.tiles.set(key, { owner: 0, dice: 1 });
        } else {
            switch (cycleMode) {
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
                                tile.owner = 0;
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
                                tile.dice = 1;
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
        this.updateHoverPreview();
    }

    /**
     * Toggle Map View (grey tile rendering, hides assign/dice tabs)
     */
    /**
     * Generate a random map from current map size / style / seed settings
     */
    async handleRandom() {
        const sliderVal = parseInt(this.elements.editorMapSize?.value || '4', 10);
        const preset = CONFIG_MAP_SIZE_PRESETS[Math.max(0, Math.min(sliderVal - 1, CONFIG_MAP_SIZE_PRESETS.length - 1))];
        const [genW, genH] = [preset.width, preset.height];
        const mapStyle = this.elements.editorModsMapStyle?.value || 'islands';
        const seedEl = this.elements.editorModsSeedInput;
        const seedVal = seedEl ? parseInt(seedEl.value, 10) : NaN;
        const hasFixedSeed = Number.isFinite(seedVal) && seedVal > 0;
        const mapSeed = hasFixedSeed ? seedVal >>> 0 : randomSeed();

        this.rebuildPlayersFromScenarioConfig();
        const players = this.state.players;
        const maxDice = this.state.maxDice;

        const map = new MapManager();
        map.generateMap(genW, genH, players, maxDice, mapStyle, null, mulberry32(mapSeed));

        const CANVAS_SIZE = 16;
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

        this.gameAdapter.syncFromState();
        if (this.renderer?.grid) this.renderer.grid.invalidate();
        this.updateUIFromState();
        this.renderToCanvas();
    }

    /**
     * Randomize only the owner of each existing tile (keep dice values)
     */
    handleRandomOwners() {
        const playerCount = this.state.players.length;
        if (playerCount === 0) return;
        const rng = mulberry32(randomSeed());
        for (const [key, tile] of this.state.tiles) {
            tile.owner = Math.floor(rng() * playerCount);
        }
        this.state.isDirty = true;
        this.gameAdapter.syncFromState();
        if (this.renderer?.grid) this.renderer.grid.invalidate();
        this.renderToCanvas();
        this.updateHoverPreview();
    }

    /**
     * Randomize only the dice value of each existing tile (keep owners).
     * Respects the current game mode (classic/madness/2of2/fair).
     */
    handleRandomDice() {
        const maxDice = this.state.maxDice;
        const gameMode = this.state.gameMode;
        const rng = mulberry32(randomSeed());

        if (gameMode === 'madness') {
            for (const tile of this.state.tiles.values()) tile.dice = maxDice;
        } else if (gameMode === '2of2') {
            for (const tile of this.state.tiles.values()) tile.dice = 2;
        } else {
            // classic and fair: assign random dice first
            for (const tile of this.state.tiles.values()) {
                tile.dice = 1 + Math.floor(rng() * maxDice);
            }
            if (gameMode === 'fair') {
                // Balance: reduce players with more total dice than the minimum
                const playerTiles = new Map();
                for (const [key, tile] of this.state.tiles) {
                    if (!playerTiles.has(tile.owner)) playerTiles.set(tile.owner, []);
                    playerTiles.get(tile.owner).push(tile);
                }
                const totals = [...playerTiles.entries()].map(([owner, tiles]) => ({
                    owner, tiles, total: tiles.reduce((s, t) => s + t.dice, 0)
                }));
                const minTotal = Math.min(...totals.map(s => s.total));
                for (const { tiles, total } of totals) {
                    let excess = total - minTotal;
                    const reducible = tiles.filter(t => t.dice > 1);
                    while (excess > 0 && reducible.length > 0) {
                        const i = Math.floor(rng() * reducible.length);
                        reducible[i].dice--;
                        excess--;
                        if (reducible[i].dice <= 1) reducible.splice(i, 1);
                    }
                }
            }
        }

        this.state.isDirty = true;
        this.gameAdapter.syncFromState();
        if (this.renderer?.grid) this.renderer.grid.invalidate();
        this.renderToCanvas();
        this.updateHoverPreview();
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
        this.renderPlayerPalette();
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

        // Compute per-player stats
        const stats = this.state.players.map((p, i) => {
            let territories = 0, totalDice = 0, maxStack = 0;
            for (const tile of this.state.tiles.values()) {
                if (tile.owner === i) {
                    territories++;
                    totalDice += tile.dice;
                    if (tile.dice > maxStack) maxStack = tile.dice;
                }
            }
            return { p, i, territories, totalDice, maxStack };
        });

        const totalTerritories = stats.reduce((s, r) => s + r.territories, 0);

        el.innerHTML = '';
        const table = document.createElement('table');
        table.className = 'editor-stats-table';
        table.innerHTML = `<thead><tr>
            <th></th><th>Terr</th><th>Dice</th><th>Max</th>
        </tr></thead>`;
        const tbody = document.createElement('tbody');
        for (const { p, i, territories, totalDice, maxStack } of stats) {
            const colorHex = '#' + DEFAULT_COLORS[i % DEFAULT_COLORS.length].toString(16).padStart(6, '0');
            const label = p.isBot ? `P${i + 1}` : `P${i + 1}`;
            const pct = totalTerritories > 0 ? Math.round(territories / totalTerritories * 100) : 0;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="editor-legend-swatch" style="background:${colorHex}"></span> ${label}</td>
                <td>${territories} <span class="editor-stat-pct">${pct}%</span></td>
                <td>${totalDice}</td>
                <td>${maxStack || '—'}</td>`;
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        el.appendChild(table);
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

    /**
     * Switch editor mode (assign, dice, mapview)
     */
    setMode(mode) {
        this.state.currentMode = mode;

        const isMap = mode === 'mapview';

        // Sync Map/Scenario segmented button
        this.elements.typeSegmented?.querySelectorAll('.segmented-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === (isMap ? 'map' : 'scenario'));
        });

        // Show assign/dice tabs only in scenario mode; highlight the active one
        if (this.elements.scenarioTabs) {
            this.elements.scenarioTabs.classList.toggle('hidden', isMap);
            this.elements.scenarioTabs.querySelectorAll('.editor-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.mode === mode);
            });
        }

        // Show/hide scenario-only elements (color legend, random owners/dice)
        this.elements.settingsPanel?.querySelectorAll('.editor-scenario-only').forEach(el => {
            el.classList.toggle('hidden', isMap);
        });

        this.elements.assignToolbar?.classList.toggle('hidden', mode !== 'assign');
        this.elements.diceToolbar?.classList.toggle('hidden', mode !== 'dice');

        if (this.renderer && this.renderer.grid) {
            this.renderer.grid.invalidate();
            this.renderer.grid.setPaintMode(isMap);
        }

        this.renderToCanvas();
        this.updateHoverPreview();
        this.updateEditorInputHints();
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
        const sliderVal = parseInt(this.elements.editorMapSize?.value || '4', 10);
        const preset = CONFIG_MAP_SIZE_PRESETS[Math.max(0, Math.min(sliderVal - 1, CONFIG_MAP_SIZE_PRESETS.length - 1))];
        const fillW = preset.width;
        const fillH = preset.height;

        const CANVAS_SIZE = this.state.width;
        const offsetX = Math.floor((CANVAS_SIZE - fillW) / 2);
        const offsetY = Math.floor((CANVAS_SIZE - fillH) / 2);

        const { players } = this.state;
        const playerCount = players.length;
        let playerIndex = 0;

        for (let y = 0; y < fillH; y++) {
            for (let x = 0; x < fillW; x++) {
                const key = `${x + offsetX},${y + offsetY}`;
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
        const mapData = this._buildMapSnapshot();
        if (!mapData) return null;

        if (this.editorOptions?.onSave) {
            try {
                this.editorOptions.onSave(mapData);
                this.state.isDirty = false;
                this.showStatus('Saved!', 'success');
                this.close();
                return mapData;
            } catch (e) {
                this._logSaveFailure('campaign map → setUserLevel', e);
                this.showStatus('Failed to save', 'error');
                return null;
            }
        }

        const name = this.state.name.trim() || 'Untitled Map';
        this.state.name = name;
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
            this._logSaveFailure('standalone map → scenario library', e);
            this.showStatus('Failed to save', 'error');
            return null;
        }
    }

    /**
     * Save as scenario (includes players, ownership, dice)
     */
    async saveAsScenario() {
        const scenarioData = this._buildScenarioSnapshot();
        if (!scenarioData) return null;

        if (this.editorOptions?.onSave) {
            try {
                this.editorOptions.onSave(scenarioData);
                this.state.isDirty = false;
                this.showStatus('Saved!', 'success');
                this.close();
                return scenarioData;
            } catch (e) {
                this._logSaveFailure('campaign scenario → setUserLevel', e);
                this.showStatus('Failed to save', 'error');
                return null;
            }
        }

        const name = this.state.name.trim() || 'Untitled Scenario';
        this.state.name = name;
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
            this._logSaveFailure('standalone scenario → scenario library', e);
            this.showStatus('Failed to save', 'error');
            return null;
        }
    }

    /**
     * Test the current map/scenario — start a game and return to editor when done.
     */
    testGame() {
        if (!this.onTest) return;
        const snapshot = this.state.currentMode === 'assign'
            ? (this._buildScenarioSnapshot() ?? this._buildMapSnapshot())
            : (this._buildMapSnapshot() ?? this._buildScenarioSnapshot());
        if (!snapshot) return;
        // Save to campaign if in campaign context (without closing)
        if (this.editorOptions?.onSave) {
            try {
                this.editorOptions.onSave(snapshot);
                this.state.isDirty = false;
                this.showStatus('Saved!', 'success');
            } catch (e) {
                this._logSaveFailure('test → save', e);
            }
        }
        // Suppress onClose so that the campaign browser doesn't reappear mid-test
        this._suppressOnClose = true;
        this.onTest(snapshot);
    }

    /**
     * Import from existing scenario/map
     */
    importFromScenario(scenario) {
        this.state = this.createEmptyState(16, 16);

        const botCount = (scenario.players || []).filter(p => p.isBot).length;
        this.state.bots = scenario.bots ?? (scenario.players?.length ? botCount : 2);
        this.state.botAI = scenario.botAI ?? 'easy';
        if (!this.editorOptions) {
            this.state.name = scenario.isBuiltIn ? scenario.name + ' (Copy)' : (scenario.name || '');
            this.state.description = scenario.description || '';
            this.state.author = scenario.isBuiltIn ? 'User' : (scenario.author || 'User');
        }
        this.state.maxDice = scenario.maxDice || parseInt(SETUP_MOD_DEFAULTS.maxDice, 10);
        this.state.diceSides = scenario.diceSides || parseInt(SETUP_MOD_DEFAULTS.diceSides, 10);
        this.state.gameMode = scenario.gameMode || SETUP_MOD_DEFAULTS.gameMode;
        this.state.turnTimeLimit = scenario.turnTimeLimit ?? 0;

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

        this.state.currentMode = scenario.type === 'scenario' ? 'assign' : 'mapview';
        this.state.isDirty = false;
    }
}
