/**
 * Cheat codes - localhost only.
 * Press C three times quickly: near-win state (human dominates).
 * Press V three times quickly: near-lose state (bot dominates).
 *
 * Additional contexts can register via registerCheatContext() to hook
 * ccc/vvv while a specific UI (campaign browser, achievements panel) is active.
 */

const TRIPLE_PRESS_MS = 500;

// { isActive(): bool, onCCC(): void, onVVV(): void }
const _cheatContexts = [];

/** Register an additional cheat context. isActive() gates when it fires. */
export function registerCheatContext(ctx) {
    _cheatContexts.push(ctx);
}

export function initCheatCode(game, renderer) {
    if (window.location.hostname !== 'localhost') return;

    let pressTimesC = [];
    let pressTimesV = [];
    let pressTimesX = [];
    let pressTimesY = [];

    document.addEventListener('keydown', (e) => {
        if (e.key === 'c' || e.key === 'C') {
            if (e.repeat) return;
            const now = Date.now();
            pressTimesC.push(now);
            if (pressTimesC.length > 3) pressTimesC.shift();
            if (pressTimesC.length === 3 && pressTimesC[2] - pressTimesC[0] <= TRIPLE_PRESS_MS) {
                pressTimesC = [];
                // Try registered contexts first
                const ctx = _cheatContexts.find(c => c.isActive());
                if (ctx) { ctx.onCCC(); return; }
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
                const ctx = _cheatContexts.find(c => c.isActive());
                if (ctx) { ctx.onVVV(); return; }
                triggerInstantLose(game, renderer);
            } else if (pressTimesV.length === 3) {
                pressTimesV = [pressTimesV[1], pressTimesV[2]];
            }
        }
        if (e.key === 'x' || e.key === 'X') {
            if (e.repeat) return;
            const now = Date.now();
            pressTimesX.push(now);
            if (pressTimesX.length > 3) pressTimesX.shift();
            if (pressTimesX.length === 3 && pressTimesX[2] - pressTimesX[0] <= TRIPLE_PRESS_MS) {
                pressTimesX = [];
                setHoveredTileDice(game, renderer, 1);
            } else if (pressTimesX.length === 3) {
                pressTimesX = [pressTimesX[1], pressTimesX[2]];
            }
        }
        if (e.key === 'y' || e.key === 'Y') {
            if (e.repeat) return;
            const now = Date.now();
            pressTimesY.push(now);
            if (pressTimesY.length > 3) pressTimesY.shift();
            if (pressTimesY.length === 3 && pressTimesY[2] - pressTimesY[0] <= TRIPLE_PRESS_MS) {
                pressTimesY = [];
                setHoveredTileDice(game, renderer, game.maxDice);
            } else if (pressTimesY.length === 3) {
                pressTimesY = [pressTimesY[1], pressTimesY[2]];
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

function setHoveredTileDice(game, renderer, diceCount) {
    if (!game || game.gameOver || !game.players?.length) return;
    const hover = renderer?.grid?.hoverTiles?.get('mouse');
    if (!hover) return;
    const tile = game.map.getTile(hover.x, hover.y);
    if (!tile || tile.blocked) return;
    tile.dice = diceCount;
    console.log(`🎮 CHEAT: tile (${hover.x},${hover.y}) dice → ${diceCount}`);
    renderer.forceUpdate?.();
    renderer.draw?.();
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
