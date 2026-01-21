/**
 * Scenario Manager
 * Handles save/load/export of game scenarios using localStorage
 */

import { validateScenario, createScenarioFromGame } from './scenario-data.js';

const STORAGE_KEY = 'diceception_scenarios';
const MAX_SCENARIOS = 50;

export class ScenarioManager {
    constructor() {
        this.scenarios = new Map();
        this.loadFromStorage();
    }

    /**
     * Load all scenarios from localStorage
     */
    loadFromStorage() {
        this.scenarios.clear();

        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed)) {
                    for (const scenario of parsed) {
                        if (scenario && scenario.id) {
                            this.scenarios.set(scenario.id, scenario);
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Failed to load scenarios:', e);
        }

        // Add built-in scenarios if not present
        this.ensureBuiltInScenarios();
    }

    /**
     * Save all scenarios to localStorage
     */
    saveToStorage() {
        try {
            const data = Array.from(this.scenarios.values());
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('Failed to save scenarios:', e);
            // Handle quota exceeded
            if (e.name === 'QuotaExceededError') {
                this.pruneOldScenarios();
                try {
                    const data = Array.from(this.scenarios.values());
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                } catch (e2) {
                    console.error('Still failed after pruning:', e2);
                }
            }
        }
    }

    /**
     * Remove oldest non-built-in scenarios when storage is full
     */
    pruneOldScenarios() {
        const customScenarios = Array.from(this.scenarios.values())
            .filter(s => !s.isBuiltIn)
            .sort((a, b) => a.createdAt - b.createdAt);

        // Remove oldest 10 custom scenarios
        for (let i = 0; i < Math.min(10, customScenarios.length); i++) {
            this.scenarios.delete(customScenarios[i].id);
        }
    }

    /**
     * Save current game state as a scenario
     * @param {Game} game - Game instance
     * @param {string} name - Scenario name
     * @param {string} description - Optional description
     * @returns {Object} The saved scenario
     */
    saveScenario(game, name, description = '') {
        if (this.scenarios.size >= MAX_SCENARIOS) {
            this.pruneOldScenarios();
        }

        const scenario = createScenarioFromGame(game, name, description);
        this.scenarios.set(scenario.id, scenario);
        this.saveToStorage();
        return scenario;
    }

    /**
     * Save an editor-created scenario
     * @param {Object} scenario - Scenario object
     * @returns {Object} The saved scenario
     */
    saveEditorScenario(scenario) {
        const validation = validateScenario(scenario);
        if (!validation.valid) {
            throw new Error('Invalid scenario: ' + validation.errors.join(', '));
        }

        if (this.scenarios.size >= MAX_SCENARIOS) {
            this.pruneOldScenarios();
        }

        this.scenarios.set(scenario.id, scenario);
        this.saveToStorage();
        return scenario;
    }

    /**
     * Load a scenario by ID
     * @param {string} id 
     * @returns {Object|null}
     */
    loadScenario(id) {
        return this.scenarios.get(id) || null;
    }

    /**
     * Delete a scenario
     * @param {string} id 
     * @returns {boolean}
     */
    deleteScenario(id) {
        const scenario = this.scenarios.get(id);
        if (scenario && scenario.isBuiltIn) {
            console.warn('Cannot delete built-in scenario');
            return false;
        }

        const deleted = this.scenarios.delete(id);
        if (deleted) {
            this.saveToStorage();
        }
        return deleted;
    }

    /**
     * Get all scenarios sorted by date (newest first)
     * @returns {Object[]}
     */
    listScenarios() {
        return Array.from(this.scenarios.values())
            .sort((a, b) => {
                // Built-in first, then by date (newest first)
                if (a.isBuiltIn !== b.isBuiltIn) {
                    return a.isBuiltIn ? -1 : 1;
                }
                return b.createdAt - a.createdAt;
            });
    }

    /**
     * Export a scenario as JSON string
     * @param {string} id 
     * @returns {string|null}
     */
    exportScenario(id) {
        const scenario = this.scenarios.get(id);
        if (!scenario) return null;

        // Create a clean copy without internal fields
        const exported = { ...scenario };
        delete exported.thumbnail; // Don't export thumbnails (too large)

        return JSON.stringify(exported, null, 2);
    }

    /**
     * Import a scenario from JSON
     * @param {string} json 
     * @returns {Object}
     */
    importScenario(json) {
        let scenario;
        try {
            scenario = JSON.parse(json);
        } catch (e) {
            throw new Error('Invalid JSON format');
        }

        const validation = validateScenario(scenario);
        if (!validation.valid) {
            throw new Error('Invalid scenario: ' + validation.errors.join(', '));
        }

        // Generate new ID to avoid conflicts
        scenario.id = 'scenario_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        scenario.isBuiltIn = false;
        scenario.createdAt = Date.now();

        this.scenarios.set(scenario.id, scenario);
        this.saveToStorage();
        return scenario;
    }

    /**
     * Apply a scenario to start a new game
     * @param {Game} game - Game instance
     * @param {Object} scenario - Scenario to apply
     */
    applyScenarioToGame(game, scenario) {
        // Set game properties
        game.maxDice = scenario.maxDice || 9;
        game.diceSides = scenario.diceSides || 6;
        game.gameOver = false;
        game.winner = null;
        game.turn = 1;

        // Set up players
        game.players = scenario.players.map(p => ({
            id: p.id,
            isBot: p.isBot,
            color: p.color,
            alive: true,
            storedDice: p.storedDice || 0
        }));

        // Set up map
        game.map.width = scenario.width;
        game.map.height = scenario.height;
        game.map.tiles = [];

        // Create all tiles as blocked first
        for (let y = 0; y < scenario.height; y++) {
            for (let x = 0; x < scenario.width; x++) {
                game.map.tiles.push({
                    x: x,
                    y: y,
                    blocked: true,
                    owner: -1,
                    dice: 0
                });
            }
        }

        // Apply scenario tiles
        for (const tile of scenario.tiles) {
            const index = tile.y * scenario.width + tile.x;
            if (index >= 0 && index < game.map.tiles.length) {
                game.map.tiles[index] = {
                    x: tile.x,
                    y: tile.y,
                    blocked: false,
                    owner: tile.owner,
                    dice: tile.dice
                };
            }
        }

        game.currentPlayerIndex = 0;
    }

    /**
     * Add built-in scenarios if not present
     */
    ensureBuiltInScenarios() {
        // Classic Duel - 2 player balanced arena
        if (!this.scenarios.has('builtin_duel')) {
            this.scenarios.set('builtin_duel', {
                id: 'builtin_duel',
                name: '⚔️ Classic Duel',
                description: 'A balanced 2-player arena',
                type: 'scenario',
                isBuiltIn: true,
                createdAt: 0,
                width: 7,
                height: 7,
                maxDice: 9,
                diceSides: 6,
                players: [
                    { id: 0, isBot: false, color: 0xAA00FF, storedDice: 0 },
                    { id: 1, isBot: true, color: 0xFF0055, storedDice: 0 }
                ],
                tiles: this.generateDuelTiles()
            });
        }

        // Four Corners - 4 player symmetric
        if (!this.scenarios.has('builtin_corners')) {
            this.scenarios.set('builtin_corners', {
                id: 'builtin_corners',
                name: '🏰 Four Corners',
                description: 'Symmetric 4-player battlefield',
                type: 'scenario',
                isBuiltIn: true,
                createdAt: 0,
                width: 9,
                height: 9,
                maxDice: 9,
                diceSides: 6,
                players: [
                    { id: 0, isBot: false, color: 0xAA00FF, storedDice: 0 },
                    { id: 1, isBot: true, color: 0xFF0055, storedDice: 0 },
                    { id: 2, isBot: true, color: 0x55FF00, storedDice: 0 },
                    { id: 3, isBot: true, color: 0xFFDD00, storedDice: 0 }
                ],
                tiles: this.generateCornersTiles()
            });
        }

        // The Line - Long narrow battle
        if (!this.scenarios.has('builtin_line')) {
            this.scenarios.set('builtin_line', {
                id: 'builtin_line',
                name: '📏 The Line',
                description: 'Fight along a narrow corridor',
                type: 'scenario',
                isBuiltIn: true,
                createdAt: 0,
                width: 15,
                height: 3,
                maxDice: 9,
                diceSides: 6,
                players: [
                    { id: 0, isBot: false, color: 0xAA00FF, storedDice: 0 },
                    { id: 1, isBot: true, color: 0xFF0055, storedDice: 0 }
                ],
                tiles: this.generateLineTiles()
            });
        }

        // World Map - Risk-style with connected continents
        if (!this.scenarios.has('builtin_world')) {
            this.scenarios.set('builtin_world', {
                id: 'builtin_world',
                name: '🌍 World Conquest',
                description: 'Risk-style map with 6 connected continents',
                type: 'scenario',
                isBuiltIn: true,
                createdAt: 0,
                width: 12,
                height: 10,
                maxDice: 9,
                diceSides: 6,
                players: [
                    { id: 0, isBot: false, color: 0xAA00FF, storedDice: 0 },
                    { id: 1, isBot: true, color: 0xFF0055, storedDice: 0 },
                    { id: 2, isBot: true, color: 0x55FF00, storedDice: 0 },
                    { id: 3, isBot: true, color: 0xFFDD00, storedDice: 0 },
                    { id: 4, isBot: true, color: 0x00DDFF, storedDice: 0 },
                    { id: 5, isBot: true, color: 0xFF8800, storedDice: 0 }
                ],
                tiles: this.generateWorldTiles()
            });
        }

        // The Ring - Circular battle
        if (!this.scenarios.has('builtin_ring')) {
            this.scenarios.set('builtin_ring', {
                id: 'builtin_ring',
                name: '💍 The Ring',
                description: 'Circular arena - attack from both sides!',
                type: 'scenario',
                isBuiltIn: true,
                createdAt: 0,
                width: 9,
                height: 9,
                maxDice: 9,
                diceSides: 6,
                players: [
                    { id: 0, isBot: false, color: 0xAA00FF, storedDice: 0 },
                    { id: 1, isBot: true, color: 0xFF0055, storedDice: 0 },
                    { id: 2, isBot: true, color: 0x55FF00, storedDice: 0 }
                ],
                tiles: this.generateRingTiles()
            });
        }

        // Archipelago - Island hopping
        if (!this.scenarios.has('builtin_archipelago')) {
            this.scenarios.set('builtin_archipelago', {
                id: 'builtin_archipelago',
                name: '🏝️ Archipelago',
                description: 'Island-hopping warfare',
                type: 'scenario',
                isBuiltIn: true,
                createdAt: 0,
                width: 11,
                height: 9,
                maxDice: 9,
                diceSides: 6,
                players: [
                    { id: 0, isBot: false, color: 0xAA00FF, storedDice: 0 },
                    { id: 1, isBot: true, color: 0xFF0055, storedDice: 0 },
                    { id: 2, isBot: true, color: 0x55FF00, storedDice: 0 },
                    { id: 3, isBot: true, color: 0xFFDD00, storedDice: 0 }
                ],
                tiles: this.generateArchipelagoTiles()
            });
        }

        // The Cross - Central chokepoint
        if (!this.scenarios.has('builtin_cross')) {
            this.scenarios.set('builtin_cross', {
                id: 'builtin_cross',
                name: '✝️ The Cross',
                description: 'Central chokepoint battlefield',
                type: 'scenario',
                isBuiltIn: true,
                createdAt: 0,
                width: 9,
                height: 9,
                maxDice: 9,
                diceSides: 6,
                players: [
                    { id: 0, isBot: false, color: 0xAA00FF, storedDice: 0 },
                    { id: 1, isBot: true, color: 0xFF0055, storedDice: 0 },
                    { id: 2, isBot: true, color: 0x55FF00, storedDice: 0 },
                    { id: 3, isBot: true, color: 0xFFDD00, storedDice: 0 }
                ],
                tiles: this.generateCrossTiles()
            });
        }

        // Tiny Battle - Quick 2-player game
        if (!this.scenarios.has('builtin_tiny')) {
            this.scenarios.set('builtin_tiny', {
                id: 'builtin_tiny',
                name: '🔬 Tiny Battle',
                description: 'Quick micro-game for rapid battles',
                type: 'scenario',
                isBuiltIn: true,
                createdAt: 0,
                width: 5,
                height: 5,
                maxDice: 6,
                diceSides: 6,
                players: [
                    { id: 0, isBot: false, color: 0xAA00FF, storedDice: 0 },
                    { id: 1, isBot: true, color: 0xFF0055, storedDice: 0 }
                ],
                tiles: this.generateTinyTiles()
            });
        }
    }

    generateDuelTiles() {
        const tiles = [];
        const width = 7, height = 7;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Create a simple hexagonal-ish pattern
                const distFromCenter = Math.abs(x - 3) + Math.abs(y - 3);
                if (distFromCenter <= 4) {
                    // Left side = player 0, right side = player 1
                    const owner = x < 3 ? 0 : (x > 3 ? 1 : (y < 3 ? 0 : 1));
                    tiles.push({
                        x, y,
                        owner: owner,
                        dice: x === 0 || x === 6 ? 3 : (x === 3 ? 2 : 2)
                    });
                }
            }
        }
        return tiles;
    }

    generateCornersTiles() {
        const tiles = [];
        const size = 9;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                // Skip center block for more interesting gameplay
                if (x >= 3 && x <= 5 && y >= 3 && y <= 5) continue;

                // Assign corners to players
                let owner;
                if (x < 4 && y < 4) owner = 0;
                else if (x >= 5 && y < 4) owner = 1;
                else if (x < 4 && y >= 5) owner = 2;
                else owner = 3;

                tiles.push({
                    x, y,
                    owner: owner,
                    dice: 2
                });
            }
        }
        return tiles;
    }

    generateLineTiles() {
        const tiles = [];
        const width = 15, height = 3;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const owner = x < 7 ? 0 : (x > 7 ? 1 : (y === 1 ? -1 : (x < 7 ? 0 : 1)));
                if (owner === -1) continue; // Skip center tile for gap

                tiles.push({
                    x, y,
                    owner: owner,
                    dice: x === 0 || x === 14 ? 4 : 2
                });
            }
        }
        return tiles;
    }

    // Risk-style world map with 6 connected continents
    generateWorldTiles() {
        const tiles = [];
        const width = 12, height = 10;

        // Define continents as regions with their owner
        // 0 = North America (top-left), 1 = South America (bottom-left)
        // 2 = Europe (top-center), 3 = Africa (center-bottom)
        // 4 = Asia (top-right), 5 = Australia (bottom-right)

        const continentMap = [
            // Row 0
            [0, 0, 0, -1, 2, 2, 2, -1, 4, 4, 4, 4],
            // Row 1  
            [0, 0, 0, -1, 2, 2, 2, 4, 4, 4, 4, 4],
            // Row 2
            [0, 0, 0, 0, 2, 2, 2, 4, 4, 4, 4, -1],
            // Row 3
            [-1, 0, 0, -1, 2, 3, 3, 4, 4, 4, -1, -1],
            // Row 4
            [-1, 1, -1, -1, 3, 3, 3, 3, -1, -1, -1, -1],
            // Row 5
            [1, 1, 1, -1, 3, 3, 3, 3, -1, -1, 5, 5],
            // Row 6
            [1, 1, 1, -1, 3, 3, 3, -1, -1, 5, 5, 5],
            // Row 7
            [1, 1, -1, -1, -1, 3, -1, -1, -1, 5, 5, 5],
            // Row 8
            [-1, 1, -1, -1, -1, -1, -1, -1, -1, 5, 5, -1],
            // Row 9
            [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1]
        ];

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const owner = continentMap[y][x];
                if (owner !== -1) {
                    tiles.push({
                        x, y,
                        owner: owner,
                        dice: 2
                    });
                }
            }
        }
        return tiles;
    }

    // Circular ring arena
    generateRingTiles() {
        const tiles = [];
        const size = 9;
        const center = 4;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dist = Math.sqrt((x - center) ** 2 + (y - center) ** 2);
                // Ring from radius 2 to 4
                if (dist >= 2 && dist <= 4.5) {
                    // Divide into 3 sectors
                    const angle = Math.atan2(y - center, x - center);
                    let owner;
                    if (angle < -Math.PI / 3) owner = 0;
                    else if (angle < Math.PI / 3) owner = 1;
                    else owner = 2;

                    tiles.push({
                        x, y,
                        owner: owner,
                        dice: 2
                    });
                }
            }
        }
        return tiles;
    }

    // Island archipelago
    generateArchipelagoTiles() {
        const tiles = [];

        // Define islands with their positions and owners
        const islands = [
            // Large island top-left (player 0)
            { owner: 0, coords: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [1, 2]] },
            // Medium island top-right (player 1)
            { owner: 1, coords: [[8, 0], [9, 0], [10, 0], [8, 1], [9, 1], [10, 1]] },
            // Medium island center-left (player 2)
            { owner: 2, coords: [[0, 4], [1, 4], [2, 4], [0, 5], [1, 5]] },
            // Central island (contested - player 0)
            { owner: 0, coords: [[5, 3], [6, 3], [5, 4], [6, 4], [5, 5]] },
            // Medium island center-right (player 3)
            { owner: 3, coords: [[9, 4], [10, 4], [9, 5], [10, 5]] },
            // Large island bottom-left (player 1)
            { owner: 1, coords: [[1, 7], [2, 7], [3, 7], [1, 8], [2, 8], [3, 8]] },
            // Medium island bottom-center (player 2)
            { owner: 2, coords: [[5, 7], [6, 7], [7, 7], [6, 8]] },
            // Large island bottom-right (player 3)
            { owner: 3, coords: [[9, 7], [10, 7], [9, 8], [10, 8]] },
            // Bridge tiles connecting islands
            { owner: 0, coords: [[3, 2], [4, 3]] },
            { owner: 1, coords: [[7, 1], [7, 2]] },
            { owner: 2, coords: [[3, 5], [4, 5]] },
            { owner: 3, coords: [[8, 5], [8, 6]] },
            { owner: 0, coords: [[4, 6], [4, 7]] },
            { owner: 1, coords: [[4, 8]] },
            { owner: 3, coords: [[8, 7]] },
        ];

        for (const island of islands) {
            for (const [x, y] of island.coords) {
                tiles.push({
                    x, y,
                    owner: island.owner,
                    dice: 2
                });
            }
        }

        return tiles;
    }

    // Cross-shaped battlefield
    generateCrossTiles() {
        const tiles = [];
        const size = 9;
        const center = 4;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                // Create cross shape (center column and center row, plus corners)
                const inVerticalArm = x >= 3 && x <= 5;
                const inHorizontalArm = y >= 3 && y <= 5;

                if (inVerticalArm || inHorizontalArm) {
                    // Assign by position
                    let owner;
                    if (y < 3) owner = 0;  // Top
                    else if (y > 5) owner = 1;  // Bottom
                    else if (x < 3) owner = 2;  // Left
                    else if (x > 5) owner = 3;  // Right
                    else owner = (x + y) % 4;  // Center - mixed

                    tiles.push({
                        x, y,
                        owner: owner,
                        dice: 2
                    });
                }
            }
        }
        return tiles;
    }

    // Tiny 5x5 battlefield for quick games
    generateTinyTiles() {
        const tiles = [];

        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < 5; x++) {
                // Create diamond-ish shape
                const dist = Math.abs(x - 2) + Math.abs(y - 2);
                if (dist <= 3) {
                    const owner = x < 2 ? 0 : (x > 2 ? 1 : (y < 2 ? 0 : 1));
                    tiles.push({
                        x, y,
                        owner: owner,
                        dice: x === 0 || x === 4 ? 3 : 2
                    });
                }
            }
        }
        return tiles;
    }
}
