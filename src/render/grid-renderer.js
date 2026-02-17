import { Graphics, Container, Text, TextStyle, Sprite } from 'pixi.js';
import { TileRenderer } from './tile-renderer.js';
import { RENDER } from '../core/constants.js';
import { getWinProbability, getProbabilityHexColor } from '../core/probability.js';
import { shouldShowInputHints, getInputHint, ACTION_MOVE_UP, ACTION_MOVE_DOWN, ACTION_MOVE_LEFT, ACTION_MOVE_RIGHT, ACTION_ATTACK } from '../ui/input-hints.js';

export class GridRenderer {
    constructor(stage, game, animator, inputManager = null) {
        this.stage = stage;
        this.game = game;
        this.animator = animator;
        this.inputManager = inputManager;
        this.container = new Container();
        this.stage.addChild(this.container);

        // Container for overlays (selection, hover)
        this.overlayContainer = new Container();
        this.stage.addChild(this.overlayContainer); // Above tiles

        // Container for temporary animations (so they don't get cleared by drawOverlay)
        this.animationContainer = new Container();
        this.stage.addChild(this.animationContainer);

        // Container for probability badges and input hints (always on top)
        this.hintsContainer = new Container();
        this.stage.addChild(this.hintsContainer);

        this.tileSize = RENDER.DEFAULT_TILE_SIZE;
        this.gap = RENDER.DEFAULT_GAP;

        // Styling
        this.textStyle = new TextStyle({
            fontFamily: 'Arial',
            fontSize: 24,
            fontWeight: 'bold',
            fill: '#ffffff',
            dropShadowDistance: 2,
        });

        this.selectedTile = null; // {x, y}
        this.hoverTile = null; // {x, y}
        this.cursorTile = null; // {x, y} - keyboard/gamepad cursor
        this.cursorPulse = 0; // For animation
        this.gameSpeed = 'beginner'; // Speed level: beginner, normal, fast
        this.diceSides = 6; // Default 6-sided dice
        this.effectsQuality = 'high'; // Effects quality: off, low, high

        // Shimmer animation for largest region border
        this.shimmerTime = 0;
        this.shimmerContainer = new Container();
        this.shimmerGraphics = null; // Reusable shimmer graphics
        this.stage.addChild(this.shimmerContainer);

        // Cache for current player's largest region edges
        this.currentPlayerRegionEdges = [];
        this.currentPlayerSecondaryRegionEdges = []; // For smaller regions

        // Editor paint mode (neutral rendering)
        this.paintMode = false;
        // Show map bounds (editor) - outline of full grid
        this.showMapBounds = false;

        // === PERFORMANCE: Tile caching ===
        // Pool of tile containers indexed by tile index
        this.tileCache = new Map();
        // Track last known state for dirty checking
        this.lastTileStates = new Map();
        // Track last current player for region highlighting changes
        this.lastCurrentPlayerId = null;
        // Track if full redraw is needed
        this.needsFullRedraw = true;

        // Text style for probability badges
        this.probabilityTextStyle = new TextStyle({
            fontFamily: 'Arial',
            fontSize: 12,
            fontWeight: 'bold',
            fill: '#ffffff',
        });

        // Text style for input hints
        this.hintTextStyle = new TextStyle({
            fontFamily: 'Arial',
            fontSize: 11,
            fontWeight: 'bold',
            fill: '#00ffff',
        });

        // === PERFORMANCE: Caching & Reuse ===
        this.largestRegionsCache = new Map();
        this.regionsValid = false;

        // Persistent overlay elements
        this.selectionGfx = new Graphics();
        this.hoverGfx = new Graphics();
        this.cursorGfx = new Graphics();
        this.neighborHighlighters = []; // Pool of Graphics
        this.probabilityBadges = []; // Pool of Containers

        this.overlayContainer.addChild(this.selectionGfx);
        this.overlayContainer.addChild(this.hoverGfx);
        this.overlayContainer.addChild(this.cursorGfx);
    }

    /**
     * Mark the grid as needing a full redraw (e.g., after map change)
     */
    invalidate() {
        this.needsFullRedraw = true;
        this.lastTileStates.clear();
        this.invalidateRegions();
    }

    /**
     * Mark regions as needing recalculation
     */
    invalidateRegions() {
        this.regionsValid = false;
        this.largestRegionsCache.clear();
    }

    /**
     * Check if a tile needs redrawing based on its current state
     */
    isTileDirty(tileIdx, tileRaw, isCurrentPlayer, isInRegion) {
        const lastState = this.lastTileStates.get(tileIdx);
        if (!lastState) return true;

        return lastState.owner !== tileRaw.owner ||
            lastState.dice !== tileRaw.dice ||
            lastState.blocked !== tileRaw.blocked ||
            lastState.isCurrentPlayer !== isCurrentPlayer ||
            lastState.isInRegion !== isInRegion;
    }

    /**
     * Store the current state of a tile for future dirty checking
     */
    saveTileState(tileIdx, tileRaw, isCurrentPlayer, isInRegion) {
        this.lastTileStates.set(tileIdx, {
            owner: tileRaw.owner,
            dice: tileRaw.dice,
            blocked: tileRaw.blocked,
            isCurrentPlayer,
            isInRegion
        });
    }

    setPaintMode(enabled) {
        this.paintMode = enabled;
    }

    setShowMapBounds(enabled) {
        this.showMapBounds = enabled;
        this.needsFullRedraw = true;
    }

    setGameSpeed(speed) {
        this.gameSpeed = speed;
    }

    setDiceSides(sides) {
        this.diceSides = sides;
    }

    setEffectsQuality(quality) {
        this.effectsQuality = quality;
    }

    setSelection(x, y) {
        if (x === null) this.selectedTile = null;
        else this.selectedTile = { x, y };
        this.drawOverlay(); // Redraw highlighting
    }

    setHover(x, y) {
        if (x === null) this.hoverTile = null;
        else this.hoverTile = { x, y };
        this.drawOverlay();
    }

    setCursor(x, y) {
        if (x === null) this.cursorTile = null;
        else this.cursorTile = { x, y };
        this.drawOverlay();
    }

