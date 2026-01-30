/**
 * HardAI - Tactical AI that targets strong neighbors it can defeat
 * 
 * Strategy:
 * - 80% aggression quota
 * - Only attacks when having advantage (more dice) or equal dice
 * - Prioritizes:
 *   - First: tiles where we have more dice (priority 2)
 *   - Second: tiles with equal dice (priority 1)
 * - Within same priority, targets stronger enemies to weaken them
 */
import { BaseAI } from './base-ai.js';

export class HardAI extends BaseAI {
    constructor(game, playerId) {
        super(game, playerId);
        this.name = 'Hard';
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
                        let priority = 0;
                        if (target.dice < tile.dice) priority = 2; // Better odds
                        else if (target.dice === tile.dice) priority = 1; // Equal odds

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
