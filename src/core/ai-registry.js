/**
 * AIRegistry - Manages built-in and custom AIs
 * 
 * Features:
 * - Registers built-in AI presets (easy, medium, hard, adaptive)
 * - Stores custom user-created AIs in localStorage
 * - Import/Export AIs as JSON for sharing
 */
export class AIRegistry {
    constructor() {
        this.builtIn = new Map();
        this.custom = new Map();

        // Register built-in AIs
        this.registerBuiltInAIs();
    }

    /**
     * Register all built-in AI presets
     */
    registerBuiltInAIs() {
        // Easy AI - Current behavior, attacks with any advantage
        this.builtIn.set('easy', {
            id: 'easy',
            name: 'Easy',
            description: 'Simple AI that attacks when it has equal or more dice',
            code: `
// Easy AI: Attacks when dice advantage >= 0
const myTiles = api.getMyTiles().filter(t => t.dice > 1);

for (const tile of myTiles) {
    const neighbors = api.getAdjacentTiles(tile.x, tile.y);
    for (const target of neighbors) {
        if (target.owner !== api.myId && tile.dice >= target.dice) {
            api.attack(tile.x, tile.y, target.x, target.y);
        }
    }
}

api.endTurn();
            `.trim()
        });

        // Medium AI - Better move evaluation, prioritizes good trades
        this.builtIn.set('medium', {
            id: 'medium',
            name: 'Medium',
            description: 'Smarter AI that evaluates all moves and picks the best ones',
            code: `
// Medium AI: Evaluates all moves and picks best
function evaluateMove(from, to) {
    const diff = from.dice - to.dice;
    
    // Strong advantage
    if (diff >= 2) return 100 + diff;
    
    // Full stack should always attack
    if (from.dice === api.maxDice) return 90 + diff;
    
    // Small advantage
    if (diff > 0) return 50 + diff;
    
    // Even fight only if we're full
    if (diff === 0 && from.dice === api.maxDice) return 40;
    
    return -1;
}

// Collect all possible moves
const moves = [];
const myTiles = api.getMyTiles().filter(t => t.dice > 1);

for (const tile of myTiles) {
    const neighbors = api.getAdjacentTiles(tile.x, tile.y);
    for (const target of neighbors) {
        if (target.owner !== api.myId) {
            const score = evaluateMove(tile, target);
            if (score > 0) {
                moves.push({ from: tile, to: target, score });
            }
        }
    }
}

// Sort by score and execute
moves.sort((a, b) => b.score - a.score);

for (const move of moves) {
    // Re-check the tile still has enough dice
    const currentTile = api.getTileAt(move.from.x, move.from.y);
    if (currentTile && currentTile.dice > 1 && currentTile.owner === api.myId) {
        api.attack(move.from.x, move.from.y, move.to.x, move.to.y);
    }
}

api.endTurn();
            `.trim()
        });

        // Hard AI - Risk assessment, connectivity bonus, endgame awareness
        this.builtIn.set('hard', {
            id: 'hard',
            name: 'Hard',
            description: 'Advanced AI with risk assessment and strategic planning',
            code: `
// Hard AI: Risk assessment and strategic planning

function getConnectedTiles(tiles, startTile) {
    const connected = new Set();
    const queue = [startTile];
    const key = t => t.x + ',' + t.y;
    connected.add(key(startTile));
    
    while (queue.length > 0) {
        const current = queue.shift();
        const neighbors = api.getAdjacentTiles(current.x, current.y);
        for (const n of neighbors) {
            if (n.owner === api.myId && !connected.has(key(n))) {
                connected.add(key(n));
                queue.push(n);
            }
        }
    }
    return connected.size;
}

function evaluateMove(from, to, allMyTiles) {
    let score = 0;
    const diff = from.dice - to.dice;
    
    // Base score from dice advantage
    score += diff * 10;
    
    // Win probability bonus
    const winProb = api.getWinProbability(from.dice, to.dice, api.diceSides);
    if (winProb < 0.4) return -100; // Too risky
    score += winProb * 50;
    
    // Full stack must attack
    if (from.dice === api.maxDice) score += 30;
    
    // Bonus for attacking weak targets
    if (to.dice === 1) score += 20;
    
    // Bonus for expanding territory (check if target connects to more enemies)
    const targetNeighbors = api.getAdjacentTiles(to.x, to.y);
    const newFrontier = targetNeighbors.filter(n => n.owner !== api.myId && n.owner !== to.owner).length;
    score += newFrontier * 5;
    
    // Penalty for leaving frontier weak
    const fromNeighbors = api.getAdjacentTiles(from.x, from.y);
    const enemyNeighbors = fromNeighbors.filter(n => n.owner !== api.myId).length;
    if (enemyNeighbors > 0) {
        score -= enemyNeighbors * 3;
    }
    
    return score;
}

// Collect and score all moves
const moves = [];
const myTiles = api.getMyTiles();
const attackers = myTiles.filter(t => t.dice > 1);

for (const tile of attackers) {
    const neighbors = api.getAdjacentTiles(tile.x, tile.y);
    for (const target of neighbors) {
        if (target.owner !== api.myId) {
            const score = evaluateMove(tile, target, myTiles);
            if (score > 0) {
                moves.push({ from: tile, to: target, score });
            }
        }
    }
}

// Sort by score (best first)
moves.sort((a, b) => b.score - a.score);

// Execute top moves
for (const move of moves) {
    const currentTile = api.getTileAt(move.from.x, move.from.y);
    if (currentTile && currentTile.dice > 1 && currentTile.owner === api.myId) {
        const result = api.attack(move.from.x, move.from.y, move.to.x, move.to.y);
        if (!result.success) break;
    }
}

api.endTurn();
            `.trim()
        });

        // Adaptive AI - Learns from game, adjusts aggression
        this.builtIn.set('adaptive', {
            id: 'adaptive',
            name: 'Adaptive',
            description: 'Learning AI that adapts its strategy based on past games',
            code: `
// Adaptive AI: Learns and adapts strategy

// Load past performance
let stats = api.load('stats') || { wins: 0, losses: 0, aggression: 0.5 };
let gameStats = api.load('currentGame') || { attacks: 0, wins: 0, territory: 0 };

// Adjust aggression based on past performance
const winRate = stats.wins / Math.max(1, stats.wins + stats.losses);
const aggression = stats.aggression;

function evaluateMove(from, to) {
    const diff = from.dice - to.dice;
    const winProb = api.getWinProbability(from.dice, to.dice, api.diceSides);
    
    // Threshold based on aggression level
    const threshold = 0.6 - aggression * 0.3; // 0.3 to 0.6
    
    if (winProb < threshold) return -1;
    
    let score = winProb * 100;
    score += diff * 10;
    
    // Full stacks must attack
    if (from.dice === api.maxDice) score += 50;
    
    // Easy kills
    if (to.dice === 1) score += 30 * aggression;
    
    // Territory expansion
    const neighbors = api.getAdjacentTiles(to.x, to.y);
    const enemyNeighbors = neighbors.filter(n => n.owner !== api.myId).length;
    score += enemyNeighbors * 10 * aggression;
    
    return score;
}

// Collect moves
const moves = [];
const myTiles = api.getMyTiles();
const attackers = myTiles.filter(t => t.dice > 1);

for (const tile of attackers) {
    const neighbors = api.getAdjacentTiles(tile.x, tile.y);
    for (const target of neighbors) {
        if (target.owner !== api.myId) {
            const score = evaluateMove(tile, target);
            if (score > 0) {
                moves.push({ from: tile, to: target, score });
            }
        }
    }
}

moves.sort((a, b) => b.score - a.score);

// Execute with move limit based on aggression
const maxAttacks = Math.floor(5 + aggression * 20);
let attackCount = 0;

for (const move of moves) {
    if (attackCount >= maxAttacks) break;
    
    const currentTile = api.getTileAt(move.from.x, move.from.y);
    if (currentTile && currentTile.dice > 1 && currentTile.owner === api.myId) {
        const result = api.attack(move.from.x, move.from.y, move.to.x, move.to.y);
        if (result.success) {
            gameStats.attacks++;
            if (result.expectedWin) gameStats.wins++;
            attackCount++;
        }
    }
}

// Track territory for learning
const currentTerritory = api.getMyTiles().length;
if (gameStats.territory === 0) {
    gameStats.territory = currentTerritory;
} else {
    // Adjust aggression based on territory change
    if (currentTerritory > gameStats.territory) {
        stats.aggression = Math.min(1, stats.aggression + 0.02);
    } else if (currentTerritory < gameStats.territory) {
        stats.aggression = Math.max(0.1, stats.aggression - 0.01);
    }
    gameStats.territory = currentTerritory;
}

// Save state
api.save('stats', stats);
api.save('currentGame', gameStats);

api.endTurn();
            `.trim()
        });
    }

