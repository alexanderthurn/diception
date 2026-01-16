export class AIController {
    constructor(difficulty = 'balanced') {
        this.difficulty = difficulty;
    }

    takeTurn(game) {
        return new Promise((resolve) => {
            this.performMoves(game);
            game.endTurn();
            resolve();
        });
    }

    performMoves(game) {
        let hasAttacked = true;
        let moves = 0;
        const MAX_MOVES = 100;

        while (hasAttacked && moves < MAX_MOVES) {
            hasAttacked = false;

            const move = this.findBestMove(game);

            if (move) {
                const result = game.attack(move.from.x, move.from.y, move.to.x, move.to.y);
                if (result && !result.error) {
                    hasAttacked = true;
                }
                moves++;
            }
        }
    }

    findBestMove(game) {
        const myId = game.currentPlayer.id;
        let bestMove = null;
        let highestScore = -Infinity;

        // Iterate by coordinates (safe approach)
        for (let y = 0; y < game.map.height; y++) {
            for (let x = 0; x < game.map.width; x++) {
                const tile = game.map.getTile(x, y);

                // Skip blocked tiles (getTile returns null for blocked)
                if (!tile) continue;
                if (tile.owner !== myId || tile.dice <= 1) continue;

                const neighbors = game.map.getAdjacentTiles(x, y);

                for (const target of neighbors) {
                    if (target.owner === myId) continue;

                    const score = this.evaluateMove(tile, target, game.maxDice);

                    if (score > highestScore) {
                        highestScore = score;
                        bestMove = { from: { x, y }, to: { x: target.x, y: target.y } };
                    }
                }
            }
        }
        return highestScore > 0 ? bestMove : null;
    }

    evaluateMove(attacker, defender, maxDice) {
        const diff = attacker.dice - defender.dice;

        // Always attack if tile is full
        if (attacker.dice === maxDice) return 100 + diff;

        // Aggressive: attack with any advantage
        if (this.difficulty === 'aggressive') {
            return diff > -2 ? diff + 10 : -1;
        }

        // Balanced: attack if clear advantage or equal
        if (diff > 0) return diff + 5;
        if (diff === 0) return 1;

        return -1;
    }
}
