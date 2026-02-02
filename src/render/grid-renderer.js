import { Graphics, Container, Text, TextStyle, Sprite } from 'pixi.js';
import { TileRenderer } from './tile-renderer.js';
import { RENDER } from '../core/constants.js';
import { getWinProbability, getProbabilityHexColor } from '../core/probability.js';

export class GridRenderer {
    constructor(stage, game, animator) {
        this.stage = stage;
        this.game = game;
        this.animator = animator;
        this.container = new Container();
        this.stage.addChild(this.container);

        // Container for overlays (selection, hover)
        this.overlayContainer = new Container();
        this.stage.addChild(this.overlayContainer); // Above tiles

        // Container for temporary animations (so they don't get cleared by drawOverlay)
        this.animationContainer = new Container();
        this.stage.addChild(this.animationContainer);

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

        // Editor paint mode (neutral rendering)
        this.paintMode = false;

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
    }

    /**
     * Mark the grid as needing a full redraw (e.g., after map change)
     */
    invalidate() {
        this.needsFullRedraw = true;
        this.lastTileStates.clear();
    }

    /**
     * Check if a tile needs redrawing based on its current state
     */
    isTileDirty(tileIdx, tileRaw, isCurrentPlayer, isInLargestRegion) {
        const lastState = this.lastTileStates.get(tileIdx);
        if (!lastState) return true;

        return lastState.owner !== tileRaw.owner ||
            lastState.dice !== tileRaw.dice ||
            lastState.blocked !== tileRaw.blocked ||
            lastState.isCurrentPlayer !== isCurrentPlayer ||
            lastState.isInLargestRegion !== isInLargestRegion;
    }

    /**
     * Store the current state of a tile for future dirty checking
     */
    saveTileState(tileIdx, tileRaw, isCurrentPlayer, isInLargestRegion) {
        this.lastTileStates.set(tileIdx, {
            owner: tileRaw.owner,
            dice: tileRaw.dice,
            blocked: tileRaw.blocked,
            isCurrentPlayer,
            isInLargestRegion
        });
    }

