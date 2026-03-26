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
        this.diceContainer.sortableChildren = true;
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

    /**
     * Set armies for intro mode.
     * @param {Array<{color: number, human: boolean}>} armyDefs
     *   Bot armies get evenly-spaced angles around the screen; human armies are player-only (no auto-spawn).
     */
    setArmies(armyDefs) {
        // Only 2 directions: left→right and right→left — cycle armies through them
        const CARDINALS = [Math.PI, 0];
        let botIdx = 0;
        this.armies = armyDefs.map(def => {
            if (def.human) return { ...def };
            const angle = CARDINALS[botIdx % 4];
            botIdx++;
            return { ...def, angle };
        });
        this._nextBotIdx = 0;
        if (this.introMode) this.createFloatingDice();
    }

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

    // ── Floating dice — N armies from screen edges, comet perspective ──────────

    createFloatingDice() {
        this.clearFloatingDice();
        if (!this.enabled) return;

        const armies = this.armies ?? [];
        const botArmies = armies.filter(a => !a.human);
        const perArmy   = this.quality === 'high' ? 7 : 4;
        const count     = Math.max(perArmy, botArmies.length * perArmy);

        this.baseCount = count;
        this.maxExtra  = this.quality === 'high' ? 80 : 30;
        this.matrixSpawnTimer    = 0;
        this.matrixSpawnInterval = 9; // high only; medium skips spawning entirely
        this._nextBotIdx = 0;

        if (this.quality !== 'high') return; // medium/low: no dice at all

        // Stagger initial dice across each army's path so the screen fills instantly
        const botIndices = armies.map((a, i) => a.human ? -1 : i).filter(i => i >= 0);
        for (let i = 0; i < count; i++) {
            if (botIndices.length === 0) break;
            this._spawnArmyDie(botIndices[i % botIndices.length], true);
        }
    }

    /**
     * Spawn one bot-army die.
     * @param {number} armyIndex  index into this.armies
     * @param {boolean} scattered  if true, start at a random point along the path (fills screen on init)
     */
    _spawnArmyDie(armyIndex, scattered = false) {
        if (!this.enabled) return;
        const army = this.armies?.[armyIndex];
        if (!army || army.human) return;

        const s = this._scale();
        const minDim = Math.min(this.width, this.height);
        const sc = this.diceContainer.scale.x;
        const ox = this.diceContainer.x;
        const oy = this.diceContainer.y;

        // Army direction: from screen edge toward center (and beyond)
        const angle = army.angle;          // direction FROM center TO spawn edge
        const cos   = Math.cos(angle);
        const sin   = Math.sin(angle);
        const cx    = this.width  / 2;
        const cy    = this.height / 2;

        // Find where the ray from center at `angle` hits the screen edge
        let t = Infinity;
        if ( cos >  1e-4) t = Math.min(t, (this.width  - cx) /  cos);
        if ( cos < -1e-4) t = Math.min(t, -cx            /  cos);
        if ( sin >  1e-4) t = Math.min(t, (this.height - cy)  /  sin);
        if ( sin < -1e-4) t = Math.min(t, -cy             /  sin);

        const offscreen = 80 + Math.random() * 40;           // pixels beyond edge
        const crossDist = t * 2 + offscreen;                 // full crossing in screen px

        // Edge point, then go off-screen
        let spawnSX = cx + cos * t;
        let spawnSY = cy + sin * t;

        // Cardinal directions: fill the full spawn edge (not just the centre strip)
        if (Math.abs(cos) > 0.5) {
            spawnSY = Math.random() * this.height;  // horizontal army → random Y
        } else {
            spawnSX = Math.random() * this.width;   // vertical army → random X
        }
        spawnSX += cos * offscreen;
        spawnSY += sin * offscreen;

        if (scattered) {
            const walk = Math.random() * crossDist;
            spawnSX -= cos * walk;
            spawnSY -= sin * walk;
        }

        // Convert to local (diceContainer) space
        const startX = (spawnSX - ox) / sc;
        const startY = (spawnSY - oy) / sc;

        // Velocity: toward center (-angle), tiny perpendicular wobble
        const speed  = (0.7 + Math.random() * 0.8) * s / sc;
        const wobble = (Math.random() - 0.5) * 0.04 * s / sc;
        const vx = -cos * speed + (-sin) * wobble;
        const vy = -sin * speed +   cos  * wobble;

        const size      = (0.03 + Math.random() * 0.04) * minDim / sc;
        const diceSides = [6, 6, 6, 8, 10, 12, 20][Math.floor(Math.random() * 7)];
        const diceCount = 1 + Math.floor(Math.random() * 6);

        const tileContainer = TileRenderer.createTile({
            size, diceCount, diceSides, color: army.color, fillAlpha: 0.7, showBorder: true
        });
        tileContainer.pivot.set(size / 2, size / 2);
        tileContainer.scale.set(0.04);   // starts tiny — grows via perspective as it nears center
        tileContainer.x = startX;
        tileContainer.y = startY;
        tileContainer.rotation = Math.random() * Math.PI * 2;
        tileContainer.alpha    = 0.5 + Math.random() * 0.4;

        // Per-army cap: remove this army's oldest die before adding a new one
        const armyKey  = `bot_${armyIndex}`;
        if (this.quality !== 'high') return;
        const maxPerArmy = 30;
        const armyDice = this.floatingDice.filter(d => d.armyKey === armyKey);
        if (armyDice.length >= maxPerArmy) {
            const oldest = armyDice[0];
            oldest.graphics.destroy();
            this.floatingDice.splice(this.floatingDice.indexOf(oldest), 1);
        }

        this.diceContainer.addChild(tileContainer);
        this.floatingDice.push({
            graphics: tileContainer,
            x: startX, y: startY, vx, vy,
            rotation: tileContainer.rotation,
            rotationSpeed: (Math.random() - 0.5) * 0.003,
            armyKey,
        });
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
        const worldX = (x - this.diceContainer.x) / currentScale;
        const worldY = (y - this.diceContainer.y) / currentScale;
        this.diceContainer.scale.set(newScale, newScale);
        this.diceContainer.x = x - worldX * newScale;
        this.diceContainer.y = y - worldY * newScale;
    }

    /**
     * Spawn a player-thrown die at a screen position.
     * Flies toward screen center and beyond in the player's color.
     * @param {number} screenX
     * @param {number} screenY
     * @param {number|null} color  hex; null → cyan fallback
     */
    spawnDiceAt(screenX, screenY, color = null) {
        if (!this.enabled || !this.introMode) return;

        const sc  = this.diceContainer.scale.x;
        const ox  = this.diceContainer.x;
        const oy  = this.diceContainer.y;
        const s   = this._scale();
        const minDim = Math.min(this.width, this.height);

        const localX = (screenX - ox) / sc;
        const localY = (screenY - oy) / sc;

        // Direction: from click toward screen center (and beyond)
        const cx = this.width / 2, cy = this.height / 2;
        const ddx = cx - screenX, ddy = cy - screenY;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        const nx = ddx / dist, ny = ddy / dist;

        const speed  = (0.5 + Math.random() * 0.4) * s / sc;
        const wobble = (Math.random() - 0.5) * 0.05 * s / sc;
        const vx = nx * speed + (-ny) * wobble;
        const vy = ny * speed +   nx  * wobble;

        const size      = (0.04 + Math.random() * 0.02) * minDim / sc;
        const diceSides = [6, 6, 6, 8, 10, 12, 20][Math.floor(Math.random() * 7)];
        const diceCount = 1 + Math.floor(Math.random() * 6);
        const effectiveColor = color ?? 0x00ffff;

        const tileContainer = TileRenderer.createTile({
            size, diceCount, diceSides, color: effectiveColor, fillAlpha: 0.7, showBorder: true
        });
        tileContainer.pivot.set(size / 2, size / 2);
        tileContainer.x = localX;
        tileContainer.y = localY;
        tileContainer.rotation = (Math.random() - 0.5) * 0.3;
        tileContainer.alpha    = 0.9 + Math.random() * 0.1;

        // Per-player cap: remove this player's oldest die only
        const armyKey    = `player_${color ?? 'anon'}`;
        const maxPerHuman = this.quality === 'high' ? 60 : 30;
        const playerDice  = this.floatingDice.filter(d => d.armyKey === armyKey);
        if (playerDice.length >= maxPerHuman) {
            const oldest = playerDice[0];
            oldest.graphics.destroy();
            this.floatingDice.splice(this.floatingDice.indexOf(oldest), 1);
        }

        this.floatingDice.push({
            graphics: tileContainer,
            x: localX, y: localY, vx, vy,
            rotation: tileContainer.rotation,
            rotationSpeed: (Math.random() - 0.5) * 0.004,
            playerSpawned: true,
            armyKey,
        });
        this.diceContainer.addChild(tileContainer);
    }

    removeNearestDie(screenX, screenY) {
        if (!this.enabled || !this.introMode || this.floatingDice.length === 0) return;
        const sc = this.diceContainer.scale.x;
        const ox = this.diceContainer.x;
        const oy = this.diceContainer.y;
        const localX = (screenX - ox) / sc;
        const localY = (screenY - oy) / sc;
        let minDist = Infinity, closest = null, closestIdx = -1;
        for (let i = 0; i < this.floatingDice.length; i++) {
            const d = this.floatingDice[i];
            const dx = d.x - localX, dy = d.y - localY;
            const dist = dx * dx + dy * dy;
            if (dist < minDist) { minDist = dist; closest = d; closestIdx = i; }
        }
        if (closest) {
            closest.graphics.destroy();
            this.floatingDice.splice(closestIdx, 1);
        }
    }

    mutateDie(screenX, screenY) {
        if (!this.enabled || !this.introMode || this.floatingDice.length === 0) return;
        const sc = this.diceContainer.scale.x;
        const ox = this.diceContainer.x;
        const oy = this.diceContainer.y;
        const localX = (screenX - ox) / sc;
        const localY = (screenY - oy) / sc;
        let minDist = Infinity, closest = null;
        for (const d of this.floatingDice) {
            const dx = d.x - localX, dy = d.y - localY;
            const dist = dx * dx + dy * dy;
            if (dist < minDist) { minDist = dist; closest = d; }
        }
        if (closest) {
            closest.graphics.scale.set(closest.graphics.scale.x * 1.6, closest.graphics.scale.y * 1.6);
            closest.rotationSpeed = (Math.random() - 0.5) * 0.02;
            closest.graphics.alpha = 1;
            closest.vx *= -1.2;
            closest.vy *= -1.2;
        }
    }

    clearFloatingDice() {
        for (const d of this.floatingDice) d.graphics.destroy();
        this.floatingDice = [];
        this.diceContainer.removeChildren();
        this.diceContainer.position.set(0, 0);
        this.diceContainer.scale.set(1, 1);
    }

    /**
     * Burst all dice outward from the screen center — used for campaign complete.
     * Clears existing dice and spawns a full spread of new ones at center.
     */
    burstDiceFromCenter(color) {
        if (!this.enabled) return;
        this.clearFloatingDice();

        const sc      = this.diceContainer.scale.x;
        const ox      = this.diceContainer.x;
        const oy      = this.diceContainer.y;
        const s       = this._scale();
        const minDim  = Math.min(this.width, this.height);
        const cx      = (this.width  / 2 - ox) / sc;
        const cy      = (this.height / 2 - oy) / sc;
        const count   = this.quality === 'high' ? 48 : 24;
        const colors  = [color ?? 0xFFD700, 0x00ffff, 0xAA00FF, 0xffff00, 0xffffff];

        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
            const speed = (1.0 + Math.random() * 1.5) * s / sc;
            const vx    = Math.cos(angle) * speed;
            const vy    = Math.sin(angle) * speed;

            const size      = (0.03 + Math.random() * 0.05) * minDim / sc;
            const diceSides = [6, 6, 6, 8, 10, 12, 20][Math.floor(Math.random() * 7)];
            const diceCount = 1 + Math.floor(Math.random() * 6);
            const c         = colors[i % colors.length];

            const tileContainer = TileRenderer.createTile({
                size, diceCount, diceSides, color: c, fillAlpha: 0.85, showBorder: true,
            });
            tileContainer.pivot.set(size / 2, size / 2);
            tileContainer.x        = cx;
            tileContainer.y        = cy;
            tileContainer.rotation = Math.random() * Math.PI * 2;
            tileContainer.alpha    = 0.9 + Math.random() * 0.1;

            this.diceContainer.addChild(tileContainer);
            this.floatingDice.push({
                graphics: tileContainer,
                x: cx, y: cy, vx, vy,
                rotation: tileContainer.rotation,
                rotationSpeed: (Math.random() - 0.5) * 0.025,
                playerSpawned: true,
                armyKey: 'campaign_burst',
            });
        }
    }

    updateFloatingDice(dt) {
        const sc  = this.diceContainer.scale.x;
        const ox  = this.diceContainer.x;
        const oy  = this.diceContainer.y;
        const cx  = this.width  / 2;
        const cy  = this.height / 2;
        const maxDist    = Math.sqrt(this.width * this.width + this.height * this.height) * 0.5;
        const cullMargin = 200;

        // Round-robin spawn across bot armies — high quality only
        this.matrixSpawnTimer = (this.matrixSpawnTimer || 0) + dt;
        if (this.quality === 'high' && this.matrixSpawnTimer >= (this.matrixSpawnInterval || 10)) {
            this.matrixSpawnTimer = 0;
            const botIndices = (this.armies ?? [])
                .map((a, i) => a.human ? -1 : i).filter(i => i >= 0);
            if (botIndices.length > 0) {
                this._nextBotIdx = ((this._nextBotIdx ?? 0)) % botIndices.length;
                this._spawnArmyDie(botIndices[this._nextBotIdx], false);
                this._nextBotIdx++;
            }
        }

        for (let i = this.floatingDice.length - 1; i >= 0; i--) {
            const d = this.floatingDice[i];

            d.x += d.vx * dt;
            d.y += d.vy * dt;
            d.rotation += d.rotationSpeed * dt;

            const screenX = ox + d.x * sc;
            const screenY = oy + d.y * sc;

            if (screenX < -cullMargin || screenX > this.width  + cullMargin ||
                screenY < -cullMargin || screenY > this.height + cullMargin) {
                d.graphics.destroy();
                this.floatingDice.splice(i, 1);
                if (i < this.baseCount) this.baseCount = Math.max(0, this.baseCount - 1);
                continue;
            }

            // Perspective: large at screen center, visible at edges (quadratic falloff)
            const ddx = screenX - cx, ddy = screenY - cy;
            const distNorm  = Math.min(1, Math.sqrt(ddx * ddx + ddy * ddy) / maxDist);
            const perspScale = d.playerSpawned ? 1.0 : 0.25 + 0.75 * (1 - distNorm * distNorm);

            d.graphics.x = d.x;
            d.graphics.y = d.y;
            d.graphics.rotation = d.rotation;
            d.graphics.scale.set(perspScale);
            d.graphics.zIndex = perspScale;
            d.graphics.alpha = 1.0;
        }

        // Force z-sort every frame so larger (closer) dice always render in front
        this.diceContainer.sortChildren();
    }
}