    /**
     * Get an AI by ID (checks both built-in and custom)
     */
    getAI(id) {
        return this.builtIn.get(id) || this.custom.get(id) || null;
    }

    /**
     * Get all available AIs for UI dropdowns
     */
    getAllAIs() {
        const ais = [];

        // Built-in first
        for (const [id, ai] of this.builtIn) {
            ais.push({ ...ai, isBuiltIn: true });
        }

        // Then custom
        for (const [id, ai] of this.custom) {
            ais.push({ ...ai, isBuiltIn: false });
        }

        return ais;
    }

    /**
     * Register a custom AI
     */
    registerCustomAI(id, definition) {
        this.custom.set(id, {
            id,
            name: definition.name,
            description: definition.description || '',
            code: definition.code
        });
        this.saveCustomAIs();
    }

    /**
     * Delete a custom AI
     */
    deleteCustomAI(id) {
        this.custom.delete(id);
        this.saveCustomAIs();
        // Also clear its storage
        localStorage.removeItem(`dicy_ai_storage_${id}`);
    }

    /**
     * Update a custom AI
     */
    updateCustomAI(id, definition) {
        if (this.custom.has(id)) {
            this.custom.set(id, {
                ...this.custom.get(id),
                ...definition,
                id
            });
            this.saveCustomAIs();
        }
    }