    setPaintMode(enabled) {
        this.paintMode = enabled;
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

        // Paint mode border (only on full redraw)
        if (this.paintMode && needsFullRedraw) {
            const borderGfx = new Graphics();
            borderGfx.rect(-2, -2, mapPixelWidth + 4 - this.gap, mapPixelHeight + 4 - this.gap);
            borderGfx.stroke({ width: 2, color: 0xFFFFFF, alpha: 0.3 });
            this.container.addChild(borderGfx);
        }

        // Get largest connected regions for ALL alive players
        const largestRegions = new Map();
        for (const player of this.game.players) {
            if (player.alive) {
                largestRegions.set(player.id, this.getLargestConnectedRegionTiles(player.id));
            }
        }

        // Clear and recollect edges for current player's shimmer effect
        this.currentPlayerRegionEdges = [];

        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                const tileIdx = map.getTileIndex(x, y);
                const tileRaw = map.getTileRaw(x, y);
                const isCurrentPlayer = tileRaw.owner === currentPlayerId;
                const ownerLargestRegion = largestRegions.get(tileRaw.owner);
                const isInLargestRegion = ownerLargestRegion?.has(tileIdx) || false;

                // Check if this tile needs redrawing
                const isDirty = needsFullRedraw ||
                    playerChanged ||
                    this.isTileDirty(tileIdx, tileRaw, isCurrentPlayer, isInLargestRegion);

                if (isDirty) {
                    // Remove old cached tile if it exists
                    const oldTile = this.tileCache.get(tileIdx);
                    if (oldTile) {
                        oldTile.destroy({ children: true });
                        this.tileCache.delete(tileIdx);
                    }

                    // Create new tile
                    const tileContainer = this.createTileContainer(x, y, tileRaw, currentPlayer, isCurrentPlayer, isInLargestRegion, largestRegions, map);
                    this.container.addChild(tileContainer);
                    this.tileCache.set(tileIdx, tileContainer);

                    // Save state for future dirty checking
                    this.saveTileState(tileIdx, tileRaw, isCurrentPlayer, isInLargestRegion);
                }

                // Always collect shimmer edges for current player (even if tile not dirty)
                if (!tileRaw.blocked && isCurrentPlayer && isInLargestRegion && !this.paintMode) {
                    this.collectShimmerEdges(x, y, tileRaw, map);
                }
            }
        }

        this.drawOverlay();
    }

    /**
     * Create a tile container with all graphics
     */
    createTileContainer(x, y, tileRaw, currentPlayer, isCurrentPlayer, isInLargestRegion, largestRegions, map) {
        const tileContainer = new Container();
        tileContainer.x = x * (this.tileSize + this.gap);
        tileContainer.y = y * (this.tileSize + this.gap);

        const tileGfx = new Graphics();

        // Handle blocked tiles
        if (tileRaw.blocked) {
            tileGfx.rect(0, 0, this.tileSize, this.tileSize);
            tileGfx.fill({ color: 0x080818, alpha: 0.5 });
            tileContainer.addChild(tileGfx);
            return tileContainer;
        }

        const owner = this.game.players.find(p => p.id === tileRaw.owner);
        const color = owner ? owner.color : 0x333333;

        // Tron style: Bright fill
        const fillAlpha = isCurrentPlayer ? 0.6 : 0.3;

        tileGfx.rect(0, 0, this.tileSize, this.tileSize);

        if (this.paintMode) {
            // Paint mode: Neutral gray, no numbers, simple border
            tileGfx.fill({ color: 0x444444, alpha: 0.8 });
            tileGfx.stroke({ width: 1, color: 0x666666, alpha: 0.8 });
        } else {
            // Normal game mode
            tileGfx.fill({ color: color, alpha: fillAlpha });

            // Border logic
            if (isCurrentPlayer) {
                const borderColor = currentPlayer.isBot ? color : 0xffffff;
                if (tileRaw.dice > 1) {
                    tileGfx.stroke({ width: 2, color: borderColor, alpha: 1.0 });
                } else {
                    tileGfx.stroke({ width: 2, color: borderColor, alpha: 0.8 });
                }
            } else {
                tileGfx.stroke({ width: 1, color: color, alpha: 0.6 });
            }

            // Draw OUTER borders for largest region tiles
            if (isInLargestRegion) {
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
                }

                tileGfx.moveTo(edge.x1, edge.y1);
                tileGfx.lineTo(edge.x2, edge.y2);
                tileGfx.stroke({ width: 2, color: borderColor, alpha: 0.85 });
            }
        }
    }

    /**
     * Collect shimmer effect edges for a tile
     */
    collectShimmerEdges(x, y, tileRaw, map) {
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

                this.currentPlayerRegionEdges.push({
                    x1: ex1, y1: ey1,
                    x2: ex2, y2: ey2
                });
            }
        }
    }

    getLargestConnectedRegionTiles(playerId) {
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

        // Return the largest region
        if (regions.length === 0) return new Set();
        return regions.reduce((a, b) => a.size > b.size ? a : b);
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

        // Show shimmer for current player (human or bot)
        const currentPlayer = this.game.currentPlayer;
        if (!currentPlayer || this.currentPlayerRegionEdges.length === 0) {
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

        // === ANIMATION CONFIG ===
        const CYCLE_DURATION = RENDER.SHIMMER_CYCLE_DURATION;
        const TRAIL_SEGMENTS = RENDER.SHIMMER_TRAIL_SEGMENTS;

        // Update time consistently
        this.shimmerTime += deltaTime;

        // Calculate animation progress (0 to 1, loops)
        const cycleProgress = (this.shimmerTime / CYCLE_DURATION) % 1;

        // Draw one comet on EACH edge, all in sync
        for (const edge of this.currentPlayerRegionEdges) {
            const dx = edge.x2 - edge.x1;
            const dy = edge.y2 - edge.y1;
            const edgeLength = Math.sqrt(dx * dx + dy * dy);

            if (edgeLength === 0) continue;

            // Comet position along this edge (0 to 1)
            const headT = cycleProgress;

            // Draw trail segments (including head at seg 0)
            for (let seg = 0; seg <= TRAIL_SEGMENTS; seg++) {
                // Trail position (behind head)
                const segT = headT - (seg * 0.08); // Each segment is 8% behind

                // Wrap around if needed (trail goes off start of edge)
                if (segT < 0) continue; // Don't draw trail that's off the edge

                const x = edge.x1 + dx * segT;
                const y = edge.y1 + dy * segT;

                // Fade: head is brightest
                const fadeProgress = seg / TRAIL_SEGMENTS;
                const alpha = (1 - fadeProgress) * 0.8;
                const size = 2.5 - fadeProgress * 1.5;

                if (size > 0.5 && alpha > 0.05) {
                    if (seg === 0) {
                        // Bright head with glow
                        const s1 = size + 3;
                        this.shimmerGraphics.rect(x - s1, y - s1, s1 * 2, s1 * 2);
                        this.shimmerGraphics.fill({ color: 0xffffff, alpha: alpha * 0.15 });

                        const s2 = size + 1.5;
                        this.shimmerGraphics.rect(x - s2, y - s2, s2 * 2, s2 * 2);
                        this.shimmerGraphics.fill({ color: 0xffffff, alpha: alpha * 0.4 });

                        this.shimmerGraphics.rect(x - size, y - size, size * 2, size * 2);
                        this.shimmerGraphics.fill({ color: 0xffffff, alpha: alpha });
                    } else {
                        // Trail particles
                        this.shimmerGraphics.rect(x - size, y - size, size * 2, size * 2);
                        this.shimmerGraphics.fill({ color: 0xffffff, alpha: alpha });
                    }
                }
            }
        }
    }

    drawOverlay() {
        this.overlayContainer.removeChildren();

        // Draw keyboard/gamepad cursor (distinct from hover)
        if (this.cursorTile) {
            // Animate pulse
            this.cursorPulse = (this.cursorPulse + 0.1) % (Math.PI * 2);
            const pulseAlpha = 0.5 + Math.sin(this.cursorPulse) * 0.3;

            const cursorGfx = new Graphics();
            const inset = 3; // Draw cursor slightly inside tile

            // Draw pulsing diamond/crosshair cursor
            cursorGfx.rect(inset, inset, this.tileSize - inset * 2, this.tileSize - inset * 2);
            cursorGfx.stroke({ width: 3, color: 0x00ffff, alpha: pulseAlpha }); // Cyan cursor

            // Corner brackets for extra visibility
            const bracketSize = 10;
            // Top-left
            cursorGfx.moveTo(0, bracketSize);
            cursorGfx.lineTo(0, 0);
            cursorGfx.lineTo(bracketSize, 0);
            // Top-right
            cursorGfx.moveTo(this.tileSize - bracketSize, 0);
            cursorGfx.lineTo(this.tileSize, 0);
            cursorGfx.lineTo(this.tileSize, bracketSize);
            // Bottom-right
            cursorGfx.moveTo(this.tileSize, this.tileSize - bracketSize);
            cursorGfx.lineTo(this.tileSize, this.tileSize);
            cursorGfx.lineTo(this.tileSize - bracketSize, this.tileSize);
            // Bottom-left
            cursorGfx.moveTo(bracketSize, this.tileSize);
            cursorGfx.lineTo(0, this.tileSize);
            cursorGfx.lineTo(0, this.tileSize - bracketSize);
            cursorGfx.stroke({ width: 2, color: 0x00ffff, alpha: 1.0 });

            cursorGfx.x = this.cursorTile.x * (this.tileSize + this.gap);
            cursorGfx.y = this.cursorTile.y * (this.tileSize + this.gap);
            this.overlayContainer.addChild(cursorGfx);
        }

        // Draw Selection
        if (this.selectedTile) {
            const gfx = new Graphics();
            gfx.rect(0, 0, this.tileSize, this.tileSize);
            gfx.stroke({ width: 4, color: 0xffffff, alpha: 1.0 });
            gfx.fill({ color: 0xffffff, alpha: 0.4 });

            gfx.x = this.selectedTile.x * (this.tileSize + this.gap);
            gfx.y = this.selectedTile.y * (this.tileSize + this.gap);
            this.overlayContainer.addChild(gfx);

            // Get selected tile info for probability calculation
            const selectedTileData = this.game.map.getTile(this.selectedTile.x, this.selectedTile.y);
            const attackerDice = selectedTileData ? selectedTileData.dice : 0;

            // Collect probability badges to add after hover/attack indicator (for z-order)
            const probabilityBadges = [];

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

                    // Beginner mode: show pulsing dashed highlight on attackable neighbors
                    if (this.gameSpeed === 'beginner') {
                        const highlightGfx = new Graphics();
                        const inset = 4;

                        // Draw pulsing border
                        const pulseAlpha = 0.4 + Math.sin(this.cursorPulse * 1.5) * 0.2;
                        highlightGfx.rect(inset, inset, this.tileSize - inset * 2, this.tileSize - inset * 2);
                        highlightGfx.stroke({ width: 2, color: 0x00ffff, alpha: pulseAlpha });

                        highlightGfx.x = neighborPixelX;
                        highlightGfx.y = neighborPixelY;
                        this.overlayContainer.addChild(highlightGfx);
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
                            badgeY = selectedPixelY - this.gap / 2;
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

                    // Create probability badge
                    const badgeContainer = new Container();
                    badgeContainer.x = badgeX;
                    badgeContainer.y = badgeY;

                    // Background pill
                    const badgeWidth = 28;
                    const badgeHeight = 16;
                    const badgeBg = new Graphics();
                    badgeBg.roundRect(-badgeWidth / 2, -badgeHeight / 2, badgeWidth, badgeHeight, 3);
                    badgeBg.fill({ color: probColor, alpha: 0.9 });
                    badgeBg.stroke({ width: 1, color: 0x000000, alpha: 0.3 });
                    badgeContainer.addChild(badgeBg);

                    // Probability text
                    const probText = new Text({
                        text: `${probabilityPercent}%`,
                        style: this.probabilityTextStyle
                    });
                    probText.anchor.set(0.5, 0.5);
                    badgeContainer.addChild(probText);

                    // Collect badge to add later (after attack indicator)
                    probabilityBadges.push(badgeContainer);
                }
            }

            // Draw Target Hover or Cursor target
            const isCursorOnDifferentTile = this.cursorTile && (this.cursorTile.x !== this.selectedTile.x || this.cursorTile.y !== this.selectedTile.y);
            const targetTile = this.hoverTile || (isCursorOnDifferentTile ? this.cursorTile : null);

            if (targetTile) {
                // If adjacent to selection, show attack indicator
                const isAdjacent = Math.abs(this.selectedTile.x - targetTile.x) + Math.abs(this.selectedTile.y - targetTile.y) === 1;

                if (isAdjacent) {
                    const hGfx = new Graphics();
                    hGfx.rect(0, 0, this.tileSize, this.tileSize);

                    const tile = this.game.map.getTile(targetTile.x, targetTile.y);
                    const isEnemy = tile && tile.owner !== this.game.currentPlayer.id;

                    if (isEnemy) {
                        // Attack cursor
                        hGfx.stroke({ width: 4, color: 0xff0000, alpha: 0.8 }); // Red
                    }

                    hGfx.x = targetTile.x * (this.tileSize + this.gap);
                    hGfx.y = targetTile.y * (this.tileSize + this.gap);
                    this.overlayContainer.addChild(hGfx);
                }
            }

            // Add probability badges last (on top of attack indicator)
            for (const badge of probabilityBadges) {
                this.overlayContainer.addChild(badge);
            }
        } else if (this.hoverTile) {
            // Just hovering without selection - show subtle highlight for any tile
            if (this.game.currentPlayer?.isBot) return;

            const tileRaw = this.game.map.getTileRaw(this.hoverTile.x, this.hoverTile.y);
            if (tileRaw) {
                const gfx = new Graphics();
                gfx.rect(0, 0, this.tileSize, this.tileSize);

                const tile = this.game.map.getTile(this.hoverTile.x, this.hoverTile.y);
                const isOwnTile = tile && tile.owner === this.game.currentPlayer?.id && tile.dice > 1;

                // Brighter highlight for own selectable tiles, subtle for others
                const alpha = isOwnTile ? 0.6 : 0.2;
                const color = isOwnTile ? 0xffffff : 0xaaaaaa;

                gfx.stroke({ width: 2, color: color, alpha: alpha });
                gfx.x = this.hoverTile.x * (this.tileSize + this.gap);
                gfx.y = this.hoverTile.y * (this.tileSize + this.gap);
                this.overlayContainer.addChild(gfx);
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
                glow.stroke({ color: 0xffffff, width: 8, alpha: 0.5 });
                group.addChild(glow);

                const high = new Graphics();
                high.rect(-this.tileSize / 2, -this.tileSize / 2, this.tileSize, this.tileSize);
                high.fill({ color: color, alpha: 0.8 });
                high.stroke({ color: 0xffffff, width: 4, alpha: 1.0 });
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
