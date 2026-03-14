import { Container, Graphics, Ticker } from 'pixi.js';
import { TileRenderer } from '../tile-renderer.js';
import { BackgroundShader } from './background-shader.js';

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

        // Space/Tron background shader (sits at zIndex -1 inside this.container)
        this.bgShader = options.app
            ? new BackgroundShader(this.container, options.app)
            : null;
        // Default to high so shader is visible before setQuality() is called
        this.bgShader?.setQuality('high');

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

        this.bgShader?.setQuality(quality);

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

    update(ticker) {
        if (!this.enabled) return;
        const dt = ticker.deltaTime;

        this.time += dt;

        // Ambient particles
        for (const p of this.ambientParticles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            if (p.x < -10) p.x = this.width + 10;
            if (p.x > this.width + 10) p.x = -10;
            if (p.y < -10) p.y = this.height + 10;
            if (p.y > this.height + 10) p.y = -10;

            p.alphaPhase += p.alphaSpeed * dt;
            const alphaMod = Math.sin(p.alphaPhase) * 0.3 + 0.7;

            p.graphics.x = p.x;
            p.graphics.y = p.y;
            p.graphics.alpha = p.baseAlpha * alphaMod;
        }

        // Pulse decay
        if (this.pulseTarget > 0) {
            this.pulseAlpha += (this.pulseTarget - this.pulseAlpha) * (0.1 * dt);
            if (this.pulseAlpha >= this.pulseTarget * 0.9) this.pulseTarget = 0;
        } else {
            this.pulseAlpha *= Math.pow(0.92, dt);
            if (this.pulseAlpha < 0.01) this.pulseAlpha = 0;
        }

        // Win intensity (brightens particles)
        if (this.winIntensity > 0) {
            this.winIntensity *= Math.pow(0.99, dt);
            if (this.winIntensity < 0.01) this.winIntensity = 0;

            for (const p of this.ambientParticles) {
                p.graphics.alpha = Math.min(1, p.graphics.alpha + this.winIntensity * 0.5);
            }
        }

        // Elimination flare (growing square, event-driven — unchanged)
        if (this.flareActive) {
            this.flareProgress += 0.012 * dt;
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
            this.updateFloatingDice(dt);
        }
    }

    // ── Resize / destroy ─────────────────────────────────────────────────────

    onResize() {
        const oldWidth = this.width;
        const oldHeight = this.height;

        this.width = window.innerWidth;
        this.height = window.innerHeight;

        if (oldWidth === 0 || oldHeight === 0 || (oldWidth === this.width && oldHeight === this.height)) return;

        const rx = this.width / oldWidth;
        const ry = this.height / oldHeight;

        // Proportionally reposition ambient particles so they stay distributed across the screen
        for (const p of this.ambientParticles) {
            p.x *= rx;
            p.y *= ry;
            p.graphics.x = p.x;
            p.graphics.y = p.y;
        }

        // Proportionally reposition floating dice so they maintain their visual positions
        if (this.introMode && this.floatingDice.length > 0) {
            this.diceContainer.x *= rx;
            this.diceContainer.y *= ry;
            for (const d of this.floatingDice) {
                d.x *= rx;
                d.y *= ry;
                d.graphics.x = d.x;
                d.graphics.y = d.y;
            }
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

    /** Override the two army colours (e.g. to match connected player colours). */
    setArmyColors(colors) {
        this.armyColors = colors;
    }

    setIntroMode(enabled) {
        this.introMode = enabled;

        if (enabled) {
            this.armyColors = this.armyColors || [0xAA00FF, 0x0088FF];
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

    // ── Floating dice — two armies clashing ───────────────────────────────────

    createFloatingDice() {
        this.clearFloatingDice();

        if (!this.enabled) return;

        const count = this.quality === 'high' ? 40 : 14;
        this.baseCount = count;
        this.maxExtra  = this.quality === 'high' ? 60 : 20;
        this.matrixSpawnTimer    = 0;
        this.matrixSpawnInterval = this.quality === 'high' ? 5 : 12;
        this._nextTeam = 0;

        // Fill screen immediately: stagger team 0 and 1 across full x range
        for (let i = 0; i < count; i++) {
            this._spawnArmyDie(i % 2, true);
        }
    }

    _spawnArmyDie(team, scattered = false) {
        if (!this.enabled) return;

        const s = this._scale();
        const minDim = Math.min(this.width, this.height);
        const sc = this.diceContainer.scale.x;
        const ox = this.diceContainer.x;
        const oy = this.diceContainer.y;

        // Visible bounds in local space
        const localLeft   = -ox / sc;
        const localRight  = (this.width  - ox) / sc;
        const localTop    = -oy / sc;
        const localBottom = (this.height - oy) / sc;
        const localWidth  = localRight - localLeft;
        const localHeight = localBottom - localTop;

        const size      = (0.03 + Math.random() * 0.04) * minDim / sc;
        const baseSpeed = (0.3  + Math.random() * 0.6)  * s / sc;
        const drift     = (Math.random() - 0.5) * 0.06  * s / sc;  // subtle vertical drift

        const color = this.armyColors?.[team] ?? (team === 0 ? 0xAA00FF : 0x0088FF);
        const diceSidesOptions = [6, 6, 6, 8, 10, 12, 20];
        const diceCount = 1 + Math.floor(Math.random() * 6);
        const diceSides = diceSidesOptions[Math.floor(Math.random() * diceSidesOptions.length)];

        const tileContainer = TileRenderer.createTile({
            size, diceCount, diceSides, color, fillAlpha: 0.7, showBorder: true
        });
        tileContainer.pivot.set(size / 2, size / 2);

        // Team 0: left → right.  Team 1: right → left.
        const margin     = size + 60 / sc;
        const travelDist = localWidth + margin * 2;
        const vx         = team === 0 ? baseSpeed : -baseSpeed;
        const startX     = team === 0
            ? (scattered ? localLeft  - margin - Math.random() * localWidth : localLeft  - margin)
            : (scattered ? localRight + margin + Math.random() * localWidth : localRight + margin);
        const startY = localTop + Math.random() * localHeight;

        const dice = {
            graphics: tileContainer,
            x: startX, y: startY,
            vx, vy: drift,
            baseVx: vx,
            rotation: (Math.random() - 0.5) * 0.5,
            rotationSpeed: (Math.random() - 0.5) * 0.003,
            baseAlpha: 0.5 + Math.random() * 0.4,
            alphaPhase: Math.random() * Math.PI * 2,
            startX, travelDist, team,
        };

        tileContainer.scale.set(0.04); // starts tiny — grows as it crosses (comet feel)
        tileContainer.x = dice.x;
        tileContainer.y = dice.y;
        tileContainer.rotation = dice.rotation;
        tileContainer.alpha = dice.baseAlpha;

        this.diceContainer.addChild(tileContainer);
        this.floatingDice.push(dice);
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

    /**
     * Spawn a player-thrown die at a screen position.
     * It joins the army on that side of the screen (left half → rightward, right half → leftward).
     * @param {number} screenX
     * @param {number} screenY
     * @param {number|null} color  hex colour; null → use army colour for that side
     */
    spawnDiceAt(screenX, screenY, color = null) {
        if (!this.enabled || !this.introMode) return;

        const sc = this.diceContainer.scale.x;
        const localX = (screenX - this.diceContainer.x) / sc;
        const localY = (screenY - this.diceContainer.y) / sc;

        const s = this._scale();
        const minDim = Math.min(this.width, this.height);
        const size = (0.04 + Math.random() * 0.02) * minDim / sc;

        // Join the army on the side of the click
        const team = screenX < this.width / 2 ? 0 : 1;
        const effectiveColor = color ?? this.armyColors?.[team] ?? (team === 0 ? 0xAA00FF : 0x0088FF);

        const diceSidesOptions = [6, 6, 6, 8, 10, 12, 20];
        const diceCount = 1 + Math.floor(Math.random() * 6);
        const diceSides = diceSidesOptions[Math.floor(Math.random() * diceSidesOptions.length)];

        const tileContainer = TileRenderer.createTile({
            size, diceCount, diceSides, color: effectiveColor, fillAlpha: 0.7, showBorder: true
        });
        tileContainer.pivot.set(size / 2, size / 2);

        const baseSpeed = (0.4 + Math.random() * 0.4) * s / sc;
        const vx = team === 0 ? baseSpeed : -baseSpeed;
        const vy = (Math.random() - 0.5) * 0.06 * s / sc;

        const dice = {
            graphics: tileContainer,
            x: localX, y: localY,
            vx, vy,
            baseVx: vx,
            rotation: (Math.random() - 0.5) * 0.3,
            rotationSpeed: (Math.random() - 0.5) * 0.004,
            baseAlpha: 0.8 + Math.random() * 0.2,
            alphaPhase: Math.random() * Math.PI * 2,
            startX: localX,
            travelDist: -1,  // player-spawned: full scale, no comet grow
            team,
        };

        tileContainer.x = dice.x;
        tileContainer.y = dice.y;
        tileContainer.rotation = dice.rotation;
        tileContainer.alpha = dice.baseAlpha;

        // At cap: recycle oldest extra die
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

    updateFloatingDice(dt) {
        const sc = this.diceContainer.scale.x;
        const ox = this.diceContainer.x;
        const oy = this.diceContainer.y;
        const cullMargin = 300;

        // Alternate team spawning
        this.matrixSpawnTimer = (this.matrixSpawnTimer || 0) + dt;
        if (this.matrixSpawnTimer >= (this.matrixSpawnInterval || 10)) {
            this.matrixSpawnTimer = 0;
            if (this.floatingDice.length < this.baseCount + this.maxExtra) {
                this._nextTeam = (this._nextTeam ?? 0) === 0 ? 1 : 0;
                this._spawnArmyDie(this._nextTeam, false);
            }
        }

        for (let i = this.floatingDice.length - 1; i >= 0; i--) {
            const d = this.floatingDice[i];

            // Progress: 0 = just spawned off-screen edge, 1 = fully crossed
            // team 0 moves right (x increases), team 1 moves left (x decreases)
            // travelDist < 0 = player-spawned: full scale, constant speed
            const progress = d.travelDist > 0
                ? (d.team === 0
                    ? Math.max(0, Math.min(1, (d.x - d.startX) / d.travelDist))
                    : Math.max(0, Math.min(1, (d.startX - d.x) / d.travelDist)))
                : 1;

            // Comet: starts tiny, grows to full scale as it crosses
            const perspScale = d.travelDist < 0 ? 1.0 : 0.04 + 0.96 * Math.pow(progress, 0.65);

            // Accelerate toward the camera (perspective feel)
            const speedMult = d.travelDist < 0 ? 1.0 : 0.3 + 0.7 * progress;

            d.x += d.baseVx * dt * speedMult;
            d.y += d.vy    * dt;
            d.rotation += d.rotationSpeed * dt * (0.5 + 0.5 * progress);

            const screenX = ox + d.x * sc;
            const screenY = oy + d.y * sc;

            if (screenX < -cullMargin || screenX > this.width  + cullMargin ||
                screenY < -cullMargin || screenY > this.height + cullMargin) {
                d.graphics.destroy();
                this.floatingDice.splice(i, 1);
                if (i < this.baseCount) this.baseCount = Math.max(0, this.baseCount - 1);
                continue;
            }

            d.alphaPhase += 0.015 * dt;
            const alphaMod = Math.sin(d.alphaPhase) * 0.2 + 0.8;

            d.graphics.x = d.x;
            d.graphics.y = d.y;
            d.graphics.rotation = d.rotation;
            d.graphics.scale.set(perspScale);
            d.graphics.alpha = d.baseAlpha * alphaMod;
        }
    }
}
