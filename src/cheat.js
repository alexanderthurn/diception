/**
 * Cheat codes - localhost only.
 * Press C three times quickly: near-win state (human dominates).
 * Press V three times quickly: near-lose state (bot dominates).
 */

const TRIPLE_PRESS_MS = 500;

export function initCheatCode(game, renderer) {
    if (window.location.hostname !== 'localhost') return;

    let pressTimesC = [];
    let pressTimesV = [];

    document.addEventListener('keydown', (e) => {
        if (e.key === 'c' || e.key === 'C') {
            if (e.repeat) return;
            const now = Date.now();
            pressTimesC.push(now);
            if (pressTimesC.length > 3) pressTimesC.shift();
            if (pressTimesC.length === 3 && pressTimesC[2] - pressTimesC[0] <= TRIPLE_PRESS_MS) {
                pressTimesC = [];
                triggerInstantWin(game, renderer);
            } else if (pressTimesC.length === 3) {
                pressTimesC = [pressTimesC[1], pressTimesC[2]];
            }
            return;
        }
        if (e.key === 'v' || e.key === 'V') {
            if (e.repeat) return;
            const now = Date.now();
            pressTimesV.push(now);
            if (pressTimesV.length > 3) pressTimesV.shift();
            if (pressTimesV.length === 3 && pressTimesV[2] - pressTimesV[0] <= TRIPLE_PRESS_MS) {
                pressTimesV = [];
                triggerInstantLose(game, renderer);
            } else if (pressTimesV.length === 3) {
                pressTimesV = [pressTimesV[1], pressTimesV[2]];
            }
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

function triggerInstantLose(game, renderer) {
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
    const singleHumanIdx = playableIndices.find(hasAdjacent) ?? playableIndices[0];
    for (const idx of playableIndices) {
        const tile = game.map.tiles[idx];
        if (idx === singleHumanIdx) {
            tile.owner = human.id;
            tile.dice = 1;
        } else {
            tile.owner = enemy.id;
            tile.dice = game.maxDice;
        }
    }

    game.currentPlayerIndex = game.players.findIndex(p => p.id === enemy.id);

    game.emit('turnStart', { player: game.currentPlayer });

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
