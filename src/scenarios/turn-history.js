/**
 * Turn History System
 * Captures game state snapshots at each turn for replay and scenario saving
 */

import { createScenarioFromGame } from './scenario-data.js';

const MAX_HISTORY_LENGTH = 100; // Keep last 100 turns
const AUTOSAVE_KEY = 'diceception_autosave';
const INITIAL_STATE_KEY = 'diceception_initial_state';

export class TurnHistory {
    constructor() {
        this.snapshots = [];
        this.currentIndex = -1;
        this.initialSnapshot = null;
    }

    /**
     * Clear all history (on new game)
     */
    clear() {
        this.snapshots = [];
        this.currentIndex = -1;
        this.initialSnapshot = null;
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

        // Capture initial state (Turn 1) if not already captured in memory
        if (game.turn === 1 && !this.initialSnapshot) {
            // Clone deep copy for safety
            this.initialSnapshot = JSON.parse(JSON.stringify(snapshot));
        }

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
     * Check if there is a saved initial state available
     * @returns {boolean}
     */
    hasInitialState() {
        if (this.initialSnapshot) return true;

        try {
            const stored = localStorage.getItem(INITIAL_STATE_KEY);
            // Verify it's valid JSON and not null/empty
            return stored && JSON.parse(stored) !== null;
        } catch (e) {
            return false;
        }
    }

    /**
     * Explicitly save the current game state as the "Initial State" for restarts.
     * Should be called when a NEW game is started.
     * @param {Game} game 
     */
    saveInitialState(game) {
        const snapshot = {
            turn: game.turn,
            currentPlayerIndex: game.currentPlayerIndex,
            timestamp: Date.now(),
            gameState: this.serializeGameState(game)
        };

        this.initialSnapshot = JSON.parse(JSON.stringify(snapshot));

        try {
            localStorage.setItem(INITIAL_STATE_KEY, JSON.stringify(this.initialSnapshot));
        } catch (e) {
            console.error('Failed to persist initial state:', e);
        }
    }

    // ... serializeGameState ...

    // ... restoreSnapshot ...

    /**
     * Restore the initial game state (start of game)
     * @param {Game} game 
     * @returns {boolean}
     */
    restoreInitialSnapshot(game) {
        // Try to load from memory first, then localStorage
        if (!this.initialSnapshot) {
            try {
                const stored = localStorage.getItem(INITIAL_STATE_KEY);
                if (stored) {
                    this.initialSnapshot = JSON.parse(stored);
                }
            } catch (e) {
                console.error('Failed to load initial state from storage:', e);
            }
        }

        if (!this.initialSnapshot) {
            console.warn('No initial snapshot available to restore');
            return false;
        }

        // Cache the snapshot object before clearing history (which wipes this.initialSnapshot)
        const snapshotToRestore = this.initialSnapshot;

        // Reset history since we are restarting
        this.clear();

        // We re-capture the initial snapshot after restore so it exists for the next restart
        const success = this.applyGameState(game, snapshotToRestore.gameState);

        if (success) {
            // Re-save initial snapshot because clear() wiped it
            // We use the cached one, making a fresh copy just in case applyGameState somehow mutated it (it shouldn't but safe)
            this.initialSnapshot = JSON.parse(JSON.stringify(snapshotToRestore));
            // Add as first history item
            this.snapshots.push(this.initialSnapshot);
            this.currentIndex = 0;

            // Re-persist to storage just to be safe/consistent (though it should still be there)
            try {
                localStorage.setItem(INITIAL_STATE_KEY, JSON.stringify(this.initialSnapshot));
            } catch (e) {
                console.error('Failed to re-persist initial state:', e);
            }
        }

        return success;
    }

    /**
     * Serialize the complete game state for restoration
     * @param {Game} game 
     * @returns {Object}
     */
    serializeGameState(game) {
        return {
            // Core game properties
            maxDice: game.maxDice,
            diceSides: game.diceSides,
            turn: game.turn,
            currentPlayerIndex: game.currentPlayerIndex,
            gameOver: game.gameOver,
            gameMode: game.gameMode,

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
            // Restore core properties
            game.maxDice = state.maxDice;
            game.diceSides = state.diceSides;
            game.turn = state.turn;
            game.currentPlayerIndex = state.currentPlayerIndex;
            game.gameOver = state.gameOver;
            game.gameMode = state.gameMode;
            game.winner = null;

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

        // Default to 'replay' type for battle log saves
        const scenarioOptions = {
            type: 'replay',
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
