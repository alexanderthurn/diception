/**
 * EasyAI - Simple AI that attacks the weakest neighbors
 * 
 * Strategy:
 * - 30% aggression quota (attacks ~30% of owned tiles per turn)
 * - Prioritizes attacking tiles with fewer dice (weakest first)
 */
import { BaseAI } from './base-ai.js';

export class EasyAI extends BaseAI {
    constructor(game, playerId) {
        super(game, playerId);
        this.name = 'Easy';
    }

    async takeTurn(gameSpeed = 'normal') {
        const allMyTiles = this.getMyTiles();
        const minAttacks = Math.ceil(allMyTiles.length * 0.3);
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
                        // Easy: Score by WEAKEST neighbor (least dice)
                        const score = -target.dice;
                        moves.push({ from: tile, to: target, score });
                    }
                }
            }

            if (moves.length === 0) break;
            moves.sort((a, b) => b.score - a.score);

            const move = moves[0];
            // Proceed if below quota
            if (attacksDone < minAttacks) {
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
            } else {
                break;
            }
        }
    }
}
