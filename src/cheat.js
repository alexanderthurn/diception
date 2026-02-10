/**
 * Cheat code - localhost only.
 * Press C three times quickly to instantly set up a near-win state.
 */

const TRIPLE_PRESS_MS = 500;

export function initCheatCode(game, renderer) {
    if (window.location.hostname !== 'localhost') return;

    let pressTimes = [];

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'c' && e.key !== 'C') return;
        if (e.repeat) return;

        const now = Date.now();
        pressTimes.push(now);
        if (pressTimes.length > 3) pressTimes.shift();

        if (pressTimes.length === 3 && pressTimes[2] - pressTimes[0] <= TRIPLE_PRESS_MS) {
            pressTimes = [];
            triggerInstantWin(game, renderer);
        } else if (pressTimes.length === 3) {
            pressTimes = [pressTimes[1], pressTimes[2]];
        }
    });
}

function triggerInstantWin(game, renderer) {
    if (!game || game.gameOver || !game.players?.length) return;

    const human = game.players.find(p => !p.isBot);
    if (!human) return;

    const enemy = game.players.find(p => p.id !== human.id && p.alive);
    if (!enemy) return;

    const playableIndices = [];
    game.map.tiles.forEach((tile, idx) => {
        if (!tile.blocked) playableIndices.push(idx);
    });

    if (playableIndices.length < 2) return;

    // Pick enemy tile: one that has an adjacent playable tile (so human can attack)
    const w = game.map.width;
    const playableSet = new Set(playableIndices);
    const hasAdjacent = (idx) => {
        const x = idx % w, y = Math.floor(idx / w);
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            const ni = (y + dy) * w + (x + dx);
            if (playableSet.has(ni)) return true;
        }
        return false;
    };
    const singleEnemyIdx = playableIndices.find(hasAdjacent) ?? playableIndices[0];
    for (const idx of playableIndices) {
        const tile = game.map.tiles[idx];
        if (idx === singleEnemyIdx) {
            tile.owner = enemy.id;
            tile.dice = 1;
        } else {
            tile.owner = human.id;
            tile.dice = game.maxDice;
        }
    }

    // Ensure it's human's turn
    game.currentPlayerIndex = game.players.findIndex(p => p.id === human.id);

    // Force update - emit turn start so UI/AI knows
    game.emit('turnStart', { player: game.currentPlayer });

    // Ensure eliminated players are marked
    game.players.forEach(p => {
        if (p.id !== human.id && p.id !== enemy.id) {
            p.alive = false;
        }
    });

    if (renderer) {
        renderer.forceUpdate?.();
        renderer.draw?.();
    }
}
