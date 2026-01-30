import { Game } from './src/core/game.js';
import { createAI } from './src/core/ai/index.js';

const game = new Game();

// Setup event logging
game.on('gameStart', (data) => {
    console.log(`Game Started! Map Size: ${data.map.width}x${data.map.height}, Players: ${data.players.length}`);
    data.players.forEach(p => console.log(`Player ${p.id} (Color: ${p.color.toString(16)})`));
});

game.on('turnStart', (data) => {
    // console.log(`Turn ${game.turn} Start: Player ${data.player.id}`);
});

game.on('attackResult', (res) => {
    // console.log(`Attack: P${res.attacker} (${res.from.x},${res.from.y}) -> P${res.defender} (${res.to.x},${res.to.y}) [${res.attackerSum} vs ${res.defenderSum}] Result: ${res.won ? 'WIN' : 'LOSS'}`);
});

game.on('reinforcements', (data) => {
    // console.log(`Player ${data.player.id} gained ${data.amount} dice.`);
});

game.on('playerEliminated', (p) => {
    console.log(`💀 Player ${p.id} ELIMINATED at turn ${game.turn}`);
});

game.on('gameOver', (data) => {
    console.log(`🏆 GAME OVER! Winner: Player ${data.winner.id} at turn ${game.turn}`);
});

// Start Game
console.log("Initializing simulation...");
game.startGame({ humanCount: 0, botCount: 4, mapWidth: 10, mapHeight: 10 });

// Create AI instances for each player
const playerAIs = new Map();
game.players.forEach(p => {
    playerAIs.set(p.id, createAI('hard', game, p.id));
});

// Game Loop
async function run() {
    let turns = 0;
    while (!game.gameOver && turns < 1000) {
        const ai = playerAIs.get(game.currentPlayer.id);
        if (ai) {
            await ai.takeTurn('fast');
        }
        game.endTurn();
        turns++;
    }

    if (!game.winner) {
        console.log("Simulation stopped (limit reached).");
        game.players.forEach(p => {
            if (p.alive) {
                const tiles = game.map.getTilesByOwner(p.id);
                console.log(`Player ${p.id}: ${tiles.length} tiles`);
            }
        });
    }
}

run();
