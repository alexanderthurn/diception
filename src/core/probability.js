/**
 * Probability calculation for dice combat
 * Uses Monte Carlo simulation for accurate win probability estimation
 */

// Cache for computed probabilities to avoid recalculating
const probabilityCache = new Map();

/**
 * Calculate the probability of attacker winning against defender
 * @param {number} attackerDice - Number of dice the attacker has
 * @param {number} defenderDice - Number of dice the defender has
 * @param {number} diceSides - Number of sides per die (default 6)
 * @returns {number} Win probability as a decimal (0-1)
 */
export function calculateWinProbability(attackerDice, defenderDice, diceSides = 6) {
    // Create cache key
    const cacheKey = `${attackerDice}-${defenderDice}-${diceSides}`;

    if (probabilityCache.has(cacheKey)) {
        return probabilityCache.get(cacheKey);
    }

    // Monte Carlo simulation with 10,000 iterations
    const ITERATIONS = 10000;
    let wins = 0;

    for (let i = 0; i < ITERATIONS; i++) {
        const attackSum = rollDice(attackerDice, diceSides);
        const defenseSum = rollDice(defenderDice, diceSides);

        // Attacker wins only if strictly greater
        if (attackSum > defenseSum) {
            wins++;
        }
    }

    const probability = wins / ITERATIONS;
    probabilityCache.set(cacheKey, probability);

    return probability;
}

/**
 * Simulate rolling multiple dice and return the sum
 * @param {number} count - Number of dice to roll
 * @param {number} sides - Number of sides per die
 * @returns {number} Sum of all dice
 */
function rollDice(count, sides) {
    let sum = 0;
    for (let i = 0; i < count; i++) {
        sum += Math.floor(Math.random() * sides) + 1;
    }
    return sum;
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

/**
 * Pre-calculate probabilities for a full table (for how-to modal)
 * @param {number} maxDice - Maximum dice count for rows/columns
 * @param {number} diceSides - Number of sides per die
 * @returns {number[][]} 2D array of probabilities [attacker][defender]
 */
export function generateProbabilityTable(maxDice = 9, diceSides = 6) {
    const table = [];

    for (let attacker = 1; attacker <= maxDice; attacker++) {
        const row = [];
        for (let defender = 1; defender <= maxDice; defender++) {
            row.push(calculateWinProbability(attacker, defender, diceSides));
        }
        table.push(row);
    }

    return table;
}

/**
 * Clear the probability cache (useful when dice sides change)
 */
export function clearProbabilityCache() {
    probabilityCache.clear();
}
