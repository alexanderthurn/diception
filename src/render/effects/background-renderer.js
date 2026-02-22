import { Container, Graphics, Ticker } from 'pixi.js';
import { TileRenderer } from '../tile-renderer.js';

/**
 * Background Renderer - Animated Tron-style background
 * Completely isolated from game rendering
 */
export class BackgroundRenderer {
    constructor(stage, options = {}) {
        // Create container behind everything else
        this.container = new Container();
        this.container.label = 'background-effects';
        this.container.zIndex = -100;

        // Insert at the beginning of stage (behind game)
        stage.addChildAt(this.container, 0);

        this.width = options.width || (window.visualViewport ? window.visualViewport.width : document.documentElement.clientWidth);
        this.height = options.height || (window.visualViewport ? window.visualViewport.height : document.documentElement.clientHeight);

        // Try to get actual renderer dimensions if available (most accurate for game-space)
        if (stage.renderer) {
            this.width = stage.renderer.screen.width;
            this.height = stage.renderer.screen.height;
        }

        // Effect settings
        this.quality = 'high';
        this.enabled = true;

        // Grid/scanline/gradient container
        this.gridContainer = new Container();
        this.container.addChild(this.gridContainer);
        this.scanLineObjects = [];
        this.gradientPhase = 0;

        // Ambient particles
        this.particleContainer = new Container();
        this.container.addChild(this.particleContainer);
        this.ambientParticles = [];

        // Pulse effect state
        this.pulseAlpha = 0;
        this.pulseTarget = 0;
        this.pulseColor = 0x00ffff;

        // Dynamic intensity based on game action
        this.winIntensity = 0;
        this.intensityColor = 0x00ffff;
        this.flareProgress = 0;
        this.flareActive = false;
        this.flashGfx = new Graphics();
        this.container.addChild(this.flashGfx);

        this.flareGfx = new Graphics();
        this.container.addChild(this.flareGfx);

        // Intro mode state
        this.introMode = false;
        this.floatingDice = [];
        this.diceContainer = new Container();
        this.container.addChild(this.diceContainer);

        // Create effects
        this.createGrid();
        this.createAmbientParticles();

        // Animation state
        this.time = 0;
        this.tickerCallback = this.update.bind(this);
        Ticker.shared.add(this.tickerCallback);

        // Handle resize
        this.handleResize = this.onResize.bind(this);
        window.addEventListener('resize', this.handleResize);
    }

    setQuality(quality) {
        this.quality = quality;
        this.enabled = quality !== 'off';
        this.container.visible = this.enabled;

        if (quality === 'off') {
            this.clearAmbientParticles();
        } else {
            this.createGrid();
            this.createAmbientParticles();
        }
    }

    createGrid() {
        this.gridContainer.removeChildren();
        this.scanLineObjects = [];
        this.gradientPhase = 0;

        if (!this.enabled) return;

        if (this.quality === 'high') {
            this._createScanlines();
        } else if (this.quality === 'medium') {
            this._createGradientOverlay();
        }
        // 'off': nothing
    }

    _createScanlines() {
        // Horizontal glowing bands that drift slowly downward — Tron CRT feel
        const count = 5;
        const bandColors = [0x00ffff, 0x0088ff, 0x00ffff, 0xAA00FF, 0x00ffff];

        for (let i = 0; i < count; i++) {
            const gfx = new Graphics();
            const h = 80 + Math.random() * 140;
            gfx.rect(0, 0, this.width, h);
            gfx.fill({ color: bandColors[i % bandColors.length], alpha: 0.025 + Math.random() * 0.02 });
            gfx.blendMode = 'add';

            const sl = {
                graphics: gfx,
                y: Math.random() * this.height,
                speed: 0.12 + Math.random() * 0.18,
                height: h
            };
            gfx.y = sl.y;

            this.gridContainer.addChild(gfx);
            this.scanLineObjects.push(sl);
        }
    }

    _createGradientOverlay() {
        // Radial purple-to-black gradient matching the loading screen feel
        const cx = this.width / 2;
        const cy = this.height / 2;
        const maxR = Math.sqrt(cx * cx + cy * cy);
        const steps = 14;

        const gradGfx = new Graphics();
        // Draw concentric circles from largest (edge, no tint) to smallest (center, most tint)
        for (let i = steps; i >= 1; i--) {
            const r = (i / steps) * maxR;
            const t = 1 - i / steps; // 0 at edges → 1 at center
            const alpha = t * 0.13;
            if (alpha > 0.003) {
                gradGfx.circle(cx, cy, r);
                gradGfx.fill({ color: 0xaa00ff, alpha });
            }
        }
        gradGfx.blendMode = 'add';
        this.gridContainer.addChild(gradGfx);
    }

