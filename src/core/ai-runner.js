/**
 * AIRunner - Executes AI code in a sandboxed Web Worker environment
 * 
 * Security features:
 * - Web Worker isolation (no DOM access)
 * - Configurable timeout (default 30s)
 * - Max moves limit per turn (default 200)
 * - Actions queued and validated before execution
 * - Storage isolated per AI
 */
export class AIRunner {
    constructor(aiDefinition) {
        this.id = aiDefinition.id;
        this.name = aiDefinition.name;
        this.code = aiDefinition.code;
        this.storageKey = `dicy_ai_storage_${aiDefinition.id}`;
        this.timeout = aiDefinition.timeout || 30000;  // 30 seconds max per turn
        this.maxMoves = aiDefinition.maxMoves || 200;   // Max attacks per turn
    }

    /**
     * Execute the AI's turn
     * @param {Game} game - The game instance
     * @returns {Promise<void>}
     */
    async takeTurn(game) {
        return new Promise((resolve) => {
            const gameState = this.serializeGameState(game);
            const storage = this.loadStorage();

            // Create worker code that will execute the AI
            const workerCode = this.createWorkerCode();
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);
            const worker = new Worker(workerUrl);

            let resolved = false;
            const cleanup = () => {
                if (!resolved) {
                    resolved = true;
                    worker.terminate();
                    URL.revokeObjectURL(workerUrl);
                    resolve();
                }
            };

            // Timeout handler
            const timer = setTimeout(() => {
                console.warn(`[AIRunner] AI "${this.name}" timed out after ${this.timeout}ms`);
                cleanup();
            }, this.timeout);

            // Message handler
            worker.onmessage = (e) => {
                clearTimeout(timer);
                const { actions, storage: newStorage, error } = e.data;

                if (error) {
                    console.error(`[AIRunner] AI "${this.name}" error:`, error);
                } else {
                    // Save updated storage
                    if (newStorage) {
                        this.saveStorage(newStorage);
                    }

                    // Execute validated actions
                    this.executeActions(actions || [], game);
                }

                cleanup();
            };

            worker.onerror = (e) => {
                clearTimeout(timer);
                console.error(`[AIRunner] AI "${this.name}" worker error:`, e.message);
                cleanup();
            };

            // Start the worker
            worker.postMessage({
                gameState,
                code: this.code,
                storage,
                maxMoves: this.maxMoves,
                myId: game.currentPlayer.id
            });
        });
    }

    /**
     * Creates the Web Worker code that provides the sandboxed AI API
     */
    createWorkerCode() {
        return `
            // Sandboxed AI Execution Environment
            const actions = [];
            let moveCount = 0;
            let maxMoves = 200;
            let turnEnded = false;
            let gameState = null;
            let myId = null;
            let aiStorage = {};

            // Helper for connected regions (BFS)
            const calculateLargestRegion = (playerId, currentTiles) => {
                const myTiles = currentTiles.filter(t => t.owner === playerId && !t.blocked);
                if (myTiles.length === 0) return 0;

                // Build lookup for O(1) adjacency checks
                const tileSet = new Set(myTiles.map(t => \`\${t.x},\${t.y}\`));

                const seen = new Set();
                let maxRegion = 0;

                for (const tile of myTiles) {
                    const key = \`\${tile.x},\${tile.y}\`;
                    if (seen.has(key)) continue;

                    let size = 0;
                    const queue = [tile];
                    seen.add(key);

                    while (queue.length > 0) {
                        const current = queue.shift();
                        size++;

                        // Check neighbors
                        const directions = [{dx: -1, dy: 0}, {dx: 1, dy: 0}, {dx: 0, dy: -1}, {dx: 0, dy: 1}];
                        for (const {dx, dy} of directions) {
                            const nx = current.x + dx;
                            const ny = current.y + dy;
                            const nKey = \`\${nx},\${ny}\`;
                            
                            if (tileSet.has(nKey) && !seen.has(nKey)) {
                                seen.add(nKey);
                                queue.push({x: nx, y: ny});
                            }
                        }
                    }
                    if (size > maxRegion) maxRegion = size;
                }
                return maxRegion;
            };

            // API exposed to AI code
            const api = {
                // Game state access
                getMyTiles: () => {
                    return gameState.tiles.filter(t => t.owner === myId && !t.blocked);
                },
                
                getEnemyTiles: () => {
                    return gameState.tiles.filter(t => t.owner !== myId && !t.blocked);
                },
                
                getAllTiles: () => {
                    return gameState.tiles.filter(t => !t.blocked);
                },
                
                getAdjacentTiles: (x, y) => {
                    const adjacent = [];
                    const directions = [{dx: -1, dy: 0}, {dx: 1, dy: 0}, {dx: 0, dy: -1}, {dx: 0, dy: 1}];
                    for (const {dx, dy} of directions) {
                        const tile = gameState.tiles.find(t => t.x === x + dx && t.y === y + dy && !t.blocked);
                        if (tile) adjacent.push(tile);
                    }
                    return adjacent;
                },
                
                getTileAt: (x, y) => {
                    return gameState.tiles.find(t => t.x === x && t.y === y && !t.blocked) || null;
                },
                
                // --- NEW API METHODS ---
                getLargestConnectedRegion: (playerId) => {
                    return calculateLargestRegion(playerId, gameState.tiles);
                },

                getReinforcements: (playerId) => {
                    const region = calculateLargestRegion(playerId, gameState.tiles);
                    const player = gameState.players.find(p => p.id === playerId);
                    const stored = player ? (player.storedDice || 0) : 0;
                    return region + stored;
                },

                getPlayerInfo: (playerId) => {
                    return gameState.players.find(p => p.id === playerId) || null;
                },

                simulateAttack: (fromX, fromY, toX, toY) => {
                     // Create a deep copy of tiles for simulation
                     // Optimization: Only clone relevant tiles if possible, but for correctness globally, flat clone is safest and fast enough for 50x50
                     const tilesCopy = gameState.tiles.map(t => ({...t}));
                     
                     const fromTile = tilesCopy.find(t => t.x === fromX && t.y === fromY);
                     const toTile = tilesCopy.find(t => t.x === toX && t.y === toY);

                     if (!fromTile || !toTile || fromTile.owner !== myId || fromTile.dice <= 1) {
                         return { success: false, reason: 'invalid_move' };
                     }

                     const expectedWin = fromTile.dice > toTile.dice;
                     let myReinforcements = 0;
                     let enemyReinforcements = 0;

                     if (expectedWin) {
                         const enemyId = toTile.owner;
                         // Simulate conquest
                         toTile.owner = myId;
                         toTile.dice = fromTile.dice - 1;
                         fromTile.dice = 1;
                         
                         // Calculate new metrics
                         myReinforcements = calculateLargestRegion(myId, tilesCopy);
                         const me = gameState.players.find(p => p.id === myId);
                         if (me) myReinforcements += (me.storedDice || 0);

                         if (enemyId !== null) {
                             enemyReinforcements = calculateLargestRegion(enemyId, tilesCopy);
                             const enemy = gameState.players.find(p => p.id === enemyId);
                             if (enemy) enemyReinforcements += (enemy.storedDice || 0);
                         }
                     } else {
                         // Attack fails
                         fromTile.dice = 1;
                         
                         // Connectivity unchanged
                         myReinforcements = calculateLargestRegion(myId, tilesCopy);
                         const me = gameState.players.find(p => p.id === myId);
                         if (me) myReinforcements += (me.storedDice || 0);
                         
                         // Enemy unchanged (usually)
                         if (enemyId !== null) {
                             enemyReinforcements = calculateLargestRegion(enemyId, tilesCopy);
                             const enemy = gameState.players.find(p => p.id === enemyId);
                             if (enemy) enemyReinforcements += (enemy.storedDice || 0);
                         }
                     }

                     return { 
                         success: true, 
                         expectedWin, 
                         myPredictedReinforcements: myReinforcements,
                         enemyPredictedReinforcements: enemyReinforcements
                     };
                },
                // -----------------------

                // Game info
                get myId() { return myId; },
                get maxDice() { return gameState.maxDice; },
                get diceSides() { return gameState.diceSides; },
                get mapWidth() { return gameState.mapWidth; },
                get mapHeight() { return gameState.mapHeight; },
                get players() { return gameState.players; },
                get turn() { return gameState.turn; },
                
                // Actions
                attack: (fromX, fromY, toX, toY) => {
                    if (turnEnded) {
                        api.log('Warning: Cannot attack after ending turn');
                        return { success: false, reason: 'turn_ended' };
                    }
                    if (moveCount >= maxMoves) {
                        api.log('Warning: Max moves reached');
                        return { success: false, reason: 'max_moves' };
                    }
                    
                    // Basic validation
                    const fromTile = api.getTileAt(fromX, fromY);
                    const toTile = api.getTileAt(toX, toY);
                    
                    if (!fromTile || !toTile) {
                        return { success: false, reason: 'invalid_tiles' };
                    }
                    if (fromTile.owner !== myId) {
                        return { success: false, reason: 'not_your_tile' };
                    }
                    if (toTile.owner === myId) {
                        return { success: false, reason: 'cannot_attack_self' };
                    }
                    if (fromTile.dice <= 1) {
                        return { success: false, reason: 'not_enough_dice' };
                    }
                    
                    // Check adjacency
                    const isAdjacent = Math.abs(fromX - toX) + Math.abs(fromY - toY) === 1;
                    if (!isAdjacent) {
                        return { success: false, reason: 'not_adjacent' };
                    }
                    
                    actions.push({ type: 'attack', fromX, fromY, toX, toY });
                    moveCount++;
                    
                    // Simulate outcome (real outcome determined server-side)
                    // For AI planning, assume win if dice advantage, loss otherwise
                    const expectedWin = fromTile.dice > toTile.dice;
                    if (expectedWin) {
                        // Update local state for planning
                        toTile.owner = myId;
                        toTile.dice = fromTile.dice - 1;
                        fromTile.dice = 1;
                    } else {
                        fromTile.dice = 1;
                    }
                    
                    return { success: true, expectedWin };
                },
                
                endTurn: () => {
                    if (!turnEnded) {
                        turnEnded = true;
                        actions.push({ type: 'endTurn' });
                    }
                },
                
                // Storage (persisted between games)
                save: (key, value) => {
                    aiStorage[key] = value;
                },
                
                load: (key) => {
                    return aiStorage[key];
                },
                
                getAllStorage: () => {
                    return { ...aiStorage };
                },
                
                // Utilities
                log: (msg) => {
                    console.log('[AI]', msg);
                },
                
                // Helper for calculating win probability
                getWinProbability: (attackerDice, defenderDice, diceSides = 6) => {
                    // Simplified probability calculation
                    const avgAttack = attackerDice * (diceSides + 1) / 2;
                    const avgDefend = defenderDice * (diceSides + 1) / 2;
                    const diff = avgAttack - avgDefend;
                    // Rough sigmoid approximation
                    return 1 / (1 + Math.exp(-diff / 2));
                }
            };
    // ... rest of worker code ...
            self.onmessage = function(e) {
                const { gameState: gs, code, storage, maxMoves: mm, myId: id } = e.data;
                gameState = gs;
                myId = id;
                maxMoves = mm;
                aiStorage = storage || {};
                
                try {
                    // Execute AI code
                    const aiFunction = new Function('api', code);
                    aiFunction(api);
                    
                    // Auto-end turn if not explicitly ended
                    if (!turnEnded) {
                        api.endTurn();
                    }
                    
                    self.postMessage({ actions, storage: aiStorage });
                } catch (error) {
                    self.postMessage({ actions: [{ type: 'endTurn' }], error: error.message });
                }
            };
        `;
    }

    /**
     * Serialize game state for the worker
     */
    serializeGameState(game) {
        const width = game.map.width;
        return {
            tiles: game.map.tiles.map((t, idx) => ({
                x: idx % width,
                y: Math.floor(idx / width),
                owner: t.owner,
                dice: t.dice,
                blocked: t.blocked
            })),
            players: game.players.map(p => ({
                id: p.id,
                alive: p.alive,
                isBot: p.isBot,
                storedDice: p.storedDice || 0,
                name: p.name || (p.isBot ? `Bot ${p.id}` : `Player ${p.id}`)
            })),
            maxDice: game.maxDice,
            diceSides: game.diceSides,
            mapWidth: game.map.width,
            mapHeight: game.map.height,
            turn: game.turn
        };
    }

    /**
     * Execute validated actions from the worker
     */
    executeActions(actions, game) {
        for (const action of actions) {
            if (action.type === 'attack') {
                try {
                    game.attack(action.fromX, action.fromY, action.toX, action.toY);
                } catch (e) {
                    // Attack may fail if game state changed - that's ok
                    console.warn(`[AIRunner] Attack failed:`, e.message);
                }
            } else if (action.type === 'endTurn') {
                game.endTurn();
                break; // Stop processing after end turn
            }
        }
    }

    /**
     * Load AI's persistent storage
     */
    loadStorage() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey) || '{}');
        } catch {
            return {};
        }
    }

    /**
     * Save AI's persistent storage
     */
    saveStorage(storage) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(storage));
        } catch (e) {
            console.warn(`[AIRunner] Failed to save storage:`, e.message);
        }
    }
}
