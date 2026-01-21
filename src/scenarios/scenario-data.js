/**
 * Scenario Data Format & Validation
 * Defines the schema for saving/loading game scenarios
 */

/**
 * Generate a unique ID for scenarios
 */
export function generateScenarioId() {
    return 'scenario_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Create a scenario object from current game state
 * @param {Game} game - The game instance
 * @param {string} name - User-provided name
 * @param {string} description - Optional description
 * @returns {Object} Scenario data object
 */
export function createScenarioFromGame(game, name, description = '') {
    // Extract only non-blocked tiles (sparse format)
    // Tiles don't have x/y properties - they're stored in a flat array where index = y * width + x
    const tiles = [];
    const width = game.map.width;

    for (let i = 0; i < game.map.tiles.length; i++) {
        const tile = game.map.tiles[i];
        if (!tile.blocked) {
            const x = i % width;
            const y = Math.floor(i / width);
            tiles.push({
                x: x,
                y: y,
                owner: tile.owner,
                dice: tile.dice
            });
        }
    }

    // Extract player configuration
    const players = game.players.map(p => ({
        id: p.id,
        isBot: p.isBot,
        color: p.color,
        storedDice: p.storedDice || 0
    }));

    return {
        id: generateScenarioId(),
        name: name,
        description: description,
        thumbnail: null, // Can be set later
        createdAt: Date.now(),
        isBuiltIn: false,

        // Map configuration
        width: game.map.width,
        height: game.map.height,
        maxDice: game.maxDice,
        diceSides: game.diceSides,

        // Tile data
        tiles: tiles,

        // Player configuration  
        players: players
    };
}

/**
 * Validate a scenario object
 * @param {Object} scenario - Scenario to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateScenario(scenario) {
    const errors = [];

    if (!scenario) {
        return { valid: false, errors: ['Scenario is null or undefined'] };
    }

    // Required fields
    if (!scenario.id) errors.push('Missing id');
    if (!scenario.name) errors.push('Missing name');
    if (!scenario.width || scenario.width < 3) errors.push('Invalid width');
    if (!scenario.height || scenario.height < 3) errors.push('Invalid height');
    if (!Array.isArray(scenario.tiles)) errors.push('Tiles must be an array');
    if (!Array.isArray(scenario.players)) errors.push('Players must be an array');

    // Validate tiles
    if (Array.isArray(scenario.tiles)) {
        for (let i = 0; i < scenario.tiles.length; i++) {
            const tile = scenario.tiles[i];
            if (typeof tile.x !== 'number' || typeof tile.y !== 'number') {
                errors.push(`Tile ${i}: invalid coordinates`);
            }
            if (typeof tile.owner !== 'number') {
                errors.push(`Tile ${i}: invalid owner`);
            }
            if (typeof tile.dice !== 'number' || tile.dice < 1) {
                errors.push(`Tile ${i}: invalid dice count`);
            }
        }
    }

    // Validate players
    if (Array.isArray(scenario.players)) {
        if (scenario.players.length < 2) {
            errors.push('At least 2 players required');
        }
        for (let i = 0; i < scenario.players.length; i++) {
            const player = scenario.players[i];
            if (typeof player.id !== 'number') {
                errors.push(`Player ${i}: invalid id`);
            }
            if (typeof player.isBot !== 'boolean') {
                errors.push(`Player ${i}: invalid isBot flag`);
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

/**
 * Create an empty scenario template for the editor
 * @param {number} width 
 * @param {number} height 
 * @param {number} playerCount
 * @returns {Object}
 */
export function createEmptyScenario(width, height, playerCount = 2) {
    const players = [];
    const defaultColors = [
        0xAA00FF, 0xFF00AA, 0x00FFFF, 0xFFFFFF,
        0xFF0055, 0x55FF00, 0xFFDD00, 0xFF8800
    ];

    for (let i = 0; i < playerCount; i++) {
        players.push({
            id: i,
            isBot: i > 0, // First player is human
            color: defaultColors[i % defaultColors.length],
            storedDice: 0
        });
    }

    return {
        id: generateScenarioId(),
        name: 'New Map',
        description: '',
        thumbnail: null,
        createdAt: Date.now(),
        isBuiltIn: false,
        width: width,
        height: height,
        maxDice: 9,
        diceSides: 6,
        tiles: [],
        players: players
    };
}
