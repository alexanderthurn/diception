/**
 * Map Generation Algorithms
 * Each generator takes a MapManager instance and modifies its tiles array
 */

import { MAP_GENERATION as CONFIG } from '../constants.js';

/**
 * Generate a full grid with no holes
 */
export function generateFull(map) {
    for (let i = 0; i < map.tiles.length; i++) {
        map.tiles[i].blocked = false;
    }
}

/**
 * Generate narrow winding corridors with choke points
 */
export function generateTunnels(map) {
    const numPaths = CONFIG.TUNNELS_MIN_PATHS + Math.floor(Math.random() * CONFIG.TUNNELS_MAX_ADDITIONAL_PATHS);

    for (let p = 0; p < numPaths; p++) {
        let x = Math.floor(Math.random() * map.width);
        let y = Math.floor(Math.random() * map.height);

        const pathLength = Math.floor(map.width * map.height * CONFIG.TUNNELS_PATH_LENGTH_FACTOR);
        let direction = Math.floor(Math.random() * 4);
        const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];

        for (let i = 0; i < pathLength; i++) {
            if (x >= 0 && x < map.width && y >= 0 && y < map.height) {
                map.tiles[y * map.width + x].blocked = false;
            }

            if (Math.random() < CONFIG.TUNNELS_DIRECTION_CHANGE_CHANCE) {
                direction = Math.floor(Math.random() * 4);
            }

            const [dx, dy] = directions[direction];
            x += dx;
            y += dy;

            if (x < 0) x = 0;
            if (x >= map.width) x = map.width - 1;
            if (y < 0) y = 0;
            if (y >= map.height) y = map.height - 1;
        }
    }

    // Occasionally widen some path sections
    const tempTiles = [...map.tiles.map(t => ({ ...t }))];
    for (let i = 0; i < map.tiles.length; i++) {
        if (!tempTiles[i].blocked && Math.random() < CONFIG.TUNNELS_WIDEN_CHANCE) {
            const x = i % map.width;
            const y = Math.floor(i / map.width);
            const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
            const [dx, dy] = directions[Math.floor(Math.random() * 4)];
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < map.width && ny >= 0 && ny < map.height) {
                map.tiles[ny * map.width + nx].blocked = false;
            }
        }
    }
}

/**
 * Generate a full grid with many small random holes (swiss cheese pattern)
 */
export function generateSwissCheese(map) {
    // Start with all tiles unblocked
    for (let i = 0; i < map.tiles.length; i++) {
        map.tiles[i].blocked = false;
    }

    const holeRange = CONFIG.SWISS_MAX_HOLE_PERCENTAGE - CONFIG.SWISS_MIN_HOLE_PERCENTAGE;
    const holePercentage = CONFIG.SWISS_MIN_HOLE_PERCENTAGE + Math.random() * holeRange;
    const targetHoles = Math.floor(map.width * map.height * holePercentage);
    let holesCreated = 0;
    let attempts = 0;
    const maxAttempts = targetHoles * CONFIG.SWISS_MAX_ATTEMPTS_MULTIPLIER;

    while (holesCreated < targetHoles && attempts < maxAttempts) {
        const idx = Math.floor(Math.random() * map.tiles.length);

        if (!map.tiles[idx].blocked) {
            map.tiles[idx].blocked = true;

            if (arePlayableTilesConnected(map)) {
                holesCreated++;
            } else {
                map.tiles[idx].blocked = false;
            }
        }
        attempts++;
    }
}

/**
 * Generate 2-4 landmasses using noise-like patterns
 */
