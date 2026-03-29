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
        const { map, player, maxDice = GAME.DEFAULT_MAX_DICE, supplyRule = 'classic' } = context;

        const earned = map.findLargestConnectedRegion(playerId);
        const fromStore = player.storedDice || 0;

        let diceToDistribute = earned + fromStore;
        let placed = 0;
        let dropped = 0;
        const placements = [];
        // Ordered event log for animation (no_stack_hard / reborn only)
        const events = [];

        const ownedTiles = map.getTilesByOwner(playerId);

        if (supplyRule === 'no_stack_hard' || supplyRule === 'reborn') {
            // Pick from ALL owned tiles; full tile either loses the die or reborns it
            while (diceToDistribute > 0 && ownedTiles.length > 0) {
                const randomIndex = Math.floor(Math.random() * ownedTiles.length);
                const randomTile = ownedTiles[randomIndex];
                diceToDistribute--;

                if (randomTile.dice >= maxDice) {
                    if (supplyRule === 'reborn') {
                        randomTile.dice = 1;
                        placed++;
                        // Not added to placements — handled separately via events in animation
                        events.push({ x: randomTile.x, y: randomTile.y, type: 'reborn' });
                    } else {
                        dropped++;
                        events.push({ x: randomTile.x, y: randomTile.y, type: 'reject' });
                    }
                } else {
                    randomTile.dice++;
                    placed++;
                    placements.push({ x: randomTile.x, y: randomTile.y });
                    events.push({ x: randomTile.x, y: randomTile.y, type: 'place' });
                }
            }
            player.storedDice = 0;
        } else {
            // Classic / No Stack: pre-filter to eligible tiles
            const eligibleTiles = ownedTiles.filter(t => t.dice < maxDice);

            while (diceToDistribute > 0 && eligibleTiles.length > 0) {
                const randomIndex = Math.floor(Math.random() * eligibleTiles.length);
                const randomTile = eligibleTiles[randomIndex];

                randomTile.dice++;
                diceToDistribute--;
                placed++;
                placements.push({ x: randomTile.x, y: randomTile.y });

                if (randomTile.dice >= maxDice) {
                    eligibleTiles[randomIndex] = eligibleTiles[eligibleTiles.length - 1];
                    eligibleTiles.pop();
                }
            }

            if (supplyRule === 'no_stack') {
                dropped = diceToDistribute;
                player.storedDice = 0;
            } else {
                // Classic: remainder goes to stack
                player.storedDice = diceToDistribute;
            }
        }

        return {
            earned,
            placed,
            dropped,
            stored: player.storedDice,
            fromStore,
            placements,
            events,
            supplyRule,
        };
    }

    // Legacy method for backward compatibility with Game class
    distributeReinforcementsLegacy(game, playerId) {
        const player = game.players.find(p => p.id === playerId);
        return this.distributeReinforcements({
            map: game.map,
            player: player,
            maxDice: game.maxDice,
            supplyRule: game.supplyRule,
        }, playerId);
    }
}