    createAmbientParticles() {
        this.clearAmbientParticles();

        if (!this.enabled) return;

        // Particle count based on quality
        let count = 20; // Medium
        if (this.quality === 'high') count = 40;

        const colors = [0x00ffff, 0xAA00FF, 0x00ff88, 0x0088ff];

        for (let i = 0; i < count; i++) {
            const g = new Graphics();
            const size = 1 + Math.random() * 2;

            g.circle(0, 0, size);
            g.fill({ color: 0xffffff });
            g.blendMode = 'add';

            const particle = {
                graphics: g,
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3,
                baseAlpha: 0.2 + Math.random() * 0.4,
                alphaPhase: Math.random() * Math.PI * 2,
                alphaSpeed: 0.01 + Math.random() * 0.02,
                color: colors[Math.floor(Math.random() * colors.length)]
            };

            g.x = particle.x;
            g.y = particle.y;
            g.alpha = particle.baseAlpha;
            g.tint = particle.color;

            this.particleContainer.addChild(g);
            this.ambientParticles.push(particle);
        }
    }

    clearAmbientParticles() {
        for (const p of this.ambientParticles) {
            p.graphics.destroy();
        }
        this.ambientParticles = [];
        this.particleContainer.removeChildren();
    }

    /**
     * Trigger a screen pulse effect (e.g., on major events)
     */
    pulse(color = 0x00ffff, intensity = 0.3) {
        if (!this.enabled) return;
        this.pulseColor = color;
        this.pulseTarget = intensity;
    }

    setWinIntensity(intensity, color = 0x00ffff) {
        if (!this.enabled) return;
        this.winIntensity = intensity;
        this.intensityColor = color;
    }

    startEliminationFlare(color) {
        if (!this.enabled) return;
        this.intensityColor = color;
        this.flareProgress = 0.01;
        this.flareActive = true;
    }

    update() {
        if (!this.enabled) return;

        this.time++;

        // Update ambient particles
        for (const p of this.ambientParticles) {
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < -10) p.x = this.width + 10;
            if (p.x > this.width + 10) p.x = -10;
            if (p.y < -10) p.y = this.height + 10;
            if (p.y > this.height + 10) p.y = -10;

            p.alphaPhase += p.alphaSpeed;
            const alphaMod = Math.sin(p.alphaPhase) * 0.3 + 0.7;

            p.graphics.x = p.x;
            p.graphics.y = p.y;
            p.graphics.alpha = p.baseAlpha * alphaMod;
        }

        // Update pulse effect
        if (this.pulseTarget > 0) {
            this.pulseAlpha += (this.pulseTarget - this.pulseAlpha) * 0.1;
            if (this.pulseAlpha >= this.pulseTarget * 0.9) {
                this.pulseTarget = 0;
            }
        } else {
            this.pulseAlpha *= 0.92;
            if (this.pulseAlpha < 0.01) {
                this.pulseAlpha = 0;
            }
        }

        // Animate scanlines (high quality) and gradient/pulse (medium)
        if (this.quality === 'high') {
            for (const sl of this.scanLineObjects) {
                sl.y += sl.speed;
                if (sl.y > this.height) sl.y = -sl.height;
                sl.graphics.y = sl.y;
            }
            const baseAlpha = this.introMode ? 1.5 : 1;
            this.gridContainer.alpha = baseAlpha + this.pulseAlpha * 2 + (this.winIntensity * 0.5);
        } else if (this.quality === 'medium') {
            this.gradientPhase += 0.008;
            const breathe = 0.8 + Math.sin(this.gradientPhase) * 0.2;
            this.gridContainer.alpha = breathe + this.pulseAlpha * 2;
        }

        // Intensify ambient particles based on winIntensity
        if (this.winIntensity > 0) {
            this.winIntensity *= 0.99;
            if (this.winIntensity < 0.01) this.winIntensity = 0;

            for (const p of this.ambientParticles) {
                p.graphics.alpha = Math.min(1, p.graphics.alpha + this.winIntensity * 0.5);
            }
        }

