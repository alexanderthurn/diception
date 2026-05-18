/**
 * Map Generation Algorithms
 * Each generator takes a MapManager instance and modifies its tiles array
 */

import { MAP_GENERATION as CONFIG } from '../constants.js';

function rand(map) {
    const r = map._rng || Math.random;
    return r();
}

function unblock(map, x, y) {
    if (x >= 0 && x < map.width && y >= 0 && y < map.height) {
        map.tiles[y * map.width + x].blocked = false;
    }
}

function countPlayable(map) {
    let n = 0;
    for (let i = 0; i < map.tiles.length; i++) {
        if (!map.tiles[i].blocked) n++;
    }
    return n;
}

/**
 * Generate a full grid with no holes
 */
export function generateFull(map) {
    for (let i = 0; i < map.tiles.length; i++) {
        map.tiles[i].blocked = false;
    }
}

/**
 * "Simple" setup style: start full, remove some random voids while keeping one playable component.
 */
export function generateSimpleMap(map) {
    punchRandomHoles(map, CONFIG.SIMPLE_HOLE_PERCENTAGE);
}

/**
 * Punch random holes; each hole is kept only if the playable region stays connected.
 */
export function punchRandomHoles(map, holePercentage) {
    for (let i = 0; i < map.tiles.length; i++) {
        map.tiles[i].blocked = false;
    }

    const targetHoles = Math.floor(map.width * map.height * holePercentage);
    let holesCreated = 0;
    let attempts = 0;
    const maxAttempts = targetHoles * CONFIG.SIMPLE_MAX_ATTEMPTS_MULTIPLIER;

    while (holesCreated < targetHoles && attempts < maxAttempts) {
        const idx = Math.floor(rand(map) * map.tiles.length);
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
 * Unblock blocked tiles that touch the playable region until at least `minPlayable` cells are playable.
 */
export function expandPlayableUntilMin(map, minPlayable) {
    const cap = Math.min(minPlayable, map.width * map.height);
    const rnd = map._rng || Math.random;

    while (countPlayable(map) < cap) {
        const frontier = [];
        for (let idx = 0; idx < map.tiles.length; idx++) {
            if (!map.tiles[idx].blocked) continue;
            const x = idx % map.width;
            const y = Math.floor(idx / map.width);
            for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < map.width && ny >= 0 && ny < map.height) {
                    const ni = ny * map.width + nx;
                    if (!map.tiles[ni].blocked) {
                        frontier.push(idx);
                        break;
                    }
                }
            }
        }
        if (frontier.length === 0) break;
        const pick = frontier[Math.floor(rnd() * frontier.length)];
        map.tiles[pick].blocked = false;
    }
}

function unblockRect(map, x0, y0, x1, y1) {
    const xa = Math.max(0, Math.min(x0, x1));
    const xb = Math.min(map.width - 1, Math.max(x0, x1));
    const ya = Math.max(0, Math.min(y0, y1));
    const yb = Math.min(map.height - 1, Math.max(y0, y1));
    for (let y = ya; y <= yb; y++) {
        for (let x = xa; x <= xb; x++) {
            map.tiles[y * map.width + x].blocked = false;
        }
    }
}

/** Anchor inside a corner s×s block, biased toward map centre (for 2×2 bridges). */
function cornerAnchor(w, h, s, corner) {
    switch (corner) {
        case 'tl':
            return { x: Math.min(w - 1, Math.max(0, s - 1)), y: Math.min(h - 1, Math.max(0, s - 1)) };
        case 'tr':
            return { x: Math.min(w - 1, Math.max(0, w - s)), y: Math.min(h - 1, Math.max(0, s - 1)) };
        case 'bl':
            return { x: Math.min(w - 1, Math.max(0, s - 1)), y: Math.min(h - 1, Math.max(0, h - s)) };
        case 'br':
            return { x: Math.min(w - 1, Math.max(0, w - s)), y: Math.min(h - 1, Math.max(0, h - s)) };
        default:
            return { x: 0, y: 0 };
    }
}

function continentCornerSizeTwo(w, h) {
    const minDim = Math.min(w, h);
    // 5×5 (or any board with both sides ≥5): two opposite 3×3 corners; they may meet at one cell diagonally.
    if (minDim >= 5 && w >= 5 && h >= 5) {
        return Math.min(3, w, h);
    }
    let s = Math.min(3, Math.max(1, Math.floor(minDim / 2)));
    while (s > 1 && (s > w || s > h)) s--;
    return s;
}

function continentCornerSizeFour(map, w, h, minDim) {
    let s = minDim >= 14
        ? Math.min(8, Math.max(4, Math.floor(minDim * (0.23 + rand(map) * 0.05))))
        : Math.min(6, Math.max(3, Math.floor(minDim * (0.2 + rand(map) * 0.04))));
    while (s > 1 && (2 * s > w || 2 * s > h)) {
        s--;
    }
    return Math.max(2, s);
}

function ensureContinentHalfCoverage(map) {
    const total = map.width * map.height;
    const need = Math.ceil(total * 0.5);
    if (countPlayable(map) < need) {
        expandPlayableUntilMin(map, need);
    }
}

