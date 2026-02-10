/**
 * Map Module Index
 * Re-exports MapManager with all functionality
 */

import * as generators from './map-generators.js';
import * as queries from './map-queries.js';

export class MapManager {
    constructor() {
        this.width = 0;
        this.height = 0;
        this.tiles = [];
        this.maxDice = 9;
    }

    generateMap(width, height, players, maxDice = 9, mapStyle = 'random', presetLayout = null) {
        this.width = width;
        this.height = height;
        this.maxDice = maxDice;
        const totalTiles = width * height;

        // Initialize all as blocked
        this.tiles = new Array(totalTiles).fill(null).map(() => ({ owner: null, dice: 0, blocked: true }));

        // Determine which style to use
        let style = mapStyle;
        if (mapStyle === 'random') {
            const styles = ['continents', 'caves', 'islands', 'maze'];
            style = styles[Math.floor(Math.random() * styles.length)];
        }

        console.log(`Generating ${style} map (${width}x${height})...`);

        if (style === 'preset' && presetLayout) {
            this.applyPresetLayout(presetLayout);
        } else {
            // Use the generator functions
            switch (style) {
                case 'full':
                    generators.generateFull(this);
                    break;
                case 'continents':
                    generators.generateContinents(this);
                    break;
                case 'caves':
                    generators.generateCaves(this);
                    break;
                case 'islands':
                    generators.generateIslands(this);
                    break;
                case 'maze':
                    generators.generateMaze(this);
                    break;
                case 'tunnels':
                    generators.generateTunnels(this);
                    break;
                case 'swiss':
                    generators.generateSwissCheese(this);
                    break;
                default:
                    generators.generateContinents(this);
            }

            // Ensure connectivity (except for full grid)
            if (style !== 'full') {
                this.ensureConnectivity();
            }
        }

        // Get playable tiles
        const playableIndices = [];
        this.tiles.forEach((tile, idx) => {
            if (!tile.blocked) playableIndices.push(idx);
        });

        // Need minimum tiles for players
        const minTiles = players.length * 4;
        if (playableIndices.length < minTiles && style !== 'full') {
            generators.generateSimple(this, 0.2);
        }

        // Re-gather playable indices
        const finalPlayable = [];
        this.tiles.forEach((tile, idx) => {
            if (!tile.blocked) finalPlayable.push(idx);
        });

        // Shuffle and assign to players
        for (let i = finalPlayable.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [finalPlayable[i], finalPlayable[j]] = [finalPlayable[j], finalPlayable[i]];
        }

        let playerIndex = 0;
        for (const idx of finalPlayable) {
            this.tiles[idx].owner = players[playerIndex].id;
            this.tiles[idx].dice = 1;
            playerIndex = (playerIndex + 1) % players.length;
        }

        this.distributeInitialDice(players, finalPlayable.length);
    }

    applyPresetLayout(tiles) {
        for (const t of tiles) {
            const index = t.y * this.width + t.x;
            if (index >= 0 && index < this.tiles.length) {
                this.tiles[index].blocked = false;
            }
        }
    }

    ensureConnectivity() {
        const playable = [];
        this.tiles.forEach((t, idx) => {
            if (!t.blocked) playable.push(idx);
        });

        if (playable.length === 0) return;

        const components = generators.findConnectedComponents(this);

        if (components.length <= 1) return;

        const largest = components.reduce((a, b) => a.length > b.length ? a : b);

        for (const component of components) {
            if (component === largest) continue;

            let minDist = Infinity;
            let closestPair = null;

            for (const idx1 of component) {
                const x1 = idx1 % this.width;
                const y1 = Math.floor(idx1 / this.width);

                for (const idx2 of largest) {
                    const x2 = idx2 % this.width;
                    const y2 = Math.floor(idx2 / this.width);
                    const dist = Math.abs(x1 - x2) + Math.abs(y1 - y2);

                    if (dist < minDist) {
                        minDist = dist;
                        closestPair = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
                    }
                }
            }

            if (closestPair) {
                generators.createBridge(this, closestPair[0], closestPair[1]);
            }
        }
    }

    distributeInitialDice(players, playableCount) {
        const tilesPerPlayer = Math.floor(playableCount / players.length);
        const baseDice = Math.floor(tilesPerPlayer * 2.5);

        players.forEach((player, index) => {
            const totalDice = baseDice + index;
            const ownedTiles = this.getTilesByOwner(player.id);

            let currentDiceCount = ownedTiles.length;
            let remainingDice = totalDice - currentDiceCount;

            // Optimization: Filter once and maintain list
            const eligibleTiles = ownedTiles.filter(t => t.dice < this.maxDice);

            while (remainingDice > 0 && eligibleTiles.length > 0) {
                const randomIndex = Math.floor(Math.random() * eligibleTiles.length);
                const randomTile = eligibleTiles[randomIndex];

                randomTile.dice++;
                remainingDice--;

                // If tile becomes full, remove it from eligible list
                if (randomTile.dice >= this.maxDice) {
                    eligibleTiles[randomIndex] = eligibleTiles[eligibleTiles.length - 1];
                    eligibleTiles.pop();
                }
            }
        });
    }

    // === Query Methods (delegate to queries module) ===

    getTilesByOwner(playerId) {
        return queries.getTilesByOwner(this, playerId);
    }

    getPlayableTileCount() {
        return queries.getPlayableTileCount(this);
    }

    getTile(x, y) {
        return queries.getTile(this, x, y);
    }

    getTileRaw(x, y) {
        return queries.getTileRaw(this, x, y);
    }

    getTileIndex(x, y) {
        return queries.getTileIndex(this, x, y);
    }

    getAdjacentTiles(x, y) {
        return queries.getAdjacentTiles(this, x, y);
    }

    findLargestConnectedRegion(playerId) {
        return queries.findLargestConnectedRegion(this, playerId);
    }
}

// Re-export for direct access if needed
export { generators, queries };
