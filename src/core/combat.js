export class CombatManager {
    constructor() {
        this.history = []; // Log of battles
    }

    rollDice(count, sides = 6) {
        const rolls = [];
        let sum = 0;
        for (let i = 0; i < count; i++) {
            const roll = Math.floor(Math.random() * sides) + 1;
            rolls.push(roll);
            sum += roll;
        }
        return { rolls, sum };
    }

    canAttack(game, fromX, fromY, toX, toY) {
        const map = game.map;
        const attackerTile = map.getTile(fromX, fromY);
        const defenderTile = map.getTile(toX, toY);

        if (!attackerTile || !defenderTile) return { valid: false, reason: "Invalid coordinates" };
        if (attackerTile.owner !== game.currentPlayer.id) return { valid: false, reason: "Not your tile" };
        if (attackerTile.owner === defenderTile.owner) return { valid: false, reason: "Cannot attack self" };
        if (attackerTile.dice <= 1) return { valid: false, reason: "Net enough dice (need > 1)" };

        // Check adjacency
        const isAdjacent = Math.abs(fromX - toX) + Math.abs(fromY - toY) === 1;
        if (!isAdjacent) return { valid: false, reason: "Tiles not adjacent" };

        return { valid: true };
    }

    resolveAttack(game, fromX, fromY, toX, toY) {
        const validation = this.canAttack(game, fromX, fromY, toX, toY);
        if (!validation.valid) throw new Error(validation.reason);

        const attackerTile = game.map.getTile(fromX, fromY);
        const defenderTile = game.map.getTile(toX, toY);

        const diceSides = game.diceSides || 6;
        const attackRoll = this.rollDice(attackerTile.dice, diceSides);
        const defenseRoll = this.rollDice(defenderTile.dice, diceSides);

        const battleResult = {
            attackerId: game.currentPlayer.id,
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
            // Attacker wins
            // Move all dice - 1 to captured tile
            const movingDice = attackerTile.dice - 1;
            defenderTile.owner = attackerTile.owner;
            defenderTile.dice = movingDice;
            attackerTile.dice = 1;
        } else {
            // Attacker loses
            // Attacker drops to 1 die
            attackerTile.dice = 1;
            // Defender stays same
        }

        this.history.push(battleResult);
        return battleResult;
    }
}
