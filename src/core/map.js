export class MapManager {
    constructor() {
        this.width = 0;
        this.height = 0;
        this.tiles = [];
    }

    generateMap(width, height, players, maxDice = 9, mapStyle = 'random', presetLayout = null) {
        this.width = width;
        this.height = height;
        this.maxDice = maxDice;
        const totalTiles = width * height;

        // Initialize all as blocked
        this.tiles = new Array(totalTiles).fill(null).map(() => ({ owner: null, dice: 0, blocked: true }));

        // Use the larger dimension for algorithms that need a "size"
        const size = Math.max(width, height);

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
            switch (style) {
                case 'full':
                    this.generateFull();
                    break;
                case 'continents':
                    this.generateContinents();
                    break;
                case 'caves':
                    this.generateCaves();
                    break;
                case 'islands':
                    this.generateIslands();
                    break;
                case 'maze':
                    this.generateMaze();
                    break;
                case 'tunnels':
                    this.generateTunnels();
                    break;
                case 'swiss':
                    this.generateSwissCheese();
                    break;
                default:
                    this.generateContinents();
            }

            // Ensure connectivity (except for full grid which is always connected)
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
            // Fallback to simple generation
            this.generateSimple(0.2);
        }

        // Re-gather playable indices after potential regeneration
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

    // === MAP GENERATION STYLES ===

    applyPresetLayout(tiles) {
        // Mark all specified tiles as unblocked (playable)
        for (const t of tiles) {
            const index = t.y * this.width + t.x;
            if (index >= 0 && index < this.tiles.length) {
                this.tiles[index].blocked = false;
            }
        }
    }

    generateFull() {
        // Complete grid with no holes - all tiles playable
        for (let i = 0; i < this.tiles.length; i++) {
            this.tiles[i].blocked = false;
        }
    }

    generateTunnels() {
        // Create narrow winding corridors with choke points
        // Start all blocked, then carve winding paths

        // Create multiple random winding paths
        const numPaths = 3 + Math.floor(Math.random() * 3);

        for (let p = 0; p < numPaths; p++) {
            // Random start position
            let x = Math.floor(Math.random() * this.width);
            let y = Math.floor(Math.random() * this.height);

            // Carve a winding path
            const pathLength = Math.floor(this.width * this.height * 0.4);
            let direction = Math.floor(Math.random() * 4);
            const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];

            for (let i = 0; i < pathLength; i++) {
                // Mark current tile
                if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
                    this.tiles[y * this.width + x].blocked = false;
                }

                // Randomly change direction (30% chance)
                if (Math.random() < 0.3) {
                    direction = Math.floor(Math.random() * 4);
                }

                // Move in current direction
                const [dx, dy] = directions[direction];
                x += dx;
                y += dy;

                // Wrap around or bounce
                if (x < 0) x = 0;
                if (x >= this.width) x = this.width - 1;
                if (y < 0) y = 0;
                if (y >= this.height) y = this.height - 1;
            }
        }

        // Occasionally widen some path sections
        const tempTiles = [...this.tiles.map(t => ({ ...t }))];
        for (let i = 0; i < this.tiles.length; i++) {
            if (!tempTiles[i].blocked && Math.random() < 0.2) {
                const x = i % this.width;
                const y = Math.floor(i / this.width);
                const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
                const [dx, dy] = directions[Math.floor(Math.random() * 4)];
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                    this.tiles[ny * this.width + nx].blocked = false;
                }
            }
        }
    }

    generateSwissCheese() {
        // Full grid with many small random holes scattered throughout

        // Start with all tiles unblocked
        for (let i = 0; i < this.tiles.length; i++) {
            this.tiles[i].blocked = false;
        }

        // Create many small holes (30-40% of tiles)
        const holePercentage = 0.3 + Math.random() * 0.1;
        const targetHoles = Math.floor(this.width * this.height * holePercentage);
        let holesCreated = 0;
        let attempts = 0;
        const maxAttempts = targetHoles * 20;

        while (holesCreated < targetHoles && attempts < maxAttempts) {
            const idx = Math.floor(Math.random() * this.tiles.length);

            if (!this.tiles[idx].blocked) {
                // Temporarily create hole
                this.tiles[idx].blocked = true;

                // Check if map is still connected
                if (this.arePlayableTilesConnected()) {
                    holesCreated++;
                } else {
                    // Revert if it breaks connectivity
                    this.tiles[idx].blocked = false;
                }
            }
            attempts++;
        }
    }

    generateContinents() {
        // Create 2-4 landmasses using noise-like patterns
        // For very small maps, force 2 continents max to avoid clutter
        const isSmallMap = this.width * this.height < 25;
        const numContinents = isSmallMap ? 2 : (2 + Math.floor(Math.random() * 3));

        const centers = [];
        const avgDim = (this.width + this.height) / 2;

        // Minimum distance between centers to ensure separation
        const minDistance = avgDim * 0.4;

        // Pick continent centers with separation check
        let attempts = 0;
        while (centers.length < numContinents && attempts < 50) {
            const cx = Math.floor(Math.random() * this.width);
            const cy = Math.floor(Math.random() * this.height);

            let tooClose = false;
            for (const center of centers) {
                const dist = Math.sqrt((cx - center.x) ** 2 + (cy - center.y) ** 2);
                if (dist < minDistance) {
                    tooClose = true;
                    break;
                }
            }

            if (!tooClose) {
                // Radius should be smaller than half distance to allow gaps
                // But varied enough to look natural
                const maxRadius = minDistance * 0.6;
                const radius = (maxRadius * 0.6) + Math.random() * (maxRadius * 0.4);

                centers.push({ x: cx, y: cy, radius });
            }
            attempts++;
        }

        // If we couldn't place all, that's fine, we work with what we have (at least 1 usually)
        // If 0 (extremely unlikely), force 1 center
        if (centers.length === 0) {
            centers.push({
                x: Math.floor(this.width / 2),
                y: Math.floor(this.height / 2),
                radius: avgDim / 3
            });
        }

        // Mark tiles based on distance to centers with noise
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const idx = y * this.width + x;

                for (const center of centers) {
                    const dist = Math.sqrt((x - center.x) ** 2 + (y - center.y) ** 2);
                    // More noise for organic look
                    const noise = (Math.random() - 0.5) * center.radius * 0.6;

                    if (dist + noise < center.radius) {
                        this.tiles[idx].blocked = false;
                        // Don't break immediately, let other continents potentially overlap slightly 
                        // (though we try to avoid it via placement) 
                        // actually breaking is fine since it's just OR logic
                        break;
                    }
                }
            }
        }

        // Add bridges between closest continents to ensure playability
        // Connect 0->1, 1->2 etc. effectively a chain valid enough for connectivity
        // For better structure, we can connect each back to previous
        if (centers.length > 1) {
            for (let i = 0; i < centers.length - 1; i++) {
                this.createBridge(centers[i], centers[i + 1]);
            }
        }
    }

    generateCaves() {
        // Cellular automata cave generation
        // Start with random fill
        for (let i = 0; i < this.tiles.length; i++) {
            this.tiles[i].blocked = Math.random() < 0.45;
        }

        // Run cellular automata iterations
        for (let iter = 0; iter < 5; iter++) {
            const newTiles = this.tiles.map((t, idx) => {
                const x = idx % this.width;
                const y = Math.floor(idx / this.width);
                const neighbors = this.countBlockedNeighbors(x, y);

                // 4-5 rule: become blocked if 5+ neighbors are blocked, stay same if 4
                if (neighbors >= 5) return { ...t, blocked: true };
                if (neighbors <= 3) return { ...t, blocked: false };
                return { ...t };
            });
            this.tiles = newTiles;
        }

        // Carve border for aesthetic
        for (let x = 0; x < this.width; x++) {
            this.tiles[x].blocked = true;
            this.tiles[(this.height - 1) * this.width + x].blocked = true;
        }
        for (let y = 0; y < this.height; y++) {
            this.tiles[y * this.width].blocked = true;
            this.tiles[y * this.width + this.width - 1].blocked = true;
        }
    }

    generateIslands() {
        // Create archipelago with central island and smaller ones around
        const centerX = Math.floor(this.width / 2);
        const centerY = Math.floor(this.height / 2);
        const avgSize = (this.width + this.height) / 2;
        const mainRadius = avgSize / 3;

        // Main island
        this.carveCircle(centerX, centerY, mainRadius);

        // Carve lake in center
        this.fillCircle(centerX, centerY, mainRadius / 3);

        // Smaller islands around
        const numSmallIslands = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < numSmallIslands; i++) {
            const angle = (i / numSmallIslands) * Math.PI * 2;
            const dist = mainRadius + 2 + Math.random() * 3;
            const ix = Math.floor(centerX + Math.cos(angle) * dist);
            const iy = Math.floor(centerY + Math.sin(angle) * dist);
            const radius = 2 + Math.random() * 2;
            this.carveCircle(ix, iy, radius);

            // Bridge to main
            this.createBridge({ x: centerX, y: centerY }, { x: ix, y: iy });
        }
    }

    generateMaze() {
        // Start all blocked, then carve maze paths
        // Use recursive backtracker algorithm
        const visited = new Set();
        const stack = [];

        // Start from center
        const startX = Math.floor(this.width / 2);
        const startY = Math.floor(this.height / 2);

        stack.push({ x: startX, y: startY });
        visited.add(`${startX},${startY}`);
        this.tiles[startY * this.width + startX].blocked = false;

        while (stack.length > 0) {
            const current = stack[stack.length - 1];
            const neighbors = this.getUnvisitedNeighbors(current.x, current.y, visited);

            if (neighbors.length === 0) {
                stack.pop();
            } else {
                const next = neighbors[Math.floor(Math.random() * neighbors.length)];
                visited.add(`${next.x},${next.y}`);
                this.tiles[next.y * this.width + next.x].blocked = false;

                // Also carve the cell between current and next for wider corridors
                const midX = Math.floor((current.x + next.x) / 2);
                const midY = Math.floor((current.y + next.y) / 2);
                if (midX >= 0 && midX < this.width && midY >= 0 && midY < this.height) {
                    this.tiles[midY * this.width + midX].blocked = false;
                }

                stack.push(next);
            }
        }

        // Widen corridors randomly
        for (let i = 0; i < this.tiles.length; i++) {
            if (!this.tiles[i].blocked && Math.random() < 0.3) {
                const x = i % this.width;
                const y = Math.floor(i / this.width);
                const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
                for (const [dx, dy] of directions) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                        this.tiles[ny * this.width + nx].blocked = false;
                    }
                }
            }
        }
    }

    generateSimple(holePercentage) {
        // Fallback: simple random holes
        for (let i = 0; i < this.tiles.length; i++) {
            this.tiles[i].blocked = false;
        }

        const targetHoles = Math.floor(this.width * this.height * holePercentage);
        let holesCreated = 0;
        let attempts = 0;

        while (holesCreated < targetHoles && attempts < targetHoles * 10) {
            const idx = Math.floor(Math.random() * this.tiles.length);
            if (!this.tiles[idx].blocked) {
                this.tiles[idx].blocked = true;
                if (this.arePlayableTilesConnected()) {
                    holesCreated++;
                } else {
                    this.tiles[idx].blocked = false;
                }
            }
            attempts++;
        }
    }

    // === HELPER METHODS ===

    createBridge(from, to) {
        // Draw an L-shaped path (Manhattan path) - first horizontal, then vertical
        // This ensures all tiles are orthogonally connected (no diagonals)

        // Horizontal segment
        const xStart = Math.min(from.x, to.x);
        const xEnd = Math.max(from.x, to.x);
        const yMid = from.y; // Use starting y for horizontal segment

        for (let x = xStart; x <= xEnd; x++) {
            if (x >= 0 && x < this.width && yMid >= 0 && yMid < this.height) {
                this.tiles[yMid * this.width + x].blocked = false;
            }
        }

        // Vertical segment
        const yStart = Math.min(from.y, to.y);
        const yEnd = Math.max(from.y, to.y);
        const xMid = to.x; // Use ending x for vertical segment

        for (let y = yStart; y <= yEnd; y++) {
            if (xMid >= 0 && xMid < this.width && y >= 0 && y < this.height) {
                this.tiles[y * this.width + xMid].blocked = false;
            }
        }
    }

    carveCircle(cx, cy, radius) {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
                const noise = (Math.random() - 0.5) * radius * 0.3;
                if (dist + noise < radius) {
                    this.tiles[y * this.width + x].blocked = false;
                }
            }
        }
    }

    fillCircle(cx, cy, radius) {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
                if (dist < radius) {
                    this.tiles[y * this.width + x].blocked = true;
                }
            }
        }
    }

    countBlockedNeighbors(x, y) {
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) {
                    count++; // Out of bounds counts as blocked
                } else if (this.tiles[ny * this.width + nx].blocked) {
                    count++;
                }
            }
        }
        return count;
    }

    getUnvisitedNeighbors(x, y, visited) {
        const neighbors = [];
        const directions = [[0, 2], [2, 0], [0, -2], [-2, 0]]; // Step by 2 for maze

        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 1 && nx < this.width - 1 && ny >= 1 && ny < this.height - 1) {
                if (!visited.has(`${nx},${ny}`)) {
                    neighbors.push({ x: nx, y: ny });
                }
            }
        }
        return neighbors;
    }


    ensureConnectivity() {
        // Find all playable tiles and ensure they're connected
        const playable = [];
        this.tiles.forEach((t, idx) => {
            if (!t.blocked) playable.push(idx);
        });

        if (playable.length === 0) return;

        // Find connected components
        const components = this.findConnectedComponents();

        if (components.length <= 1) return;

        // Connect all components to the largest one
        const largest = components.reduce((a, b) => a.length > b.length ? a : b);

        for (const component of components) {
            if (component === largest) continue;

            // Find closest pair between this component and largest
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
                this.createBridge(closestPair[0], closestPair[1], this.width);
            }
        }
    }

    findConnectedComponents() {
        const visited = new Set();
        const components = [];

        for (let i = 0; i < this.tiles.length; i++) {
            if (this.tiles[i].blocked || visited.has(i)) continue;

            const component = [];
            const queue = [i];
            visited.add(i);

            while (queue.length > 0) {
                const idx = queue.shift();
                component.push(idx);

                const x = idx % this.width;
                const y = Math.floor(idx / this.width);
                const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];

                for (const [dx, dy] of directions) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                        const nIdx = ny * this.width + nx;
                        if (!this.tiles[nIdx].blocked && !visited.has(nIdx)) {
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

    arePlayableTilesConnected() {
        const components = this.findConnectedComponents();
        return components.length <= 1;
    }

    distributeInitialDice(players, playableCount) {
        const tilesPerPlayer = Math.floor(playableCount / players.length);
        // Give enough dice for average of ~2.5 per tile
        const baseDice = Math.floor(tilesPerPlayer * 2.5);

        players.forEach((player, index) => {
            const totalDice = baseDice + index;
            const ownedTiles = this.getTilesByOwner(player.id);

            let currentDiceCount = ownedTiles.length;
            let remainingDice = totalDice - currentDiceCount;

            let safetyCounter = 0;
            while (remainingDice > 0 && safetyCounter < 1000) {
                const nonFullTiles = ownedTiles.filter(t => t.dice < this.maxDice);
                if (nonFullTiles.length === 0) break;

                const randomTile = nonFullTiles[Math.floor(Math.random() * nonFullTiles.length)];
                randomTile.dice++;
                remainingDice--;
                safetyCounter++;
            }
        });
    }

    getTilesByOwner(playerId) {
        return this.tiles.filter(t => !t.blocked && t.owner === playerId);
    }

    getPlayableTileCount() {
        return this.tiles.filter(t => !t.blocked).length;
    }

    getTile(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
        const tile = this.tiles[y * this.width + x];
        if (tile.blocked) return null;
        return tile;
    }

    getTileRaw(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
        return this.tiles[y * this.width + x];
    }

    getTileIndex(x, y) {
        return y * this.width + x;
    }

    getAdjacentTiles(x, y) {
        const adjacent = [];
        const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];

        for (const [dx, dy] of directions) {
            const tile = this.getTile(x + dx, y + dy);
            if (tile) {
                adjacent.push({ x: x + dx, y: y + dy, ...tile });
            }
        }
        return adjacent;
    }

    findLargestConnectedRegion(playerId) {
        const visited = new Set();
        let maxRegionSize = 0;

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const idx = this.getTileIndex(x, y);
                const tile = this.tiles[idx];

                if (!tile.blocked && tile.owner === playerId && !visited.has(idx)) {
                    const size = this.measureRegion(x, y, playerId, visited);
                    if (size > maxRegionSize) {
                        maxRegionSize = size;
                    }
                }
            }
        }
        return maxRegionSize;
    }

    measureRegion(startX, startY, playerId, visited) {
        let size = 0;
        const stack = [{ x: startX, y: startY }];
        const startIdx = this.getTileIndex(startX, startY);
        visited.add(startIdx);

        while (stack.length > 0) {
            const { x, y } = stack.pop();
            size++;

            const neighbors = this.getAdjacentTiles(x, y);
            for (const n of neighbors) {
                const nIdx = this.getTileIndex(n.x, n.y);
                if (n.owner === playerId && !visited.has(nIdx)) {
                    visited.add(nIdx);
                    stack.push({ x: n.x, y: n.y });
                }
            }
        }

        return size;
    }
}
