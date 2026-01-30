/**
 * Map Query Utilities
 * These functions provide read-only access to map data
 */

/**
 * Get all tiles owned by a specific player (with coordinates)
 * Returns the original tile objects with x/y properties added
 * so that modifications (like dice++) affect the actual map tiles.
 */
export function getTilesByOwner(map, playerId) {
    const result = [];
    for (let i = 0; i < map.tiles.length; i++) {
        const t = map.tiles[i];
        if (!t.blocked && t.owner === playerId) {
            // Add coordinates directly to the original tile object
            // This ensures modifications affect the actual tile
            t.x = i % map.width;
            t.y = Math.floor(i / map.width);
            result.push(t);
        }
    }
    return result;
}

/**
 * Get count of playable (non-blocked) tiles
 */
export function getPlayableTileCount(map) {
    return map.tiles.filter(t => !t.blocked).length;
}

/**
 * Get a tile at coordinates (returns null if blocked or out of bounds)
 */
export function getTile(map, x, y) {
    if (x < 0 || x >= map.width || y < 0 || y >= map.height) return null;
    const tile = map.tiles[y * map.width + x];
    if (tile.blocked) return null;
    return tile;
}

/**
 * Get a tile at coordinates (returns tile even if blocked, null if out of bounds)
 */
export function getTileRaw(map, x, y) {
    if (x < 0 || x >= map.width || y < 0 || y >= map.height) return null;
    return map.tiles[y * map.width + x];
}

/**
 * Convert x,y coordinates to tile index
 */
export function getTileIndex(map, x, y) {
    return y * map.width + x;
}

/**
 * Get adjacent (non-blocked) tiles with their coordinates
 */
export function getAdjacentTiles(map, x, y) {
    const adjacent = [];
    const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];

    for (const [dx, dy] of directions) {
        const tile = getTile(map, x + dx, y + dy);
        if (tile) {
            adjacent.push({ x: x + dx, y: y + dy, ...tile });
        }
    }
    return adjacent;
}

/**
 * Find the size of the largest connected region for a player
 */
export function findLargestConnectedRegion(map, playerId) {
    const visited = new Set();
    let maxRegionSize = 0;

    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            const idx = getTileIndex(map, x, y);
            const tile = map.tiles[idx];

            if (!tile.blocked && tile.owner === playerId && !visited.has(idx)) {
                const size = measureRegion(map, x, y, playerId, visited);
                if (size > maxRegionSize) {
                    maxRegionSize = size;
                }
            }
        }
    }
    return maxRegionSize;
}

/**
 * Measure the size of a connected region starting from a tile
 */
export function measureRegion(map, startX, startY, playerId, visited) {
    let size = 0;
    const stack = [{ x: startX, y: startY }];
    const startIdx = getTileIndex(map, startX, startY);
    visited.add(startIdx);

    while (stack.length > 0) {
        const { x, y } = stack.pop();
        size++;

        const neighbors = getAdjacentTiles(map, x, y);
        for (const n of neighbors) {
            const nIdx = getTileIndex(map, n.x, n.y);
            if (n.owner === playerId && !visited.has(nIdx)) {
                visited.add(nIdx);
                stack.push({ x: n.x, y: n.y });
            }
        }
    }

    return size;
}
