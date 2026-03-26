import { MapManager } from './map.js';
import { CombatManager } from './combat.js';
import { ReinforcementManager } from './reinforcement.js';
import { GAME } from './constants.js';
import { mulberry32 } from './rng.js';

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
        this.turnLimitReached = false; // Set when game ends due to turn limit
        this.maxDice = 9;
        this.diceSides = 6; // Default to standard 6-sided dice
        this.fullBoardRule = 'nothing';
        this._fullBoardRuleFired = false;
        this.fullBoardResolution = false;
        /** Set between full-board rule resolve and `confirmFullBoardResolution` (UI reveal). */
        this._pendingFullBoardWinner = null;
        /** Max attacks per turn for the active player (0 = unlimited). */
        this.attacksPerTurn = 0;
        this.attacksUsedThisTurn = 0;
        /** Wall-clock seconds per turn for the active player (0 = unlimited). Parallel modes ignore this. */
        this.secondsPerTurn = 0;
        /** Wall-clock seconds to make each attack (0 = unlimited). Resets after each attack. Parallel modes ignore. */
        this.secondsPerAttack = 0;

        // Event listeners
        this.listeners = {};

        // When muted, emit() is a no-op (used for headless fast-forward)
        this.muted = false;

        // Optional hook set by the renderer to show a reinforcement animation
        // before the player switch happens.  Signature: (data, continueCallback) => void
        this.reinforcementAnimationHook = null;
    }

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        if (this.muted) return;
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }

    reset() {
        this.players = [];
        this.currentPlayerIndex = 0;
        this.turn = 1;
        this.gameOver = false;
        this.winner = null;
        this.turnLimitReached = false;
        this.fullBoardRule = 'nothing';
        this._fullBoardRuleFired = false;
        this.fullBoardResolution = false;
        this._pendingFullBoardWinner = null;
        this.attacksPerTurn = 0;
        this.attacksUsedThisTurn = 0;
        this.secondsPerTurn = 0;
        this.secondsPerAttack = 0;
        // Reset map to empty
        this.map.generateMap(0, 0, [], this.maxDice, 'empty');
        this.emit('gameReset');
    }

    startGame(config) {
        // config: { humanCount, botCount, mapWidth, mapHeight, maxDice, diceSides, mapStyle, gameMode }
        this.players = [];
        this.gameOver = false;
        this.winner = null;
        this.turnLimitReached = false;
        this.turn = 1;
        this.maxDice = config.maxDice || 9;
        this.diceSides = config.diceSides || 6;
        this.gameMode = config.gameMode || 'classic';
        this.fullBoardRule = config.fullBoardRule || 'nothing';
        this._fullBoardRuleFired = false;
        this.fullBoardResolution = false;
        this._pendingFullBoardWinner = null;
        this.attacksPerTurn = config.attacksPerTurn ?? 0;
        this.attacksUsedThisTurn = 0;
        this.secondsPerTurn = config.secondsPerTurn ?? 0;
        this.secondsPerAttack = config.secondsPerAttack ?? 0;

        const rng = Number.isFinite(config.mapSeed) ? mulberry32(config.mapSeed) : Math.random;

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

        // Randomize turn order (skirmish / custom game). Campaign or scenarios can set
        // `humanStartsFirst: true` to keep humans-first creation order so the human opens.
        if (config.humanStartsFirst !== true) {
            for (let i = this.players.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                [this.players[i], this.players[j]] = [this.players[j], this.players[i]];
            }
        }

        if (config.startingPlayerId !== undefined && config.startingPlayerId !== null) {
            const found = this.players.findIndex(p => p.id === config.startingPlayerId);
            this.currentPlayerIndex = found >= 0 ? found : 0;
        } else {
            this.currentPlayerIndex = 0;
        }

        // Generate map with the specified style
        if (config.predefinedMap) {
            this.map.generateMap(config.mapWidth, config.mapHeight, this.players, this.maxDice, 'preset', config.predefinedMap.tiles, rng);
        } else {
            this.map.generateMap(config.mapWidth, config.mapHeight, this.players, this.maxDice, config.mapStyle || 'random', null, rng);
        }

        // Apply Game Modes
        if (this.gameMode === 'fair') {
            this.applyFairStartMode(rng);
        } else if (this.gameMode === 'madness') {
            this.applyMadnessMode();
        } else if (this.gameMode === '2of2') {
            this.apply2of2Mode();
        }

        this.emit('gameStart', { players: this.players, map: this.map });
        this.startTurn();
    }

    applyFairStartMode(rng) {
        const rnd = rng || Math.random;
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
            // Optimization: Filter once and maintain list
            const reducibleTiles = s.tiles.filter(t => t.dice > 1);

            while (excess > 0 && reducibleTiles.length > 0) {
                const randomIndex = Math.floor(rnd() * reducibleTiles.length);
                const tile = reducibleTiles[randomIndex];

                tile.dice--;
                excess--;

                // If tile drops to 1 die, it's no longer reducible
                if (tile.dice <= 1) {
                    reducibleTiles[randomIndex] = reducibleTiles[reducibleTiles.length - 1];
                    reducibleTiles.pop();
                }
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
        if (isBot) {
            return GAME.BOT_COLORS[index % GAME.BOT_COLORS.length];
        }
        return GAME.HUMAN_COLORS[index % GAME.HUMAN_COLORS.length];
    }

    get currentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    attack(fromX, fromY, toX, toY, attackingPlayerId = null) {
        if (this.gameOver || this.players.length === 0) return;

        try {
            // attackingPlayerId is provided in parallel modes where the attacker
            // may differ from currentPlayer.
            const activePid = attackingPlayerId ?? this.currentPlayer.id;
            const result = this.combat.resolveAttack({
                map: this.map,
                currentPlayerId: activePid,
                diceSides: this.diceSides
            }, fromX, fromY, toX, toY);

            if (!result.error && this.attacksPerTurn > 0 && activePid === this.currentPlayer.id) {
                this.attacksUsedThisTurn++;
            }

            this.checkWinCondition();
            this.emit('attackResult', result);
            if (result.won) {
                // this.checkRowColumnCompletion(result.to.x, result.to.y, result.attackerId);
            }

            if (!this.gameOver) {
                this.tryFullBoardRule(true);
            }

            return result;
        } catch (e) {
            console.warn("Attack failed:", e.message);
            return { error: e.message };
        }
    }

    endTurn() {
        if (this.gameOver || this.players.length === 0) return;

        // 1. Reinforce current player
        const reinforceResult = this.reinforcement.distributeReinforcements({
            map: this.map,
            player: this.currentPlayer,
            maxDice: this.maxDice
        }, this.currentPlayer.id);
        const reinforceData = { player: this.currentPlayer, ...reinforceResult };
        this.emit('reinforcements', reinforceData);

        // 2. Switch player — deferred if an animation hook is registered
        const continueEndTurn = () => {
            let loops = 0;
            do {
                this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
                loops++;
                if (loops > this.players.length) {
                    this.gameOver = true;
                    break;
                }
            } while (!this.players[this.currentPlayerIndex].alive);

            this.turn++;

            if (this.turn > GAME.MAX_TURNS) {
                this.determineTurnLimitWinner();
                return;
            }

            if (!this.gameOver) {
                this.tryFullBoardRule();
            }

            this.startTurn();
        };

        if (this.reinforcementAnimationHook) {
            this.reinforcementAnimationHook(reinforceData, continueEndTurn);
        } else {
            continueEndTurn();
        }
    }

    startTurn() {
        if (this.gameOver) return;
        this.attacksUsedThisTurn = 0;
        this.emit('turnStart', { player: this.currentPlayer });

        // If bot, trigger AI (handled by main loop or AI controller listening to events)
    }

    attacksRemaining() {
        if (!this.attacksPerTurn || this.attacksPerTurn <= 0) return Infinity;
        return Math.max(0, this.attacksPerTurn - this.attacksUsedThisTurn);
    }

    _allPlayableTilesAtMaxDice() {
        for (const tile of this.map.tiles) {
            if (tile.blocked) continue;
            if (tile.dice < this.maxDice) return false;
        }
        return true;
    }

    /** Unique tile.owner values on non-blocked cells (ignores null/undefined). */
    _distinctPlayableOwners() {
        const ids = new Set();
        for (const tile of this.map.tiles) {
            if (tile.blocked) continue;
            const o = tile.owner;
            if (o === undefined || o === null) continue;
            ids.add(o);
        }
        return ids;
    }

    tryFullBoardRule(fromAttack = false) {
        if (this.gameOver || !this.fullBoardRule || this.fullBoardRule === 'nothing') return;
        if (!this._allPlayableTilesAtMaxDice()) return;

        const ownerIds = this._distinctPlayableOwners();
        if (ownerIds.size === 1) {
            const onlyId = ownerIds.values().next().value;
            const winner = this.players.find((p) => p.id === onlyId);
            if (winner) {
                this.gameOver = true;
                this.winner = winner;
                this.fullBoardResolution = false;
                this.emit('gameOver', { winner: this.winner });
            }
            return;
        }

        const rule = this.fullBoardRule;

        if (rule === 'raise_max_dice') {
            if (this.maxDice >= GAME.MAX_DICE_PER_TERRITORY) {
                this.resolveFullBoardWinner('most_territories');
                return;
            }
            this.maxDice = Math.min(this.maxDice + 2, GAME.MAX_DICE_PER_TERRITORY);
            this.map.maxDice = this.maxDice;
            this.emit('maxDiceRaised', { maxDice: this.maxDice });
            return;
        }

        if (this._fullBoardRuleFired) return;
        this._fullBoardRuleFired = true;

        if (rule === 'most_territories' || rule === 'biggest_territory') {
            this.resolveFullBoardWinner(rule);
            return;
        }
        if (rule === 'random_picker') {
            this.emit('fullBoardRandomPick', { fromAttack });
            return;
        }
        if (rule === 'autoplay_humans') {
            this.emit('fullBoardRule', { rule, fromAttack });
            return;
        }

        this._fullBoardRuleFired = false;
    }

    resolveFullBoardWinner(rule) {
        let best = null;

        if (rule === 'most_territories') {
            let bestN = -1;
            let bestDice = -1;
            for (const p of this.players) {
                if (!p.alive) continue;
                const tiles = this.map.getTilesByOwner(p.id);
                const n = tiles.length;
                const td = tiles.reduce((s, t) => s + t.dice, 0) + (p.storedDice || 0);
                if (n > bestN || (n === bestN && td > bestDice)) {
                    bestN = n;
                    bestDice = td;
                    best = p;
                }
            }
        } else if (rule === 'biggest_territory') {
            let bestR = -1;
            let bestDice = -1;
            for (const p of this.players) {
                if (!p.alive) continue;
                const r = this.map.findLargestConnectedRegion(p.id);
                const tiles = this.map.getTilesByOwner(p.id);
                const td = tiles.reduce((s, t) => s + t.dice, 0) + (p.storedDice || 0);
                if (r > bestR || (r === bestR && td > bestDice)) {
                    bestR = r;
                    bestDice = td;
                    best = p;
                }
            }
        }

        if (!best) {
            const alive = this.players.filter(p => p.alive);
            best = alive[0] || this.players[0] || null;
        }

        this._pendingFullBoardWinner = best;
        if (this.muted) {
            this.confirmFullBoardResolution();
            return;
        }
        this.emit('fullBoardWinnerPending', { rule, winnerId: best != null ? best.id : null });
    }

    /** Call after UI reveal for most_territories / biggest_territory full-board end. */
    confirmFullBoardResolution() {
        const best = this._pendingFullBoardWinner;
        this._pendingFullBoardWinner = null;
        if (this.gameOver) return;

        this.gameOver = true;
        this.winner = best;
        this.fullBoardResolution = true;
        this.emit('gameOver', { winner: this.winner, fullBoardResolution: true });
    }

    declareWinnerFromRandomFullBoardTile(x, y) {
        const t = this.map.getTile(x, y);
        const ownerId = t != null ? t.owner : -1;
        this.winner = this.players.find(p => p.alive && p.id === ownerId) || null;
        if (!this.winner) {
            const alive = this.players.filter(p => p.alive);
            this.winner = alive[Math.floor(Math.random() * alive.length)] || null;
        }
        this.gameOver = true;
        this.fullBoardResolution = true;
        this.emit('gameOver', { winner: this.winner, fullBoardResolution: true });
    }

    checkWinCondition() {
        // Check if any player has 0 tiles
        const activePlayers = new Set();
        for (const tile of this.map.tiles) {
            // Skip blocked tiles - they have no owner
            if (tile.blocked) continue;
            const o = tile.owner;
            if (o === undefined || o === null) continue;
            activePlayers.add(o);
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



    /**
     * End the game due to turn limit. Winner is the player with the most total dice.
     */
    determineTurnLimitWinner() {
        this.turnLimitReached = true;
        this.fullBoardResolution = false;
        this.gameOver = true;

        // Calculate total dice for each alive player (territory dice + stored/reserve dice)
        let bestPlayer = null;
        let bestDice = -1;

        for (const player of this.players) {
            if (!player.alive) continue;

            const ownedTiles = this.map.getTilesByOwner(player.id);
            const territoryDice = ownedTiles.reduce((sum, t) => sum + t.dice, 0);
            const totalDice = territoryDice + (player.storedDice || 0);

            if (totalDice > bestDice) {
                bestDice = totalDice;
                bestPlayer = player;
            }
        }

        this.winner = bestPlayer;
        this.emit('gameOver', { winner: this.winner, turnLimitReached: true });
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
