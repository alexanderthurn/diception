/**
 * Scenario Manager
 * Handles save/load/export of game scenarios using localStorage
 */

import { validateScenario, createScenarioFromGame } from './scenario-data.js';
import builtinScenarios from './builtin-scenarios.json';
import builtinMaps from './builtin-maps.json';

const STORAGE_KEY = 'diceception_scenarios';
const MAX_SCENARIOS = 50;

export class ScenarioManager {
    constructor() {
        this.scenarios = new Map();
        console.log('ScenarioManager constructor called');
        this.loadFromStorage();
        console.log('ScenarioManager loaded', this.scenarios.size, 'scenarios');
    }

    /**
     * Load all scenarios from localStorage
     */
    loadFromStorage() {
        console.log('ScenarioManager.loadFromStorage called');
        this.scenarios.clear();

        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                console.log('Loaded', parsed.length, 'user scenarios from localStorage');
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
        console.log('Calling ensureBuiltInScenarios');
        this.ensureBuiltInScenarios();
        console.log('ensureBuiltInScenarios completed, total scenarios:', this.scenarios.size);
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
        const scenario = this.scenarios.get(id) || null;
        console.log('ScenarioManager.loadScenario:', id, 'found:', !!scenario, 'total scenarios:', this.scenarios.size);
        if (!scenario) {
            console.log('Available scenario IDs:', Array.from(this.scenarios.keys()));
        }
        return scenario;
    }

    /**
     * Alias for loadScenario
     */
    getScenario(id) {
        return this.loadScenario(id);
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
    /**
     * Import a scenario from JSON but do NOT save it yet.
     * Returns the scenario object if valid.
     */
    parseImport(json) {
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

        return scenario;
    }

    /**
     * Generate a new unique ID for a scenario
     */
    generateUniqueId(prefix = 'scenario') {
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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
        console.log('Loading builtin scenarios:', builtinScenarios.length);
        // Load built-in scenarios from JSON
        for (const scenario of builtinScenarios) {
            // Always overwrite to ensure latest version (e.g. name changes)
            this.scenarios.set(scenario.id, {
                ...scenario,
                createdAt: 0 // Keep sorted at bottom (or top based on sort logic)
            });
        }

        console.log('Loading builtin maps:', builtinMaps.length);
        // Load built-in maps from JSON
        // Maps are scenarios with type='map' and no fixed players/dice
        for (const map of builtinMaps) {
            // Always overwrite to ensure latest version
            this.scenarios.set(map.id, {
                ...map,
                createdAt: 0,
                // Ensure required defaults exist
                maxDice: map.maxDice || 9,
                diceSides: map.diceSides || 6,
                players: map.players || []
            });
        }
        console.log('Built-in maps loaded, checking for map_archipelago:', this.scenarios.has('map_archipelago'));
    }
}
