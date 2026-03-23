import { Application, Container, Graphics, Ticker } from 'pixi.js';
import { ScanlineFilter } from './effects/scanline-filter.js';
import { GridRenderer } from './grid-renderer.js';
import { AnimationManager } from './animation-manager.js';
import { TileRenderer } from './tile-renderer.js';

export class Renderer {
    constructor(containerElement, game, inputManager = null) {
        this.container = containerElement;
        this.game = game;
        this.inputManager = inputManager;
        this.app = null;
        this.grid = null;
        this.rootContainer = null;
        this.animator = null;
        this.gameSpeed = 'beginner';
        this.shakeIntensity = 0;
        this.shakeDuration = 0;
        this.originalX = 0;
        this.originalY = 0;
        this.editorActive = false;
        this.panOverride = null;
        this.zoomOverride = null;
        /** True when trackpad-style scroll detected (no middle button → use left-drag for pan). Default true on Mac. */
        this.likelyTrackpad = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
    }


    async init() {
        // Check user graphics preferences
        const savedAA = localStorage.getItem('dicy_gfx_antialias') === 'on';

        // Cap resolution to 1.5 to avoid extreme overhead on Retina/4K displays while keeping it crisp
        const realRes = Math.min(window.devicePixelRatio || 1, 1.5);
        this.app = new Application();
        await this.app.init({
            background: '#050510',
            resizeTo: this.container,
            antialias: savedAA,
            resolution: realRes,
            autoDensity: true,
            roundPixels: true,
            preference: 'webgl',
            hello: false // Minor performance boost by skipping splash
        });

        this.app.canvas.style.display = 'block';
        // Remove object-fit or fixed percentages that might fight with Pixi's resizeTo/autoDensity
        // display: block is enough to ensure it behaves correctly in the container.

        // Ensure smooth rendering but don't overwork the CPU/GPU
        // (This gets instantly overridden by the framerate setting in main.js, but acts as a safe default)
        this.app.ticker.maxFPS = Math.min(window.screen.refreshRate || 60, 120);

        this.container.appendChild(this.app.canvas);

        // Pre-render tile textures for fast sprite rendering
        await TileRenderer.initTextures(this.app);

        // Create a root container for the game world
        this.rootContainer = new Container();
        this.app.stage.addChild(this.rootContainer);

        // Initialize Animation Manager
        this.animator = new AnimationManager(this);

        // Initialize sub-renderers
        this.grid = new GridRenderer(this.rootContainer, this.game, this.animator, this.inputManager);
        this.grid.app = this.app;

        // Center the grid initially
        this.centerGrid();

        // Listen to game events to trigger redraws
        this.game.on('gameStart', () => {
            this.grid.invalidateRegions();
            this.draw();
            this.autoFitCamera();
        });

        this.game.on('attackResult', (result) => {
            if (result.won) {
                this.grid.invalidateRegions();
            }
            // Trigger animation
            this.grid.animateAttack(result, () => {
                // Callback when animation finishes (optional if we draw immediately)
            });
            // Update board state immediately (animations will overlay)
            this.draw();
        });

        this.game.on('reinforcements', (data) => {
            // When the hook is active, animateSupply handles drawing + input suspension.
            // Without a hook (expert speed) just redraw immediately.
            if (!this.game.reinforcementAnimationHook) {
                this.draw();
            }
        });

        // Set up the reinforcement animation hook so endTurn() defers player switching
        // until the supply animation completes.  Re-evaluated each call so speed changes
        // take effect immediately.
        this.game.reinforcementAnimationHook = (data, continueEndTurn) => {
            // Skip animation for bots and expert speed — just advance immediately
            if (this.gameSpeed === 'expert' || data.player.isBot) {
                this.draw();
                continueEndTurn();
                return;
            }
            // Freeze the turn timer so it doesn't tick during the animation
            this.gameEventManager?.pauseTurnTimer();
            this.draw(); // show updated dice immediately
            this.inputManager?.setSuspended(true);
            const endTurnBtn = document.getElementById('end-turn-btn');
            if (endTurnBtn) endTurnBtn.disabled = true;
            this.grid.animateSupply(data, this.sfx ?? null, () => {
                this.inputManager?.setSuspended(false);
                if (endTurnBtn) endTurnBtn.disabled = false;
                // Turn is ending — stop timer entirely (a new one starts on the next turn)
                this.gameEventManager?.stopTurnTimer();
                continueEndTurn();
            });
        };
        this.game.on('turnStart', () => this.draw()); // update highlights

        // Add shake update to ticker
        this.app.ticker.add(this.updateShake.bind(this));
    }