    draw() {
        const map = this.game.map;
        const currentPlayer = this.game.currentPlayer;
        const currentPlayerId = currentPlayer?.id;

        // Check if current player changed (requires full region recalculation)
        const playerChanged = this.lastCurrentPlayerId !== currentPlayerId;
        if (playerChanged) {
            this.lastCurrentPlayerId = currentPlayerId;
        }

        // Full redraw needed if map structure changed or it's the first draw
        const needsFullRedraw = this.needsFullRedraw ||
            this.tileCache.size === 0 ||
            this.tileCache.size !== map.width * map.height;

        if (needsFullRedraw) {
            // Clear everything for full redraw
            this.container.removeChildren();
            this.tileCache.clear();
            this.lastTileStates.clear();
            this.needsFullRedraw = false;
        }

        const mapPixelWidth = map.width * (this.tileSize + this.gap);
        const mapPixelHeight = map.height * (this.tileSize + this.gap);

        this.container.x = 0;
        this.container.y = 0;
        this.overlayContainer.x = 0;
        this.overlayContainer.y = 0;
        this.hintsContainer.x = 0;
        this.hintsContainer.y = 0;

        // Ensure hints are always on top of EVERYTHING (including shimmer)
        this.stage.addChild(this.hintsContainer);

        // Map bounds border (editor) - clear outline of full grid
        if (this.showMapBounds && needsFullRedraw) {
            const borderGfx = new Graphics();
            const pad = 4;
            borderGfx.rect(-pad, -pad, mapPixelWidth + pad * 2 - this.gap, mapPixelHeight + pad * 2 - this.gap);
            borderGfx.stroke({ width: 4, color: 0x00ffff, alpha: 0.85, join: 'miter', cap: 'square' });
            this.container.addChild(borderGfx);
        }

        // Get ALL connected regions for ALL alive players (cached)
        // Structure: { largest: Set<idx>, others: Array<Set<idx>> }
        if (!this.regionsValid) {
            this.largestRegionsCache.clear();
            for (const player of this.game.players) {
                if (player.alive) {
                    this.largestRegionsCache.set(player.id, this.getPlayerRegions(player.id));
                }
            }
            this.regionsValid = true;
        }
        const playerRegions = this.largestRegionsCache;

        // Clear and recollect edges for current player's shimmer effect
        this.currentPlayerRegionEdges = [];
        this.currentPlayerSecondaryRegionEdges = [];

        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                const tileIdx = map.getTileIndex(x, y);
                const tileRaw = map.getTileRaw(x, y);
                const isCurrentPlayer = tileRaw.owner === currentPlayerId;

                const regionsData = playerRegions.get(tileRaw.owner);
                const largestRegion = regionsData?.largest;
                const otherRegions = regionsData?.others || [];

                const isInLargestRegion = largestRegion?.has(tileIdx) || false;
                // Check if in secondary (non-largest) region
                let isInSecondaryRegion = false;
                if (!isInLargestRegion && isCurrentPlayer) {
                    for (const region of otherRegions) {
                        if (region.has(tileIdx)) {
                            isInSecondaryRegion = true;
                            break;
                        }
                    }
                }

                // Treat both largest and secondary regions as "active" for border drawing purposes?
                // The user requested "comets at every territory... but on the others... smaller and slower"
                // This implies all regions get the "region border" treatment
                const isRegionTile = isInLargestRegion || isInSecondaryRegion;

                // Check if this tile needs redrawing
                const isDirty = needsFullRedraw ||
                    playerChanged ||
                    this.isTileDirty(tileIdx, tileRaw, isCurrentPlayer, isRegionTile);

                if (isDirty) {
                    // Remove old cached tile if it exists
                    const oldTile = this.tileCache.get(tileIdx);
                    if (oldTile) {
                        oldTile.destroy({ children: true });
                        this.tileCache.delete(tileIdx);
                    }

                    // Create new tile
                    const tileContainer = this.createTileContainer(x, y, tileRaw, currentPlayer, isCurrentPlayer, isRegionTile, playerRegions, map);
                    this.container.addChild(tileContainer);
                    this.tileCache.set(tileIdx, tileContainer);

                    // Save state for future dirty checking
                    this.saveTileState(tileIdx, tileRaw, isCurrentPlayer, isRegionTile);
                }

                // Always collect shimmer edges for current human player
                if (!tileRaw.blocked && isCurrentPlayer && !this.paintMode && !currentPlayer.isBot) {
                    if (isInLargestRegion) {
                        this.collectShimmerEdges(x, y, tileRaw, map, this.currentPlayerRegionEdges);
                    } else if (isInSecondaryRegion) {
                        this.collectShimmerEdges(x, y, tileRaw, map, this.currentPlayerSecondaryRegionEdges);
                    }
                }
            }
        }

        this.drawOverlay();
    }

    /**
     * Create a tile container with all graphics
     */
    createTileContainer(x, y, tileRaw, currentPlayer, isCurrentPlayer, isInRegion, playerRegions, map) {
        const tileContainer = new Container();
        tileContainer.x = x * (this.tileSize + this.gap);
        tileContainer.y = y * (this.tileSize + this.gap);

        const tileGfx = new Graphics();

        // Handle blocked tiles
        if (tileRaw.blocked) {
            tileGfx.rect(0, 0, this.tileSize, this.tileSize);
            tileGfx.fill({ color: 0x080818, alpha: 0.0 });
            tileContainer.addChild(tileGfx);
            return tileContainer;
        }

        const owner = this.game.players.find(p => p.id === tileRaw.owner);
        const color = owner ? owner.color : 0x333333;

        // Tron style: Bright fill
        const fillAlpha = isCurrentPlayer ? 0.5 : 0.4;

        tileGfx.rect(0, 0, this.tileSize, this.tileSize);

        if (this.paintMode) {
            // Paint mode: Neutral gray, no numbers, simple border
            tileGfx.fill({ color: 0x444444, alpha: 0.8 });
            tileGfx.stroke({ width: 1, color: 0x666666, alpha: 0.8, join: 'miter', cap: 'square' });
        } else {
            // Normal game mode
            tileGfx.fill({ color: color, alpha: fillAlpha });

            // Border logic - REMOVED per user request
            // We rely on fill color difference and region borders
            // UPDATE: User requested subtle 1px inner border
            // Smart borders: Only draw borders separating different colors
            // This prevents "gray borders between tiles of the same color"
            this.drawSmartBorders(tileGfx, x, y, tileRaw, map);

            // Draw OUTER borders for any region tiles (largest or secondary)
            if (isInRegion && isCurrentPlayer && !currentPlayer.isBot) {
                this.drawRegionBorders(tileGfx, x, y, tileRaw, currentPlayer, isCurrentPlayer, color, map);
            }
        }

        tileContainer.addChild(tileGfx);

        // Dice rendering (skip in paint mode)
        if (!this.paintMode) {
            const diceColor = isCurrentPlayer ? null : color;
            this.renderDice(tileContainer, tileRaw.dice, diceColor);
        }

        return tileContainer;
    }

    /**
     * Draw smart borders only on edges that face a different owner
     */
    drawSmartBorders(tileGfx, x, y, tileRaw, map) {
        const edgeDefs = [
            { dx: 0, dy: -1, x1: 0, y1: 0, x2: this.tileSize, y2: 0 }, // Top
            { dx: 0, dy: 1, x1: 0, y1: this.tileSize, x2: this.tileSize, y2: this.tileSize }, // Bottom
            { dx: -1, dy: 0, x1: 0, y1: 0, x2: 0, y2: this.tileSize }, // Left
            { dx: 1, dy: 0, x1: this.tileSize, y1: 0, x2: this.tileSize, y2: this.tileSize } // Right
        ];

        // Gather all styles to group strokes by color/alpha for fewer draw calls and better corners
        const drawPasses = new Map();

        const humanPlayer = this.game.players.find(p => !p.isBot);
        const humanId = humanPlayer ? humanPlayer.id : null;
        const isHumanActive = this.game.currentPlayer && this.game.currentPlayer.id === humanId;

        for (const edge of edgeDefs) {
            const nx = x + edge.dx;
            const ny = y + edge.dy;
            const neighbor = map.getTileRaw(nx, ny);

            let shouldDraw = !neighbor || neighbor.blocked || neighbor.owner !== tileRaw.owner;

            // Do not draw smart border if the neighbor is the active human player
            // (The human player's region borders will handle this boundary)
            if (shouldDraw && isHumanActive && neighbor && neighbor.owner === humanId) {
                shouldDraw = false;
            }

            if (shouldDraw) {
                const isMapEdgeOrBlocked = !neighbor || neighbor.blocked;
                const width = 2; // Increased to 2 per user request

                const owner = this.game.players.find(p => p.id === tileRaw.owner);
                let color = owner ? owner.color : 0xffffff;
                let alpha = 1.0;

                if (!isMapEdgeOrBlocked) {
                    const isPlayerInvolved = isHumanActive && (tileRaw.owner === humanId || (neighbor && neighbor.owner === humanId));
                    if (!isPlayerInvolved) {
                        alpha = 0;
                    }
                }

                if (alpha === 0) continue;

                const key = `${color}-${alpha}-${width}`;
                if (!drawPasses.has(key)) drawPasses.set(key, { color, alpha, width, edges: [] });
                drawPasses.get(key).edges.push(edge);
            }
        }

        for (const pass of drawPasses.values()) {
            for (const edge of pass.edges) {
                // Directional drawing to assist 'inner' (alignment: 0) detection
                // CW: Top (L->R), Right (T->B), Bottom (R->L), Left (B->T)
                let x1 = edge.x1, y1 = edge.y1, x2 = edge.x2, y2 = edge.y2;
                if (edge.dy === 1) { // Bottom: should be R->L
                    x1 = edge.x2; x2 = edge.x1;
                } else if (edge.dx === -1) { // Left: should be B->T
                    y1 = edge.y2; y2 = edge.y1;
                }

                tileGfx.moveTo(x1, y1);
                tileGfx.lineTo(x2, y2);
            }
            tileGfx.stroke({
                width: pass.width,
                color: pass.color,
                alpha: pass.alpha,
                join: 'miter',
                cap: 'butt',
                alignment: 0 // Inner
            });
        }
    }

    /**
     * Draw outer borders for tiles in the largest connected region
     */
    drawRegionBorders(tileGfx, x, y, tileRaw, currentPlayer, isCurrentPlayer, color, map) {
        const edgeDefs = [
            { dx: 0, dy: -1, x1: 0, y1: 0, x2: this.tileSize, y2: 0 },
            { dx: 0, dy: 1, x1: 0, y1: this.tileSize, x2: this.tileSize, y2: this.tileSize },
            { dx: -1, dy: 0, x1: 0, y1: 0, x2: 0, y2: this.tileSize },
            { dx: 1, dy: 0, x1: this.tileSize, y1: 0, x2: this.tileSize, y2: this.tileSize }
        ];

        for (const edge of edgeDefs) {
            const nx = x + edge.dx;
            const ny = y + edge.dy;
            const neighbor = map.getTileRaw(nx, ny);

            const isOuterEdge = !neighbor || neighbor.blocked || neighbor.owner !== tileRaw.owner;

            if (isOuterEdge) {
                let borderColor;
                if (isCurrentPlayer) {
                    borderColor = currentPlayer.isBot ? color : 0xffffff;
                } else {
                    const r = (color >> 16) & 0xFF;
                    const g = (color >> 8) & 0xFF;
                    const b = color & 0xFF;
                    borderColor = ((r * 0.6) << 16) | ((g * 0.6) << 8) | (b * 0.6);
                    borderColor = 0xffffff;
                }

                // Directional drawing to assist 'inner' (alignment: 0) detection
                // CW: Top (L->R), Right (T->B), Bottom (R->L), Left (B->T)
                let x1 = edge.x1, y1 = edge.y1, x2 = edge.x2, y2 = edge.y2;
                if (edge.dy === 1) { // Bottom
                    x1 = edge.x2; x2 = edge.x1;
                } else if (edge.dx === -1) { // Left
                    y1 = edge.y2; y2 = edge.y1;
                }

                tileGfx.moveTo(x1, y1);
                tileGfx.lineTo(x2, y2);
                tileGfx.stroke({
                    width: 2,
                    color: borderColor,
                    alpha: 1,
                    join: 'miter',
                    cap: 'butt',
                    alignment: 0 // Inner
                });
            }
        }
    }

    /**
     * Collect shimmer effect edges for a tile
     */
    collectShimmerEdges(x, y, tileRaw, map, targetArray) {
        const edgeDefs = [
            { dx: 0, dy: -1, x1: 0, y1: 0, x2: this.tileSize, y2: 0 },
            { dx: 0, dy: 1, x1: 0, y1: this.tileSize, x2: this.tileSize, y2: this.tileSize },
            { dx: -1, dy: 0, x1: 0, y1: 0, x2: 0, y2: this.tileSize },
            { dx: 1, dy: 0, x1: this.tileSize, y1: 0, x2: this.tileSize, y2: this.tileSize }
        ];

        for (const edge of edgeDefs) {
            const nx = x + edge.dx;
            const ny = y + edge.dy;
            const neighbor = map.getTileRaw(nx, ny);

            const isOuterEdge = !neighbor || neighbor.blocked || neighbor.owner !== tileRaw.owner;

            if (isOuterEdge) {
                const pixelX = x * (this.tileSize + this.gap);
                const pixelY = y * (this.tileSize + this.gap);

                let ex1 = pixelX + edge.x1;
                let ey1 = pixelY + edge.y1;
                let ex2 = pixelX + edge.x2;
                let ey2 = pixelY + edge.y2;

                if (edge.dy === 1) [ex1, ex2] = [ex2, ex1];
                else if (edge.dx === -1) [ey1, ey2] = [ey2, ey1];

                targetArray.push({
                    x1: ex1, y1: ey1,
                    x2: ex2, y2: ey2
                });
            }
        }
    }

    getPlayerRegions(playerId) {
        const map = this.game.map;
        const visited = new Set();
        const regions = [];

        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                const idx = map.getTileIndex(x, y);
                const tile = map.tiles[idx];

                if (!tile.blocked && tile.owner === playerId && !visited.has(idx)) {
                    const regionTiles = new Set();
                    const stack = [{ x, y }];
                    visited.add(idx);
                    regionTiles.add(idx);

                    while (stack.length > 0) {
                        const { x: cx, y: cy } = stack.pop();
                        const neighbors = map.getAdjacentTiles(cx, cy);

                        for (const n of neighbors) {
                            const nIdx = map.getTileIndex(n.x, n.y);
                            if (n.owner === playerId && !visited.has(nIdx)) {
                                visited.add(nIdx);
                                regionTiles.add(nIdx);
                                stack.push({ x: n.x, y: n.y });
                            }
                        }
                    }
                    regions.push(regionTiles);
                }
            }
        }

        if (regions.length === 0) return { largest: new Set(), others: [] };

        // Sort by size descending, then by total dice count as a tie-breaker
        regions.sort((a, b) => {
            if (b.size !== a.size) return b.size - a.size;

            const getDiceCount = (tileSet) => {
                let total = 0;
                for (const idx of tileSet) {
                    total += map.tiles[idx].dice;
                }
                return total;
            };

            return getDiceCount(b) - getDiceCount(a);
        });
        const largest = regions[0];
        const others = regions.slice(1);

        return { largest, others };
    }

    /**
     * Updates the animated shimmer effect on the current player's largest region border.
     * Call this every frame for smooth animation.
     * Optimized to reuse Graphics object instead of recreating every frame.
     */
    updateShimmer(deltaTime = 1 / 60) {
        // Skip shimmer if effects are off
        if (this.effectsQuality === 'off') {
            if (this.shimmerGraphics) {
                this.shimmerGraphics.clear();
            }
            return;
        }

        // Show shimmer for current human player only
        const currentPlayer = this.game.currentPlayer;
        if (!currentPlayer || currentPlayer.isBot || this.currentPlayerRegionEdges.length === 0) {
            if (this.shimmerGraphics) {
                this.shimmerGraphics.clear();
            }
            return;
        }

        // Create or reuse shimmer graphics
        if (!this.shimmerGraphics) {
            this.shimmerGraphics = new Graphics();
            this.shimmerContainer.addChild(this.shimmerGraphics);
        }

        // Clear and redraw (Graphics.clear() is much faster than removeChildren + new)
        this.shimmerGraphics.clear();
        this.shimmerGraphics.blendMode = 'add';

        // Ensure shimmer is on top of everything else (especially background effects)
        if (this.stage.children[this.stage.children.length - 1] !== this.shimmerContainer) {
            this.stage.addChild(this.shimmerContainer);
        }

        // === ANIMATION CONFIG ===
        const CYCLE_DURATION = RENDER.SHIMMER_CYCLE_DURATION;
        const TRAIL_SEGMENTS = RENDER.SHIMMER_TRAIL_SEGMENTS;

        // Update time consistently
        this.shimmerTime += deltaTime;

        // Helper to draw comets for a set of edges
        const drawComets = (edges, durationScale, sizeScale, alphaScale) => {
            const duration = CYCLE_DURATION * durationScale;
            // Calculate animation progress (0 to 1, loops)
            const cycleProgress = (this.shimmerTime / duration) % 1;

            const segmentOffset = RENDER.SHIMMER_SEGMENT_OFFSET || 0.08;

            for (const edge of edges) {
                const dx = edge.x2 - edge.x1;
                const dy = edge.y2 - edge.y1;
                const edgeLength = Math.sqrt(dx * dx + dy * dy);

                if (edgeLength === 0) continue;

                // Comet position along this edge (0 to 1)
                const headT = cycleProgress;

                for (let seg = 0; seg <= TRAIL_SEGMENTS; seg++) {
                    const segT = headT - (seg * segmentOffset);
                    if (segT < 0) continue;

                    const x = edge.x1 + dx * segT;
                    const y = edge.y1 + dy * segT;

                    const fadeProgress = seg / TRAIL_SEGMENTS;
                    let alpha = seg === 0 ? 1.0 : (1 - fadeProgress) * 0.5; // Solid head
                    alpha *= alphaScale;

                    const size = 3.141592 * sizeScale;

                    if (alpha > 0.05) {
                        this.shimmerGraphics.rect(x - size, y - size, size * 2, size * 2);
                        this.shimmerGraphics.fill({ color: 0xffffff, alpha: alpha });
                    }
                }
            }
        };

        // 1. Primary (Largest) Region - Standard size/speed
        drawComets(this.currentPlayerRegionEdges, 1.0, 1.0, 1.0);

        // 2. Secondary Regions - Smaller, slower (50% of previous speed = 2x duration)
        // drawComets(this.currentPlayerSecondaryRegionEdges, 3.6, 0.6, 1);
    }

    drawOverlay() {
        // Hide all human-centric overlay elements during bot turns (but allow in paint mode for editor)
        if (!this.paintMode && this.game.currentPlayer?.isBot) {
            this.selectionGfx.visible = false;
            this.hoverGfx.visible = false;
            this.cursorGfx.visible = false;
            this.hidePools();
            return;
        }

        // In paint mode (editor), just show simple hover highlight
        if (this.paintMode) {
            this.selectionGfx.visible = false;
            this.cursorGfx.visible = false;
            this.hidePools();

            if (this.hoverTile) {
                this.hoverGfx.clear();
                this.hoverGfx.rect(0, 0, this.tileSize, this.tileSize);
                this.hoverGfx.stroke({
                    width: 3,
                    color: 0xffffff,
                    alpha: 0.8,
                    join: 'miter',
                    cap: 'square',
                    alignment: 0 // Force inner
                });
                this.hoverGfx.x = this.hoverTile.x * (this.tileSize + this.gap);
                this.hoverGfx.y = this.hoverTile.y * (this.tileSize + this.gap);
                this.hoverGfx.visible = true;
            } else {
                this.hoverGfx.visible = false;
            }
            return;
        }

        // Draw keyboard/gamepad cursor (distinct from hover)
        if (this.cursorTile) {
            this.cursorGfx.clear();
            const inset = 3; // Draw cursor slightly inside tile

            // Draw diamond/crosshair cursor
            this.cursorGfx.rect(inset, inset, this.tileSize - inset * 2, this.tileSize - inset * 2);
            this.cursorGfx.stroke({ width: 3, color: 0x00ffff, alpha: 0.8, join: 'miter', cap: 'square' }); // Cyan cursor

            // Corner brackets for extra visibility
            const bracketSize = 10;
            this.cursorGfx.moveTo(0, bracketSize);
            this.cursorGfx.lineTo(0, 0);
            this.cursorGfx.lineTo(bracketSize, 0);
            // Top-right
            this.cursorGfx.moveTo(this.tileSize - bracketSize, 0);
            this.cursorGfx.lineTo(this.tileSize, 0);
            this.cursorGfx.lineTo(this.tileSize, bracketSize);
            // Bottom-right
            this.cursorGfx.moveTo(this.tileSize, this.tileSize - bracketSize);
            this.cursorGfx.lineTo(this.tileSize, this.tileSize);
            this.cursorGfx.lineTo(this.tileSize - bracketSize, this.tileSize);
            // Bottom-left
            this.cursorGfx.moveTo(bracketSize, this.tileSize);
            this.cursorGfx.lineTo(0, this.tileSize);
            this.cursorGfx.lineTo(0, this.tileSize - bracketSize);
            this.cursorGfx.stroke({
                width: 2,
                color: 0x00ffff,
                alpha: 1.0,
                join: 'miter',
                cap: 'square',
                alignment: 0 // Inner
            });

            this.cursorGfx.x = this.cursorTile.x * (this.tileSize + this.gap);
            this.cursorGfx.y = this.cursorTile.y * (this.tileSize + this.gap);
            this.cursorGfx.visible = true;
        } else {
            this.cursorGfx.visible = false;
        }

        this.hidePools();
        let neighborIdx = 0;
        let badgeIdx = 0;

        // Draw Selection
        if (this.selectedTile) {
            this.selectionGfx.clear();
            // 1. Draw and fill the background rectangle
            this.selectionGfx.rect(0, 0, this.tileSize, this.tileSize);
            this.selectionGfx.fill({ color: 0xffffff, alpha: 0.4 });

            // 2. Draw directional line segments for the border (alignment: 0)
            this.selectionGfx.moveTo(0, 0); this.selectionGfx.lineTo(this.tileSize, 0);
            this.selectionGfx.stroke({ width: 4, color: 0xffffff, alpha: 0.9, alignment: 0, cap: 'butt' });

            this.selectionGfx.moveTo(this.tileSize, 0); this.selectionGfx.lineTo(this.tileSize, this.tileSize);
            this.selectionGfx.stroke({ width: 4, color: 0xffffff, alpha: 0.9, alignment: 0, cap: 'butt' });

            this.selectionGfx.moveTo(this.tileSize, this.tileSize); this.selectionGfx.lineTo(0, this.tileSize);
            this.selectionGfx.stroke({ width: 4, color: 0xffffff, alpha: 0.9, alignment: 0, cap: 'butt' });

            this.selectionGfx.moveTo(0, this.tileSize); this.selectionGfx.lineTo(0, 0);
            this.selectionGfx.stroke({ width: 4, color: 0xffffff, alpha: 0.9, alignment: 0, cap: 'butt' });

            this.selectionGfx.x = this.selectedTile.x * (this.tileSize + this.gap);
            this.selectionGfx.y = this.selectedTile.y * (this.tileSize + this.gap);
            this.selectionGfx.visible = true;

            // Get selected tile info for probability calculation
            const selectedTileData = this.game.map.getTile(this.selectedTile.x, this.selectedTile.y);
            const attackerDice = selectedTileData ? selectedTileData.dice : 0;

            // Draw attackable neighbor indicators (Beginner: highlight + probability, Normal: probability only)
            if (this.gameSpeed !== 'expert' && attackerDice > 1) {
                const neighbors = [
                    { x: this.selectedTile.x, y: this.selectedTile.y - 1, edge: 'top' },
                    { x: this.selectedTile.x, y: this.selectedTile.y + 1, edge: 'bottom' },
                    { x: this.selectedTile.x - 1, y: this.selectedTile.y, edge: 'left' },
                    { x: this.selectedTile.x + 1, y: this.selectedTile.y, edge: 'right' }
                ];

                for (const neighbor of neighbors) {
                    const neighborTile = this.game.map.getTile(neighbor.x, neighbor.y);

                    // Only show for enemy tiles that exist
                    if (!neighborTile || neighborTile.owner === this.game.currentPlayer?.id) continue;

                    const neighborPixelX = neighbor.x * (this.tileSize + this.gap);
                    const neighborPixelY = neighbor.y * (this.tileSize + this.gap);

                    // Beginner mode: show simple static red highlight on attackable neighbors
                    if (this.gameSpeed === 'beginner') {
                        const hGfx = this.getNeighborHighlighter(neighborIdx++);
                        const inset = 4;

                        hGfx.clear();
                        hGfx.rect(inset, inset, this.tileSize - inset * 2, this.tileSize - inset * 2);
                        hGfx.stroke({ width: 2, color: 0xff0000, alpha: 0.8, join: 'miter', cap: 'square' });

                        hGfx.x = neighborPixelX;
                        hGfx.y = neighborPixelY;
                        hGfx.visible = true;
                    }

                    // Calculate win probability
                    const defenderDice = neighborTile.dice;
                    const probability = getWinProbability(attackerDice, defenderDice, this.diceSides);
                    // Cap at 99% only if rounded to 100 but not actually 100%
                    let probabilityPercent = Math.round(probability * 100);
                    if (probabilityPercent === 100 && probability < 1.0) {
                        probabilityPercent = 99;
                    }
                    const probColor = getProbabilityHexColor(probability);

                    // Calculate badge position (at edge between attacker and defender)
                    let badgeX, badgeY;
                    const selectedPixelX = this.selectedTile.x * (this.tileSize + this.gap);
                    const selectedPixelY = this.selectedTile.y * (this.tileSize + this.gap);

                    switch (neighbor.edge) {
                        case 'top':
                            badgeX = selectedPixelX + this.tileSize / 2;
                            badgeY = selectedPixelY + 8 - this.gap / 2; // Move it a bit more down into the tile to avoid overlap
                            break;
                        case 'bottom':
                            badgeX = selectedPixelX + this.tileSize / 2;
                            badgeY = selectedPixelY + this.tileSize + this.gap / 2;
                            break;
                        case 'left':
                            badgeX = selectedPixelX - this.gap / 2;
                            badgeY = selectedPixelY + this.tileSize / 2;
                            break;
                        case 'right':
                            badgeX = selectedPixelX + this.tileSize + this.gap / 2;
                            badgeY = selectedPixelY + this.tileSize / 2;
                            break;
                    }

                    // Update probability badge
                    this.updateProbabilityBadge(badgeIdx++, badgeX, badgeY, `${probabilityPercent}%`, probColor, neighbor.edge);
                }
            }

            // Draw Target Hover or Cursor target
            const isCursorOnDifferentTile = this.cursorTile && (this.cursorTile.x !== this.selectedTile.x || this.cursorTile.y !== this.selectedTile.y);
            const targetTile = this.hoverTile || (isCursorOnDifferentTile ? this.cursorTile : null);

            if (targetTile) {
                // If adjacent to selection, show attack indicator
                const isAdjacent = Math.abs(this.selectedTile.x - targetTile.x) + Math.abs(this.selectedTile.y - targetTile.y) === 1;

                if (isAdjacent) {
                    const hGfx = this.getNeighborHighlighter(neighborIdx++);
                    hGfx.clear();
                    const tileContent = this.game.map.getTile(targetTile.x, targetTile.y);
                    const isEnemy = tileContent && tileContent.owner !== this.game.currentPlayer.id;
                    const color = isEnemy ? 0xff0000 : 0xffffff;

                    // Individual CW segments with individual strokes
                    hGfx.moveTo(0, 0); hGfx.lineTo(this.tileSize, 0);
                    hGfx.stroke({ width: 3, color, alpha: 0.8, alignment: 0, cap: 'butt' });
                    hGfx.moveTo(this.tileSize, 0); hGfx.lineTo(this.tileSize, this.tileSize);
                    hGfx.stroke({ width: 3, color, alpha: 0.8, alignment: 0, cap: 'butt' });
                    hGfx.moveTo(this.tileSize, this.tileSize); hGfx.lineTo(0, this.tileSize);
                    hGfx.stroke({ width: 3, color, alpha: 0.8, alignment: 0, cap: 'butt' });
                    hGfx.moveTo(0, this.tileSize); hGfx.lineTo(0, 0);
                    hGfx.stroke({ width: 3, color, alpha: 0.8, alignment: 0, cap: 'butt' });

                    hGfx.x = targetTile.x * (this.tileSize + this.gap);
                    hGfx.y = targetTile.y * (this.tileSize + this.gap);
                    hGfx.visible = true;
                    this.hoverGfx.visible = false;
                } else {
                    // Non-adjacent hover: show normal smart highlight
                    const { nextBadgeIdx } = this._renderSmartHover(targetTile.x, targetTile.y, badgeIdx);
                    badgeIdx = nextBadgeIdx;
                }
            } else {
                this.hoverGfx.visible = false;
            }
        } else if (this.hoverTile) {
            this.selectionGfx.visible = false;
            // Just hovering without selection - show smart highlight
            if (this.game.currentPlayer?.isBot) {
                this.hoverGfx.visible = false;
            } else {
                this._renderSmartHover(this.hoverTile.x, this.hoverTile.y, badgeIdx);
            }
        } else {
            this.selectionGfx.visible = false;
            this.hoverGfx.visible = false;
        }
    }

    /**
     * Internal helper to draw the "smart" hover highlight for a tile.
     * Differentiates between own attackable tiles, static own tiles, and non-interactable tiles.
     */
    _renderSmartHover(x, y, badgeIdx) {
        const tileRaw = this.game.map.getTileRaw(x, y);
        if (!tileRaw || tileRaw.blocked) {
            this.hoverGfx.visible = false;
            return { nextBadgeIdx: badgeIdx };
        }

        const isOwned = tileRaw.owner === this.game.currentPlayer.id;
        const canAttackFrom = isOwned && tileRaw.dice > 1;

        // Check for direct attack shortcut (uniquely attackable)
        let isUniquelyAttackable = false;
        let uniqueAttacker = null;
        if (!isOwned) {
            const neighbors = this.game.map.getAdjacentTiles(x, y);
            let attackersCount = 0;
            for (const n of neighbors) {
                if (n.owner === this.game.currentPlayer.id && n.dice > 1) {
                    attackersCount++;
                    uniqueAttacker = n;
                }
            }
            // ONLY available in expert mode for now
            isUniquelyAttackable = attackersCount === 1 && this.gameSpeed === 'expert';
        }

        this.hoverGfx.clear();
        // Pattern for fill
        this.hoverGfx.rect(0, 0, this.tileSize, this.tileSize);

        if (isUniquelyAttackable) {
            // Attack shortcut available: Red static highlight on target (hover)
            this.hoverGfx.fill({ color: 0xff0000, alpha: 0.2 });
            // Individual CW segments for stroke
            this.hoverGfx.moveTo(0, 0); this.hoverGfx.lineTo(this.tileSize, 0);
            this.hoverGfx.stroke({ width: 3, color: 0xff0000, alpha: 0.8, alignment: 0, cap: 'butt' });
            this.hoverGfx.moveTo(this.tileSize, 0); this.hoverGfx.lineTo(this.tileSize, this.tileSize);
            this.hoverGfx.stroke({ width: 3, color: 0xff0000, alpha: 0.8, alignment: 0, cap: 'butt' });
            this.hoverGfx.moveTo(this.tileSize, this.tileSize); this.hoverGfx.lineTo(0, this.tileSize);
            this.hoverGfx.stroke({ width: 3, color: 0xff0000, alpha: 0.8, alignment: 0, cap: 'butt' });
            this.hoverGfx.moveTo(0, this.tileSize); this.hoverGfx.lineTo(0, 0);
            this.hoverGfx.stroke({ width: 3, color: 0xff0000, alpha: 0.8, alignment: 0, cap: 'butt' });

            // Position between hovered tile and attacker
            const hoverPx = x * (this.tileSize + this.gap);
            const hoverPy = y * (this.tileSize + this.gap);
            const attackPx = uniqueAttacker.x * (this.tileSize + this.gap);
            const attackPy = uniqueAttacker.y * (this.tileSize + this.gap);

            const badgeX = (hoverPx + attackPx + this.tileSize) / 2;
            const badgeY = (hoverPy + attackPy + this.tileSize) / 2;

            // Experts see the badge (to identify attacker) but with NO text
            this.updateProbabilityBadge(badgeIdx++, badgeX, badgeY, '', 0xffffff, 'direct');
        } else if (canAttackFrom) {
            // Selectable & Actionable: Large white static border
            this.hoverGfx.fill({ color: 0xffffff, alpha: 0.15 });
            // Individual CW segments for stroke
            this.hoverGfx.moveTo(0, 0); this.hoverGfx.lineTo(this.tileSize, 0);
            this.hoverGfx.stroke({ width: 3, color: 0xffffff, alpha: 0.8, alignment: 0, cap: 'butt' });
            this.hoverGfx.moveTo(this.tileSize, 0); this.hoverGfx.lineTo(this.tileSize, this.tileSize);
            this.hoverGfx.stroke({ width: 3, color: 0xffffff, alpha: 0.8, alignment: 0, cap: 'butt' });
            this.hoverGfx.moveTo(this.tileSize, this.tileSize); this.hoverGfx.lineTo(0, this.tileSize);
            this.hoverGfx.stroke({ width: 3, color: 0xffffff, alpha: 0.8, alignment: 0, cap: 'butt' });
            this.hoverGfx.moveTo(0, this.tileSize); this.hoverGfx.lineTo(0, 0);
            this.hoverGfx.stroke({ width: 3, color: 0xffffff, alpha: 0.8, alignment: 0, cap: 'butt' });
        } else if (isOwned) {
            // Selectable but no action: Subtle static white
            this.hoverGfx.fill({ color: 0xffffff, alpha: 0.1 });
            // Individual CW segments for stroke
            this.hoverGfx.moveTo(0, 0); this.hoverGfx.lineTo(this.tileSize, 0);
            this.hoverGfx.stroke({ width: 1, color: 0xffffff, alpha: 0.6, alignment: 0, cap: 'butt' });
            this.hoverGfx.moveTo(this.tileSize, 0); this.hoverGfx.lineTo(this.tileSize, this.tileSize);
            this.hoverGfx.stroke({ width: 1, color: 0xffffff, alpha: 0.6, alignment: 0, cap: 'butt' });
            this.hoverGfx.moveTo(this.tileSize, this.tileSize); this.hoverGfx.lineTo(0, this.tileSize);
            this.hoverGfx.stroke({ width: 1, color: 0xffffff, alpha: 0.6, alignment: 0, cap: 'butt' });
            this.hoverGfx.moveTo(0, this.tileSize); this.hoverGfx.lineTo(0, 0);
            this.hoverGfx.stroke({ width: 1, color: 0xffffff, alpha: 0.6, alignment: 0, cap: 'butt' });
        } else {
            // Not interactable: Very subtle dimmed highlight
            this.hoverGfx.fill({ color: 0x000000, alpha: 0.15 });
        }

        this.hoverGfx.x = x * (this.tileSize + this.gap);
        this.hoverGfx.y = y * (this.tileSize + this.gap);
        this.hoverGfx.visible = true;

        return { nextBadgeIdx: badgeIdx };
    }

    hidePools() {
        for (const h of this.neighborHighlighters) h.visible = false;
        for (const b of this.probabilityBadges) b.visible = false;
    }

    getNeighborHighlighter(index) {
        if (!this.neighborHighlighters[index]) {
            const gfx = new Graphics();
            this.overlayContainer.addChild(gfx);
            this.neighborHighlighters[index] = gfx;
        }
        return this.neighborHighlighters[index];
    }

    updateProbabilityBadge(index, x, y, text, color, edge) {
        if (!this.probabilityBadges[index]) {
            const container = new Container();

            // Background pill
            const badgeBg = new Graphics();
            container.addChild(badgeBg);
            container.badgeBg = badgeBg;

            // Probability text
            const probText = new Text({
                text: '',
                style: this.probabilityTextStyle
            });
            probText.anchor.set(0.5, 0.5);
            container.addChild(probText);
            container.probText = probText;

            // Input hint container
            const hintContainer = new Container();
            hintContainer.y = -14;
            container.addChild(hintContainer);
            container.hintContainer = hintContainer;

            this.hintsContainer.addChild(container);
            this.probabilityBadges[index] = container;
        }

        const container = this.probabilityBadges[index];
        container.x = x;
        container.y = y;
        container.visible = true;

        // Update Background (Smaller if empty/shortcut)
        const isSmall = text === '';
        const badgeWidth = isSmall ? 10 : 28;
        const badgeHeight = isSmall ? 10 : 16;

        container.badgeBg.clear();
        container.badgeBg.rect(-badgeWidth / 2, -badgeHeight / 2, badgeWidth, badgeHeight);
        container.badgeBg.fill({ color: color, alpha: 0.95 });

        if (!isSmall) {
            container.badgeBg.stroke({ width: 1, color: 0x000000, alpha: 0.4 });
        }

        // Update Text
        container.probText.text = text;

        // Update Hint
        container.hintContainer.removeChildren();
        if (this.gameSpeed === 'beginner' && shouldShowInputHints(this.inputManager)) {
            let hintAction = null;
            switch (edge) {
                case 'top': hintAction = ACTION_MOVE_UP; break;
                case 'bottom': hintAction = ACTION_MOVE_DOWN; break;
                case 'left': hintAction = ACTION_MOVE_LEFT; break;
                case 'right': hintAction = ACTION_MOVE_RIGHT; break;
            }

            if (hintAction) {
                const hint = getInputHint(hintAction, this.inputManager);
                if (hint) {
                    const hintBg = new Graphics();
                    const hintWidth = hint.type === 'gamepad' ? 16 : (hint.label.length * 7 + 6);
                    const hintHeight = 14;

                    if (hint.style === 'gamepad-dpad') {
                        hintBg.circle(0, 0, 8);
                        hintBg.fill({ color: 0x666666, alpha: 0.9 });
                        hintBg.stroke({ width: 1, color: 0x000000, alpha: 0.5 });
                    } else if (hint.style === 'keyboard') {
                        hintBg.roundRect(-hintWidth / 2, -hintHeight / 2, hintWidth, hintHeight, 3);
                        hintBg.fill({ color: 0x000000, alpha: 0.8 });
                        hintBg.stroke({ width: 1, color: 0x00ffff, alpha: 0.6 });
                    }
                    container.hintContainer.addChild(hintBg);

                    const hintText = new Text({
                        text: hint.label,
                        style: this.hintTextStyle
                    });
                    hintText.anchor.set(0.5, 0.5);
                    hintText.style.fontSize = hint.type === 'gamepad' ? 10 : 11;
                    container.hintContainer.addChild(hintText);
                }
            }
        }
    }

    renderDice(container, count, color) {
        if (count <= 0) return;

        // Use pre-rendered sprite textures for fast rendering
        const diceTexture = TileRenderer.getDiceTexture(this.diceSides, count);

        if (diceTexture) {
            // Fast path: use sprite
            const diceSprite = new Sprite(diceTexture);

            // Apply tint (D6 emoji stays white, others get player color)
            if (color && this.diceSides !== 6) {
                diceSprite.tint = color;
            } else if (color && this.diceSides === 6) {
                // D6 emoji - keep it mostly white but slightly tint
                diceSprite.tint = color;
            }

            container.addChild(diceSprite);
        } else {
            // Fallback: render using slow method (shouldn't happen after init)
            TileRenderer.renderDiceToContainer(container, {
                size: this.tileSize,
                diceCount: count,
                diceSides: this.diceSides,
                color: color
            });
        }
    }

    animateAttack(result, onComplete) {
        // Skip animations in expert mode
        if (this.gameSpeed === 'expert') {
            if (onComplete) onComplete();
            this.invalidate(); // Full redraw to update borders
            return;
        }

        const fromX = result.from.x * (this.tileSize + this.gap);
        const fromY = result.from.y * (this.tileSize + this.gap);
        const toX = result.to.x * (this.tileSize + this.gap);
        const toY = result.to.y * (this.tileSize + this.gap);

        // Flash attacker
        const attackerFlash = new Graphics();
        attackerFlash.rect(0, 0, this.tileSize, this.tileSize);
        attackerFlash.fill({ color: 0xffffff, alpha: 0.8 });
        attackerFlash.x = fromX;
        attackerFlash.y = fromY;
        this.container.addChild(attackerFlash);

        this.animator.addTween({
            duration: 20,
            onUpdate: (p) => {
                attackerFlash.alpha = 0.8 * (1 - p);
            },
            onComplete: () => {
                attackerFlash.destroy();
            }
        });

        // Defender flash
        const defenderFlash = new Graphics();
        defenderFlash.rect(0, 0, this.tileSize, this.tileSize);
        defenderFlash.x = toX;
        defenderFlash.y = toY;
        this.container.addChild(defenderFlash);

        const flashColor = result.won ? 0xff0000 : 0xffffff;
        defenderFlash.fill({ color: flashColor, alpha: 0.8 });

        this.animator.addTween({
            duration: 20,
            onUpdate: (p) => {
                defenderFlash.alpha = 0.8 * (1 - p);
            },
            onComplete: () => {
                defenderFlash.destroy();
                if (onComplete) onComplete();
                this.invalidate(); // Full redraw to update borders
            }
        });

        // Beginner mode: show tile highlights only (dice results are in DOM HUD)
        if (this.gameSpeed === 'beginner') {
            const attacker = this.game.players.find(p => p.id === result.attackerId);
            const defender = this.game.players.find(p => p.id === result.defenderId);

            // Create highlight with glow
            const createHighlight = (x, y, color) => {
                const group = new Container();
                group.x = x + this.tileSize / 2;
                group.y = y + this.tileSize / 2;
                group.alpha = 0;

                // Glow effect
                const glow = new Graphics();
                glow.rect(-this.tileSize / 2 - 6, -this.tileSize / 2 - 6, this.tileSize + 12, this.tileSize + 12);
                glow.stroke({ color: 0xffffff, width: 8, alpha: 0.5, join: 'miter', cap: 'square' });
                group.addChild(glow);

                const high = new Graphics();
                high.rect(-this.tileSize / 2, -this.tileSize / 2, this.tileSize, this.tileSize);
                high.fill({ color: color, alpha: 0.8 });
                high.stroke({ color: 0xffffff, width: 4, alpha: 1.0, join: 'miter', cap: 'square' });
                group.addChild(high);

                return group;
            };

            // Attacker highlight
            const attackerHigh = createHighlight(fromX, fromY, attacker ? attacker.color : 0xffffff);
            this.animationContainer.addChild(attackerHigh);

            // Defender highlight - use attacker color if won (tile is now theirs)
            const defenderColor = result.won ? (attacker ? attacker.color : 0xffffff) : (defender ? defender.color : 0xffffff);
            const defenderHigh = createHighlight(toX, toY, defenderColor);
            this.animationContainer.addChild(defenderHigh);

            // Animation timing - faster when attacker loses
            const fadeInDuration = result.won ? 10 : 6;
            const holdDuration = result.won ? 40 : 20;
            const baseX = fromX + this.tileSize / 2;

            // Staggered animation: attacker appears first
            this.animator.addTween({
                duration: fadeInDuration,
                onUpdate: (p) => {
                    attackerHigh.alpha = p;
                    attackerHigh.scale.set(1 + (1 - p) * 0.3);
                },
                onComplete: () => {
                    // Now show defender
                    this.animator.addTween({
                        duration: fadeInDuration,
                        onUpdate: (p) => {
                            defenderHigh.alpha = p;
                            defenderHigh.scale.set(1 + (1 - p) * 0.3);
                        },
                        onComplete: () => {
                            // Hold briefly then fade out both
                            // If attacker lost, add shake effect
                            this.animator.addTween({
                                duration: holdDuration,
                                onUpdate: (p) => {
                                    // Shake attacker if lost
                                    if (!result.won && p < 0.5) {
                                        const shake = Math.sin(p * Math.PI * 8) * 5;
                                        attackerHigh.x = baseX + shake;
                                    } else {
                                        attackerHigh.x = baseX;
                                    }

                                    if (p > 0.7) {
                                        const fade = (1 - p) / 0.3;
                                        attackerHigh.alpha = fade;
                                        defenderHigh.alpha = fade;
                                    }
                                },
                                onComplete: () => {
                                    attackerHigh.destroy();
                                    defenderHigh.destroy();
                                }
                            });
                        }
                    });
                }
            });
        }
    }

    animateReinforcements(data) {
        // Only show in Beginner mode
        if (this.gameSpeed !== 'beginner') return;

        const player = data.player;
        const placements = data.placements || [];

        if (placements.length === 0) return;

        // Animate each placement sequentially
        const animateNextPlacement = (index) => {
            if (index >= placements.length) return;

            const placement = placements[index];
            const pixelX = placement.x * (this.tileSize + this.gap);
            const pixelY = placement.y * (this.tileSize + this.gap);

            // Create a flash effect for this tile
            const flash = new Graphics();
            flash.rect(0, 0, this.tileSize, this.tileSize);
            flash.fill({ color: 0xffffff, alpha: 0.9 });
            flash.x = pixelX;
            flash.y = pixelY;
            flash.alpha = 0;
            this.animationContainer.addChild(flash);

            // Also create a "+" icon (using the same master texture)
            const plusText = new Sprite(TileRenderer.masterDiceTexture);
            plusText.anchor.set(0.5);
            plusText.width = 24;
            plusText.height = 24;
            plusText.x = pixelX + this.tileSize / 2;
            plusText.y = pixelY + this.tileSize / 2;
            plusText.alpha = 0;
            this.animationContainer.addChild(plusText);

            // Store the base scale after width/height are set
            const baseScaleX = plusText.scale.x;
            const baseScaleY = plusText.scale.y;

            // Animate the flash
            this.animator.addTween({
                duration: 12,
                onUpdate: (p) => {
                    if (p < 0.3) {
                        flash.alpha = p / 0.3;
                        plusText.alpha = p / 0.3;
                        // Apply scale multiplier relative to base scale
                        const scaleMult = 0.5 + p * 1.5;
                        plusText.scale.set(baseScaleX * scaleMult, baseScaleY * scaleMult);
                    } else {
                        flash.alpha = (1 - p) / 0.7;
                        plusText.alpha = (1 - p) / 0.7;
                        plusText.y = pixelY + this.tileSize / 2 - (p - 0.3) * 20;
                    }
                },
                onComplete: () => {
                    flash.destroy();
                    plusText.destroy();
                    // Animate next placement
                    animateNextPlacement(index + 1);
                }
            });
        };

        // Start the sequence
        animateNextPlacement(0);
    }
}
