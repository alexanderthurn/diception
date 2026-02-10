/**
 * GameStatsTracker - Tracks per-game statistics during gameplay
 * Used to display interesting stats on the game over screen
 */
export class GameStatsTracker {
    constructor(game) {
        this.game = game;
        this.reset();
        this.setupListeners();
    }

    reset() {
        // Per-player stats
        this.playerStats = new Map();

        // Game-wide stats
        this.totalAttacks = 0;
        this.totalTerritoryChanges = 0;
        this.eliminationOrder = []; // { playerId, turn, eliminatedBy }
        this.startTurn = 1;
    }

    setupListeners() {
        this.game.on('gameStart', () => this.onGameStart());
        this.game.on('attackResult', (result) => this.onAttackResult(result));
        this.game.on('playerEliminated', (player) => this.onPlayerEliminated(player));
        this.game.on('reinforcements', (data) => this.onReinforcements(data));
    }

    onGameStart() {
        this.reset();
        this.startTurn = this.game.turn;

        // Initialize stats for each player
        this.game.players.forEach(player => {
            this.playerStats.set(player.id, {
                attacks: 0,
                attackWins: 0,
                attackLosses: 0,
                territoriesConquered: 0,
                territoriesLost: 0,
                totalRolled: 0,      // Sum of all dice rolled
                expectedRoll: 0,     // Expected sum based on dice count
                rollCount: 0,        // Number of roll events
                diceProduced: 0,
                diceLost: 0,
                isBot: player.isBot,
                name: player.name || (player.isBot ? `Bot ${player.id}` : `Player ${player.id}`)
            });
        });
    }

    onAttackResult(result) {
        if (result.error) return;

        this.totalAttacks++;

        const attackerStats = this.playerStats.get(result.attackerId);
        const defenderStats = this.playerStats.get(result.defenderId);

        if (!attackerStats || !defenderStats) return;

        // Track attacker stats
        attackerStats.attacks++;
        if (result.won) {
            attackerStats.attackWins++;
            attackerStats.territoriesConquered++;
            this.totalTerritoryChanges++;
        } else {
            attackerStats.attackLosses++;
            // Attacker lost all but 1 die
            attackerStats.diceLost += (result.attackerRolls.length - 1);
        }

        // Track defender stats
        if (result.won) {
            defenderStats.territoriesLost++;
            // Defender lost all dice on the captured tile
            defenderStats.diceLost += result.defenderRolls.length;
        }

        // Track luck (actual roll vs expected)
        const diceSides = this.game.diceSides || 6;
        const expectedPerDie = (diceSides + 1) / 2; // Average roll

        // Attacker luck
        attackerStats.totalRolled += result.attackerSum;
        attackerStats.expectedRoll += result.attackerRolls.length * expectedPerDie;
        attackerStats.rollCount++;

        // Defender luck
        defenderStats.totalRolled += result.defenderSum;
        defenderStats.expectedRoll += result.defenderRolls.length * expectedPerDie;
        defenderStats.rollCount++;
    }

    onPlayerEliminated(player) {
        this.eliminationOrder.push({
            playerId: player.id,
            turn: this.game.turn,
            name: player.name || (player.isBot ? `Bot ${player.id}` : `Player ${player.id}`),
            winner: false
        });
    }

    onReinforcements(data) {
        const stats = this.playerStats.get(data.player.id);
        if (stats) {
            stats.diceProduced += data.earned;
        }
    }

    /**
     * Calculate luck score for a player
     * Positive = lucky (rolled higher than expected)
     * Negative = unlucky (rolled lower than expected)
     */
    getLuckScore(playerId) {
        const stats = this.playerStats.get(playerId);
        if (!stats || stats.rollCount === 0) return 0;

        return stats.totalRolled - stats.expectedRoll;
    }

    /**
     * Get the luckiest player
     */
    getLuckiestPlayer() {
        let luckiest = null;
        let maxLuck = -Infinity;

        this.playerStats.forEach((stats, playerId) => {
            const luck = this.getLuckScore(playerId);
            if (luck > maxLuck) {
                maxLuck = luck;
                luckiest = { playerId, luck, name: stats.name };
            }
        });

        return luckiest;
    }

    /**
     * Get the unluckiest player
     */
    getUnluckiestPlayer() {
        let unluckiest = null;
        let minLuck = Infinity;

        this.playerStats.forEach((stats, playerId) => {
            const luck = this.getLuckScore(playerId);
            if (luck < minLuck) {
                minLuck = luck;
                unluckiest = { playerId, luck, name: stats.name };
            }
        });

        return unluckiest;
    }

    /**
     * Get comprehensive game stats for display
     */
    getGameStats() {
        const gameDuration = this.game.turn - this.startTurn + 1;

        // Find MVP (most territories conquered)
        let mvp = null;
        let maxConquered = 0;
        this.playerStats.forEach((stats, playerId) => {
            if (stats.territoriesConquered > maxConquered) {
                maxConquered = stats.territoriesConquered;
                mvp = { playerId, conquered: maxConquered, name: stats.name };
            }
        });

        return {
            gameDuration,
            totalAttacks: this.totalAttacks,
            totalTerritoryChanges: this.totalTerritoryChanges,
            eliminationOrder: this.eliminationOrder,
            playerStats: Object.fromEntries(this.playerStats),
            luckiest: this.getLuckiestPlayer(),
            unluckiest: this.getUnluckiestPlayer(),
            mvp
        };
    }

    /**
     * Check if any human players participated
     */
    hasHumanPlayer() {
        for (const [, stats] of this.playerStats) {
            if (!stats.isBot) return true;
        }
        return false;
    }
}