    autoFitCamera(fitRatio = 1.0) {
        if (!this.game.map || !this.rootContainer) return;

        const map = this.game.map;
        const tileSize = this.grid.tileSize;
        const gap = this.grid.gap;

        // Calculate map pixel dimensions
        const mapPixelWidth = map.width * (tileSize + gap);
        const mapPixelHeight = map.height * (tileSize + gap);

        let screenWidth, screenHeight, padding;
        if (this.editorActive) {
            // Editor: right panel ~290px, top bar ~70px, bottom bar ~80px
            screenWidth = this.app.screen.width - 310;
            screenHeight = this.app.screen.height - 160;
            padding = 0;
        } else {
            padding = 40;
            screenWidth = (this.app.screen.width - padding) * 0.80;
            screenHeight = (this.app.screen.height - padding) * 0.80;
        }

        // Calculate scale to fit
        const scaleX = screenWidth / mapPixelWidth;
        const scaleY = screenHeight / mapPixelHeight;
        const scale = Math.min(scaleX, scaleY, 4.0) * fitRatio; // Apply fitRatio

        const safeScale = Math.max(0.2, scale);
        this.rootContainer.scale.set(safeScale, safeScale);

        const scaledWidth = mapPixelWidth * this.rootContainer.scale.x;
        const scaledHeight = mapPixelHeight * this.rootContainer.scale.y;

        if (this.editorActive) {
            // Position in lower-left: ~25% inset from left, bottom-aligned above bottom bar
            const leftInset = this.app.screen.width * 0.25;
            const bottomInset = 100; // Space for bottom bar and padding
            this.rootContainer.x = leftInset;
            this.rootContainer.y = this.app.screen.height - scaledHeight - bottomInset;
        } else {
            // Center the map in the full screen
            this.rootContainer.x = (this.app.screen.width - scaledWidth) / 2;
            this.rootContainer.y = (this.app.screen.height - scaledHeight) / 2;
        }

        this.draw();
    }

    centerGrid() {
        // Simple centering logic
        // Ideally we want to scale based on map size vs screen size
        // We will do this properly in GridRenderer
    }

    draw() {
        this.grid.draw();
    }

    forceUpdate(fitCamera = true) {
        // Force complete redraw - used when loading scenarios
        this.grid.invalidate(); // Clear tile cache for full redraw
        this.draw();
        if (fitCamera) this.autoFitCamera();
    }

    setSelection(x, y, sourceId = 'mouse') {
        this.grid.setSelection(x, y, sourceId);
        this.draw(); // Trigger redraw to show highlight
    }

    setHover(x, y, cursorId = 'mouse') {
        this.grid.setHover(x, y, cursorId);
    }

    setCursor(x, y, sourceId = 'mouse') {
        this.grid.setCursor(x, y, sourceId);
    }

    setGameSpeed(speed) {
        console.log('renderer.setGameSpeed called with:', speed);
        this.gameSpeed = speed;
        if (this.animator) {
            this.animator.setGameSpeed(speed);
        }
        if (this.grid) {
            this.grid.setGameSpeed(speed);
        }
    }

    setDiceSides(sides) {
        if (this.grid) {
            this.grid.setDiceSides(sides);
        }
    }

    setEffectsQuality(quality) {
        if (this.grid) {
            this.grid.setEffectsQuality(quality);
        }
        this._applyScanline(quality);
    }

