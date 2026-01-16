import { MapManager } from './map.js';
import { CombatManager } from './combat.js';
import { ReinforcementManager } from './reinforcement.js';

export class Game {
    constructor() {
        this.map = new MapManager();
        this.combat = new CombatManager();
        this.reinforcement = new ReinforcementManager();

        this.players = [];
        this.currentPlayerIndex = 0;
        this.turn = 1;
        this.gameOver = false;
        this.winner = null;
        this.maxDice = 9;
        this.diceSides = 6; // Default to standard 6-sided dice

        // Event listeners
        this.listeners = {};
    }

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }

    startGame(config) {
        // config: { humanCount, botCount, mapWidth, mapHeight, maxDice, diceSides, mapStyle, gameMode }
        this.players = [];
        this.gameOver = false;
        this.winner = null;
        this.turn = 1;
        this.maxDice = config.maxDice || 9;
        this.diceSides = config.diceSides || 6;
        this.gameMode = config.gameMode || 'classic';

        const totalPlayers = config.humanCount + config.botCount;

        // Create human players first
        for (let i = 0; i < config.humanCount; i++) {
            this.players.push({
                id: i,
                isBot: false,
                color: this.getPlayerColor(i, false),
                alive: true,
                storedDice: 0
            });
        }

        // Then create bots
        for (let i = 0; i < config.botCount; i++) {
            this.players.push({
                id: config.humanCount + i,
                isBot: true,
                color: this.getPlayerColor(i, true),
                alive: true,
                storedDice: 0
            });
        }

        // Shuffle players to randomize starting player
        for (let i = this.players.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.players[i], this.players[j]] = [this.players[j], this.players[i]];
        }

        this.currentPlayerIndex = 0;

        // Generate map with the specified style
        this.map.generateMap(config.mapWidth, config.mapHeight, this.players, this.maxDice, config.mapStyle || 'random');

        // Apply Game Modes
        if (this.gameMode === 'fair') {
            this.applyFairStartMode();
        } else if (this.gameMode === 'madness') {
            this.applyMadnessMode();
        } else if (this.gameMode === '2of2') {
            this.apply2of2Mode();
        }

        this.emit('gameStart', { players: this.players, map: this.map });
        this.startTurn();
    }

    applyFairStartMode() {
        // Ensure all players have the same total dice count
        const stats = this.players.map(p => {
            const tiles = this.map.getTilesByOwner(p.id);
            return {
                player: p,
                tiles: tiles,
                totalDice: tiles.reduce((sum, t) => sum + t.dice, 0)
            };
        });

        // Find the minimum dice count
        const minDice = Math.min(...stats.map(s => s.totalDice));

        // Reduce dice on players with more than minimum
        stats.forEach(s => {
            let excess = s.totalDice - minDice;
            while (excess > 0) {
                // Find tiles with more than 1 die
                const reducibleTiles = s.tiles.filter(t => t.dice > 1);
                if (reducibleTiles.length === 0) break;

                // Reduce a random tile
                const tile = reducibleTiles[Math.floor(Math.random() * reducibleTiles.length)];
                tile.dice--;
                excess--;
            }
        });
    }

    applyMadnessMode() {
        // Every tile starts with max dice
        this.map.tiles.forEach(tile => {
            if (!tile.blocked) {
                tile.dice = this.maxDice;
            }
        });
    }

    apply2of2Mode() {
        // Every tile starts with exactly 2 dice
        this.map.tiles.forEach(tile => {
            if (!tile.blocked) {
                tile.dice = 2;
            }
        });
    }

    getPlayerColor(index, isBot = false) {
        // Human colors: Purple first, then cool/neutral tones
        const humanColors = [
            0xAA00FF, // Purple (Human 1)
            0xFF00AA, // Magenta (Human 2)
            0x00FFFF, // Cyan (Human 3)
            0xFFFFFF  // White (Human 4)
        ];

        // Bot colors: Warm tones to contrast with humans
        const botColors = [
            0xFF0055, // Red/Pink
            0x55FF00, // Lime
            0xFFDD00, // Yellow
            0xFF8800, // Orange
            0x00AAFF, // Light Blue
            0x88FF88, // Light Green
            0xFFAA55  // Peach
        ];

        if (isBot) {
            return botColors[index % botColors.length];
        }
        return humanColors[index % humanColors.length];
    }

    get currentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    attack(fromX, fromY, toX, toY) {
        if (this.gameOver) return;

        try {
            const result = this.combat.resolveAttack(this, fromX, fromY, toX, toY);
            this.emit('attackResult', result);
            this.checkWinCondition();

            // If still active and attacker lost dice, maybe they can't attack anymore?
            // User decides when to end turn.

            return result;
        } catch (e) {
            console.warn("Attack failed:", e.message);
            return { error: e.message };
        }
    }

    endTurn() {
        if (this.gameOver) return;

        // 1. Reinforce current player
        const reinforceResult = this.reinforcement.distributeReinforcements(this, this.currentPlayer.id);
        this.emit('reinforcements', { player: this.currentPlayer, ...reinforceResult });

        // 2. Switch player
        // Skip dead players
        let loops = 0;
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            loops++;
            if (loops > this.players.length) {
                // Should not happen if game not over
                this.gameOver = true;
                break;
            }
        } while (!this.players[this.currentPlayerIndex].alive);

        this.turn++;
        this.startTurn();
    }

    startTurn() {
        if (this.gameOver) return;
        this.emit('turnStart', { player: this.currentPlayer });

        // If bot, trigger AI (handled by main loop or AI controller listening to events)
    }

    checkWinCondition() {
        // Check if any player has 0 tiles
        const activePlayers = new Set();
        for (const tile of this.map.tiles) {
            // Skip blocked tiles - they have no owner
            if (tile.blocked) continue;
            activePlayers.add(tile.owner);
        }

        // Mark dead players
        this.players.forEach(p => {
            if (!activePlayers.has(p.id)) {
                if (p.alive) {
                    p.alive = false;
                    this.emit('playerEliminated', p);
                }
            }
        });

        if (activePlayers.size === 1) {
            this.gameOver = true;
            this.winner = this.players.find(p => p.id === [...activePlayers][0]);
            this.emit('gameOver', { winner: this.winner });
        }
    }

    getPlayerStats() {
        return this.players.map(p => {
            if (!p.alive) return { id: p.id, color: p.color, isBot: p.isBot, alive: false, tileCount: 0, totalDice: 0, connectedTiles: 0 };

            const ownedTiles = this.map.getTilesByOwner(p.id);
            const totalDice = ownedTiles.reduce((sum, t) => sum + t.dice, 0);
            const largestRegion = this.map.findLargestConnectedRegion(p.id);

            return {
                id: p.id,
                color: p.color,
                isBot: p.isBot,
                alive: true,
                tileCount: ownedTiles.length,
                totalDice: totalDice,
                connectedTiles: largestRegion,
                storedDice: p.storedDice || 0
            };
        });
    }
}
