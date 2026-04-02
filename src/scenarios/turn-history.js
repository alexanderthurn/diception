/**
 * Turn History System
 * Captures game state snapshots at each turn for replay and scenario saving
 */

import { createScenarioFromGame } from './scenario-data.js';
import { mulberry32 } from '../core/rng.js';

const MAX_HISTORY_LENGTH = 100; // Keep last 100 turns
const AUTOSAVE_KEY = 'diceception_autosave';

export class TurnHistory {
    constructor() {
        this.snapshots = [];
        this.currentIndex = -1;
    }

    /**
     * Clear all history (on new game)
     */
    clear() {
        this.snapshots = [];
        this.currentIndex = -1;
        try {
            localStorage.removeItem('diceception_initial_state');
        } catch (e) {
            /* ignore */
        }
    }

    /**
     * Capture the current game state as a snapshot
     * @param {Game} game - The game instance
     * @returns {Object} The captured snapshot
     */
    captureSnapshot(game) {
        const snapshot = {
            turn: game.turn,
            currentPlayerIndex: game.currentPlayerIndex,
            timestamp: Date.now(),

            // Full game state for restoration
            gameState: this.serializeGameState(game)
        };

        // Add to history
        this.snapshots.push(snapshot);
        this.currentIndex = this.snapshots.length - 1;

        // Prune old snapshots
        if (this.snapshots.length > MAX_HISTORY_LENGTH) {
            this.snapshots.shift();
            this.currentIndex--;
        }

        return snapshot;
    }

    /**
     * Serialize the complete game state for restoration
     * @param {Game} game 
     * @returns {Object}
     */
    serializeGameState(game) {
        return {
            // Seed — restored so the RNG can continue from exactly this point
            seed: game.seed ?? null,
            rngState: (typeof game.rng?.getState === 'function') ? game.rng.getState() : null,

            // Core game properties
            maxDice: game.maxDice,
            diceSides: game.diceSides,
            turn: game.turn,
            currentPlayerIndex: game.currentPlayerIndex,
            gameOver: game.gameOver,
            gameMode: game.gameMode,
            attacksPerTurn: game.attacksPerTurn ?? 0,
            attacksUsedThisTurn: game.attacksUsedThisTurn ?? 0,
            secondsPerTurn: game.secondsPerTurn ?? 0,
            secondsPerAttack: game.secondsPerAttack ?? 0,
            playMode: game.playMode ?? 'classic',
            attackRule: game.attackRule ?? 'classic',
            supplyRule: game.supplyRule ?? 'classic',

            // Map state
            map: {
                width: game.map.width,
                height: game.map.height,
                tiles: game.map.tiles.map((tile, idx) => ({
                    x: idx % game.map.width,
                    y: Math.floor(idx / game.map.width),
                    blocked: tile.blocked,
                    owner: tile.owner,
                    dice: tile.dice
                }))
            },

            // Player state
            players: game.players.map(p => ({
                id: p.id,
                isBot: p.isBot,
                aiId: p.aiId,
                name: p.name,
                color: p.color,
                alive: p.alive,
                storedDice: p.storedDice || 0
            }))
        };
    }

    /**
     * Restore a game state from a snapshot
     * @param {Game} game - The game instance to restore into
     * @param {number} snapshotIndex - Index of the snapshot to restore
     * @returns {boolean} Success
     */
    restoreSnapshot(game, snapshotIndex) {
        if (snapshotIndex < 0 || snapshotIndex >= this.snapshots.length) {
            console.error('Invalid snapshot index:', snapshotIndex);
            return false;
        }

        const snapshot = this.snapshots[snapshotIndex];
        return this.applyGameState(game, snapshot.gameState);
    }