export function generateContinents(map) {
    const isSmallMap = map.width * map.height < 25;
    const numContinents = isSmallMap ? 2 : (2 + Math.floor(Math.random() * 3));

    const centers = [];
    const avgDim = (map.width + map.height) / 2;
    const minDistance = avgDim * 0.4;

    let attempts = 0;
    while (centers.length < numContinents && attempts < 50) {
        const cx = Math.floor(Math.random() * map.width);
        const cy = Math.floor(Math.random() * map.height);

        let tooClose = false;
        for (const center of centers) {
            const dist = Math.sqrt((cx - center.x) ** 2 + (cy - center.y) ** 2);
            if (dist < minDistance) {
                tooClose = true;
                break;
            }
        }

        if (!tooClose) {
            const maxRadius = minDistance * 0.6;
            const radius = (maxRadius * 0.6) + Math.random() * (maxRadius * 0.4);
            centers.push({ x: cx, y: cy, radius });
        }
        attempts++;
    }

    if (centers.length === 0) {
        centers.push({
            x: Math.floor(map.width / 2),
            y: Math.floor(map.height / 2),
            radius: avgDim / 3
        });
    }

    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            const idx = y * map.width + x;

            for (const center of centers) {
                const dist = Math.sqrt((x - center.x) ** 2 + (y - center.y) ** 2);
                const noise = (Math.random() - 0.5) * center.radius * 0.6;

                if (dist + noise < center.radius) {
                    map.tiles[idx].blocked = false;
                    break;
                }
            }
        }
    }

    // Add bridges between continents
    if (centers.length > 1) {
        for (let i = 0; i < centers.length - 1; i++) {
            createBridge(map, centers[i], centers[i + 1]);
        }
    }
}

/**
 * Generate caves using cellular automata
 */
export function generateCaves(map) {
    // Start with random fill
    for (let i = 0; i < map.tiles.length; i++) {
        map.tiles[i].blocked = Math.random() < CONFIG.CAVES_INITIAL_BLOCK_CHANCE;
    }

    // Run cellular automata iterations
    for (let iter = 0; iter < CONFIG.CAVES_ITERATIONS; iter++) {
        const newTiles = map.tiles.map((t, idx) => {
            const x = idx % map.width;
            const y = Math.floor(idx / map.width);
            const neighbors = countBlockedNeighbors(map, x, y);

            if (neighbors >= CONFIG.CAVES_BLOCK_THRESHOLD) return { ...t, blocked: true };
            if (neighbors <= CONFIG.CAVES_UNBLOCK_THRESHOLD) return { ...t, blocked: false };
            return { ...t };
        });
        map.tiles = newTiles;
    }

    // Carve border
    for (let x = 0; x < map.width; x++) {
        map.tiles[x].blocked = true;
        map.tiles[(map.height - 1) * map.width + x].blocked = true;
    }
    for (let y = 0; y < map.height; y++) {
        map.tiles[y * map.width].blocked = true;
        map.tiles[y * map.width + map.width - 1].blocked = true;
    }
}

/**
 * Generate archipelago with central island and smaller ones around
 */
export function generateIslands(map) {
    const centerX = Math.floor(map.width / 2);
    const centerY = Math.floor(map.height / 2);
    const avgSize = (map.width + map.height) / 2;
    const mainRadius = avgSize / 3;

    // Main island
    carveCircle(map, centerX, centerY, mainRadius);

    // Carve lake in center
    fillCircle(map, centerX, centerY, mainRadius / 3);

    // Smaller islands around
    const numSmallIslands = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < numSmallIslands; i++) {
        const angle = (i / numSmallIslands) * Math.PI * 2;
        const dist = mainRadius + 2 + Math.random() * 3;
        const ix = Math.floor(centerX + Math.cos(angle) * dist);
        const iy = Math.floor(centerY + Math.sin(angle) * dist);
        const radius = 2 + Math.random() * 2;
        carveCircle(map, ix, iy, radius);

        // Bridge to main
        createBridge(map, { x: centerX, y: centerY }, { x: ix, y: iy });
    }
}

/**
 * Generate maze using recursive backtracker algorithm
 */
export function generateMaze(map) {
    const visited = new Set();
    const stack = [];

    const startX = Math.floor(map.width / 2);
    const startY = Math.floor(map.height / 2);

    stack.push({ x: startX, y: startY });
    visited.add(`${startX},${startY}`);
    map.tiles[startY * map.width + startX].blocked = false;

    while (stack.length > 0) {
        const current = stack[stack.length - 1];
        const neighbors = getUnvisitedNeighbors(map, current.x, current.y, visited);

        if (neighbors.length === 0) {
            stack.pop();
        } else {
            const next = neighbors[Math.floor(Math.random() * neighbors.length)];
            visited.add(`${next.x},${next.y}`);
            map.tiles[next.y * map.width + next.x].blocked = false;

            const midX = Math.floor((current.x + next.x) / 2);
            const midY = Math.floor((current.y + next.y) / 2);
            if (midX >= 0 && midX < map.width && midY >= 0 && midY < map.height) {
                map.tiles[midY * map.width + midX].blocked = false;
            }

            stack.push(next);
        }
    }

    // Widen corridors randomly
    for (let i = 0; i < map.tiles.length; i++) {
        if (!map.tiles[i].blocked && Math.random() < 0.3) {
            const x = i % map.width;
            const y = Math.floor(i / map.width);
            const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
            for (const [dx, dy] of directions) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < map.width && ny >= 0 && ny < map.height) {
                    map.tiles[ny * map.width + nx].blocked = false;
                }
            }
        }
    }
}

