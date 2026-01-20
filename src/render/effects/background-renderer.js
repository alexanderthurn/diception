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

        this.width = options.width || window.innerWidth;
        this.height = options.height || window.innerHeight;

        // Effect settings
        this.quality = 'high';
        this.enabled = true;

        // Grid lines
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
            // Recreate with appropriate density
            this.createAmbientParticles();
        }
    }

    createGrid() {
        this.gridContainer.removeChildren();

        if (!this.enabled) return;

        const gridGfx = new Graphics();
        const spacing = 80;
        const color = 0x00ffff;
        const alpha = 0.08;

        // Horizontal lines
        for (let y = 0; y < this.height + spacing; y += spacing) {
            gridGfx.moveTo(0, y);
            gridGfx.lineTo(this.width, y);
        }

        // Vertical lines
        for (let x = 0; x < this.width + spacing; x += spacing) {
            gridGfx.moveTo(x, 0);
            gridGfx.lineTo(x, this.height);
        }

        gridGfx.stroke({ width: 1, color: color, alpha: alpha });
        gridGfx.blendMode = 'add';

        this.gridContainer.addChild(gridGfx);

        // Add occasional brighter accent lines
        const accentGfx = new Graphics();
        const accentSpacing = spacing * 4;

        for (let y = 0; y < this.height + accentSpacing; y += accentSpacing) {
            accentGfx.moveTo(0, y);
            accentGfx.lineTo(this.width, y);
        }

        for (let x = 0; x < this.width + accentSpacing; x += accentSpacing) {
            accentGfx.moveTo(x, 0);
            accentGfx.lineTo(x, this.height);
        }

        accentGfx.stroke({ width: 1, color: color, alpha: 0.15 });
        accentGfx.blendMode = 'add';

        this.gridContainer.addChild(accentGfx);
    }

    createAmbientParticles() {
        this.clearAmbientParticles();

        if (!this.enabled) return;

        // Particle count based on quality
        const count = this.quality === 'high' ? 40 : 15;

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

    update() {
        if (!this.enabled) return;

        this.time++;

        // Update ambient particles
        for (const p of this.ambientParticles) {
            // Move
            p.x += p.vx;
            p.y += p.vy;

            // Wrap around screen
            if (p.x < -10) p.x = this.width + 10;
            if (p.x > this.width + 10) p.x = -10;
            if (p.y < -10) p.y = this.height + 10;
            if (p.y > this.height + 10) p.y = -10;

            // Pulse alpha
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

        // Apply pulse to grid
        const baseAlpha = this.introMode ? 1.5 : 1;
        this.gridContainer.alpha = baseAlpha + this.pulseAlpha * 2;

        // Update floating dice (intro mode)
        if (this.introMode) {
            this.updateFloatingDice();
        }
    }

    onResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
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
            // Intensify grid
            this.gridContainer.alpha = 1.5;
            // Speed up ambient particles
            for (const p of this.ambientParticles) {
                p.vx *= 2;
                p.vy *= 2;
                p.baseAlpha = Math.min(1, p.baseAlpha * 1.5);
            }
            // Create floating dice
            this.createFloatingDice();
        } else {
            // Reset grid
            this.gridContainer.alpha = 1;
            // Slow down ambient particles
            for (const p of this.ambientParticles) {
                p.vx /= 2;
                p.vy /= 2;
                p.baseAlpha = Math.max(0.2, p.baseAlpha / 1.5);
            }
            // Remove floating dice
            this.clearFloatingDice();
        }
    }

    createFloatingDice() {
        this.clearFloatingDice();

        if (!this.enabled) return;

        const count = this.quality === 'high' ? 8 : 4;
        const colors = [0x00ffff, 0xAA00FF, 0xffffff, 0x00ff88, 0xffff00, 0x00ff00];
        const diceSidesOptions = [6, 6, 6, 8, 10, 12, 20]; // Variety of dice types

        for (let i = 0; i < count; i++) {
            const size = 40 + Math.random() * 30; // 40-70 pixels
            const diceCount = 1 + Math.floor(Math.random() * 6); // 1-6 dice
            const diceSides = diceSidesOptions[Math.floor(Math.random() * diceSidesOptions.length)];
            const color = colors[i % colors.length];

            // Create tile using TileRenderer
            const tileContainer = TileRenderer.createTile({
                size,
                diceCount,
                diceSides,
                color,
                fillAlpha: 0.3,
                showBorder: true
            });

            // Center the tile (TileRenderer creates at 0,0)
            tileContainer.pivot.set(size / 2, size / 2);
            tileContainer.alpha = 0.6;

            const dice = {
                graphics: tileContainer,
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                rotation: (Math.random() - 0.5) * 0.3, // Slight tilt only
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
            // Move
            d.x += d.vx;
            d.y += d.vy;
            d.rotation += d.rotationSpeed;

            // Wrap around screen
            if (d.x < -50) d.x = this.width + 50;
            if (d.x > this.width + 50) d.x = -50;
            if (d.y < -50) d.y = this.height + 50;
            if (d.y > this.height + 50) d.y = -50;

            // Pulse alpha
            d.alphaPhase += 0.02;
            const alphaMod = Math.sin(d.alphaPhase) * 0.2 + 0.8;

            d.graphics.x = d.x;
            d.graphics.y = d.y;
            d.graphics.rotation = d.rotation;
            d.graphics.alpha = d.baseAlpha * alphaMod;
        }
    }
}