        // Update growing flare effect
        if (this.flareActive) {
            this.flareProgress += 0.012;

            this.flareGfx.clear();
            const maxDim = Math.max(this.width, this.height);
            const flareSize = this.flareProgress * maxDim * 2.5;
            const flareAlpha = Math.min(0.6, (1.0 - this.flareProgress) * 1.2);

            if (this.flareProgress >= 1.0) {
                this.flareActive = false;
                this.flareProgress = 0;
            } else {
                this.flareGfx.rect(
                    this.width / 2 - flareSize / 2,
                    this.height / 2 - flareSize / 2,
                    flareSize,
                    flareSize
                );
                this.flareGfx.fill({ color: this.intensityColor, alpha: flareAlpha });
                this.flareGfx.blendMode = 'add';
            }
        } else {
            this.flareGfx.clear();
        }

        // Update floating dice (intro mode)
        if (this.introMode) {
            this.updateFloatingDice();
        }
    }

    onResize() {
        if (this.container.stage?.renderer) {
            this.width = this.container.stage.renderer.screen.width;
            this.height = this.container.stage.renderer.screen.height;
        } else {
            const viewport = window.visualViewport;
            this.width = viewport ? viewport.width : document.documentElement.clientWidth;
            this.height = viewport ? viewport.height : document.documentElement.clientHeight;
        }
        this.createGrid();
    }

    destroy() {
        Ticker.shared.remove(this.tickerCallback);
        window.removeEventListener('resize', this.handleResize);
        this.clearAmbientParticles();
        this.clearFloatingDice();
        this.container.destroy({ children: true });
    }

    /**
     * Enable/disable intro mode (intensified effects for setup screen)
     */
    setIntroMode(enabled) {
        this.introMode = enabled;

        if (enabled) {
            this.gridContainer.alpha = 1.5;
            for (const p of this.ambientParticles) {
                p.vx *= 2;
                p.vy *= 2;
                p.baseAlpha = Math.min(1, p.baseAlpha * 1.5);
            }
            this.createFloatingDice();
        } else {
            this.gridContainer.alpha = 1;
            for (const p of this.ambientParticles) {
                p.vx /= 2;
                p.vy /= 2;
                p.baseAlpha = Math.max(0.2, p.baseAlpha / 1.5);
            }
            this.clearFloatingDice();
        }
    }

    createFloatingDice() {
        this.clearFloatingDice();

        if (!this.enabled) return;

        const count = this.quality === 'high' ? 8 : 4;
        const colors = [0x00ffff, 0xAA00FF, 0xffffff, 0x00ff88, 0xffff00, 0x00ff00];
        const diceSidesOptions = [6, 6, 6, 8, 10, 12, 20];

        for (let i = 0; i < count; i++) {
            const size = 40 + Math.random() * 30;
            const diceCount = 1 + Math.floor(Math.random() * 6);
            const diceSides = diceSidesOptions[Math.floor(Math.random() * diceSidesOptions.length)];
            const color = colors[i % colors.length];

            const tileContainer = TileRenderer.createTile({
                size,
                diceCount,
                diceSides,
                color,
                fillAlpha: 0.3,
                showBorder: true
            });

            tileContainer.pivot.set(size / 2, size / 2);
            tileContainer.alpha = 0.6;

            const dice = {
                graphics: tileContainer,
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                rotation: (Math.random() - 0.5) * 0.3,
                rotationSpeed: (Math.random() - 0.5) * 0.005,
                baseAlpha: 0.4 + Math.random() * 0.3,
                alphaPhase: Math.random() * Math.PI * 2
            };

            tileContainer.x = dice.x;
            tileContainer.y = dice.y;
            tileContainer.rotation = dice.rotation;
            tileContainer.alpha = dice.baseAlpha;

            this.diceContainer.addChild(tileContainer);
            this.floatingDice.push(dice);
        }
    }

    clearFloatingDice() {
        for (const d of this.floatingDice) {
            d.graphics.destroy();
        }
        this.floatingDice = [];
        this.diceContainer.removeChildren();
    }

    updateFloatingDice() {
        for (const d of this.floatingDice) {
            d.x += d.vx;
            d.y += d.vy;
            d.rotation += d.rotationSpeed;

            if (d.x < -50) d.x = this.width + 50;
            if (d.x > this.width + 50) d.x = -50;
            if (d.y < -50) d.y = this.height + 50;
            if (d.y > this.height + 50) d.y = -50;

            d.alphaPhase += 0.02;
            const alphaMod = Math.sin(d.alphaPhase) * 0.2 + 0.8;

            d.graphics.x = d.x;
            d.graphics.y = d.y;
            d.graphics.rotation = d.rotation;
            d.graphics.alpha = d.baseAlpha * alphaMod;
        }
    }
}
