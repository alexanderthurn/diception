import { Graphics, Container, Text, TextStyle, Sprite, Texture } from 'pixi.js';

function premultiplyColor(hex, alpha) {
    const r = Math.round(((hex >> 16) & 0xFF) * alpha);
    const g = Math.round(((hex >> 8) & 0xFF) * alpha);
    const b = Math.round((hex & 0xFF) * alpha);
    return (r << 16) | (g << 8) | b;
}
import { TileRenderer } from './tile-renderer.js';
import { RENDER, GAME } from '../core/constants.js';
import { TileGlow } from './effects/tile-glow.js';
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

        // Blurred territory glow layer (below tiles)
        this.tileGlow = new TileGlow(stage);

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

        this.selectedTiles = new Map(); // sourceId -> {x, y} — one selection per input source
        this.hoverTiles = new Map(); // cursorId -> {x, y} — one hover per input cursor
        this._lastHoverCursorId = null; // Which cursor was moved most recently (for primary targeting)
        this.cursorTiles = new Map(); // sourceId -> {x, y} — D-pad/keyboard cursor per source
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
        // Temporary dice count overrides used during supply animation
        this._diceOverrides = new Map(); // tileIdx → displayed count
        // True while supply animation is running — shimmer runs 5× faster
        this._supplyAnimActive = false;
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

        // Persistent overlay elements (per-source pools)
        this._selectionGfxPool = new Map(); // sourceId -> Graphics
        this._selPulseTime = 0;
        this._hoverGfxPool = new Map(); // cursorId -> Graphics (lazy-created)
        this._cursorGfxPool = new Map(); // sourceId -> Graphics
        this.neighborHighlighters = []; // Pool of Graphics
        this.probabilityBadges = []; // Pool of Containers
    }

    /** Returns or creates a hover Graphics object for the given cursor ID */
    _getHoverGfx(cursorId) {
        if (!this._hoverGfxPool.has(cursorId)) {
            const gfx = new Graphics();
            this.overlayContainer.addChild(gfx);
            this._hoverGfxPool.set(cursorId, gfx);
        }
        return this._hoverGfxPool.get(cursorId);
    }

    _getSelectionGfx(sourceId) {
        if (!this._selectionGfxPool.has(sourceId)) {
            const gfx = new Graphics();
            this.overlayContainer.addChild(gfx);
            this._selectionGfxPool.set(sourceId, gfx);
        }
        return this._selectionGfxPool.get(sourceId);
    }

    _getCursorGfx(sourceId) {
        if (!this._cursorGfxPool.has(sourceId)) {
            const gfx = new Graphics();
            this.overlayContainer.addChild(gfx);
            this._cursorGfxPool.set(sourceId, gfx);
        }
        return this._cursorGfxPool.get(sourceId);
    }

    /** Primary hover tile — used for selection/attack targeting. Most-recently-moved cursor wins. */
    get hoverTile() {
        if (this._lastHoverCursorId && this.hoverTiles.has(this._lastHoverCursorId)) {
            return this.hoverTiles.get(this._lastHoverCursorId);
        }
        const first = this.hoverTiles.values().next();
        return first.done ? null : first.value;
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

    isTileDirty(tileIdx, tileRaw, isCurrentPlayer, isInRegion, map, x, y) {
        const lastState = this.lastTileStates.get(tileIdx);
        if (!lastState) return true;

        const actualTileSize = this.tileSize * this.stage.scale.x;
        const hideSmallBorders = actualTileSize < RENDER.MIN_TILE_SIZE_FOR_BORDERS;

        if (lastState.owner !== tileRaw.owner ||
            lastState.dice !== tileRaw.dice ||
            lastState.blocked !== tileRaw.blocked ||
            lastState.isCurrentPlayer !== isCurrentPlayer ||
            lastState.isInRegion !== isInRegion ||
            lastState.hideSmallBorders !== hideSmallBorders ||
            lastState.diceOverride !== (this._diceOverrides.get(tileIdx) ?? null)) return true;

        // Borders depend on neighbor ownership — redraw if any orthogonal neighbor changed owner
        const dirs = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
        for (let i = 0; i < 4; i++) {
            const n = map.getTileRaw(x + dirs[i].dx, y + dirs[i].dy);
            if ((n?.owner ?? null) !== lastState.neighborOwners[i]) return true;
        }
        return false;
    }

    /**
     * Store the current state of a tile for future dirty checking
     */
    saveTileState(tileIdx, tileRaw, isCurrentPlayer, isInRegion, map, x, y) {
        const actualTileSize = this.tileSize * this.stage.scale.x;
        const hideSmallBorders = actualTileSize < RENDER.MIN_TILE_SIZE_FOR_BORDERS;

        const dirs = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
        const neighborOwners = dirs.map(d => map.getTileRaw(x + d.dx, y + d.dy)?.owner ?? null);

        this.lastTileStates.set(tileIdx, {
            owner: tileRaw.owner,
            dice: tileRaw.dice,
            blocked: tileRaw.blocked,
            isCurrentPlayer,
            isInRegion,
            hideSmallBorders,
            neighborOwners,
            diceOverride: this._diceOverrides.get(tileIdx) ?? null,
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
        this.tileGlow.setQuality(quality);
    }

    setSelection(x, y, sourceId = 'mouse') {
        if (x === null) {
            if (sourceId === null) {
                this.selectedTiles.clear(); // clear all sources
            } else {
                this.selectedTiles.delete(sourceId);
            }
        } else {
            this.selectedTiles.set(sourceId, { x, y });
        }
        this.drawOverlay();
    }

    setHover(x, y, cursorId = 'mouse') {
        if (x === null) {
            this.hoverTiles.delete(cursorId);
            if (this._lastHoverCursorId === cursorId) this._lastHoverCursorId = null;
        } else {
            this.hoverTiles.set(cursorId, { x, y });
            this._lastHoverCursorId = cursorId;
        }
        this.drawOverlay();
    }

    setCursor(x, y, sourceId = 'mouse') {
        if (x === null) {
            if (sourceId === null) {
                this.cursorTiles.clear();
            } else {
                this.cursorTiles.delete(sourceId);
            }
        } else {
            this.cursorTiles.set(sourceId, { x, y });
        }
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
        this.currentPlayerCornerEdges = [];

        // Collect glow data for all owned tiles
        const glowTiles = [];

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
                    this.isTileDirty(tileIdx, tileRaw, isCurrentPlayer, isRegionTile, map, x, y);

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
                    this.saveTileState(tileIdx, tileRaw, isCurrentPlayer, isRegionTile, map, x, y);
                }

                // Collect tile for glow layer (all owned, non-blocked tiles)
                if (!tileRaw.blocked && this.effectsQuality !== 'off') {
                    const owner = this.game.players.find(p => p.id === tileRaw.owner);
                    if (owner) {
                        glowTiles.push({
                            worldX: x * (this.tileSize + this.gap),
                            worldY: y * (this.tileSize + this.gap),
                            color: owner.color,
                        });
                    }
                }

                // Always collect shimmer edges for current human player
                if (!tileRaw.blocked && isCurrentPlayer && !this.paintMode && !currentPlayer.isBot) {
                    if (isInLargestRegion) {
                        this.collectShimmerEdges(x, y, tileRaw, map, this.currentPlayerRegionEdges, this.currentPlayerCornerEdges);
                    } else if (isInSecondaryRegion) {
                        this.collectShimmerEdges(x, y, tileRaw, map, this.currentPlayerSecondaryRegionEdges, this.currentPlayerCornerEdges);
                    }
                }
            }
        }

        // Update territory glow layer
        if (this.effectsQuality !== 'off') {
            this.tileGlow.redraw(glowTiles, this.tileSize, this.gap);
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
            tileGfx.fill({ color: premultiplyColor(0x444444, 0.8), alpha: 1.0 });
            tileGfx.stroke({ width: 1, color: 0x666666, alpha: 0.8, join: 'miter', cap: 'square' });
        } else {
            // Normal game mode — solid fill (color pre-multiplied against black, no transparency)
            tileGfx.fill({ color: premultiplyColor(color, fillAlpha), alpha: 1.0 });

            const actualTileSize = this.tileSize * this.stage.scale.x;
            const hideSmallBorders = actualTileSize < RENDER.MIN_TILE_SIZE_FOR_BORDERS;

            // Smart borders: Only draw borders separating different colors
            // Skip them if they are too small to avoid artifacts
            if (!hideSmallBorders) {
                this.drawSmartBorders(tileGfx, x, y, tileRaw, map);
            }

            // Draw OUTER borders for any region tiles (largest or secondary)
            // For human players, these stay visible and get thicker when small
            if (isInRegion && isCurrentPlayer && !currentPlayer.isBot) {
                const borderThickness = hideSmallBorders ? 3 : 2;
                this.drawRegionBorders(tileGfx, x, y, tileRaw, currentPlayer, isCurrentPlayer, color, map, borderThickness);
            }
        }

        tileContainer.addChild(tileGfx);

        // Dice rendering (skip in paint mode)
        if (!this.paintMode) {
            const tileIdx = x + y * this.game.map.width;
            const diceCount = this._diceOverrides.get(tileIdx) ?? tileRaw.dice;
            const diceColor = isCurrentPlayer ? null : color;
            this.renderDice(tileContainer, diceCount, diceColor);
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
    drawRegionBorders(tileGfx, x, y, tileRaw, currentPlayer, isCurrentPlayer, color, map, strokeWidth = 2) {
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
                    width: strokeWidth,
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
    collectShimmerEdges(x, y, tileRaw, map, targetArray, cornerArray = null) {
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

        // Inside corners: diagonal is enemy but both orthogonal neighbors are friendly,
        // leaving a missing corner pixel. Push to cornerArray (static, no comet animation).
        if (!cornerArray) return;
        const diagonalDefs = [
            { ddx: 1, ddy: 1 },
            { ddx: 1, ddy: -1 },
            { ddx: -1, ddy: 1 },
            { ddx: -1, ddy: -1 },
        ];
        for (const { ddx, ddy } of diagonalDefs) {
            const diag = map.getTileRaw(x + ddx, y + ddy);
            const isEnemyDiag = !diag || diag.blocked || diag.owner !== tileRaw.owner;
            if (!isEnemyDiag) continue;

            const hNeighbor = map.getTileRaw(x + ddx, y);
            const vNeighbor = map.getTileRaw(x, y + ddy);
            const hFriendly = hNeighbor && !hNeighbor.blocked && hNeighbor.owner === tileRaw.owner;
            const vFriendly = vNeighbor && !vNeighbor.blocked && vNeighbor.owner === tileRaw.owner;
            if (!hFriendly || !vFriendly) continue;

            const pixelX = x * (this.tileSize + this.gap);
            const pixelY = y * (this.tileSize + this.gap);
            const cornerX = pixelX + (ddx > 0 ? this.tileSize : 0);
            const cornerY = pixelY + (ddy > 0 ? this.tileSize : 0);

            // Store corner point + inward direction — rendered as a static dot, no comet animation
            cornerArray.push({ x: cornerX, y: cornerY, ddx, ddy });
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
     * Pick best attacker when multiple can attack same enemy (Expert mode quick-attack tiebreaker).
     * 1) Most dice. 2) Selected tile if applicable. 3) Most connected friendly tiles.
     */
    pickBestAttackerForExpert(attackers, selectedTile) {
        if (!attackers.length) return null;
        if (attackers.length === 1) return attackers[0];

        const playerId = this.game.currentPlayer.id;
        const map = this.game.map;
        const { largest, others } = this.getPlayerRegions(playerId);
        const allRegions = [largest, ...others];

        const getConnectedCount = (x, y) => {
            const idx = map.getTileIndex(x, y);
            for (const region of allRegions) {
                if (region.has(idx)) return region.size;
            }
            return 0;
        };

        const withMeta = attackers.map(a => {
            const tile = map.getTile(a.x, a.y);
            return {
                ...a,
                dice: tile?.dice ?? 0,
                isSelected: selectedTile && a.x === selectedTile.x && a.y === selectedTile.y,
                connectedCount: getConnectedCount(a.x, a.y)
            };
        });

        withMeta.sort((a, b) => {
            if (b.dice !== a.dice) return b.dice - a.dice;
            if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
            return b.connectedCount - a.connectedCount;
        });

        return withMeta[0] ? { x: withMeta[0].x, y: withMeta[0].y } : null;
    }

    /**
     * Updates the animated shimmer effect on the current player's largest region border.
     * Call this every frame for smooth animation.
     * Optimized to reuse Graphics object instead of recreating every frame.
     */
    updateShimmer(deltaTime = 1 / 60) {
        // Pulse selected tile overlay
        if (this._selectionGfxPool.size > 0) {
            this._selPulseTime += deltaTime;
            const pulse = 0.65 + 0.35 * Math.sin(this._selPulseTime * 4.5);
            for (const gfx of this._selectionGfxPool.values()) {
                if (gfx.visible) gfx.alpha = pulse;
            }
        }

        // Suppress shimmer during the initial tile reveal animation
        if (this._suppressShimmerUntil && Date.now() < this._suppressShimmerUntil) {
            if (this.shimmerGraphics) this.shimmerGraphics.clear();
            return;
        }

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

        // 1. Primary (Largest) Region — 5× faster during supply animation
        const primaryDurationScale = this._supplyAnimActive ? 0.2 : 1.0;
        drawComets(this.currentPlayerRegionEdges, primaryDurationScale, 1.0, 1.0);

        // 2. Secondary Regions - Smaller, slower (50% of previous speed = 2x duration)
        // drawComets(this.currentPlayerSecondaryRegionEdges, 3.6, 0.6, 1);

        // 3. Inside corner notches — static bright square matching border thickness, no comet animation
        if (this.currentPlayerCornerEdges) {
            const actualTileSize = this.tileSize * this.stage.scale.x;
            const strokeWidth = actualTileSize < RENDER.MIN_TILE_SIZE_FOR_BORDERS ? 3 : 2;
            for (const pt of this.currentPlayerCornerEdges) {
                // Compute top-left of the corner square: offset inward from the tile corner
                // so it sits exactly where the two inner-aligned border lines would meet
                const tlx = pt.ddx > 0 ? pt.x - strokeWidth : pt.x;
                const tly = pt.ddy > 0 ? pt.y - strokeWidth : pt.y;
                this.shimmerGraphics.rect(tlx, tly, strokeWidth, strokeWidth);
                this.shimmerGraphics.fill({ color: 0xffffff, alpha: 1.0 });
            }
        }
    }

    drawOverlay() {
        // Hide all human-centric overlay elements during bot turns in classic mode.
        // In parallel mode, humans can act at any time so keep overlays active.
        const _isParallelOverlay = this.game.playMode === 'parallel' || this.game.playMode === 'parallel-s';
        if (!this.paintMode && !_isParallelOverlay && this.game.currentPlayer?.isBot) {
            for (const gfx of this._selectionGfxPool.values()) gfx.visible = false;
            for (const gfx of this._cursorGfxPool.values()) gfx.visible = false;
            this.hidePools();
            return;
        }

        // In paint mode (editor), just show simple hover highlight (mouse cursor only)
        if (this.paintMode) {
            for (const gfx of this._selectionGfxPool.values()) gfx.visible = false;
            for (const gfx of this._cursorGfxPool.values()) gfx.visible = false;
            this.hidePools();

            const mouseHover = this.hoverTiles.get('mouse');
            if (mouseHover) {
                const hoverGfx = this._getHoverGfx('mouse');
                hoverGfx.clear();
                hoverGfx.rect(0, 0, this.tileSize, this.tileSize);
                hoverGfx.stroke({
                    width: 3,
                    color: 0xffffff,
                    alpha: 0.8,
                    join: 'miter',
                    cap: 'square',
                    alignment: 0 // Force inner
                });
                hoverGfx.x = mouseHover.x * (this.tileSize + this.gap);
                hoverGfx.y = mouseHover.y * (this.tileSize + this.gap);
                hoverGfx.visible = true;
            }
            return;
        }

        this.hidePools();
        let neighborIdx = 0;
        let badgeIdx = 0;

        // Draw per-source D-pad/keyboard cursors
        for (const [sourceId, cursorTile] of this.cursorTiles) {
            const selTile = this.selectedTiles.get(sourceId);
            const sameAsSelection = selTile && selTile.x === cursorTile.x && selTile.y === cursorTile.y;
            if (!sameAsSelection) {
                if (this._cursorGfxPool.has(sourceId)) this._cursorGfxPool.get(sourceId).visible = false;
            } else {
                if (this._cursorGfxPool.has(sourceId)) this._cursorGfxPool.get(sourceId).visible = false;
            }
        }
        // Hide cursor graphics for sources no longer active
        for (const [sourceId, gfx] of this._cursorGfxPool) {
            if (!this.cursorTiles.has(sourceId)) gfx.visible = false;
        }

        // Track which sourceIds have selections (so hover-only sources are handled separately)
        const sourcesWithSelection = new Set(this.selectedTiles.keys());

        // Draw per-source selections + neighbor highlights + attack target indicators
        for (const [sourceId, selTile] of this.selectedTiles) {
            const selGfx = this._getSelectionGfx(sourceId);
            selGfx.clear();
            selGfx.rect(0, 0, this.tileSize, this.tileSize);
            selGfx.fill({ color: 0xffffff, alpha: 0.4 });
            selGfx.moveTo(0, 0); selGfx.lineTo(this.tileSize, 0);
            selGfx.stroke({ width: 4, color: 0xffffff, alpha: 0.9, alignment: 0, cap: 'butt' });
            selGfx.moveTo(this.tileSize, 0); selGfx.lineTo(this.tileSize, this.tileSize);
            selGfx.stroke({ width: 4, color: 0xffffff, alpha: 0.9, alignment: 0, cap: 'butt' });
            selGfx.moveTo(this.tileSize, this.tileSize); selGfx.lineTo(0, this.tileSize);
            selGfx.stroke({ width: 4, color: 0xffffff, alpha: 0.9, alignment: 0, cap: 'butt' });
            selGfx.moveTo(0, this.tileSize); selGfx.lineTo(0, 0);
            selGfx.stroke({ width: 4, color: 0xffffff, alpha: 0.9, alignment: 0, cap: 'butt' });
            selGfx.x = selTile.x * (this.tileSize + this.gap);
            selGfx.y = selTile.y * (this.tileSize + this.gap);
            selGfx.visible = true;

            const selectedTileData = this.game.map.getTile(selTile.x, selTile.y);
            const attackerDice = selectedTileData ? selectedTileData.dice : 0;
            const _isParallel = this.game.playMode === 'parallel' || this.game.playMode === 'parallel-s';
            const actingPlayerId = _isParallel ? selectedTileData?.owner : this.game.currentPlayer?.id;

            if (attackerDice > 1) {
                const neighbors = [
                    { x: selTile.x, y: selTile.y - 1, edge: 'top' },
                    { x: selTile.x, y: selTile.y + 1, edge: 'bottom' },
                    { x: selTile.x - 1, y: selTile.y, edge: 'left' },
                    { x: selTile.x + 1, y: selTile.y, edge: 'right' }
                ];
                const selectedPixelX = selTile.x * (this.tileSize + this.gap);
                const selectedPixelY = selTile.y * (this.tileSize + this.gap);
                const hasHint = this.gameSpeed === 'beginner' && shouldShowInputHints(this.inputManager);

                for (const neighbor of neighbors) {
                    const neighborTile = this.game.map.getTile(neighbor.x, neighbor.y);
                    if (!neighborTile || neighborTile.owner === actingPlayerId) continue;

                    const neighborPixelX = neighbor.x * (this.tileSize + this.gap);
                    const neighborPixelY = neighbor.y * (this.tileSize + this.gap);

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

                    let badgeX, badgeY;
                    switch (neighbor.edge) {
                        case 'top': badgeX = selectedPixelX + this.tileSize / 2; badgeY = selectedPixelY + (hasHint ? 8 : 2) - this.gap / 2; break;
                        case 'bottom': badgeX = selectedPixelX + this.tileSize / 2; badgeY = selectedPixelY + this.tileSize + this.gap / 2; break;
                        case 'left': badgeX = selectedPixelX - this.gap / 2; badgeY = selectedPixelY + this.tileSize / 2; break;
                        case 'right': badgeX = selectedPixelX + this.tileSize + this.gap / 2; badgeY = selectedPixelY + this.tileSize / 2; break;
                    }

                    if (this.gameSpeed === 'expert') {
                        this.updateProbabilityBadge(badgeIdx++, badgeX, badgeY, '', 0xffffff, neighbor.edge);
                    } else {
                        const defenderDice = neighborTile.dice;
                        const probability = getWinProbability(attackerDice, defenderDice, this.diceSides, this.game.attackRule);
                        const percentValue = probability * 100;
                        let percentStr;
                        if (percentValue < 1) {
                            percentStr = percentValue.toFixed(2).replace(/^0/, '');
                        } else {
                            let rounded = Math.round(percentValue);
                            if (rounded === 100 && probability < 1.0) rounded = 99;
                            percentStr = rounded.toString();
                        }
                        const probColor = getProbabilityHexColor(probability);
                        this.updateProbabilityBadge(badgeIdx++, badgeX, badgeY, `${percentStr}%`, probColor, neighbor.edge);
                    }
                }
            }

            // Attack target indicator: use this source's own hover/cursor
            const hoverForSource = this.hoverTiles.get(sourceId);
            const cursorForSource = this.cursorTiles.get(sourceId);
            const isCursorOnDifferentTile = cursorForSource &&
                (cursorForSource.x !== selTile.x || cursorForSource.y !== selTile.y);
            const targetTile = hoverForSource || (isCursorOnDifferentTile ? cursorForSource : null);

            if (targetTile) {
                const isAdjacent = Math.abs(selTile.x - targetTile.x) + Math.abs(selTile.y - targetTile.y) === 1;
                if (isAdjacent) {
                    const hGfx = this.getNeighborHighlighter(neighborIdx++);
                    hGfx.clear();
                    const tileContent = this.game.map.getTile(targetTile.x, targetTile.y);
                    const isEnemy = tileContent && tileContent.owner !== actingPlayerId;
                    const color = isEnemy ? 0xff0000 : 0xffffff;
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
                    // Hide this source's hover gfx (attack indicator replaces it)
                    if (this._hoverGfxPool.has(sourceId)) this._hoverGfxPool.get(sourceId).visible = false;
                } else {
                    const { nextBadgeIdx } = this._renderSmartHover(targetTile.x, targetTile.y, badgeIdx, sourceId);
                    badgeIdx = nextBadgeIdx;
                }
            }
        }

        // Hide selection graphics for sources that no longer have a selection
        for (const [sourceId, gfx] of this._selectionGfxPool) {
            if (!this.selectedTiles.has(sourceId)) gfx.visible = false;
        }

        // Hover for sources WITHOUT a selection
        const _parallelHover = this.game.playMode === 'parallel' || this.game.playMode === 'parallel-s';
        if (_parallelHover || !this.game.currentPlayer?.isBot) {
            for (const [cursorId, tile] of this.hoverTiles) {
                if (sourcesWithSelection.has(cursorId)) continue; // already handled above
                const { nextBadgeIdx } = this._renderSmartHover(tile.x, tile.y, badgeIdx, cursorId);
                badgeIdx = nextBadgeIdx;
            }
        }
    }

    /**
     * Internal helper to draw the "smart" hover highlight for a tile.
     * Differentiates between own attackable tiles, static own tiles, and non-interactable tiles.
     * cursorId identifies which cursor's Graphics object to use from the pool.
     */
    _renderSmartHover(x, y, badgeIdx, cursorId = 'mouse') {
        const hoverGfx = this._getHoverGfx(cursorId);
        const tileRaw = this.game.map.getTileRaw(x, y);
        if (!tileRaw || tileRaw.blocked) {
            hoverGfx.visible = false;
            return { nextBadgeIdx: badgeIdx };
        }

        const _isParallelHover = this.game.playMode === 'parallel' || this.game.playMode === 'parallel-s';
        let isOwned;
        if (_isParallelHover) {
            const tileOwner = this.game.players.find(p => p.id === tileRaw.owner);
            if (!tileOwner || tileOwner.isBot) {
                isOwned = false;
            } else if (cursorId.startsWith('gamepad-')) {
                const gpIdx = parseInt(cursorId.slice('gamepad-'.length));
                isOwned = this.inputManager?.canGamepadControlPlayer(gpIdx, tileRaw.owner) ?? false;
            } else {
                isOwned = true; // keyboard/mouse controls all human players
            }
        } else {
            isOwned = tileRaw.owner === this.game.currentPlayer.id;
        }
        const canAttackFrom = isOwned && tileRaw.dice > 1;

        // Check for direct attack shortcut (expert: any attackable enemy, pick best attacker)
        // Shortcut is only available in classic mode with no gamepads connected — mirror input-controller conditions
        const _isParallelMode = this.game.playMode === 'parallel' || this.game.playMode === 'parallel-s';
        const _gamepadsConnected = (this.inputManager?.connectedGamepadIndices?.size ?? 0) > 0;
        let isUniquelyAttackable = false;
        let uniqueAttacker = null;
        if (!isOwned && this.gameSpeed === 'expert' && !_isParallelMode && !_gamepadsConnected) {
            const neighbors = this.game.map.getAdjacentTiles(x, y);
            const attackers = neighbors.filter(n => n.owner === this.game.currentPlayer.id && n.dice > 1)
                .map(n => ({ x: n.x, y: n.y }));
            uniqueAttacker = this.pickBestAttackerForExpert(attackers, this.selectedTiles.get(cursorId));
            isUniquelyAttackable = !!uniqueAttacker;
        }

        hoverGfx.clear();
        // Pattern for fill
        hoverGfx.rect(0, 0, this.tileSize, this.tileSize);

        if (isUniquelyAttackable) {
            // Attack shortcut available: Red static highlight on target (hover)
            hoverGfx.fill({ color: 0xff0000, alpha: 0.2 });
            // Individual CW segments for stroke
            hoverGfx.moveTo(0, 0); hoverGfx.lineTo(this.tileSize, 0);
            hoverGfx.stroke({ width: 3, color: 0xff0000, alpha: 0.8, alignment: 0, cap: 'butt' });
            hoverGfx.moveTo(this.tileSize, 0); hoverGfx.lineTo(this.tileSize, this.tileSize);
            hoverGfx.stroke({ width: 3, color: 0xff0000, alpha: 0.8, alignment: 0, cap: 'butt' });
            hoverGfx.moveTo(this.tileSize, this.tileSize); hoverGfx.lineTo(0, this.tileSize);
            hoverGfx.stroke({ width: 3, color: 0xff0000, alpha: 0.8, alignment: 0, cap: 'butt' });
            hoverGfx.moveTo(0, this.tileSize); hoverGfx.lineTo(0, 0);
            hoverGfx.stroke({ width: 3, color: 0xff0000, alpha: 0.8, alignment: 0, cap: 'butt' });

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
            // Selectable & Actionable: Large white static border (badges only when selected, not on hover)
            hoverGfx.fill({ color: 0xffffff, alpha: 0.15 });
            // Individual CW segments for stroke
            hoverGfx.moveTo(0, 0); hoverGfx.lineTo(this.tileSize, 0);
            hoverGfx.stroke({ width: 3, color: 0xffffff, alpha: 0.8, alignment: 0, cap: 'butt' });
            hoverGfx.moveTo(this.tileSize, 0); hoverGfx.lineTo(this.tileSize, this.tileSize);
            hoverGfx.stroke({ width: 3, color: 0xffffff, alpha: 0.8, alignment: 0, cap: 'butt' });
            hoverGfx.moveTo(this.tileSize, this.tileSize); hoverGfx.lineTo(0, this.tileSize);
            hoverGfx.stroke({ width: 3, color: 0xffffff, alpha: 0.8, alignment: 0, cap: 'butt' });
            hoverGfx.moveTo(0, this.tileSize); hoverGfx.lineTo(0, 0);
            hoverGfx.stroke({ width: 3, color: 0xffffff, alpha: 0.8, alignment: 0, cap: 'butt' });
        } else if (isOwned) {
            // Selectable but no action: Subtle static white
            hoverGfx.fill({ color: 0xffffff, alpha: 0.1 });
            // Individual CW segments for stroke
            hoverGfx.moveTo(0, 0); hoverGfx.lineTo(this.tileSize, 0);
            hoverGfx.stroke({ width: 1, color: 0xffffff, alpha: 0.6, alignment: 0, cap: 'butt' });
            hoverGfx.moveTo(this.tileSize, 0); hoverGfx.lineTo(this.tileSize, this.tileSize);
            hoverGfx.stroke({ width: 1, color: 0xffffff, alpha: 0.6, alignment: 0, cap: 'butt' });
            hoverGfx.moveTo(this.tileSize, this.tileSize); hoverGfx.lineTo(0, this.tileSize);
            hoverGfx.stroke({ width: 1, color: 0xffffff, alpha: 0.6, alignment: 0, cap: 'butt' });
            hoverGfx.moveTo(0, this.tileSize); hoverGfx.lineTo(0, 0);
            hoverGfx.stroke({ width: 1, color: 0xffffff, alpha: 0.6, alignment: 0, cap: 'butt' });
        } else {
            // Not interactable: Very subtle dimmed highlight
            hoverGfx.fill({ color: 0x000000, alpha: 0.15 });
        }

        hoverGfx.x = x * (this.tileSize + this.gap);
        hoverGfx.y = y * (this.tileSize + this.gap);
        hoverGfx.visible = true;

        return { nextBadgeIdx: badgeIdx };
    }

    hidePools() {
        for (const h of this.neighborHighlighters) h.visible = false;
        for (const b of this.probabilityBadges) b.visible = false;
        for (const gfx of this._hoverGfxPool.values()) gfx.visible = false;
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

            // Input hint container (position set each update)
            const hintContainer = new Container();
            container.addChild(hintContainer);
            container.hintContainer = hintContainer;

            this.hintsContainer.addChild(container);
            this.probabilityBadges[index] = container;
        }

        const container = this.probabilityBadges[index];
        container.x = x;
        container.y = y;
        container.visible = true;

        const isSmall = text === '';

        // Determine hint first so badge width can be adjusted
        let hint = null;
        if (!isSmall && this.gameSpeed === 'beginner' && shouldShowInputHints(this.inputManager)) {
            let hintAction = null;
            switch (edge) {
                case 'top': hintAction = ACTION_MOVE_UP; break;
                case 'bottom': hintAction = ACTION_MOVE_DOWN; break;
                case 'left': hintAction = ACTION_MOVE_LEFT; break;
                case 'right': hintAction = ACTION_MOVE_RIGHT; break;
            }
            if (hintAction) {
                hint = getInputHint(hintAction, this.inputManager, this.game?.currentPlayer?.id);
            }
        }

        // Badge dimensions — wider when a sprite icon is inlined on the left
        const inlineSprite = hint?.textureName != null;
        const badgeWidth = isSmall ? 10 : (inlineSprite ? 44 : 28);
        const badgeHeight = isSmall ? 10 : 16;

        container.badgeBg.clear();
        container.badgeBg.rect(-badgeWidth / 2, -badgeHeight / 2, badgeWidth, badgeHeight);
        container.badgeBg.fill({ color: color, alpha: 0.95 });
        if (!isSmall) {
            container.badgeBg.stroke({ width: 1, color: 0x000000, alpha: 0.4 });
        }

        // Probability text — shifted right when sharing space with an inline icon
        container.probText.text = text;
        container.probText.x = inlineSprite ? 10 : 0;
        // Match text raster resolution to current zoom so glyphs stay sharp when zoomed in
        container.probText.resolution = this.stage.scale.x * (window.devicePixelRatio || 1);

        // Hint rendering
        container.hintContainer.removeChildren();
        if (hint) {
            if (inlineSprite) {
                // Sprite inside the badge, left side
                container.hintContainer.x = -11;
                container.hintContainer.y = 0;
                try {
                    const tex = Texture.from(hint.textureName);
                    const sprite = new Sprite(tex);
                    sprite.anchor.set(0.5);
                    sprite.width = 14;
                    sprite.height = 14;
                    container.hintContainer.addChild(sprite);
                } catch (e) { /* atlas not ready yet */ }
            } else {
                // Text hint above the badge (keyboard / fallback)
                container.hintContainer.x = 0;
                container.hintContainer.y = -14;
                const hintWidth = hint.label.length * 7 + 6;
                const hintHeight = 14;
                const hintBg = new Graphics();
                if (hint.style === 'keyboard') {
                    hintBg.roundRect(-hintWidth / 2, -hintHeight / 2, hintWidth, hintHeight, 3);
                    hintBg.fill({ color: 0x000000, alpha: 0.8 });
                    hintBg.stroke({ width: 1, color: 0x00ffff, alpha: 0.6 });
                } else {
                    hintBg.circle(0, 0, 8);
                    hintBg.fill({ color: 0x666666, alpha: 0.9 });
                    hintBg.stroke({ width: 1, color: 0x000000, alpha: 0.5 });
                }
                container.hintContainer.addChild(hintBg);
                const hintText = new Text({ text: hint.label, style: this.hintTextStyle });
                hintText.anchor.set(0.5, 0.5);
                hintText.style.fontSize = hint.type === 'gamepad' ? 10 : 11;
                hintText.resolution = this.stage.scale.x * (window.devicePixelRatio || 1);
                container.hintContainer.addChild(hintText);
            }
        } else {
            container.hintContainer.x = 0;
            container.hintContainer.y = -14;
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

    // ── Supply animation helpers ─────────────────────────────────────────────

    /** Set a temporary visual dice count for one tile and mark it dirty. */
    setDiceOverride(x, y, count) {
        const idx = x + y * this.game.map.width;
        this._diceOverrides.set(idx, count);
        this.lastTileStates.delete(idx); // force redraw
    }

    /** Remove all overrides and force a full redraw. */
    clearDiceOverrides() {
        for (const idx of this._diceOverrides.keys()) this.lastTileStates.delete(idx);
        this._diceOverrides.clear();
    }

    /** Brief white flash+scale overlay on a tile to indicate a die was placed. */
    _wobbleTile(x, y) {
        const px = x * (this.tileSize + this.gap);
        const py = y * (this.tileSize + this.gap);
        const gfx = new Graphics();
        gfx.rect(0, 0, this.tileSize, this.tileSize);
        gfx.fill({ color: 0xffffff, alpha: 0 });
        gfx.x = px;
        gfx.y = py;
        this.animationContainer.addChild(gfx);
        this.animator.addTween({
            duration: 8,
            onUpdate: (p) => {
                const s = 1 + 0.2 * Math.sin(p * Math.PI);
                gfx.alpha = Math.sin(p * Math.PI) * 0.55;
                gfx.scale.set(s);
                gfx.x = px - (s - 1) * this.tileSize / 2;
                gfx.y = py - (s - 1) * this.tileSize / 2;
            },
            onComplete: () => gfx.destroy(),
        });
    }

    /** Small label that floats upward from the centre of a tile and fades out. */
    _showTileFloat(x, y, text, color) {
        const px = x * (this.tileSize + this.gap) + this.tileSize / 2;
        const py = y * (this.tileSize + this.gap) + this.tileSize / 2;
        const fontSize = Math.max(6, Math.round(this.tileSize * 0.22));
        const label = new Text({
            text,
            style: new TextStyle({
                fontFamily: 'Rajdhani, Arial',
                fontSize,
                fontWeight: '700',
                fill: '#ffffff',
                stroke: { color, width: 3 },
                dropShadow: true,
                dropShadowBlur: 6,
                dropShadowDistance: 1,
            }),
        });
        label.anchor.set(0.5);
        label.x = px;
        label.y = py;
        label.alpha = 0;
        this.animationContainer.addChild(label);
        this.animator.addTween({
            duration: 40,
            onUpdate: (p) => {
                label.alpha = p < 0.2 ? p / 0.2 : p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1;
                label.y = py - p * this.tileSize * 0.24;
            },
            onComplete: () => label.destroy(),
        });
    }

    /** Brief coloured flash overlay on a tile (e.g. white burst for Reborn). */
    _flashTile(x, y, color, frames = 12) {
        const px = x * (this.tileSize + this.gap);
        const py = y * (this.tileSize + this.gap);
        const gfx = new Graphics();
        gfx.rect(0, 0, this.tileSize, this.tileSize);
        gfx.fill({ color, alpha: 0 });
        gfx.x = px;
        gfx.y = py;
        this.animationContainer.addChild(gfx);
        this.animator.addTween({
            duration: frames,
            onUpdate: (p) => { gfx.alpha = Math.sin(p * Math.PI) * 0.85; },
            onComplete: () => gfx.destroy(),
        });
    }

    /**
     * Supply animation: region pulse + big "+N" text + one-by-one die placement.
     * Runs in beginner and normal mode; expert skips entirely.
     * @param {Object}   data       - reinforcements event data
     * @param {Function} onComplete - called when animation finishes
     */

    /**
     * Show a large centred label that pops in, holds, then dissolves.
     * Font size auto-scales so the text always fits within 80 % of the screen width.
     * No-ops on mobile (≤768 px wide or ≤720 px tall).
     * @param {string} text - text to display
     * @param {number} color - hex colour for the stroke / glow (e.g. 0x00ffff)
     * @param {number} [durationFrames=120] - total animation length in frames (~2 s at 60 fps)
     */
    showBigLabel(text, color, durationFrames = 180, yOffset = 0) {
        if (window.innerWidth <= 768 || window.innerHeight <= 720) return;

        const screenW = this.app?.screen.width ?? window.innerWidth;
        const screenH = this.app?.screen.height ?? window.innerHeight;
        const labelX = (screenW / 2 - this.stage.x) / this.stage.scale.x;
        const labelY = (screenH / 2 - this.stage.y) / this.stage.scale.y;

        const baseSize = Math.round(this.tileSize * 1.4);
        const maxByWidth = Math.floor((screenW * 0.8) / (text.length * 0.6));
        const fontSize = Math.min(baseSize, maxByWidth);

        const label = new Text({
            text,
            style: new TextStyle({
                fontFamily: 'Rajdhani, Arial',
                fontSize,
                fontWeight: '700',
                fill: '#ffffff',
                stroke: { color, width: 4 },
                dropShadow: true,
                dropShadowBlur: 10,
                dropShadowDistance: 2,
            }),
        });
        label.anchor.set(0.5);
        label.x = labelX;
        label.y = labelY + yOffset;
        label.alpha = 0;
        label.scale.set(0.3);
        this.animationContainer.addChild(label);

        this.animator.addTween({
            duration: durationFrames,
            onUpdate: (p) => {
                if (p < 0.15) {
                    const t = p / 0.15;
                    label.alpha = t;
                    label.scale.set(0.5 + t * 0.7);
                } else if (p < 0.36) {
                    label.alpha = 1;
                    label.scale.set(1.2);
                } else if (p < 0.60) {
                    label.alpha = 1 - (p - 0.36) / 0.24;
                    label.scale.set(1.2 + (p - 0.36) / 0.24 * 0.6);
                } else {
                    label.alpha = 0;
                }
            },
            onComplete: () => label.destroy(),
        });
    }

    animateSupply(data, sfx, onComplete) {
        if (this.gameSpeed === 'expert') { onComplete?.(); return; }
        this._supplyAnimActive = true;

        const placements = data.placements || [];
        const events = data.events?.length ? data.events : null;
        const totalDice = (data.placed || 0) + (data.stored || 0);
        const dropped = data.dropped || 0;
        const supplyRule = data.supplyRule || 'classic';
        const mapWidth = this.game.map.width;
        const playerColor = data.player.color;
        const totalFrames = this.gameSpeed === 'beginner'
            ? GAME.SUPPLY_ANIM_FRAMES_BEGINNER
            : GAME.SUPPLY_ANIM_FRAMES_NORMAL;

        // Phase split: 25 % for region reveal, 75 % for sequential placement
        const phaseARatio = 0.25;
        const phaseBRatio = 0.75;

        // ── Region tiles (source of the animation) ───────────────────────────
        const regionTiles = this.game.map.findLargestConnectedRegionTiles(data.player.id);

        // ── Phase A: pulsing overlay + "+N" label ─────────────────────────────
        const overlays = [];
        for (const t of regionTiles) {
            const gfx = new Graphics();
            gfx.rect(0, 0, this.tileSize, this.tileSize);
            gfx.fill({ color: playerColor, alpha: 1 });
            gfx.x = t.x * (this.tileSize + this.gap);
            gfx.y = t.y * (this.tileSize + this.gap);
            gfx.alpha = 0;
            this.animationContainer.addChild(gfx);
            overlays.push(gfx);
        }


        // ── "+N" label: pop in, brief hold, fast dissolve ────────────────────
        const hasFullLabel = supplyRule === 'no_stack' && dropped > 0;
        const baseOffset = hasFullLabel ? Math.round(this.tileSize * 0.9) : 0;
        this.showBigLabel(`+${totalDice}`, playerColor, totalFrames, -baseOffset);
        if (hasFullLabel) {
            this.showBigLabel('Full', 0xff3322, totalFrames, baseOffset);
        }

        // ── Main tween: runs for the full duration ────────────────────────────
        const stepList = events || placements.map(p => ({ ...p, type: 'place' }));

        // ── Pre-compute dice overrides (show pre-reinforcement counts) ────────
        if (stepList.length > 0) {
            const placementCounts = new Map();
            for (const p of placements) {
                const idx = p.x + p.y * mapWidth;
                placementCounts.set(idx, (placementCounts.get(idx) || 0) + 1);
            }
            for (const [idx, cnt] of placementCounts) {
                const x = idx % mapWidth;
                const y = Math.floor(idx / mapWidth);
                const tile = this.game.map.getTileRaw(x, y);
                if (tile) this.setDiceOverride(x, y, tile.dice - cnt);
            }
            // Reborn tiles: always show maxDice until the reborn event fires
            if (supplyRule === 'reborn' && events) {
                for (const ev of events) {
                    if (ev.type === 'reborn') {
                        this.setDiceOverride(ev.x, ev.y, this.game.maxDice);
                    }
                }
            }
            this.draw();
        }

        let stepIndex = 0;
        let nextStepProgress = phaseARatio;
        const stepProgressInterval = stepList.length > 0
            ? phaseBRatio / stepList.length
            : Infinity;

        this.animator.addTween({
            duration: totalFrames,
            onUpdate: (p) => {
                // Overlay pulse
                const pulse = 0.15 + 0.12 * Math.sin(p * Math.PI * 8);
                for (const gfx of overlays) gfx.alpha = pulse;

                // Phase B: step through events
                if (stepList.length > 0) {
                    let stepsThisFrame = 0;
                    while (stepIndex < stepList.length &&
                        p >= nextStepProgress &&
                        stepsThisFrame < 6) {
                        const ev = stepList[stepIndex++];
                        nextStepProgress += stepProgressInterval;
                        stepsThisFrame++;

                        if (ev.type === 'reject') {
                            this._showTileFloat(ev.x, ev.y, 'Full', 0xff3322);
                        } else if (ev.type === 'reborn') {
                            // Snap tile to 1 die, flash white, show label
                            this.setDiceOverride(ev.x, ev.y, 1);
                            this._flashTile(ev.x, ev.y, 0xffffff, 14);
                            this._showTileFloat(ev.x, ev.y, 'Reborn', 0xff3322);
                        } else {
                            const idx = ev.x + ev.y * mapWidth;
                            const cur = this._diceOverrides.get(idx) ?? 0;
                            this.setDiceOverride(ev.x, ev.y, cur + 1);
                            this._wobbleTile(ev.x, ev.y);
                            if (this.gameSpeed !== 'expert') sfx?.coin();
                        }
                    }
                    if (stepsThisFrame > 0) this.draw();
                }
            },
            onComplete: () => {
                // Clean up
                this._supplyAnimActive = false;
                for (const gfx of overlays) gfx.destroy();
                this.clearDiceOverrides();
                this.draw(); // restore final counts
                onComplete?.();
            },
        });

        // ── All-full fallback: flash the end-turn button ───────────────────────
        if (stepList.length === 0) {
            const btn = document.getElementById('end-turn-btn');
            if (btn) {
                btn.classList.add('supply-flash');
                setTimeout(() => btn.classList.remove('supply-flash'),
                    Math.round(totalFrames * 1000 / 60));
            }
        }
    }
}