/**
 * Simple random holes fallback
 */
export function generateSimple(map, holePercentage = 0.2) {
    for (let i = 0; i < map.tiles.length; i++) {
        map.tiles[i].blocked = false;
    }

    const targetHoles = Math.floor(map.width * map.height * holePercentage);
    let holesCreated = 0;
    let attempts = 0;

    while (holesCreated < targetHoles && attempts < targetHoles * 10) {
        const idx = Math.floor(Math.random() * map.tiles.length);
        if (!map.tiles[idx].blocked) {
            map.tiles[idx].blocked = true;
            if (arePlayableTilesConnected(map)) {
                holesCreated++;
            } else {
                map.tiles[idx].blocked = false;
            }
        }
        attempts++;
    }
}

// === HELPER FUNCTIONS ===

/**
 * Create an L-shaped bridge between two points
 */
export function createBridge(map, from, to) {
    const xStart = Math.min(from.x, to.x);
    const xEnd = Math.max(from.x, to.x);
    const yMid = from.y;

    for (let x = xStart; x <= xEnd; x++) {
        if (x >= 0 && x < map.width && yMid >= 0 && yMid < map.height) {
            map.tiles[yMid * map.width + x].blocked = false;
        }
    }

    const yStart = Math.min(from.y, to.y);
    const yEnd = Math.max(from.y, to.y);
    const xMid = to.x;

    for (let y = yStart; y <= yEnd; y++) {
        if (xMid >= 0 && xMid < map.width && y >= 0 && y < map.height) {
            map.tiles[y * map.width + xMid].blocked = false;
        }
    }
}

/**
 * Carve a circle (unblock tiles within radius)
 */
export function carveCircle(map, cx, cy, radius) {
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            const noise = (Math.random() - 0.5) * radius * 0.3;
            if (dist + noise < radius) {
                map.tiles[y * map.width + x].blocked = false;
            }
        }
    }
}

/**
 * Fill a circle (block tiles within radius)
 */
export function fillCircle(map, cx, cy, radius) {
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            if (dist < radius) {
                map.tiles[y * map.width + x].blocked = true;
            }
        }
    }
}

/**
 * Count blocked neighbors (including out-of-bounds as blocked)
 */
export function countBlockedNeighbors(map, x, y) {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) {
                count++;
            } else if (map.tiles[ny * map.width + nx].blocked) {
                count++;
            }
        }
    }
    return count;
}

/**
 * Get unvisited neighbors for maze generation
 */
export function getUnvisitedNeighbors(map, x, y, visited) {
    const neighbors = [];
    const directions = [[0, 2], [2, 0], [0, -2], [-2, 0]];

    for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 1 && nx < map.width - 1 && ny >= 1 && ny < map.height - 1) {
            if (!visited.has(`${nx},${ny}`)) {
                neighbors.push({ x: nx, y: ny });
            }
        }
    }
    return neighbors;
}

/**
 * Check if all playable tiles are connected
 */
export function arePlayableTilesConnected(map) {
    const components = findConnectedComponents(map);
    return components.length <= 1;
}

/**
 * Find all connected components of playable tiles
 */
export function findConnectedComponents(map) {
    const visited = new Set();
    const components = [];

    for (let i = 0; i < map.tiles.length; i++) {
        if (map.tiles[i].blocked || visited.has(i)) continue;

        const component = [];
        const queue = [i];
        visited.add(i);

        while (queue.length > 0) {
            const idx = queue.shift();
            component.push(idx);

            const x = idx % map.width;
            const y = Math.floor(idx / map.width);
            const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];

            for (const [dx, dy] of directions) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < map.width && ny >= 0 && ny < map.height) {
                    const nIdx = ny * map.width + nx;
                    if (!map.tiles[nIdx].blocked && !visited.has(nIdx)) {
                        visited.add(nIdx);
                        queue.push(nIdx);
                    }
                }
            }
        }

        components.push(component);
    }

    return components;
}
