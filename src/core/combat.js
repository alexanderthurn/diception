import { GAME } from './constants.js';

/**
 * CombatManager - Handles attack resolution and dice rolling
 * 
 * This manager is stateless aside from battle history.
 * Methods accept minimal required data instead of the full Game object.
 */
export class CombatManager {
    constructor() {
        this.history = []; // Log of battles
    }

    rollDice(count, sides = GAME.DEFAULT_DICE_SIDES) {
        const rolls = [];
        let sum = 0;
        for (let i = 0; i < count; i++) {
            const roll = Math.floor(Math.random() * sides) + 1;
            rolls.push(roll);
            sum += roll;
        }
        return { rolls, sum };
    }

    /**
     * Check if an attack is valid
     * @param {Object} context - { map, currentPlayerId }
     * @param {number} fromX - Attacker X coordinate
     * @param {number} fromY - Attacker Y coordinate
     * @param {number} toX - Defender X coordinate
     * @param {number} toY - Defender Y coordinate
     * @returns {{ valid: boolean, reason?: string }}
     */
    canAttack(context, fromX, fromY, toX, toY) {
        const { map, currentPlayerId } = context;
        const attackerTile = map.getTile(fromX, fromY);
        const defenderTile = map.getTile(toX, toY);

        if (!attackerTile || !defenderTile) return { valid: false, reason: "Invalid coordinates" };
        if (attackerTile.owner !== currentPlayerId) return { valid: false, reason: "Not your tile" };
        if (attackerTile.owner === defenderTile.owner) return { valid: false, reason: "Cannot attack self" };
        if (attackerTile.dice <= 1) return { valid: false, reason: "Not enough dice (need > 1)" };

        // Check adjacency
        const isAdjacent = Math.abs(fromX - toX) + Math.abs(fromY - toY) === 1;
        if (!isAdjacent) return { valid: false, reason: "Tiles not adjacent" };

        return { valid: true };
    }

    /**
     * Resolve an attack
     * @param {Object} context - { map, currentPlayerId, diceSides }
     * @param {number} fromX - Attacker X coordinate
     * @param {number} fromY - Attacker Y coordinate
     * @param {number} toX - Defender X coordinate
     * @param {number} toY - Defender Y coordinate
     * @returns {Object} Battle result
     */
    resolveAttack(context, fromX, fromY, toX, toY) {
        const { map, currentPlayerId, diceSides = GAME.DEFAULT_DICE_SIDES } = context;
        
        const validation = this.canAttack({ map, currentPlayerId }, fromX, fromY, toX, toY);
        if (!validation.valid) throw new Error(validation.reason);

        const attackerTile = map.getTile(fromX, fromY);
        const defenderTile = map.getTile(toX, toY);

        const attackRoll = this.rollDice(attackerTile.dice, diceSides);
        const defenseRoll = this.rollDice(defenderTile.dice, diceSides);

        const battleResult = {
            attackerId: currentPlayerId,
            defenderId: defenderTile.owner,
            from: { x: fromX, y: fromY },
            to: { x: toX, y: toY },
            attackerRolls: attackRoll.rolls,
            attackerSum: attackRoll.sum,
            defenderRolls: defenseRoll.rolls,
            defenderSum: defenseRoll.sum,
            won: attackRoll.sum > defenseRoll.sum
        };

        if (battleResult.won) {
            // Attacker wins - Move all dice - 1 to captured tile
            const movingDice = attackerTile.dice - 1;
            defenderTile.owner = attackerTile.owner;
            defenderTile.dice = movingDice;
            attackerTile.dice = 1;
        } else {
            // Attacker loses - Attacker drops to 1 die
            attackerTile.dice = 1;
        }

        this.history.push(battleResult);
        return battleResult;
    }

    // Legacy method for backward compatibility with Game class
    // Wraps the new interface to accept the full game object
    resolveAttackLegacy(game, fromX, fromY, toX, toY) {
        return this.resolveAttack({
            map: game.map,
            currentPlayerId: game.currentPlayer.id,
            diceSides: game.diceSides
        }, fromX, fromY, toX, toY);
    }
}
