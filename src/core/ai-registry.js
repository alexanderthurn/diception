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
            uuid: 'builtin-easy-001',
            name: 'Easy',
            description: 'Simple AI that attacks when it has equal or more dice',
            prompt: '',
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

        // Medium AI - Connects territory to maximize reinforcements
        this.builtIn.set('medium', {
            id: 'medium',
            uuid: 'builtin-medium-001',
            name: 'Medium',
            description: 'Tries to connect its territory to gain more dice',
            prompt: '',
            code: `
// Medium AI: Prioritizes moves that increase connected region size
const moves = [];
const myTiles = api.getMyTiles().filter(t => t.dice > 1);

for (const tile of myTiles) {
    const neighbors = api.getAdjacentTiles(tile.x, tile.y);
    for (const target of neighbors) {
        if (target.owner !== api.myId && tile.dice > target.dice) {
            
            // Simulate to see if this improves our connected region
            const sim = api.simulateAttack(tile.x, tile.y, target.x, target.y);
            
            // Score based primarily on predicted reinforcements
            let score = sim.myPredictedReinforcements;
            
            // Tie-breaker: efficiency (dice difference) logic to prefer safer wins
            const diff = tile.dice - target.dice;
            score += diff * 0.1;

            moves.push({ from: tile, to: target, score });
        }
    }
}

// Sort: Highest reinforcements first
moves.sort((a, b) => b.score - a.score);

// Execute
for (const move of moves) {
    const t = api.getTileAt(move.from.x, move.from.y);
    const target = api.getTileAt(move.to.x, move.to.y);
    
    // Validation before execution
    if (t && target && t.owner === api.myId && t.dice > target.dice && target.owner !== api.myId) {
        api.attack(move.from.x, move.from.y, move.to.x, move.to.y);
    }
}
api.endTurn();
            `.trim()
        });

        // Hard AI - Risk assessment + Smart connectivity + Supply line cutting
        this.builtIn.set('hard', {
            id: 'hard',
            uuid: 'builtin-hard-001',
            name: 'Hard',
            description: 'Advanced AI that maximizes territory efficiently and cuts enemy supply lines',
            prompt: '',
            code: `
// Hard AI: Smart Connector - Prioritizes efficiency and cutting enemies
const moves = [];
const myTiles = api.getMyTiles().filter(t => t.dice > 1);

// Cache current stats to detect "cuts"
const enemyStats = {};
const players = api.players;
for (const p of players) {
    if (p.id !== api.myId && p.alive) {
        enemyStats[p.id] = api.getReinforcements(p.id);
    }
}

for (const tile of myTiles) {
    const neighbors = api.getAdjacentTiles(tile.x, tile.y);
    for (const target of neighbors) {
        if (target.owner !== api.myId && tile.dice > target.dice) {
            
            const sim = api.simulateAttack(tile.x, tile.y, target.x, target.y);
            
            // 1. Base Score: Territory connectivity
            let score = sim.myPredictedReinforcements * 10; 

            // 2. Efficiency Bonus (+2 dice diff is strong reason)
            const diff = tile.dice - target.dice;
            if (diff >= 2) {
                score += 20; // Equivalent to gaining +2 territory blocks roughly in weight
            } else {
                // Risky attack (diff == 1)
                // Only do it if strategic gain is huge
                score -= 5; 
            }

            // 3. Cutting Bonus (Destroying enemy connectivity)
            if (target.owner !== null && sim.enemyPredictedReinforcements < (enemyStats[target.owner] || 0)) {
                const cutAmount = (enemyStats[target.owner] || 0) - sim.enemyPredictedReinforcements;
                score += cutAmount * 15; // Cutting is very valuable
            }

            moves.push({ from: tile, to: target, score });
        }
    }
}

// Sort best moves first
moves.sort((a, b) => b.score - a.score);

// Execute
for (const move of moves) {
    const t = api.getTileAt(move.from.x, move.from.y);
    const target = api.getTileAt(move.to.x, move.to.y);
    
    if (t && target && t.owner === api.myId && t.dice > target.dice && target.owner !== api.myId) {
        api.attack(move.from.x, move.from.y, move.to.x, move.to.y);
    }
}
api.endTurn();
            `.trim()
        });

        // Adaptive AI - Learns from game, adjusts aggression
        this.builtIn.set('adaptive', {
            id: 'adaptive',
            uuid: 'builtin-adaptive-001',
            name: 'Adaptive',
            description: 'Learning AI that adapts its strategy based on past games',
            prompt: '',
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
            uuid: definition.uuid || this.generateUUID(),
            name: definition.name,
            description: definition.description || '',
            prompt: definition.prompt || '',
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
     * Export an AI as JSON object (for file download)
     */
    exportAI(id) {
        const ai = this.getAI(id);
        if (!ai) return null;

        return {
            uuid: ai.uuid,
            name: ai.name,
            description: ai.description || '',
            prompt: ai.prompt || '',
            code: ai.code,
            exportedAt: new Date().toISOString()
        };
    }

    /**
     * Import an AI from JSON data
     * If uuid matches existing AI, it will be replaced
     */
    importAI(data) {
        try {
            if (!data.name || !data.code) {
                throw new Error('Invalid AI format: missing name or code');
            }

            const uuid = data.uuid || this.generateUUID();

            // Check if AI with same uuid exists
            let existingId = null;
            for (const [id, ai] of this.custom) {
                if (ai.uuid === uuid) {
                    existingId = id;
                    break;
                }
            }

            const id = existingId || 'custom_' + Date.now();

            if (existingId) {
                this.updateCustomAI(id, {
                    uuid,
                    name: data.name,
                    description: data.description || '',
                    prompt: data.prompt || '',
                    code: data.code
                });
            } else {
                this.registerCustomAI(id, {
                    uuid,
                    name: data.name,
                    description: data.description || '',
                    prompt: data.prompt || '',
                    code: data.code
                });
            }

            return { success: true, id, replaced: !!existingId };
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

    /**
     * Generate a UUID
     */
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}
