/**
 * Campaign Data Format & Validation
 * Campaigns are collections of levels. Levels have no name/description.
 */

const MAX_LEVELS = 144; // 12×12 grid
const OWNER_ID_TYPES = ['steam', 'web', 'android'];

/**
 * Validate a campaign object
 * @param {Object} campaign - Campaign to validate
 * @param {Object} options - { requireAuthFields: bool, isBuiltIn: bool }
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateCampaign(campaign, options = {}) {
    const { requireAuthFields = false, isBuiltIn = false } = options;
    const errors = [];

    if (!campaign) {
        return { valid: false, errors: ['Campaign is null or undefined'] };
    }

    if (!Array.isArray(campaign.levels)) {
        errors.push('Levels must be an array');
    } else {
        if (campaign.levels.length > MAX_LEVELS) {
            errors.push(`Maximum ${MAX_LEVELS} levels allowed`);
        }
        for (let i = 0; i < campaign.levels.length; i++) {
            const result = validateLevel(campaign.levels[i]);
            if (!result.valid) {
                errors.push(`Level ${i}: ${result.errors.join(', ')}`);
            }
        }
    }

    if (!isBuiltIn && requireAuthFields) {
        if (!campaign.ownerId || typeof campaign.ownerId !== 'string') {
            errors.push('Missing or invalid ownerId');
        }
        if (!campaign.ownerIdType || !OWNER_ID_TYPES.includes(campaign.ownerIdType)) {
            errors.push('Missing or invalid ownerIdType');
        }
        if (!campaign.owner || typeof campaign.owner !== 'string') {
            errors.push('Missing or invalid owner (display name)');
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validate a single level (no name/description required)
 * @param {Object} level - Level object
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateLevel(level) {
    const errors = [];

    if (!level) {
        return { valid: false, errors: ['Level is null or undefined'] };
    }

    const type = level.type;
    if (!type || !['config', 'scenario', 'map'].includes(type)) {
        errors.push('Level type must be config, scenario, or map');
        return { valid: false, errors };
    }

    if (type === 'config') {
        if (!level.mapSize || typeof level.mapSize !== 'string') errors.push('config requires mapSize');
        if (!level.mapStyle) errors.push('config requires mapStyle');
        if (!level.gameMode) errors.push('config requires gameMode');
        if (typeof level.bots !== 'number') errors.push('config requires bots');
        if (!level.botAI) errors.push('config requires botAI');
        if (typeof level.maxDice !== 'number') errors.push('config requires maxDice');
        if (typeof level.diceSides !== 'number') errors.push('config requires diceSides');
    }

    if (type === 'scenario') {
        if (!level.width || level.width < 3) errors.push('Invalid width');
        if (!level.height || level.height < 3) errors.push('Invalid height');
        if (!Array.isArray(level.tiles)) errors.push('Tiles must be an array');
        if (!Array.isArray(level.players)) errors.push('Players must be an array');
        if (level.players && level.players.length < 2) errors.push('At least 2 players required');
        if (Array.isArray(level.tiles)) {
            for (let i = 0; i < level.tiles.length; i++) {
                const t = level.tiles[i];
                if (typeof t.x !== 'number' || typeof t.y !== 'number') {
                    errors.push(`Tile ${i}: invalid coordinates`);
                }
                if (typeof t.owner !== 'number') errors.push(`Tile ${i}: invalid owner`);
                if (typeof t.dice !== 'number' || t.dice < 1) errors.push(`Tile ${i}: invalid dice`);
            }
        }
    }

    if (type === 'map') {
        if (!level.width || level.width < 3) errors.push('Invalid width');
        if (!level.height || level.height < 3) errors.push('Invalid height');
        if (!Array.isArray(level.tiles)) errors.push('Tiles must be an array');
        if (Array.isArray(level.tiles)) {
            for (let i = 0; i < level.tiles.length; i++) {
                const t = level.tiles[i];
                if (typeof t.x !== 'number' || typeof t.y !== 'number') {
                    errors.push(`Tile ${i}: invalid coordinates`);
                }
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Strip name/description from a level (for campaign format)
 * @param {Object} level - Level with optional name/description
 * @returns {Object} - Clean level
 */
export function sanitizeLevel(level) {
    if (!level) return level;
    const { name, description, ...rest } = level;
    return rest;
}

/**
 * Compute grid dimensions for level count (1×1 to 12×12)
 * @param {number} levelCount
 * @returns {{cols: number, rows: number}}
 */
export function getGridDimensions(levelCount) {
    if (levelCount <= 0) return { cols: 1, rows: 1 };
    const size = Math.min(12, Math.ceil(Math.sqrt(Math.max(levelCount, 1))));
    return { cols: size, rows: size };
}
