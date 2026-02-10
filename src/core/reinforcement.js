import { GAME } from './constants.js';

/**
 * ReinforcementManager - Handles dice reinforcement distribution
 * 
 * This manager is stateless.
 * Methods accept minimal required data instead of the full Game object.
 */
export class ReinforcementManager {
    /**
     * Distribute reinforcements to a player
     * @param {Object} context - { map, player, maxDice }
     * @param {number} playerId - The player to reinforce
     * @returns {Object} Reinforcement result
     */
    distributeReinforcements(context, playerId) {
        const { map, player, maxDice = GAME.DEFAULT_MAX_DICE } = context;
        
        const earned = map.findLargestConnectedRegion(playerId);
        const fromStore = player.storedDice || 0;

        // Total available to place: new earnings + previously stored
        let diceToDistribute = earned + fromStore;
        let placed = 0;
        const placements = []; // Track where dice were placed for animation

        const ownedTiles = map.getTilesByOwner(playerId);

        // Distribute randomly
        // Optimization: Filter once and maintain eligible list
        const eligibleTiles = ownedTiles.filter(t => t.dice < maxDice);

        while (diceToDistribute > 0 && eligibleTiles.length > 0) {
            const randomIndex = Math.floor(Math.random() * eligibleTiles.length);
            const randomTile = eligibleTiles[randomIndex];

            randomTile.dice++;
            diceToDistribute--;
            placed++;
            placements.push({ x: randomTile.x, y: randomTile.y });

            // If tile becomes full, remove it from eligible list
            if (randomTile.dice >= maxDice) {
                // Efficient removal: swap with last element and pop
                eligibleTiles[randomIndex] = eligibleTiles[eligibleTiles.length - 1];
                eligibleTiles.pop();
            }
        }

        // Remaining dice go back to store
        player.storedDice = diceToDistribute;

        return {
            earned: earned,
            placed: placed,
            dropped: 0,
            stored: player.storedDice,
            fromStore: fromStore,
            placements: placements
        };
    }

    // Legacy method for backward compatibility with Game class
    distributeReinforcementsLegacy(game, playerId) {
        const player = game.players.find(p => p.id === playerId);
        return this.distributeReinforcements({
            map: game.map,
            player: player,
            maxDice: game.maxDice
        }, playerId);
    }
}
