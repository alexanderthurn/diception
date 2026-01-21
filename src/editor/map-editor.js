/**
 * MapEditor - Interactive map/scenario editor
 * 
 * Features:
 * - Tile painting (add/remove)
 * - Player assignment
 * - Dice placement
 * - Save as map or scenario
 */

import { generateScenarioId } from '../scenarios/scenario-data.js';

// Default player colors
const DEFAULT_COLORS = [
    0xAA00FF, 0xFF00AA, 0x00FFFF, 0xFFFFFF,
    0xFF0055, 0x55FF00, 0xFFDD00, 0xFF8800
];

export class MapEditor {
    constructor(scenarioManager, aiRegistry) {
        this.scenarioManager = scenarioManager;
        this.aiRegistry = aiRegistry;
        
        // Editor state
        this.state = this.createEmptyState();
        
        // UI elements (cached after init)
        this.elements = {};
        
        // Interaction state
        this.isPainting = false;
        this.lastPaintedTile = null;
        
        // Callback for when editor closes
        this.onClose = null;
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
            paintMode: 'add', // 'add' or 'remove'
            diceBrushValue: 2,
            isDirty: false,
            originalId: null // Track if editing existing
        };
    }
    
    /**
     * Initialize DOM bindings
     */
    init() {
        // Cache elements
        this.elements = {
            modal: document.getElementById('editor-modal'),
            closeBtn: document.getElementById('editor-close-btn'),
            backBtn: document.getElementById('editor-back-btn'),
            grid: document.getElementById('editor-grid'),
            
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
            randomizeBtn: document.getElementById('editor-randomize-btn')
        };
        
        this.bindEvents();
    }
    
    /**
     * Bind all event handlers
     */
    bindEvents() {
        // Close buttons
        this.elements.closeBtn.addEventListener('click', () => this.close());
        this.elements.backBtn.addEventListener('click', () => this.close());
        
        // Settings changes
        this.elements.nameInput.addEventListener('input', (e) => {
            this.state.name = e.target.value;
            this.state.isDirty = true;
        });
        
        this.elements.descriptionInput.addEventListener('input', (e) => {
            this.state.description = e.target.value;
            this.state.isDirty = true;
        });
        
        // Size sliders
        this.elements.widthSlider.addEventListener('input', (e) => {
            const newWidth = parseInt(e.target.value);
            this.elements.widthVal.textContent = newWidth;
            this.resizeGrid(newWidth, this.state.height);
        });
        
        this.elements.heightSlider.addEventListener('input', (e) => {
            const newHeight = parseInt(e.target.value);
            this.elements.heightVal.textContent = newHeight;
            this.resizeGrid(this.state.width, newHeight);
        });
        
        // Max dice and dice sides
        this.elements.maxDiceSelect.addEventListener('change', (e) => {
            this.state.maxDice = parseInt(e.target.value);
            // Clamp dice brush value and re-render palette
            if (this.state.diceBrushValue > this.state.maxDice) {
                this.state.diceBrushValue = this.state.maxDice;
            }
            this.renderDicePalette();
            this.state.isDirty = true;
        });
        
        this.elements.diceSidesSelect.addEventListener('change', (e) => {
            this.state.diceSides = parseInt(e.target.value);
            this.state.isDirty = true;
        });
        
        // Mode tabs
        this.elements.modeTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const mode = tab.dataset.mode;
                this.setMode(mode);
            });
        });
        
        // Add player button
        this.elements.addPlayerBtn.addEventListener('click', () => this.addPlayer());
        
        // Save buttons
        this.elements.saveAsMapBtn.addEventListener('click', () => this.saveAsMap());
        this.elements.saveAsScenarioBtn.addEventListener('click', () => this.saveAsScenario());
        
        // Quick actions
        this.elements.clearBtn.addEventListener('click', () => this.clearGrid());
        this.elements.fillBtn.addEventListener('click', () => this.fillGrid());
        this.elements.randomizeBtn.addEventListener('click', () => this.randomizeDice());
        
        // Grid mouse events
        this.elements.grid.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('editor-cell')) {
                this.isPainting = true;
                const x = parseInt(e.target.dataset.x);
                const y = parseInt(e.target.dataset.y);
                this.handleTileInteraction(x, y);
            }
        });
        
        this.elements.grid.addEventListener('mousemove', (e) => {
            if (this.isPainting && e.target.classList.contains('editor-cell')) {
                const x = parseInt(e.target.dataset.x);
                const y = parseInt(e.target.dataset.y);
                const key = `${x},${y}`;
                if (this.lastPaintedTile !== key) {
                    this.handleTileInteraction(x, y);
                    this.lastPaintedTile = key;
                }
            }
        });
        
        document.addEventListener('mouseup', () => {
            this.isPainting = false;
            this.lastPaintedTile = null;
        });
        
        // Touch support for mobile
        this.elements.grid.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            if (target && target.classList.contains('editor-cell')) {
                e.preventDefault();
                this.isPainting = true;
                const x = parseInt(target.dataset.x);
                const y = parseInt(target.dataset.y);
                this.handleTileInteraction(x, y);
            }
        }, { passive: false });
        
        this.elements.grid.addEventListener('touchmove', (e) => {
            if (this.isPainting) {
                const touch = e.touches[0];
                const target = document.elementFromPoint(touch.clientX, touch.clientY);
                if (target && target.classList.contains('editor-cell')) {
                    e.preventDefault();
                    const x = parseInt(target.dataset.x);
                    const y = parseInt(target.dataset.y);
                    const key = `${x},${y}`;
                    if (this.lastPaintedTile !== key) {
                        this.handleTileInteraction(x, y);
                        this.lastPaintedTile = key;
                    }
                }
            }
        }, { passive: false });
        
        this.elements.grid.addEventListener('touchend', () => {
            this.isPainting = false;
            this.lastPaintedTile = null;
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (!this.elements.modal.classList.contains('hidden')) {
                if (e.key === 'Escape') {
                    this.close();
                }
            }
        });
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
        
        // Update UI to match state
        this.updateUIFromState();
        this.renderGrid();
        this.renderPlayerList();
        this.renderPaintPalette();
        this.renderPlayerPalette();
        this.renderDicePalette();
        this.setMode('paint');
        
        // Show modal
        this.elements.modal.classList.remove('hidden');
    }
    
    /**
     * Close editor
     */
    close() {
        // Close without prompting - changes are auto-saved or user can save manually
        this.elements.modal.classList.add('hidden');
        
        if (this.onClose) {
            this.onClose();
        }
    }
    
    /**
     * Show a temporary status message
     */
    showStatus(message, type = 'info') {
        // Create or reuse status element
        let status = document.getElementById('editor-status');
        if (!status) {
            status = document.createElement('div');
            status.id = 'editor-status';
            status.className = 'editor-status';
            this.elements.modal.appendChild(status);
        }
        
        status.textContent = message;
        status.className = `editor-status ${type}`;
        status.classList.add('visible');
        
        // Auto-hide after 2 seconds
        clearTimeout(this.statusTimeout);
        this.statusTimeout = setTimeout(() => {
            status.classList.remove('visible');
        }, 2000);
    }
    
    /**
     * Update UI elements from state
     */
    updateUIFromState() {
        this.elements.nameInput.value = this.state.name;
        this.elements.descriptionInput.value = this.state.description;
        this.elements.widthSlider.value = this.state.width;
        this.elements.widthVal.textContent = this.state.width;
        this.elements.heightSlider.value = this.state.height;
        this.elements.heightVal.textContent = this.state.height;
        this.elements.maxDiceSelect.value = this.state.maxDice;
        this.elements.diceSidesSelect.value = this.state.diceSides;
    }
    
    /**
     * Render the interactive grid
     */
    renderGrid() {
        const { width, height, tiles } = this.state;
        
        // Set grid template
        this.elements.grid.style.gridTemplateColumns = `repeat(${width}, 1fr)`;
        this.elements.grid.style.gridTemplateRows = `repeat(${height}, 1fr)`;
        
        // Clear and rebuild
        this.elements.grid.innerHTML = '';
        
        // Pre-compute player colors map for faster lookup
        const playerColors = {};
        this.state.players.forEach(p => {
            playerColors[p.id] = '#' + p.color.toString(16).padStart(6, '0');
        });
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const cell = document.createElement('div');
                cell.className = 'editor-cell';
                cell.dataset.x = x;
                cell.dataset.y = y;
                
                const key = `${x},${y}`;
                const tile = tiles.get(key);
                
                if (tile) {
                    cell.classList.add('active');
                    cell.style.backgroundColor = playerColors[tile.owner] || '#666';
                    // Show dice count as text
                    if (tile.dice > 0) {
                        cell.textContent = tile.dice;
                    }
                } else {
                    cell.classList.add('empty');
                }
                
                this.elements.grid.appendChild(cell);
            }
        }
    }
    
    /**
     * Render the paint mode palette (add/remove tile buttons)
     */
    renderPaintPalette() {
        const container = this.elements.paintPalette;
        container.innerHTML = '';
        
        // Add tile button
        const addBtn = document.createElement('div');
        addBtn.className = 'paint-swatch add-tile';
        if (this.state.paintMode === 'add') addBtn.classList.add('selected');
        addBtn.title = 'Add tiles';
        addBtn.addEventListener('click', () => {
            this.state.paintMode = 'add';
            this.renderPaintPalette();
        });
        container.appendChild(addBtn);
        
        // Remove tile button
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
     */
    handleTileInteraction(x, y) {
        const key = `${x},${y}`;
        const tile = this.state.tiles.get(key);
        
        switch (this.state.currentMode) {
            case 'paint':
                if (this.state.paintMode === 'add') {
                    // Add tile with current selected player and default dice
                    this.state.tiles.set(key, {
                        owner: this.state.selectedPlayer,
                        dice: this.state.diceBrushValue
                    });
                } else {
                    // Remove tile
                    this.state.tiles.delete(key);
                }
                break;
                
            case 'assign':
                if (tile) {
                    tile.owner = this.state.selectedPlayer;
                } else {
                    // In assign mode, clicking empty creates tile with selected player
                    this.state.tiles.set(key, {
                        owner: this.state.selectedPlayer,
                        dice: this.state.diceBrushValue
                    });
                }
                break;
                
            case 'dice':
                if (tile) {
                    tile.dice = this.state.diceBrushValue;
                }
                break;
        }
        
        this.state.isDirty = true;
        this.renderGrid();
    }
    
    /**
     * Switch editor mode
     */
    setMode(mode) {
        this.state.currentMode = mode;
        
        // Update tab active states
        this.elements.modeTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.mode === mode);
        });
        
        // Show/hide toolbars
        this.elements.paintToolbar.classList.toggle('hidden', mode !== 'paint');
        this.elements.assignToolbar.classList.toggle('hidden', mode !== 'assign');
        this.elements.diceToolbar.classList.toggle('hidden', mode !== 'dice');
    }
    
    /**
     * Add a new player
     */
    addPlayer() {
        if (this.state.players.length >= 8) {
            return; // Max players reached
        }
        
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
        if (this.state.players.length <= 2) {
            return; // Minimum 2 players required
        }
        
        // Reassign any tiles owned by this player to player 0
        for (const tile of this.state.tiles.values()) {
            if (tile.owner === id) {
                tile.owner = 0;
            }
        }
        
        // Remove player
        this.state.players = this.state.players.filter(p => p.id !== id);
        
        // Renumber players
        this.state.players.forEach((p, i) => {
            const oldId = p.id;
            p.id = i;
            // Update tile ownership
            for (const tile of this.state.tiles.values()) {
                if (tile.owner === oldId) {
                    tile.owner = i;
                }
            }
        });
        
        // Reset selected player if needed
        if (this.state.selectedPlayer >= this.state.players.length) {
            this.state.selectedPlayer = 0;
        }
        
        this.state.isDirty = true;
        this.renderPlayerList();
        this.renderPlayerPalette();
        this.renderGrid();
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
            this.renderGrid();
        }
    }
    
    /**
     * Render the player list in settings panel
     */
    renderPlayerList() {
        const container = this.elements.playerList;
        container.innerHTML = '';
        
        this.elements.playerCountDisplay.textContent = `(${this.state.players.length})`;
        
        // Get available AIs
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
            
            // Event handlers
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
        
        // Hide add button if at max
        this.elements.addPlayerBtn.style.display = this.state.players.length >= 8 ? 'none' : '';
    }
    
    /**
     * Render the player palette for assign mode
     */
    renderPlayerPalette() {
        const container = this.elements.playerPalette;
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
        this.renderGrid();
    }
    
    /**
     * Fill entire grid with tiles
     */
    fillGrid() {
        const { width, height, players } = this.state;
        const playerCount = players.length;
        
        // Distribute tiles evenly among players
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
        this.renderGrid();
    }
    
    /**
     * Randomize dice counts on existing tiles
     */
    randomizeDice() {
        for (const tile of this.state.tiles.values()) {
            tile.dice = Math.floor(Math.random() * this.state.maxDice) + 1;
        }
        
        this.state.isDirty = true;
        this.renderGrid();
    }
    
    /**
     * Resize the grid
     */
    resizeGrid(newWidth, newHeight) {
        // Remove tiles outside new bounds
        for (const [key] of this.state.tiles) {
            const [x, y] = key.split(',').map(Number);
            if (x >= newWidth || y >= newHeight) {
                this.state.tiles.delete(key);
            }
        }
        
        this.state.width = newWidth;
        this.state.height = newHeight;
        this.state.isDirty = true;
        this.renderGrid();
    }
    
    /**
     * Save as map (tiles only, no ownership)
     */
    saveAsMap() {
        // Validation - need at least one tile
        if (this.state.tiles.size === 0) {
            this.showStatus('Add at least one tile first', 'error');
            return null;
        }
        
        // Auto-generate name if empty
        let name = this.state.name.trim();
        if (!name) {
            name = 'Untitled Map';
            this.state.name = name;
            this.elements.nameInput.value = name;
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
                return { x, y }; // Maps only store coordinates
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
        // Validation - need at least one tile
        if (this.state.tiles.size === 0) {
            this.showStatus('Add at least one tile first', 'error');
            return null;
        }
        
        // Auto-generate name if empty
        let name = this.state.name.trim();
        if (!name) {
            name = 'Untitled Scenario';
            this.state.name = name;
            this.elements.nameInput.value = name;
        }
        
        // Fix any tiles with invalid owners (assign to player 0)
        for (const [key, tile] of this.state.tiles) {
            if (tile.owner === undefined || tile.owner === null || tile.owner < 0) {
                tile.owner = 0;
            } else if (!this.state.players.find(p => p.id === tile.owner)) {
                tile.owner = 0;
            }
        }
        
        // Check each player owns at least one tile - auto-assign if not
        const tileCounts = {};
        this.state.players.forEach(p => tileCounts[p.id] = 0);
        for (const tile of this.state.tiles.values()) {
            tileCounts[tile.owner]++;
        }
        
        const playersWithNoTiles = this.state.players.filter(p => tileCounts[p.id] === 0);
        if (playersWithNoTiles.length > 0) {
            // Auto-assign tiles to players who have none
            const tilesArray = Array.from(this.state.tiles.values());
            let tileIndex = 0;
            for (const player of playersWithNoTiles) {
                // Find a tile from player 0 to give to this player
                for (let i = 0; i < tilesArray.length; i++) {
                    if (tilesArray[i].owner === 0 && tileCounts[0] > 1) {
                        tilesArray[i].owner = player.id;
                        tileCounts[0]--;
                        tileCounts[player.id]++;
                        break;
                    }
                }
            }
            this.renderGrid();
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
        
        this.state.originalId = scenario.isBuiltIn ? null : scenario.id; // Don't overwrite built-ins
        this.state.name = scenario.isBuiltIn ? scenario.name + ' (Copy)' : scenario.name;
        this.state.description = scenario.description || '';
        this.state.maxDice = scenario.maxDice || 9;
        this.state.diceSides = scenario.diceSides || 6;
        
        // Import players
        if (scenario.players && scenario.players.length > 0) {
            this.state.players = scenario.players.map(p => ({
                id: p.id,
                isBot: p.isBot !== undefined ? p.isBot : true,
                color: p.color || DEFAULT_COLORS[p.id % DEFAULT_COLORS.length],
                aiId: p.aiId || (p.isBot ? 'easy' : null)
            }));
        }
        
        // Import tiles
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
