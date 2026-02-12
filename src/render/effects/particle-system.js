import { Container, Graphics, Ticker } from 'pixi.js';

/**
 * Particle System for Tron-style visual effects
 * Completely isolated from game rendering - uses only PixiJS primitives
 */

// Particle pool to avoid GC stutters
class ParticlePool {
    constructor(createFn, initialSize = 100) {
        this.createFn = createFn;
        this.pool = [];
        this.active = new Set();

        // Pre-allocate particles
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.createFn());
        }
    }

    acquire() {
        const particle = this.pool.pop() || this.createFn();
        this.active.add(particle);
        return particle;
    }

    release(particle) {
        if (this.active.has(particle)) {
            this.active.delete(particle);
            particle.visible = false;
            this.pool.push(particle);
        }
    }

    clear() {
        for (const p of this.active) {
            p.visible = false;
            this.pool.push(p);
        }
        this.active.clear();
    }
}

// Particle data structure (separate from graphics)
class ParticleData {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.life = 0;
        this.maxLife = 60;
        this.scale = 1;
        this.alpha = 1;
        this.color = 0x00ffff;
        this.graphics = null;
    }
}

// Preset effect configurations
export const EffectPresets = {
    clickBurst: {
        count: 12,
        speed: { min: 2, max: 5 },
        life: { min: 20, max: 40 },
        size: { min: 2, max: 4 },
        colors: [0x00ffff, 0x00aaff, 0xffffff],
        gravity: 0,
        fadeOut: true,
        shrink: true
    },
    attackTrail: {
        count: 8,
        speed: { min: 0.5, max: 1.5 },
        life: { min: 15, max: 25 },
        size: { min: 3, max: 5 },
        colors: [0xAA00FF, 0xFF33FF, 0xFFAAFF],
        gravity: 0,
        fadeOut: true,
        shrink: false
    },
    victoryExplosion: {
        count: 24,
        speed: { min: 3, max: 8 },
        life: { min: 30, max: 60 },
        size: { min: 3, max: 6 },
        colors: [0x00ff00, 0x55ff55, 0xaaffaa, 0xffffff],
        gravity: 0.1,
        fadeOut: true,
        shrink: true
    },
    defeatExplosion: {
        count: 24,
        speed: { min: 2, max: 8 },
        life: { min: 40, max: 80 },
        size: { min: 3, max: 6 },
        colors: [0xff0000, 0xff3333, 0xff6666],
        gravity: 0.15,
        fadeOut: true,
        shrink: true
    },
    selectionGlow: {
        count: 6,
        speed: { min: 0.3, max: 0.8 },
        life: { min: 40, max: 60 },
        size: { min: 2, max: 3 },
        colors: [0xffffff, 0x00ffff],
        gravity: -0.02,
        fadeOut: true,
        shrink: false
    },
    ambientFloat: {
        count: 1,
        speed: { min: 0.1, max: 0.3 },
        life: { min: 200, max: 400 },
        size: { min: 1, max: 2 },
        colors: [0x00ffff, 0xAA00FF, 0x0055ff],
        gravity: 0,
        fadeOut: true,
        shrink: false
    },
    // Victory effects
    firework: {
        count: 40,
        speed: { min: 4, max: 10 },
        life: { min: 40, max: 80 },
        size: { min: 2, max: 5 },
        colors: [0x00ffff, 0xAA00FF, 0xffff00, 0x00ff00, 0xff00ff, 0xffffff],
        gravity: 0.12,
        fadeOut: true,
        shrink: true
    },
    confetti: {
        count: 3,
        speed: { min: 0.5, max: 2 },
        life: { min: 120, max: 200 },
        size: { min: 2, max: 4 },
        colors: [0x00ffff, 0xAA00FF, 0xffff00, 0x00ff00, 0xff00ff, 0xffffff],
        gravity: 0.05,
        fadeOut: true,
        shrink: false
    },
    // Intro screen effects
    introStream: {
        count: 2,
        speed: { min: 2, max: 4 },
        life: { min: 60, max: 120 },
        size: { min: 1, max: 3 },
        colors: [0x00ffff, 0xAA00FF, 0x0088ff],
        gravity: 0,
        fadeOut: true,
        shrink: false
    },
    introDice: {
        count: 1,
        speed: { min: 0.3, max: 0.8 },
        life: { min: 300, max: 500 },
        size: { min: 8, max: 15 },
        colors: [0x00ffff, 0xAA00FF, 0xffffff],
        gravity: 0,
        fadeOut: true,
        shrink: false
    }
};

export class ParticleSystem {
    constructor(stage, options = {}) {
        this.container = new Container();
        this.container.label = 'particles';

        // Insert at correct z-index (above background, below UI)
        if (options.zIndex !== undefined) {
            this.container.zIndex = options.zIndex;
        }
        stage.addChild(this.container);

        // Particle management
        this.particles = [];
        this.pool = new ParticlePool(() => this.createParticleGraphics(), 200);

        // Quality settings
        this.quality = 'high'; // 'off', 'medium', 'high'
        this.maxParticles = 500;

        // Start update loop
        this.tickerCallback = this.update.bind(this);
        Ticker.shared.add(this.tickerCallback);
    }