    _applyScanline(quality) {
        const isMobile = this.app.screen.width <= 768 || this.app.screen.height <= 600;
        if (quality === 'high' && !isMobile) {
            if (!this._scanlineFilter) {
                this._scanlineFilter = new ScanlineFilter();
                const w = this.app.screen.width;
                const h = this.app.screen.height;
                this._scanlineFilter.setResolution(w, h);
                this._scanlineBaseIntensity = 0; // scanlines only during pulse (attacks)
                this._scanlineBaseBeam      = 0.3;  // beam at rest — subtle
                this._scanlinePulse = 0;
                this._scanlineFilter.intensity     = this._scanlineBaseIntensity;
                this._scanlineFilter.beamIntensity = this._scanlineBaseBeam;
                // Animate time uniform + decay pulse
                this._scanlineTick = (ticker) => {
                    this._scanlineFilter.time += ticker.deltaTime / 60;
                    if (this._scanlinePulse > 0) {
                        this._scanlinePulse = Math.max(0, this._scanlinePulse - ticker.deltaTime * 0.04);
                        this._scanlineFilter.intensity     = this._scanlineBaseIntensity + this._scanlinePulse * 0.5;
                        this._scanlineFilter.beamIntensity = this._scanlineBaseBeam      + this._scanlinePulse;
                    }
                };
                Ticker.shared.add(this._scanlineTick);
            }
            this.app.stage.filters = [this._scanlineFilter];
        } else {
            if (this._scanlineFilter) {
                Ticker.shared.remove(this._scanlineTick);
                this._scanlineFilter = null;
                this._scanlineTick = null;
            }
            this.app.stage.filters = null;
        }
    }

    pulseScanline(amount = 1.0) {
        if (!this._scanlineFilter) return;
        this._scanlinePulse = Math.min(this._scanlinePulse + amount, 1.5);
    }

    setScanlineBeamColor(hex) {
        this._scanlineFilter?.setBeamColor(hex);
    }

    pan(dx, dy) {
        if (!this.rootContainer) return;
        if (this.panOverride) {
            this.panOverride(dx, dy);
            return;
        }
        this.rootContainer.x += dx;
        this.rootContainer.y += dy;
        this.draw();
    }

    setPanOverride(fn) {
        this.panOverride = fn || null;
    }

    /**
     * Center and scale the view for the 4x4 config preview (setup menu only).
     * The preview in effects is at (width/2, height*0.75); we center it on screen.
     */
    centerConfigPreview() {
        if (!this.rootContainer || !this.grid) return;
        const size = 4;
        const tileSize = this.grid.tileSize;
        const gap = this.grid.gap;
        const mapPixelSize = size * (tileSize + gap);

        const padding = 120;
        const screenWidth = this.app.screen.width - padding;
        const screenHeight = this.app.screen.height - padding;
        const scale = Math.min(screenWidth / mapPixelSize, screenHeight / mapPixelSize, 1.5);

        const safeScale = Math.max(0.2, scale);
        this.rootContainer.scale.set(safeScale, safeScale);

        const centerX = this.app.screen.width * 0.5;
        const centerY = this.app.screen.height * 0.75;
        const isMobile = this.app.screen.width <= 768 || this.app.screen.height <= 720;
        const sidebarOffset = isMobile ? 0 : 140;
        this.rootContainer.x = this.app.screen.width / 2 + sidebarOffset - centerX * scale;
        this.rootContainer.y = this.app.screen.height / 2 - centerY * scale;
    }

    setZoomOverride(fn) {
        this.zoomOverride = fn || null;
    }

    zoom(delta, x, y) {
        if (!this.rootContainer) return;

        if (this.zoomOverride) {
            this.zoomOverride(delta, x, y);
            return;
        }

        const scaleFactor = 1.1;
        const newScale = delta > 0 ? this.rootContainer.scale.x / scaleFactor : this.rootContainer.scale.x * scaleFactor;

        // Clamp scale
        if (newScale < 0.4 || newScale > 10.0) return;

        // Zoom towards mouse point
        const worldPos = {
            x: (x - this.rootContainer.x) / this.rootContainer.scale.x,
            y: (y - this.rootContainer.y) / this.rootContainer.scale.y
        };

        this.rootContainer.scale.set(newScale, newScale);

        this.rootContainer.x = x - worldPos.x * newScale;
        this.rootContainer.y = y - worldPos.y * newScale;

        this.draw();
    }

    /**
     * Get screen coordinates for a tile's center.
     */
    getTileScreenSize() {
        if (!this.rootContainer || !this.grid) return 0;
        return this.grid.tileSize * this.rootContainer.scale.x;
    }

