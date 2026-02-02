/**
 * Probability calculation for dice combat
 * Uses analytical calculation with pre-computed lookup tables
 */

import { GAME } from './constants.js';

// Pre-computed probability lookup tables indexed by dice sides
// Structure: probabilityTables[diceSides][attackerDice][defenderDice]
const probabilityTables = new Map();

/**
 * Calculate the probability distribution of sums for N dice with S sides
 * @param {number} n - Number of dice
 * @param {number} sides - Number of sides per die
 * @returns {number[]} Array where index = sum, value = probability
 */
function getSumDistribution(n, sides) {
    // Array where index = sum, value = count of ways to get that sum
    let dist = new Array(n * sides + 1).fill(0);
    dist[0] = 1;

    for (let i = 0; i < n; i++) {
        const nextDist = new Array(n * sides + 1).fill(0);
        for (let s = 0; s <= i * sides; s++) {
            if (dist[s] > 0) {
                for (let face = 1; face <= sides; face++) {
                    nextDist[s + face] += dist[s];
                }
            }
        }
        dist = nextDist;
    }

    // Convert to probabilities
    const totalOutcomes = Math.pow(sides, n);
    return dist.map(count => count / totalOutcomes);
}

/**
 * Calculate exact win probability for attacker vs defender
 * @param {number} attackerDice - Number of dice for attacker
 * @param {number} defenderDice - Number of dice for defender
 * @param {number} diceSides - Number of sides per die
 * @returns {number} Win probability (0-1)
 */
function computeWinProbability(attackerDice, defenderDice, diceSides) {
    const attackDist = getSumDistribution(attackerDice, diceSides);
    const defenseDist = getSumDistribution(defenderDice, diceSides);

    let winProb = 0;

    // Sum all cases where attacker sum > defender sum
    for (let a = 0; a < attackDist.length; a++) {
        if (attackDist[a] === 0) continue;
        for (let d = 0; d < defenseDist.length; d++) {
            if (defenseDist[d] === 0) continue;
            if (a > d) {
                winProb += attackDist[a] * defenseDist[d];
            }
        }
    }

    return winProb;
}

/**
 * Pre-compute all probability tables for all dice sides (1 to MAX_DICE_SIDES)
 * and dice counts (1 to MAX_DICE_PER_TERRITORY)
 * Call this once at game startup
 */
export function initializeProbabilityTables() {
    const maxSides = GAME.MAX_DICE_SIDES;
    const maxDice = GAME.MAX_DICE_PER_TERRITORY;

    console.log(`Pre-computing probability tables (sides: 1-${maxSides}, dice: 1-${maxDice})...`);
    const startTime = performance.now();

    for (let sides = 1; sides <= maxSides; sides++) {
        const table = [];
        for (let attacker = 1; attacker <= maxDice; attacker++) {
            const row = [];
            for (let defender = 1; defender <= maxDice; defender++) {
                row.push(computeWinProbability(attacker, defender, sides));
            }
            table.push(row);
        }
        probabilityTables.set(sides, table);
    }

    const elapsed = (performance.now() - startTime).toFixed(1);
    console.log(`Probability tables computed in ${elapsed}ms`);
}

/**
 * Get win probability from pre-computed table (fast lookup)
 * @param {number} attackerDice - Number of dice the attacker has
 * @param {number} defenderDice - Number of dice the defender has
 * @param {number} diceSides - Number of sides per die
 * @returns {number} Win probability (0-1)
 */
export function getWinProbability(attackerDice, defenderDice, diceSides = 6) {
    const table = probabilityTables.get(diceSides);
    if (!table) {
        console.warn(`Probability table not computed for ${diceSides}-sided dice`);
        return 0.5; // Fallback
    }

    const maxDice = GAME.MAX_DICE_PER_TERRITORY;
    // Tables are 0-indexed, dice counts are 1-indexed
    const attackIdx = Math.max(0, Math.min(maxDice - 1, attackerDice - 1));
    const defendIdx = Math.max(0, Math.min(maxDice - 1, defenderDice - 1));

    return table[attackIdx][defendIdx];
}

/**
 * Get the pre-computed probability table for a given dice type
 * @param {number} diceSides - Number of sides per die
 * @returns {number[][]} 2D array of probabilities [attacker-1][defender-1]
 */
export function getProbabilityTable(diceSides = 6) {
    return probabilityTables.get(diceSides) || [];
}

/**
 * Get the color class for a given probability
 * @param {number} probability - Win probability (0-1)
 * @returns {string} Color class name
 */
export function getProbabilityColor(probability) {
    if (probability >= 0.75) return 'prob-high';
    if (probability >= 0.25) return 'prob-medium';
    return 'prob-low';
}

/**
 * Get hex color for probability (for PixiJS rendering)
 * @param {number} probability - Win probability (0-1)
 * @returns {number} Hex color value
 */
export function getProbabilityHexColor(probability) {
    if (probability >= 0.75) return 0x00b400; // Green
    if (probability >= 0.25) return 0xffa500; // Orange/Yellow
    return 0xdc0000; // Red
}

// Legacy alias for backwards compatibility
export const calculateWinProbability = getWinProbability;
export const generateProbabilityTable = getProbabilityTable;