    createParticleGraphics() {
        const g = new Graphics();
        g.circle(0, 0, 1);
        g.fill({ color: 0xffffff });
        g.visible = false;
        g.blendMode = 'add';
        this.container.addChild(g);
        return g;
    }

    setQuality(quality) {
        this.quality = quality;
        if (quality === 'off') {
            this.clear();
        }
        // Adjust max particles based on quality
        if (quality === 'high') {
            this.maxParticles = 500;
        } else if (quality === 'medium') {
            this.maxParticles = 250; // Balanced between old medium/low
        } else {
            this.maxParticles = 0;
        }
    }

    /**
     * Emit particles at a position with a preset effect
     * @param {number} x - World X position
     * @param {number} y - World Y position
     * @param {string|object} preset - Preset name or custom config
     * @param {object} options - Override options
     */
    emit(x, y, preset, options = {}) {
        if (this.quality === 'off') return;

        const config = typeof preset === 'string' ? EffectPresets[preset] : preset;
        if (!config) return;

        // Particle count based on quality
        let count = config.count;
        if (this.quality === 'high') {
            // Use config.count directly for high quality
        } else if (this.quality === 'medium') {
            count = Math.ceil(count * 0.6); // Slightly more than old low, less than old medium
        }

        // Respect max particle limit
        const available = this.maxParticles - this.particles.length;
        count = Math.min(count, available);

        for (let i = 0; i < count; i++) {
            this.spawnParticle(x, y, config, options);
        }
    }

    /**
     * Emit particles along a line (for trails)
     */
    emitLine(x1, y1, x2, y2, preset, count = 10) {
        if (this.quality === 'off') return;

        const config = typeof preset === 'string' ? EffectPresets[preset] : preset;
        if (!config) return;

        const actualCount = this.quality === 'medium' ? Math.ceil(count * 0.6) : count;

        for (let i = 0; i < actualCount; i++) {
            const t = i / actualCount;
            const x = x1 + (x2 - x1) * t;
            const y = y1 + (y2 - y1) * t;
            this.spawnParticle(x, y, config, { delay: i * 2 });
        }
    }

    spawnParticle(x, y, config, options = {}) {
        const data = new ParticleData();
        const graphics = this.pool.acquire();

        // Position
        data.x = x + (options.offsetX || 0);
        data.y = y + (options.offsetY || 0);

        // Velocity (radial burst)
        const angle = Math.random() * Math.PI * 2;
        const speed = this.randomRange(config.speed.min, config.speed.max);
        data.vx = Math.cos(angle) * speed;
        data.vy = Math.sin(angle) * speed;

        // If direction override specified
        if (options.directionX !== undefined) {
            data.vx = options.directionX * speed;
            data.vy = options.directionY * speed;
        }

        // Life
        data.maxLife = this.randomRange(config.life.min, config.life.max);
        data.life = data.maxLife;

        // Size
        data.scale = this.randomRange(config.size.min, config.size.max);

        // Color
        data.color = config.colors[Math.floor(Math.random() * config.colors.length)];

        // Config refs
        data.gravity = config.gravity || 0;
        data.fadeOut = config.fadeOut !== false;
        data.shrink = config.shrink === true;

        // Apply to graphics
        data.graphics = graphics;
        graphics.visible = true;
        graphics.x = data.x;
        graphics.y = data.y;
        graphics.scale.set(data.scale, data.scale);
        graphics.tint = data.color;
        graphics.alpha = 1;

        // Delay spawn
        if (options.delay) {
            graphics.visible = false;
            data.delay = options.delay;
        }

        this.particles.push(data);
    }

    update() {
        if (this.quality === 'off') return;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            // Handle spawn delay
            if (p.delay && p.delay > 0) {
                p.delay--;
                continue;
            }

            if (p.delay === 0) {
                p.graphics.visible = true;
                p.delay = undefined;
            }

            // Update physics
            p.vy += p.gravity;
            p.x += p.vx;
            p.y += p.vy;

            // Update life
            p.life--;
            const lifeRatio = p.life / p.maxLife;

            // Update graphics
            p.graphics.x = p.x;
            p.graphics.y = p.y;

            if (p.fadeOut) {
                p.graphics.alpha = lifeRatio;
            }

            if (p.shrink) {
                const s = p.scale * lifeRatio;
                p.graphics.scale.set(s, s);
            }

            // Remove dead particles
            if (p.life <= 0) {
                this.pool.release(p.graphics);
                this.particles.splice(i, 1);
            }
        }
    }

    randomRange(min, max) {
        return min + Math.random() * (max - min);
    }

    clear() {
        for (const p of this.particles) {
            this.pool.release(p.graphics);
        }
        this.particles = [];
    }

    destroy() {
        Ticker.shared.remove(this.tickerCallback);
        this.clear();
        this.container.destroy({ children: true });
    }
}