/** Two diagonal corner blocks (≤6×6 style), linked with 2×2 L-bridge. */
function generateContinentsTwoCorners(map) {
    const w = map.width;
    const h = map.height;
    const rnd = () => rand(map);
    const s = continentCornerSizeTwo(w, h);
    const tlBr = rnd() < 0.5;

    const addInnerNub = (cornerId) => {
        const isHoriz = rnd() < 0.5;
        const mid = Math.floor(s / 2);
        let nubX, nubY;
        switch (cornerId) {
            case 'tl':
                if (isHoriz) { nubX = s; nubY = mid; }
                else         { nubX = mid; nubY = s; }
                break;
            case 'br':
                if (isHoriz) { nubX = w - s - 1; nubY = h - s + mid; }
                else         { nubX = w - s + mid; nubY = h - s - 1; }
                break;
            case 'bl':
                if (isHoriz) { nubX = s; nubY = h - s + mid; }
                else         { nubX = mid; nubY = h - s - 1; }
                break;
            case 'tr':
                if (isHoriz) { nubX = w - s - 1; nubY = mid; }
                else         { nubX = w - s + mid; nubY = s; }
                break;
        }
        unblock(map, nubX, nubY);
    };

    if (tlBr) {
        unblockRect(map, 0, 0, s - 1, s - 1);
        unblockRect(map, w - s, h - s, w - 1, h - 1);
        createBridge2x2(map, cornerAnchor(w, h, s, 'tl'), cornerAnchor(w, h, s, 'br'));
        addInnerNub('tl');
        addInnerNub('br');
    } else {
        unblockRect(map, 0, h - s, s - 1, h - 1);
        unblockRect(map, w - s, 0, w - 1, s - 1);
        createBridge2x2(map, cornerAnchor(w, h, s, 'bl'), cornerAnchor(w, h, s, 'tr'));
        addInnerNub('bl');
        addInnerNub('tr');
    }
}

/** Four corner continents + ring chain (TL→TR→BR→BL) with 2×2 corridors. */
function generateContinentsFourCorners(map) {
    const w = map.width;
    const h = map.height;
    const minDim = Math.min(w, h);
    const s = continentCornerSizeFour(map, w, h, minDim);

    unblockRect(map, 0, 0, s - 1, s - 1);
    unblockRect(map, w - s, 0, w - 1, s - 1);
    unblockRect(map, 0, h - s, s - 1, h - 1);
    unblockRect(map, w - s, h - s, w - 1, h - 1);

    const tl = cornerAnchor(w, h, s, 'tl');
    const tr = cornerAnchor(w, h, s, 'tr');
    const br = cornerAnchor(w, h, s, 'br');
    const bl = cornerAnchor(w, h, s, 'bl');

    createBridge2x2(map, tl, tr);
    createBridge2x2(map, tr, br);
    createBridge2x2(map, br, bl);
}

/**
 * Corner “continent” layouts: two diagonals on small boards (≤6 min side), four corners + ring paths
 * when larger. Guarantees ≥50% playable by growing from the land frontier if needed.
 */
export function generateContinents(map) {
    const w = map.width;
    const h = map.height;
    const minDim = Math.min(w, h);

    if (minDim <= 1 && w * h <= 1) {
        unblock(map, 0, 0);
    } else if (minDim <= 6) {
        generateContinentsTwoCorners(map);
    } else {
        generateContinentsFourCorners(map);
    }

    ensureContinentHalfCoverage(map);
}

/**
 * L-shaped link with a **2×2** cross-section (each leg is two cells thick in both axes along that leg).
 * Used between continent cores; auto-repair in `ensureConnectivity` still uses `createBridge`.
 */
export function createBridge2x2(map, from, to) {
    const xa = Math.min(from.x, to.x);
    const xb = Math.max(from.x, to.x);
    const y0 = from.y;
    for (let x = xa; x <= xb; x++) {
        for (let dx = 0; dx < 2; dx++) {
            for (let oy = 0; oy < 2; oy++) {
                unblock(map, x + dx, y0 + oy);
            }
        }
    }

    const ya = Math.min(from.y, to.y);
    const yb = Math.max(from.y, to.y);
    const x0 = to.x;
    for (let y = ya; y <= yb; y++) {
        for (let dy = 0; dy < 2; dy++) {
            for (let ox = 0; ox < 2; ox++) {
                unblock(map, x0 + ox, y + dy);
            }
        }
    }
}

/**
 * L-shaped link between two points, carved **two cells wide** on the perpendicular axis.
 */
export function createBridge(map, from, to) {
    const xStart = Math.min(from.x, to.x);
    const xEnd = Math.max(from.x, to.x);
    const yMid = from.y;

    const horizOff = yMid + 1 < map.height ? 1 : (yMid - 1 >= 0 ? -1 : 0);
    for (let x = xStart; x <= xEnd; x++) {
        unblock(map, x, yMid);
        if (horizOff !== 0) unblock(map, x, yMid + horizOff);
    }

    const yStart = Math.min(from.y, to.y);
    const yEnd = Math.max(from.y, to.y);
    const xMid = to.x;

    const vertOff = xMid + 1 < map.width ? 1 : (xMid - 1 >= 0 ? -1 : 0);
    for (let y = yStart; y <= yEnd; y++) {
        unblock(map, xMid, y);
        if (vertOff !== 0) unblock(map, xMid + vertOff, y);
    }
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
