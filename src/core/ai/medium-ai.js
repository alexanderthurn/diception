/**
 * MediumAI - Strategic AI that prioritizes dice advantage
 * 
 * Strategy:
 * - Priority 1: Attacks where own dice - defender dice >= 2 (strong advantage)
 * - Priority 2: Attacks where own dice - defender dice == 1 (moderate advantage)
 * - Priority 3: Attacks where own dice == defender dice (fallback, same dice)
 * - No human/bot preference
 */
import { BaseAI } from './base-ai.js';

export class MediumAI extends BaseAI {
    constructor(game, playerId) {
        super(game, playerId);
        this.name = 'Medium';
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
                        const diceDiff = tile.dice - target.dice;
                        attackOptions.push({
                            from: tile,
                            to: target,
                            diceDiff: diceDiff
                        });
                    }
                }
            }

            if (attackOptions.length === 0) break;

            // Try to find an attack with dice advantage >= 2 (highest priority)
            let selectedMove = null;
            for (const option of attackOptions) {
                if (option.diceDiff >= 2) {
                    selectedMove = option;
                    break;
                }
            }

            // If no -2+ advantage, try dice advantage == 1
            if (!selectedMove) {
                for (const option of attackOptions) {
                    if (option.diceDiff === 1) {
                        selectedMove = option;
                        break;
                    }
                }
            }

            // If no -1 advantage, use same dice (>= 0) as fallback
            if (!selectedMove) {
                for (const option of attackOptions) {
                    if (option.diceDiff >= 0) {
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
