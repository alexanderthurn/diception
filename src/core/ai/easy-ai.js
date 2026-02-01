/**
 * EasyAI - Simple AI that attacks the weakest neighbors
 * 
 * Strategy:
 * - Targets territories with the smallest number of dice
 * - Only attacks if own dice > defender dice (fallback to >= if no moves)
 * - Prefers non-human targets when dice counts are equal
 */
import { BaseAI } from './base-ai.js';

export class EasyAI extends BaseAI {
    constructor(game, playerId) {
        super(game, playerId);
        this.name = 'Easy';
    }

    async takeTurn(gameSpeed = 'normal') {
        let safety = 0;
        const delay = this.getAttackDelay(gameSpeed);

        while (safety < 500) {
            safety++;

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
                            isHuman: isHuman
                        });
                    }
                }
            }

            if (attackOptions.length === 0) break;

            // Sort by smallest dice first
            attackOptions.sort((a, b) => {
                if (a.defenderDice !== b.defenderDice) {
                    return a.defenderDice - b.defenderDice;
                }
                // If same dice, prefer non-human targets
                if (a.isHuman !== b.isHuman) {
                    return a.isHuman ? 1 : -1;
                }
                return 0;
            });

            // Try to find an attack with own dice > defender dice
            let selectedMove = null;
            for (const option of attackOptions) {
                if (option.from.dice > option.defenderDice) {
                    selectedMove = option;
                    break;
                }
            }

            // If no attack found with >, use >= rule
            if (!selectedMove) {
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
                if (delay > 0) {
                    await new Promise(r => setTimeout(r, delay));
                }
            } else {
                break;
            }
        }
    }
}
