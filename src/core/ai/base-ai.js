/**
 * BaseAI - Base class for all AI implementations
 * Provides shared utility methods for accessing game state and performing actions.
 */
export class BaseAI {
    constructor(game, playerId) {
        this.game = game;
        this.playerId = playerId;
        this.name = 'AI'; // Override in subclasses
    }

    /**
     * Get all tiles owned by this AI
     */
    getMyTiles() {
        const tiles = [];
        const width = this.game.map.width;
        for (let i = 0; i < this.game.map.tiles.length; i++) {
            const tile = this.game.map.tiles[i];
            if (tile.owner === this.playerId && !tile.blocked) {
                tiles.push({
                    x: i % width,
                    y: Math.floor(i / width),
                    dice: tile.dice,
                    owner: tile.owner
                });
            }
        }
        return tiles;
    }

    /**
     * Get adjacent tiles to a position
     */
    getAdjacentTiles(x, y) {
        return this.game.map.getAdjacentTiles(x, y);
    }

    /**
     * Perform an attack
     * @returns {{ success: boolean, won?: boolean }}
     */
    attack(fromX, fromY, toX, toY) {
        try {
            const result = this.game.attack(fromX, fromY, toX, toY);
            if (result && !result.error) {
                return { success: true, won: result.won };
            }
            return { success: false };
        } catch (e) {
            return { success: false };
        }
    }

    /**
     * Get delay between attacks based on game speed
     */
    getAttackDelay(gameSpeed) {
        if (gameSpeed === 'ultrafast') return 0; // Ultra-fast mode when all humans on autoplay
        if (gameSpeed === 'beginner') return 1200;
        if (gameSpeed === 'normal') return 200;
        return 0; // expert/fast
    }

    /**
     * Choose the single best attack, used by parallel-mode background timers.
     * Prefers highest dice advantage. Returns null if no valid attack.
     * @param {*|null} excludeTargetOwnerId - skip tiles owned by this player (Parallel-S)
     */
    chooseBestAttack(excludeTargetOwnerId = null) {
        const attackers = this.getMyTiles().filter(t => t.dice > 1);
        let best = null;
        let bestScore = -Infinity;
        for (const tile of attackers) {
            for (const target of this.getAdjacentTiles(tile.x, tile.y)) {
                if (target.owner === this.playerId) continue;
                if (excludeTargetOwnerId !== null && target.owner === excludeTargetOwnerId) continue;
                const score = tile.dice - target.dice;
                if (score > 0 && score > bestScore) {
                    bestScore = score;
                    best = { from: tile, to: target };
                }
            }
        }
        return best;
    }

    /**
     * Execute the AI's turn - must be implemented by subclasses
     */
    async takeTurn(gameSpeed = 'normal') {
        throw new Error('takeTurn must be implemented by subclass');
    }
}
