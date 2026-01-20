export class ReinforcementManager {
    distributeReinforcements(game, playerId) {
        const player = game.players.find(p => p.id === playerId);
        const earned = game.map.findLargestConnectedRegion(playerId);
        const fromStore = player.storedDice || 0;

        // Total available to place: new earnings + previously stored
        let diceToDistribute = earned + fromStore;
        let placed = 0;
        const placements = []; // Track where dice were placed for animation

        const ownedTiles = game.map.getTilesByOwner(playerId);

        // Distribute randomly
        while (diceToDistribute > 0) {
            // Filter eligible tiles (dice < maxDice)
            const eligibleTiles = ownedTiles.filter(t => t.dice < game.maxDice);

            if (eligibleTiles.length === 0) {
                break; // No space left
            }

            const randomTile = eligibleTiles[Math.floor(Math.random() * eligibleTiles.length)];
            randomTile.dice++;
            diceToDistribute--;
            placed++;
            placements.push({ x: randomTile.x, y: randomTile.y });
        }

        // Remaining dice go back to store
        player.storedDice = diceToDistribute;

        // Return detailed info
        // placed: total placed this turn
        // dropped: 0 (since they are stored now)
        // stored: current amount in store
        // earned: amount earned from tiles this turn
        // placements: array of {x, y} for animation
        return {
            earned: earned,
            placed: placed,
            dropped: 0,
            stored: player.storedDice,
            fromStore: fromStore,
            placements: placements
        };
    }
}
