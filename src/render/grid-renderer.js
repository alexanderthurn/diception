import { Graphics, Container, Text, TextStyle, Sprite } from 'pixi.js';
import { TileRenderer } from './tile-renderer.js';

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

        this.tileSize = 60;
        this.gap = 4;

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
        this.stage.addChild(this.shimmerContainer);

        // Cache for current player's largest region edges
        this.currentPlayerRegionEdges = [];
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
        this.container.removeChildren();

        const map = this.game.map;

        const mapPixelWidth = map.width * (this.tileSize + this.gap);
        const mapPixelHeight = map.height * (this.tileSize + this.gap);

        this.container.x = 0;
        this.container.y = 0;

        this.overlayContainer.x = 0;
        this.overlayContainer.y = 0;

        // Get largest connected regions for ALL alive players
        const largestRegions = new Map();
        for (const player of this.game.players) {
            if (player.alive) {
                largestRegions.set(player.id, this.getLargestConnectedRegionTiles(player.id));
            }
        }

        const currentPlayer = this.game.currentPlayer;

        // Clear and recollect edges for current player's shimmer effect
        this.currentPlayerRegionEdges = [];

        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                const tileRaw = map.getTileRaw(x, y);
                const tileContainer = new Container();
                tileContainer.x = x * (this.tileSize + this.gap);
                tileContainer.y = y * (this.tileSize + this.gap);

                const tileGfx = new Graphics();

                // Handle blocked tiles
                if (tileRaw.blocked) {
                    tileGfx.rect(0, 0, this.tileSize, this.tileSize);
                    tileGfx.fill({ color: 0x080818, alpha: 0.5 });
                    tileContainer.addChild(tileGfx);
                    this.container.addChild(tileContainer);
                    continue;
                }

                const owner = this.game.players.find(p => p.id === tileRaw.owner);
                const color = owner ? owner.color : 0x333333;
                const isCurrentPlayer = tileRaw.owner === currentPlayer?.id;
                const tileIdx = map.getTileIndex(x, y);

                // Check if this tile is in ANY player's largest region
                const ownerLargestRegion = largestRegions.get(tileRaw.owner);
                const isInLargestRegion = ownerLargestRegion?.has(tileIdx) || false;

                // Tron style: Bright fill
                const fillAlpha = isCurrentPlayer ? 0.6 : 0.3;

                tileGfx.rect(0, 0, this.tileSize, this.tileSize);
                tileGfx.fill({ color: color, alpha: fillAlpha });

                // Border logic
                if (isCurrentPlayer) {
                    // Use white border for human players, player color for bots
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
                                // Use white for human players, player color for bots
                                borderColor = currentPlayer.isBot ? color : 0xffffff;
                            } else {
                                // Non-current players get dimmed color
                                const r = (color >> 16) & 0xFF;
                                const g = (color >> 8) & 0xFF;
                                const b = color & 0xFF;
                                borderColor = ((r * 0.6) << 16) | ((g * 0.6) << 8) | (b * 0.6);
                            }

                            tileGfx.moveTo(edge.x1, edge.y1);
                            tileGfx.lineTo(edge.x2, edge.y2);
                            tileGfx.stroke({ width: 2, color: borderColor, alpha: 0.85 });

                            // Collect edges for current player's shimmer effect
                            // Orient edges for CLOCKWISE flow:
                            // - Top edges (dy=-1): left→right (x1<x2) - already correct
                            // - Right edges (dx=1): top→bottom (y1<y2) - already correct
                            // - Bottom edges (dy=1): right→left - swap to x1>x2
                            // - Left edges (dx=-1): bottom→top - swap to y1>y2
                            if (isCurrentPlayer) {
                                const pixelX = x * (this.tileSize + this.gap);
                                const pixelY = y * (this.tileSize + this.gap);

                                let ex1 = pixelX + edge.x1;
                                let ey1 = pixelY + edge.y1;
                                let ex2 = pixelX + edge.x2;
                                let ey2 = pixelY + edge.y2;

                                // Swap for clockwise orientation
                                if (edge.dy === 1) {
                                    // Bottom edge: should flow right to left
                                    [ex1, ex2] = [ex2, ex1];
                                } else if (edge.dx === -1) {
                                    // Left edge: should flow bottom to top
                                    [ey1, ey2] = [ey2, ey1];
                                }

                                this.currentPlayerRegionEdges.push({
                                    x1: ex1, y1: ey1,
                                    x2: ex2, y2: ey2
                                });
                            }
                        }
                    }
                }

                tileContainer.addChild(tileGfx);

                // Dice color: White (null tint) for active player, player color for inactive
                const diceColor = isCurrentPlayer ? null : color;
                this.renderDice(tileContainer, tileRaw.dice, diceColor);

                this.container.addChild(tileContainer);
            }
        }

        this.drawOverlay();
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
     */
    updateShimmer(deltaTime = 1 / 60) {
        this.shimmerContainer.removeChildren();

        // Skip shimmer if effects are off
        if (this.effectsQuality === 'off') {
            return;
        }

        // Show shimmer for current player (human or bot)
        const currentPlayer = this.game.currentPlayer;
        if (!currentPlayer || this.currentPlayerRegionEdges.length === 0) {
            return;
        }

        // === ANIMATION CONFIG ===
        const CYCLE_DURATION = 2; // Seconds for one complete cycle (0 to 1 and back)
        const TRAIL_SEGMENTS = 1; // Number of trail segments behind the head

        // Update time consistently
        this.shimmerTime += deltaTime;

        // Calculate animation progress (0 to 1, loops)
        const cycleProgress = (this.shimmerTime / CYCLE_DURATION) % 1;

        const shimmerGfx = new Graphics();

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
                        shimmerGfx.rect(x - s1, y - s1, s1 * 2, s1 * 2);
                        shimmerGfx.fill({ color: 0xffffff, alpha: alpha * 0.15 });

                        const s2 = size + 1.5;
                        shimmerGfx.rect(x - s2, y - s2, s2 * 2, s2 * 2);
                        shimmerGfx.fill({ color: 0xffffff, alpha: alpha * 0.4 });

                        shimmerGfx.rect(x - size, y - size, size * 2, size * 2);
                        shimmerGfx.fill({ color: 0xffffff, alpha: alpha });
                    } else {
                        // Trail particles
                        shimmerGfx.rect(x - size, y - size, size * 2, size * 2);
                        shimmerGfx.fill({ color: 0xffffff, alpha: alpha });
                    }
                }
            }
        }

        this.shimmerContainer.addChild(shimmerGfx);
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

            // Also create a "+" icon
            const plusText = new Text({
                text: '🎲',
                style: {
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: 24,
                    fill: '#ffffff',
                }
            });
            plusText.anchor.set(0.5);
            plusText.x = pixelX + this.tileSize / 2;
            plusText.y = pixelY + this.tileSize / 2;
            plusText.alpha = 0;
            this.animationContainer.addChild(plusText);

            // Animate the flash
            this.animator.addTween({
                duration: 12,
                onUpdate: (p) => {
                    if (p < 0.3) {
                        flash.alpha = p / 0.3;
                        plusText.alpha = p / 0.3;
                        plusText.scale.set(0.5 + p * 1.5);
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
