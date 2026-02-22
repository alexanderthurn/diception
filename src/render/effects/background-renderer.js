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

        // Gradient container (unused at both quality levels currently, kept for pulse)
        this.gridContainer = new Container();
        this.container.addChild(this.gridContainer);

        // Ambient particles
        this.particleContainer = new Container();
        this.container.addChild(this.particleContainer);
        this.ambientParticles = [];

        // Pulse effect state
        this.pulseAlpha = 0;
        this.pulseTarget = 0;
        this.pulseColor = 0x00ffff;

        // Dynamic intensity based on game action (elimination flare)
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
        this.baseCount = 0;  // initial dice count (protected from recycling)
        this.maxExtra = 0;   // max additional spawnable dice
        this.diceContainer = new Container();
        this.container.addChild(this.diceContainer);

        // Create effects
        this.createAmbientParticles();

        // Animation state
        this.time = 0;
        this.tickerCallback = this.update.bind(this);
        Ticker.shared.add(this.tickerCallback);

        // Handle resize
        this.handleResize = this.onResize.bind(this);
        window.addEventListener('resize', this.handleResize);
    }

    // Resolution scale factor — 1.0 at 1080p, 2.0 at 4K, etc.
    _scale() {
        return Math.max(this.width, this.height) / 1080;
    }

    setQuality(quality) {
        this.quality = quality;
        this.enabled = quality !== 'off';
        this.container.visible = this.enabled;

        if (quality === 'off') {
            this.clearAmbientParticles();
        } else {
            this.createAmbientParticles();
        }
    }

    // ── Particles ─────────────────────────────────────────────────────────────

    createAmbientParticles() {
        this.clearAmbientParticles();

        if (!this.enabled) return;

        let count = 20; // Medium
        if (this.quality === 'high') count = 120;

        const colors = [0x00ffff, 0xAA00FF, 0x00ff88, 0x0088ff];
        const s = this._scale();

        for (let i = 0; i < count; i++) {
            const g = new Graphics();
            const size = (1 + Math.random() * 2) * s;

            g.circle(0, 0, size);
            g.fill({ color: 0xffffff });
            g.blendMode = 'add';

            const particle = {
                graphics: g,
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 0.3 * s,
                vy: (Math.random() - 0.5) * 0.3 * s,
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

    // ── Public effect triggers ────────────────────────────────────────────────

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

    // ── Main update loop ──────────────────────────────────────────────────────

    update() {
        if (!this.enabled) return;

        this.time++;

        // Ambient particles
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

        // Pulse decay
        if (this.pulseTarget > 0) {
            this.pulseAlpha += (this.pulseTarget - this.pulseAlpha) * 0.1;
            if (this.pulseAlpha >= this.pulseTarget * 0.9) this.pulseTarget = 0;
        } else {
            this.pulseAlpha *= 0.92;
            if (this.pulseAlpha < 0.01) this.pulseAlpha = 0;
        }

        // Win intensity (brightens particles)
        if (this.winIntensity > 0) {
            this.winIntensity *= 0.99;
            if (this.winIntensity < 0.01) this.winIntensity = 0;

            for (const p of this.ambientParticles) {
                p.graphics.alpha = Math.min(1, p.graphics.alpha + this.winIntensity * 0.5);
            }
        }

        // Elimination flare (growing square, event-driven — unchanged)
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
                    flareSize, flareSize
                );
                this.flareGfx.fill({ color: this.intensityColor, alpha: flareAlpha });
                this.flareGfx.blendMode = 'add';
            }
        } else {
            this.flareGfx.clear();
        }

        // Floating dice (intro only)
        if (this.introMode) {
            this.updateFloatingDice();
        }
    }

    // ── Resize / destroy ─────────────────────────────────────────────────────

    onResize() {
        if (this.container.stage?.renderer) {
            this.width = this.container.stage.renderer.screen.width;
            this.height = this.container.stage.renderer.screen.height;
        } else {
            const viewport = window.visualViewport;
            this.width = viewport ? viewport.width : document.documentElement.clientWidth;
            this.height = viewport ? viewport.height : document.documentElement.clientHeight;
        }
    }

    destroy() {
        Ticker.shared.remove(this.tickerCallback);
        window.removeEventListener('resize', this.handleResize);
        this.clearAmbientParticles();
        this.clearFloatingDice();
        this.container.destroy({ children: true });
    }

    // ── Intro mode ────────────────────────────────────────────────────────────

    setIntroMode(enabled) {
        this.introMode = enabled;

        if (enabled) {
            for (const p of this.ambientParticles) {
                p.vx *= 2;
                p.vy *= 2;
                p.baseAlpha = Math.min(1, p.baseAlpha * 1.5);
            }
            this.createFloatingDice();
        } else {
            for (const p of this.ambientParticles) {
                p.vx /= 2;
                p.vy /= 2;
                p.baseAlpha = Math.max(0.2, p.baseAlpha / 1.5);
            }
            this.clearFloatingDice();
        }
    }

    // ── Floating dice ─────────────────────────────────────────────────────────

    createFloatingDice() {
        this.clearFloatingDice();

        if (!this.enabled) return;

        const count = this.quality === 'high' ? 32 : 8;
        this.baseCount = count;
        this.maxExtra = this.quality === 'high' ? 60 : 20;

        const colors = [0x00ffff, 0xAA00FF, 0xffffff, 0x00ff88, 0xffff00, 0x00ff00];
        const diceSidesOptions = [6, 6, 6, 8, 10, 12, 20];
        const s = this._scale();
        const minDim = Math.min(this.width, this.height);

        const cx = this.width / 2;
        const cy = this.height / 2;

        for (let i = 0; i < count; i++) {
            const size = (0.04 + Math.random() * 0.02) * minDim;
            const diceCount = 1 + Math.floor(Math.random() * 6);
            const diceSides = diceSidesOptions[Math.floor(Math.random() * diceSidesOptions.length)];
            const color = colors[i % colors.length];

            const tileContainer = TileRenderer.createTile({
                size,
                diceCount,
                diceSides,
                color,
                fillAlpha: 0.7,
                showBorder: true
            });

            tileContainer.pivot.set(size / 2, size / 2);

            // Start tightly clustered at center, radiate outward
            const spawnRadius = minDim * 0.02;
            const angle = Math.random() * Math.PI * 2;
            const speed = (0.3 + Math.random() * 0.3) * s;

            const dice = {
                graphics: tileContainer,
                x: cx + (Math.random() - 0.5) * spawnRadius,
                y: cy + (Math.random() - 0.5) * spawnRadius,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                rotation: (Math.random() - 0.5) * 0.3,
                rotationSpeed: (Math.random() - 0.5) * 0.004,
                baseAlpha: 0.65 + Math.random() * 0.25,
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

    panDice(dx, dy) {
        this.diceContainer.x += dx;
        this.diceContainer.y += dy;
    }

    zoomDice(delta, x, y) {
        const scaleFactor = 1.1;
        const currentScale = this.diceContainer.scale.x;
        const newScale = delta > 0 ? currentScale / scaleFactor : currentScale * scaleFactor;

        if (newScale < 0.3 || newScale > 4.0) return;

        // Zoom towards mouse point
        const worldX = (x - this.diceContainer.x) / currentScale;
        const worldY = (y - this.diceContainer.y) / currentScale;

        this.diceContainer.scale.set(newScale, newScale);
        this.diceContainer.x = x - worldX * newScale;
        this.diceContainer.y = y - worldY * newScale;
    }

    spawnDiceAt(screenX, screenY) {
        if (!this.enabled || !this.introMode) return;

        // Convert screen coords to diceContainer local space
        const sc = this.diceContainer.scale.x;
        const localX = (screenX - this.diceContainer.x) / sc;
        const localY = (screenY - this.diceContainer.y) / sc;

        const s = this._scale();
        const minDim = Math.min(this.width, this.height);
        const size = (0.04 + Math.random() * 0.02) * minDim;

        const colors = [0x00ffff, 0xAA00FF, 0xffffff, 0x00ff88, 0xffff00, 0x00ff00];
        const diceSidesOptions = [6, 6, 6, 8, 10, 12, 20];
        const diceCount = 1 + Math.floor(Math.random() * 6);
        const diceSides = diceSidesOptions[Math.floor(Math.random() * diceSidesOptions.length)];
        const color = colors[Math.floor(Math.random() * colors.length)];

        const tileContainer = TileRenderer.createTile({
            size, diceCount, diceSides, color,
            fillAlpha: 0.7, showBorder: true
        });
        tileContainer.pivot.set(size / 2, size / 2);

        const angle = Math.random() * Math.PI * 2;
        const speed = (0.3 + Math.random() * 0.3) * s;

        const dice = {
            graphics: tileContainer,
            x: localX,
            y: localY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            rotation: (Math.random() - 0.5) * 0.3,
            rotationSpeed: (Math.random() - 0.5) * 0.004,
            baseAlpha: 0.65 + Math.random() * 0.25,
            alphaPhase: Math.random() * Math.PI * 2
        };

        tileContainer.x = dice.x;
        tileContainer.y = dice.y;
        tileContainer.rotation = dice.rotation;
        tileContainer.alpha = dice.baseAlpha;

        // At cap: recycle the oldest extra die (index baseCount) instead of allocating
        if (this.floatingDice.length >= this.baseCount + this.maxExtra) {
            const oldest = this.floatingDice.splice(this.baseCount, 1)[0];
            oldest.graphics.destroy();
        }

        this.floatingDice.push(dice);
        this.diceContainer.addChild(tileContainer);
    }

    clearFloatingDice() {
        for (const d of this.floatingDice) {
            d.graphics.destroy();
        }
        this.floatingDice = [];
        this.diceContainer.removeChildren();
        this.diceContainer.position.set(0, 0);
        this.diceContainer.scale.set(1, 1);
    }

    updateFloatingDice() {
        const sc = this.diceContainer.scale.x;
        const ox = this.diceContainer.x;
        const oy = this.diceContainer.y;
        const cullMargin = 2000; // screen pixels — far enough to never be visible

        for (let i = this.floatingDice.length - 1; i >= 0; i--) {
            const d = this.floatingDice[i];
            d.x += d.vx;
            d.y += d.vy;
            d.rotation += d.rotationSpeed;

            // Cull dice that have drifted far off-screen (no wrap-back)
            const screenX = ox + d.x * sc;
            const screenY = oy + d.y * sc;
            if (screenX < -cullMargin || screenX > this.width  + cullMargin ||
                screenY < -cullMargin || screenY > this.height + cullMargin) {
                d.graphics.destroy();
                this.floatingDice.splice(i, 1);
                if (i < this.baseCount) this.baseCount = Math.max(0, this.baseCount - 1);
                continue;
            }

            d.alphaPhase += 0.015;
            const alphaMod = Math.sin(d.alphaPhase) * 0.2 + 0.8;

            d.graphics.x = d.x;
            d.graphics.y = d.y;
            d.graphics.rotation = d.rotation;
            d.graphics.alpha = d.baseAlpha * alphaMod;
        }
    }
}
