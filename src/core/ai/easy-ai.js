/**
 * EasyAI - Simple AI that attacks the weakest neighbors
 * 
 * Strategy:
 * - Prefers bot targets over human targets
 * - Intentionally grows smaller islands instead of the largest connected region
 * - Targets territories with the smallest number of dice
 * - Only attacks if own dice > defender dice
 * - Fallback: Same dice attacks (>=) only allowed if no attacks made yet this turn
 */
import { BaseAI } from './base-ai.js';

export class EasyAI extends BaseAI {
    constructor(game, playerId) {
        super(game, playerId);
        this.name = 'Easy';
    }

    async takeTurn(gameSpeed = 'normal') {
        let safety = 0;
        let hasAttacked = false; // Track if any attack has been made
        let successfulAttacks = 0;
        const delay = this.getAttackDelay(gameSpeed);
        const rampageMode = this.shouldRampageThisTurn();
        const largestRegionTiles = this.game.map.findLargestConnectedRegionTiles(this.playerId);
        const largestRegionSet = new Set(largestRegionTiles.map(t => `${t.x},${t.y}`));

        while (safety < 500) {
            safety++;
            if (!this.hasAttackBudget()) break;

            // Get all attackable territories
            const attackers = this.getMyTiles().filter(t => t.dice > 1);
            const attackOptions = [];

            for (const tile of attackers) {
                const neighbors = this.getAdjacentTiles(tile.x, tile.y);
                for (const target of neighbors) {
                    if (target.owner !== this.playerId) {
                        const isHuman = this.game.players[target.owner]?.type === 'human';
                        attackOptions.push({
                            from: tile,
                            to: target,
                            defenderDice: target.dice,
                            isHuman: isHuman,
                            fromInLargestRegion: largestRegionSet.has(`${tile.x},${tile.y}`),
                        });
                    }
                }
            }

            if (attackOptions.length === 0) break;

            // Easy intentionally plays suboptimal macro: grow islands and avoid consolidating the biggest region.
            attackOptions.sort((a, b) => {
                // Prefer attacking bots over humans
                if (a.isHuman !== b.isHuman) {
                    return a.isHuman ? 1 : -1;
                }

                // Prefer attacks launched from smaller islands (outside largest connected region)
                if (a.fromInLargestRegion !== b.fromInLargestRegion) {
                    return a.fromInLargestRegion ? 1 : -1;
                }

                // Prefer not connecting back into the largest region
                const aTouchesLargest = this.getAdjacentTiles(a.to.x, a.to.y).some(n =>
                    largestRegionSet.has(`${n.x},${n.y}`) && (n.x !== a.from.x || n.y !== a.from.y)
                );
                const bTouchesLargest = this.getAdjacentTiles(b.to.x, b.to.y).some(n =>
                    largestRegionSet.has(`${n.x},${n.y}`) && (n.x !== b.from.x || n.y !== b.from.y)
                );
                if (aTouchesLargest !== bTouchesLargest) {
                    return aTouchesLargest ? 1 : -1;
                }

                if (a.defenderDice !== b.defenderDice) {
                    return a.defenderDice - b.defenderDice;
                }
                return 0;
            });

            // Rampage: attack continuously, even equal or stronger enemies.
            let selectedMove = null;
            if (rampageMode) {
                selectedMove = attackOptions[0] || null;
            }

            // Normal mode: try to find an attack with own dice > defender dice
            if (!selectedMove) {
                for (const option of attackOptions) {
                    if (option.from.dice > option.defenderDice) {
                        selectedMove = option;
                        break;
                    }
                }
            }

            // Normal mode fallback: if no attack found with > and no attacks made yet, allow same dice (>=)
            if (!selectedMove && !rampageMode && !hasAttacked) {
                for (const option of attackOptions) {
                    if (option.from.dice >= option.defenderDice) {
                        selectedMove = option;
                        break;
                    }
                }
            }

            // If still no valid move, stop
            if (!selectedMove) break;

            const res = this.attack(
                selectedMove.from.x,
                selectedMove.from.y,
                selectedMove.to.x,
                selectedMove.to.y
            );

            if (res.success) {
                hasAttacked = true; // Mark that we've attacked
                successfulAttacks++;
                // Easy sometimes stops pressing after already attacking at least twice.
                if (successfulAttacks >= 2 && Math.random() < 0.2) {
                    break;
                }
                if (delay > 0) {
                    await new Promise(r => setTimeout(r, delay));
                }
            } else {
                break;
            }
        }
    }
}