    getTileScreenPosition(x, y) {
        if (!this.rootContainer || !this.grid) return null;

        const localX = x * (this.grid.tileSize + this.grid.gap) + this.grid.tileSize / 2;
        const localY = y * (this.grid.tileSize + this.grid.gap) + this.grid.tileSize / 2;

        return {
            x: this.rootContainer.x + localX * this.rootContainer.scale.x,
            y: this.rootContainer.y + localY * this.rootContainer.scale.y
        };
    }

    screenShake(intensity, duration = 300) {
        this.shakeIntensity = intensity;
        this.shakeDuration = duration;
    }

    updateShake(ticker) {
        if (this.shakeDuration > 0) {
            this.shakeDuration -= ticker.deltaMS;

            if (this.shakeDuration <= 0) {
                this.shakeDuration = 0;
                this.shakeIntensity = 0;
                this.rootContainer.pivot.set(0, 0);
            } else {
                const currentIntensity = this.shakeIntensity * (this.shakeDuration / 500);
                this.rootContainer.pivot.x = (Math.random() - 0.5) * currentIntensity;
                this.rootContainer.pivot.y = (Math.random() - 0.5) * currentIntensity;
            }
        }
    }

    /**
     * Full-board stalemate: choose a tile up front, then sweep playable cells left→right, top→bottom
     * (skipping blocked holes) for ≥2 full passes — slow clear steps at first, then faster — and
     * finish on the chosen tile with a hold pulse.
     * Beginner = full pacing; normal = ~⅓ shorter sweep+pulse; expert = winner pulse only at normal timing.
     * @returns {Promise<{ x: number, y: number } | null>}
     */
    async playFullBoardRandomPick() {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const game = this.game;
        const grid = this.grid;
        if (!game?.map || !grid) return null;

        const w = game.map.width;
        const h = game.map.height;
        /** Row-major order, non-blocked tiles only. */
        const ordered = [];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const t = game.map.tiles[y * w + x];
                if (!t.blocked) ordered.push({ x, y });
            }
        }
        if (ordered.length === 0) return null;

        const n = ordered.length;
        const targetIdx = Math.floor(Math.random() * n);
        const target = ordered[targetIdx];

        const speed = this.gameSpeed;
        const isExpert = speed === 'expert';
        /** Normal = ⅓ shorter than beginner (× ⅔). Expert winning pulse uses same factor as normal. */
        const sweepTimeScale = speed === 'normal' ? 2 / 3 : 1;
        const pulseTimeScale = speed === 'beginner' ? 1 : 2 / 3;

        /** At least two complete row-by-row cycles before the final run to the pick. */
        const FULL_PASSES = 2;
        const path = [];
        for (let lap = 0; lap < FULL_PASSES; lap++) {
            for (let j = 0; j < n; j++) path.push(ordered[j]);
        }
        for (let j = 0; j <= targetIdx; j++) path.push(ordered[j]);

        const gfx = new Graphics();
        grid.animationContainer.addChild(gfx);
        const ts = grid.tileSize;
        const gap = grid.gap;
        const slowPhaseSteps = FULL_PASSES * n;
        /** Steady row-by-row scans (cf. supply phase A + even phase-B cadence). */
        const STEP_SLOW_MS = 54;
        /**
         * Final partial pass: start near scan speed, then ramp toward much slower steps.
         * Ease-out on progress so longer pauses begin well before the last tile (settles earlier, lands heavy).
         */
        const STEP_FINAL_START_MS = 50;
        const STEP_FINAL_END_MS = 175;

        const stepDelayMsBeginner = (i) => {
            if (i < slowPhaseSteps) return STEP_SLOW_MS;
            const fi = i - slowPhaseSteps;
            const finalLen = path.length - slowPhaseSteps;
            if (finalLen <= 1) return STEP_FINAL_END_MS;
            const u = fi / (finalLen - 1);
            /** Ease-out: most of the slow-down unfolds in the first ~half of this pass (1-(1-u)^2). */
            const easeOut = 1 - (1 - u) * (1 - u);
            return STEP_FINAL_START_MS + (STEP_FINAL_END_MS - STEP_FINAL_START_MS) * easeOut;
        };

        const stepDelayMs = (i) =>
            Math.max(5, Math.round(stepDelayMsBeginner(i) * sweepTimeScale));

        const pulseStepMs = Math.round(115 * pulseTimeScale);
        const holdMs = Math.round(950 * pulseTimeScale);
        const pulseSteps = 10;

        this.inputManager?.setSuspended(true);
        try {
            if (!isExpert) {
                for (let i = 0; i < path.length; i++) {
                    const p = path[i];
                    gfx.clear();
                    const pad = 3;
                    gfx.rect(pad, pad, ts - pad * 2, ts - pad * 2);
                    gfx.stroke({ width: 4, color: 0xffcc33, alpha: 0.92 });
                    gfx.x = p.x * (ts + gap);
                    gfx.y = p.y * (ts + gap);
                    this.draw();
                    this.sfx?.coinSweepStep();
                    await sleep(stepDelayMs(i));
                }
            }

            const px = target.x * (ts + gap);
            const py = target.y * (ts + gap);
            for (let s = 0; s < pulseSteps; s++) {
                const t = s / (pulseSteps - 1 || 1);
                const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2.4);
                const shrink = 1 + pulse * 2;
                const pad = 2;
                gfx.clear();
                gfx.rect(pad + shrink, pad + shrink, ts - 2 * (pad + shrink), ts - 2 * (pad + shrink));
                gfx.fill({ color: 0xffe8a8, alpha: 0.14 + pulse * 0.38 });
                gfx.stroke({ width: 5 + pulse * 12, color: 0xfffdf0, alpha: 0.97 });
                gfx.x = px;
                gfx.y = py;
                this.draw();
                await sleep(pulseStepMs);
            }
            await sleep(holdMs);
        } finally {
            grid.animationContainer.removeChild(gfx);
            gfx.destroy();
            this.inputManager?.setSuspended(false);
            this.draw();
        }
        return target;
    }

    /**
     * After most_territories / biggest_territory full-board rules: pulse the winning area in the winner's color.
     * @param {'most_territories'|'biggest_territory'} rule
     * @param {number} winnerPlayerId
     */
    async playFullBoardWinnerReveal(rule, winnerPlayerId) {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const game = this.game;
        const grid = this.grid;
        if (!game?.map || !grid || winnerPlayerId == null) return;

        const player = game.players.find((p) => p.id === winnerPlayerId);
        const color = player?.color ?? 0xffcc66;

        let tiles;
        if (rule === 'biggest_territory') {
            tiles = game.map.findLargestConnectedRegionTiles(winnerPlayerId);
            if (!tiles.length) {
                tiles = game.map.getTilesByOwner(winnerPlayerId).map((t) => ({ x: t.x, y: t.y }));
            }
        } else {
            tiles = game.map.getTilesByOwner(winnerPlayerId).map((t) => ({ x: t.x, y: t.y }));
        }
        if (!tiles.length) return;

        const gfx = new Graphics();
        grid.animationContainer.addChild(gfx);
        const ts = grid.tileSize;
        const gap = grid.gap;
        const pad = 2;
        const steps = 34;
        const stepMs = 50;

        this.inputManager?.setSuspended(true);
        try {
            for (let i = 0; i < steps; i++) {
                const t = i / (steps - 1 || 1);
                const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 3.1);
                const strokeW = 2.5 + pulse * 5.5;
                const fillA = 0.07 + pulse * 0.26;

                gfx.clear();
                for (const tile of tiles) {
                    const bx = tile.x * (ts + gap);
                    const by = tile.y * (ts + gap);
                    gfx.rect(bx + pad, by + pad, ts - 2 * pad, ts - 2 * pad);
                }
                gfx.fill({ color, alpha: fillA });
                gfx.stroke({ width: strokeW, color: 0xfff8e0, alpha: 0.91 });
                this.draw();
                await sleep(stepMs);
            }
            await sleep(420);
        } finally {
            grid.animationContainer.removeChild(gfx);
            gfx.destroy();
            this.inputManager?.setSuspended(false);
            this.draw();
        }
    }

}