    /**
     * Apply a serialized game state to a game instance
     * @param {Game} game 
     * @param {Object} state 
     * @returns {boolean}
     */
    applyGameState(game, state) {
        try {
            // Restore seed and RNG state so randomness continues deterministically
            if (state.seed != null) {
                game.seed = state.seed;
                game.rng = mulberry32(state.seed);
                if (state.rngState != null) game.rng.setState(state.rngState);
            }

            // Restore core properties
            game.maxDice = state.maxDice;
            game.diceSides = state.diceSides;
            game.turn = state.turn;
            game.currentPlayerIndex = state.currentPlayerIndex;
            game.gameOver = state.gameOver;
            game.gameMode = state.gameMode;
            game.winner = null;
            game.attacksPerTurn = state.attacksPerTurn ?? 0;
            game.attacksUsedThisTurn = state.attacksUsedThisTurn ?? 0;
            game.secondsPerTurn = state.secondsPerTurn ?? 0;
            game.secondsPerAttack = state.secondsPerAttack ?? 0;
            game.playMode = state.playMode ?? 'classic';
            game.attackRule = state.attackRule ?? 'classic';
            game.supplyRule = state.supplyRule ?? 'classic';

            // Restore map
            game.map.width = state.map.width;
            game.map.height = state.map.height;
            game.map.tiles = state.map.tiles.map(t => ({
                x: t.x,
                y: t.y,
                blocked: t.blocked,
                owner: t.owner,
                dice: t.dice
            }));
            game.map.maxDice = game.maxDice;

            // Restore players
            game.players = state.players.map(p => ({
                id: p.id,
                isBot: p.isBot,
                aiId: p.aiId,
                name: p.name,
                color: p.color,
                alive: p.alive,
                storedDice: p.storedDice || 0
            }));

            return true;
        } catch (e) {
            console.error('Failed to restore game state:', e);
            return false;
        }
    }

    /**
     * Get a snapshot by index
     * @param {number} index 
     * @returns {Object|null}
     */
    getSnapshot(index) {
        return this.snapshots[index] || null;
    }

    /**
     * Get the most recent snapshot
     * @returns {Object|null}
     */
    getLatestSnapshot() {
        return this.snapshots[this.snapshots.length - 1] || null;
    }

    /**
     * Get total number of snapshots
     * @returns {number}
     */
    get length() {
        return this.snapshots.length;
    }

    /**
     * Create a scenario from a specific snapshot
     * @param {Game} game - Game instance (for context)
     * @param {number} snapshotIndex
     * @param {string} name
     * @param {Object} options - Additional options (playerAIs, type)
     * @returns {Object} Scenario object
     */
    createScenarioFromSnapshot(game, snapshotIndex, name, options = {}) {
        const snapshot = this.snapshots[snapshotIndex];
        if (!snapshot) return null;

        // Temporarily apply the snapshot to create scenario
        const originalState = this.serializeGameState(game);
        this.applyGameState(game, snapshot.gameState);

        // Default to 'scenario' type for battle log saves
        const scenarioOptions = {
            type: 'scenario',
            ...options
        };

        const scenario = createScenarioFromGame(game, name, `Saved from turn ${snapshot.turn}`, scenarioOptions);

        // Restore original state
        this.applyGameState(game, originalState);

        return scenario;
    }

    /**
     * Save current game state as auto-save
     * @param {Game} game 
     */
    saveAutoSave(game) {
        try {
            const snapshot = {
                turn: game.turn,
                currentPlayerIndex: game.currentPlayerIndex,
                timestamp: Date.now(),
                gameState: this.serializeGameState(game)
            };
            localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot));
        } catch (e) {
            console.error('Failed to auto-save:', e);
        }
    }

    /**
     * Check if auto-save exists
     * @returns {boolean}
     */
    hasAutoSave() {
        return !!localStorage.getItem(AUTOSAVE_KEY);
    }

    /**
     * Load the auto-save snapshot
     * @returns {Object|null}
     */
    loadAutoSave() {
        try {
            const data = localStorage.getItem(AUTOSAVE_KEY);
            if (data) return JSON.parse(data);
        } catch (e) {
            console.error('Failed to load auto-save:', e);
        }
        return null;
    }

    /**
     * Clear auto-save
     */
    clearAutoSave() {
        localStorage.removeItem(AUTOSAVE_KEY);
    }
}
