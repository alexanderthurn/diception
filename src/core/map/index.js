/**
 * Map Module Index
 * Re-exports MapManager with all functionality
 */

import * as generators from './map-generators.js';
import * as queries from './map-queries.js';

/** Values allowed in setup / localStorage (not `preset`, which is scenario-only). */
const USER_MAP_STYLES = new Set(['random', 'full', 'continents', 'simple']);

const LEGACY_MAP_STYLE = {
    islands: 'simple',
    sparse: 'simple',
    caves: 'simple',
    maze: 'simple',
    tunnels: 'simple',
    swiss: 'simple',
};

export function normalizeUserMapStyle(style) {
    if (style == null || style === '') return 'random';
    const mapped = LEGACY_MAP_STYLE[style] ?? style;
    if (USER_MAP_STYLES.has(mapped)) return mapped;
    return 'random';
}

export class MapManager {
    constructor() {
        this.width = 0;
        this.height = 0;
        this.tiles = [];
        this.maxDice = 9;
    }

    generateMap(width, height, players, maxDice = 9, mapStyle = 'random', presetLayout = null, rng = null) {
        this.width = width;
        this.height = height;
        this.maxDice = maxDice;
        this._rng = rng == null ? Math.random : rng;
        const totalTiles = width * height;

        // Initialize all as blocked
        this.tiles = new Array(totalTiles).fill(null).map(() => ({ owner: null, dice: 0, blocked: true }));

        // Determine which style to use
        let style = mapStyle === 'preset' ? 'preset' : normalizeUserMapStyle(mapStyle);
        if (style === 'random') {
            const styles = ['continents', 'simple', 'full'];
            style = styles[Math.floor(this._rng() * styles.length)];
        }

        console.log(`Generating ${style} map (${width}x${height})...`);

        if (style === 'preset' && presetLayout) {
            this.applyPresetLayout(presetLayout);
        } else {
            switch (style) {
                case 'full':
                    generators.generateFull(this);
                    break;
                case 'continents':
                    generators.generateContinents(this);
                    break;
                case 'simple':
                    generators.generateSimpleMap(this);
                    break;
                default:
                    generators.generateSimpleMap(this);
            }

            if (style !== 'full') {
                this.ensureConnectivity();
            }
        }

        // Get playable tiles
        const playableIndices = [];
        this.tiles.forEach((tile, idx) => {
            if (!tile.blocked) playableIndices.push(idx);
        });

        const minTiles = Math.min(players.length * 3, totalTiles);
        if (playableIndices.length < minTiles && style !== 'full') {
            generators.expandPlayableUntilMin(this, minTiles);
        }

        // Re-gather playable indices
        const finalPlayable = [];
        this.tiles.forEach((tile, idx) => {
            if (!tile.blocked) finalPlayable.push(idx);
        });

        // Shuffle and assign to players
        for (let i = finalPlayable.length - 1; i > 0; i--) {
            const j = Math.floor(this._rng() * (i + 1));
            [finalPlayable[i], finalPlayable[j]] = [finalPlayable[j], finalPlayable[i]];
        }

        let playerIndex = 0;
        for (const idx of finalPlayable) {
            this.tiles[idx].owner = players[playerIndex].id;
            this.tiles[idx].dice = 1;
            playerIndex = (playerIndex + 1) % players.length;
        }

        this.distributeInitialDice(players, finalPlayable.length);
        this._rng = null;
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
                const randomIndex = Math.floor((this._rng || Math.random)() * eligibleTiles.length);
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

    findLargestConnectedRegionTiles(playerId) {
        return queries.findLargestConnectedRegionTiles(this, playerId);
    }
}

// Re-export for direct access if needed
export { generators, queries };
