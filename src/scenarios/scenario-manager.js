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
}
