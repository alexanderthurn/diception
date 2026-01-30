/**
 * MediumAI - Strategic AI that optimizes attacks for efficiency
 * 
 * Strategy:
 * - 80% aggression quota
 * - Prioritizes optimal dice margins:
 *   - For small stacks (<4 dice): prefers diff=1, then diff=2
 *   - For larger stacks: prefers diff=2 (stable margin), then diff=1
 * - Within same priority, targets stronger enemies
 */
import { BaseAI } from './base-ai.js';

export class MediumAI extends BaseAI {
    constructor(game, playerId) {
        super(game, playerId);
        this.name = 'Medium';
    }

    async takeTurn(gameSpeed = 'normal') {
        const allMyTiles = this.getMyTiles();
        const minAttacks = Math.ceil(allMyTiles.length * 0.8);
        let attacksDone = 0;
        let safety = 0;
        const delay = this.getAttackDelay(gameSpeed);

        while (safety < 500) {
            safety++;
            const attackers = this.getMyTiles().filter(t => t.dice > 1);
            const moves = [];

            for (const tile of attackers) {
                const neighbors = this.getAdjacentTiles(tile.x, tile.y);
                for (const target of neighbors) {
                    if (target.owner !== this.playerId) {
                        const diff = tile.dice - target.dice;
                        let priority = 0;

                        if (tile.dice < 4) {
                            if (diff === 1) priority = 5;      // High aggression for small stacks
                            else if (diff === 2) priority = 4;
                            else if (diff > 2) priority = 2;
                            else if (diff === 0) priority = 1;
                        } else {
                            if (diff === 2) priority = 4;      // Optimal stable margin
                            else if (diff === 1) priority = 3; // Efficient but riskier
                            else if (diff > 2) priority = 2;   // Overkill
                            else if (diff === 0) priority = 1; // Last resort flip
                        }

                        if (priority > 0) {
                            // Score by strongest neighbor within priority
                            const score = (priority * 100) + target.dice;
                            moves.push({ from: tile, to: target, score });
                        }
                    }
                }
            }

            if (moves.length === 0) break;
            moves.sort((a, b) => b.score - a.score);

            const move = moves[0];
            const res = this.attack(move.from.x, move.from.y, move.to.x, move.to.y);
            if (res.success) {
                attacksDone++;
                if (delay > 0) {
                    await new Promise(r => setTimeout(r, delay));
                }
            } else {
                break;
            }

            if (attacksDone >= minAttacks) break;
        }
    }
}
