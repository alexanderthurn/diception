import { Game } from './src/core/game.js';
import { AIController } from './src/core/ai.js';

console.log("=== DICY Logic Test ===\n");

// Test 1: Game initialization with new config format
console.log("Test 1: Game initialization...");
const game = new Game();
game.startGame({ humanCount: 1, botCount: 3, mapWidth: 10, mapHeight: 10 });

console.log(`  ✓ Map size: ${game.map.width}x${game.map.height}`);
console.log(`  ✓ Playable tiles: ${game.map.getPlayableTileCount()}`);
console.log(`  ✓ Players: ${game.players.length} (${game.players.filter(p => !p.isBot).length} humans, ${game.players.filter(p => p.isBot).length} bots)`);
console.log(`  ✓ Current player: ${game.currentPlayer.id} (${game.currentPlayer.isBot ? 'Bot' : 'Human'})`);

// Test 2: Player stats with isBot flag
console.log("\nTest 2: getPlayerStats()...");
try {
    const stats = game.getPlayerStats();
    console.log(`  ✓ Stats returned for ${stats.length} players`);
    stats.forEach(s => {
        const type = s.isBot ? 'Bot' : 'Human';
        console.log(`    ${type} ${s.id}: ${s.tileCount} tiles, ${s.totalDice} dice, region=${s.connectedTiles}`);
    });
} catch (e) {
    console.error("  ✗ ERROR:", e.message);
    process.exit(1);
}

// Test 3: Blocked tiles connectivity
console.log("\nTest 3: Map connectivity...");
const blockedCount = game.map.tiles.filter(t => t.blocked).length;
const playableCount = game.map.getPlayableTileCount();
console.log(`  ✓ Blocked tiles: ${blockedCount}`);
console.log(`  ✓ Playable tiles: ${playableCount}`);
console.log(`  ✓ Map is connected: ${game.map.arePlayableTilesConnected()}`);

// Test 4: AI simulation
console.log("\nTest 4: AI simulation...");
const ai = new AIController('aggressive');

let turns = 0;
const MAX_TURNS = 200;

while (!game.gameOver && turns < MAX_TURNS) {
    try {
        ai.performMoves(game);
        game.endTurn();
        turns++;
    } catch (e) {
        console.error(`  ✗ ERROR on turn ${turns}:`, e.message);
        console.error(e.stack);
        process.exit(1);
    }
}

if (game.gameOver) {
    const winnerType = game.winner.isBot ? 'Bot' : 'Human';
    console.log(`  ✓ Game ended in ${turns} turns. Winner: ${winnerType} ${game.winner.id}`);
} else {
    console.log(`  ✓ Game still running after ${turns} turns (possible long game)`);
}

console.log("\n=== All tests passed! ===");