    /**
     * Save custom AIs to localStorage
     */
    saveCustomAIs() {
        const data = {};
        for (const [id, ai] of this.custom) {
            data[id] = ai;
        }
        localStorage.setItem('dicy_custom_ais', JSON.stringify(data));
    }

    /**
     * Load custom AIs from localStorage
     */
    loadCustomAIs() {
        try {
            const data = JSON.parse(localStorage.getItem('dicy_custom_ais') || '{}');
            this.custom.clear();
            for (const [id, ai] of Object.entries(data)) {
                this.custom.set(id, ai);
            }
        } catch (e) {
            console.warn('[AIRegistry] Failed to load custom AIs:', e.message);
            this.custom.clear();
        }
    }

    /**
     * Export an AI as JSON string (for sharing)
     */
    exportAI(id) {
        const ai = this.getAI(id);
        if (!ai) return null;

        return JSON.stringify({
            name: ai.name,
            description: ai.description,
            code: ai.code,
            exportedAt: new Date().toISOString()
        }, null, 2);
    }

    /**
     * Import an AI from JSON string
     */
    importAI(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (!data.name || !data.code) {
                throw new Error('Invalid AI format: missing name or code');
            }

            const id = 'custom_' + Date.now();
            this.registerCustomAI(id, {
                name: data.name,
                description: data.description || '',
                code: data.code
            });

            return { success: true, id };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * Generate a unique ID for a new custom AI
     */
    generateId() {
        return 'custom_' + Date.now();
    }
}
