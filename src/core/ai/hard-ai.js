/**
 * HardAI - Strategic AI with intelligent target selection
 * 
 * Strategy:
 * - Priority 1: Dice advantage >= 2
 * - Priority 2: Dice advantage == 1
 * - Priority 3: Same dice only if no attacks made yet
 * 
 * Within each priority, scores attacks by:
 * - Targets stronger players (more territories)
 * - Attacks from weaker positions (preserves strong stacks)
 * - Breaks connected enemy regions (reduces their bonus dice)
 * - Values consolidation (connects own territories)
 * - Prefers high-value targets (more dice)
 */
import { BaseAI } from './base-ai.js';

export class HardAI extends BaseAI {
    constructor(game, playerId) {
        super(game, playerId);
        this.name = 'Hard';
    }

    /**
     * Count territories owned by each player
     */
    countTerritories() {
        const counts = {};
        for (const tile of this.game.map.tiles) {
            if (tile.owner !== null && !tile.blocked) {
                counts[tile.owner] = (counts[tile.owner] || 0) + 1;
            }
        }
        return counts;
    }

    /**
     * Count how many same-owner neighbors a target has
     */
    countEnemyNeighbors(target) {
        const neighbors = this.getAdjacentTiles(target.x, target.y);
        return neighbors.filter(n => n.owner === target.owner).length;
    }

    /**
     * Check if attacking would connect our territories
     */
    wouldConnectOwnTerritory(fromX, fromY, toX, toY) {
        const targetNeighbors = this.getAdjacentTiles(toX, toY);
        // Count how many of target's neighbors we own (excluding the attacker)
        let ownNeighbors = 0;
        for (const n of targetNeighbors) {
            if (n.owner === this.playerId) {
                if (n.x !== fromX || n.y !== fromY) {
                    ownNeighbors++;
                }
            }
        }
        return ownNeighbors > 0;
    }

    async takeTurn(gameSpeed = 'normal') {
        let safety = 0;
        let hasAttacked = false;
        const delay = this.getAttackDelay(gameSpeed);

        while (safety < 500) {
            safety++;

            // Get territory counts for strategic targeting
            const territoryCounts = this.countTerritories();

            // Get all attackable territories
            const attackers = this.getMyTiles().filter(t => t.dice > 1);
            const attackOptions = [];

            for (const tile of attackers) {
                const neighbors = this.getAdjacentTiles(tile.x, tile.y);
                for (const target of neighbors) {
                    if (target.owner !== this.playerId) {
                        const diceDiff = tile.dice - target.dice;
                        const opponentTerritories = territoryCounts[target.owner] || 0;
                        const targetEnemyNeighbors = this.countEnemyNeighbors(target);
                        const wouldConnect = this.wouldConnectOwnTerritory(tile.x, tile.y, target.x, target.y);

                        attackOptions.push({
                            from: tile,
                            to: target,
                            diceDiff: diceDiff,
                            attackerDice: tile.dice,
                            targetDice: target.dice,
                            opponentTerritories: opponentTerritories,
                            targetEnemyNeighbors: targetEnemyNeighbors,
                            wouldConnect: wouldConnect
                        });
                    }
                }
            }

            if (attackOptions.length === 0) break;

            // Find best attack with strategic scoring
            let selectedMove = null;
            let bestScore = -Infinity;

            for (const option of attackOptions) {
                let priority = 0;

                // Determine priority tier
                if (option.diceDiff >= 2) {
                    priority = 3; // Highest priority
                } else if (option.diceDiff === 1) {
                    priority = 2; // Medium priority
                } else if (option.diceDiff >= 0 && !hasAttacked) {
                    priority = 1; // Lowest priority, only if no attacks yet
                } else {
                    continue; // Skip this option
                }

                // Calculate strategic score within priority
                // Increased multiplier to ensure strict adherence to priority tiers
                const score = (priority * 10000)
                    - (option.attackerDice * 50)              // preserve strong stacks
                    + (option.opponentTerritories * 20)       // focus on strongest player
                    + (option.targetEnemyNeighbors * 30)      // break connected regions
                    + (option.wouldConnect ? 40 : 0)          // value consolidation
                    + (option.targetDice * 5);                // prefer high value targets

                if (score > bestScore) {
                    bestScore = score;
                    selectedMove = option;
                }
            }

            // If no valid move, stop
            if (!selectedMove) break;

            const res = this.attack(
                selectedMove.from.x,
                selectedMove.from.y,
                selectedMove.to.x,
                selectedMove.to.y
            );

            if (res.success) {
                hasAttacked = true;
                if (delay > 0) {
                    await new Promise(r => setTimeout(r, delay));
                }
            } else {
                break;
            }
        }
    }
}
