import { Container } from 'pixi.js';
import { ParticleSystem, EffectPresets } from './particle-system.js';
import { BackgroundRenderer } from './background-renderer.js';

/**
 * Effects Manager - Central coordinator for all visual effects
 * Completely isolated from game rendering - responds to events only
 */
export class EffectsManager {
    constructor(stage, game, options = {}) {
        this.stage = stage;
        this.game = game;

        // Quality setting (persisted to localStorage)
        this.quality = 'high';

        // Create effects container (above game, below UI)
        this.container = new Container();
        this.container.label = 'effects';
        this.container.zIndex = 50;
        stage.addChild(this.container);

        // Initialize subsystems
        this.background = new BackgroundRenderer(stage);
        this.particles = new ParticleSystem(this.container, { zIndex: 10 });

        // Tile size for position calculations (matches grid-renderer)
        this.tileSize = options.tileSize || 60;
        this.gap = options.gap || 4;

        // World transform reference (set by main.js when available)
        this.worldTransform = null;

        // Load saved quality
        this.loadQuality();

        // Bind game events
        this.bindEvents();

        // Screen-space particle system for UI effects (fireworks, confetti)
        this.screenParticles = new ParticleSystem(stage, { zIndex: 200 });

        // Intro mode state
        this.introModeActive = false;
        this.introInterval = null;
    }

    bindEvents() {
        // Attack effect
        this.game.on('attackResult', (result) => {
            this.onAttack(result);
        });

        // Turn change pulse
        this.game.on('turnStart', (player) => {
            this.onTurnStart(player);
        });

        // Game over celebration
        this.game.on('gameOver', (winner) => {
            this.onGameOver(winner);
        });
    }

    /**
     * Set the world transform container (for screen-to-world coordinate conversion)
     */
    setWorldTransform(rootContainer) {
        this.worldTransform = rootContainer;
        // Make particles follow world transform
        if (rootContainer) {
            // Remove from stage, add to world container so particles move with camera
            this.stage.removeChild(this.container);
            rootContainer.addChild(this.container);
        }
    }

    /**
     * Convert tile coordinates to world pixel coordinates
     */
    tileToWorld(tileX, tileY) {
        return {
            x: tileX * (this.tileSize + this.gap) + this.tileSize / 2,
            y: tileY * (this.tileSize + this.gap) + this.tileSize / 2
        };
    }

    // ==================== Quality Settings ====================

    setQuality(quality) {
        this.quality = quality;
        this.background.setQuality(quality);
        this.particles.setQuality(quality);
        this.saveQuality();
    }

    loadQuality() {
        const saved = localStorage.getItem('effectsQuality');
        if (saved && ['off', 'low', 'high'].includes(saved)) {
            this.setQuality(saved);
        }
    }

    saveQuality() {
        localStorage.setItem('effectsQuality', this.quality);
    }

    getQuality() {
        return this.quality;
    }

    // ==================== Intro Mode ====================

    /**
     * Start intro mode (for setup screen)
     */
    startIntroMode() {
        if (this.quality === 'off') return;
        if (this.introModeActive) return;

        this.introModeActive = true;
        this.background.setIntroMode(true);

        // Spawn periodic particle streams
        this.introInterval = setInterval(() => {
            if (this.quality === 'off') return;

            // Diagonal particle streams from corners
            const side = Math.floor(Math.random() * 4);
            let x, y, dirX, dirY;

            switch (side) {
                case 0: // Top
                    x = Math.random() * window.innerWidth;
                    y = -20;
                    dirX = (Math.random() - 0.5) * 0.5;
                    dirY = 1;
                    break;
                case 1: // Right
                    x = window.innerWidth + 20;
                    y = Math.random() * window.innerHeight;
                    dirX = -1;
                    dirY = (Math.random() - 0.5) * 0.5;
                    break;
                case 2: // Bottom
                    x = Math.random() * window.innerWidth;
                    y = window.innerHeight + 20;
                    dirX = (Math.random() - 0.5) * 0.5;
                    dirY = -1;
                    break;
                case 3: // Left
                    x = -20;
                    y = Math.random() * window.innerHeight;
                    dirX = 1;
                    dirY = (Math.random() - 0.5) * 0.5;
                    break;
            }

            this.screenParticles.emit(x, y, 'introStream', { directionX: dirX, directionY: dirY });
        }, 200);
    }

    /**
     * Stop intro mode (when game starts)
     */
    stopIntroMode() {
        this.introModeActive = false;
        this.background.setIntroMode(false);

        if (this.introInterval) {
            clearInterval(this.introInterval);
            this.introInterval = null;
        }

        // Clear any remaining screen particles
        this.screenParticles.clear();
    }

    // ==================== Effect Triggers ====================

    /**
     * Emit particles on tile click/selection
     */
    onTileClick(tileX, tileY) {
        if (this.quality === 'off') return;

        const pos = this.tileToWorld(tileX, tileY);
        this.particles.emit(pos.x, pos.y, 'clickBurst');
    }

    /**
     * Emit particles on tile selection (when selecting own tile)
     */
    onTileSelect(tileX, tileY) {
        if (this.quality === 'off') return;

        const pos = this.tileToWorld(tileX, tileY);
        this.particles.emit(pos.x, pos.y, 'selectionGlow');
    }

    /**
     * Attack effect - trail from attacker to defender, explosion on defender
     */
    onAttack(result) {
        if (this.quality === 'off') return;

        const from = this.tileToWorld(result.from.x, result.from.y);
        const to = this.tileToWorld(result.to.x, result.to.y);

        // Trail from attacker to defender
        this.particles.emitLine(from.x, from.y, to.x, to.y, 'attackTrail',
            this.quality === 'high' ? 12 : 6);

        // Explosion on defender
        setTimeout(() => {
            if (result.won) {
                // Victory - green/cyan burst
                this.particles.emit(to.x, to.y, 'victoryExplosion');
                this.background.pulse(0x00ff00, 0.2);
            } else {
                // Defeat - red burst
                this.particles.emit(to.x, to.y, 'defeatExplosion');
                this.background.pulse(0xff0055, 0.15);
            }
        }, 100); // Small delay for trail to reach target
    }

    /**
     * Turn start - subtle pulse
     */
    onTurnStart(player) {
        if (this.quality === 'off') return;

        const color = player?.color || 0x00ffff;
        this.background.pulse(color, 0.1);
    }

    /**
     * Game over celebration with fireworks
     */
    onGameOver(data) {
        if (this.quality === 'off') return;

        const winner = data?.winner;
        const winnerColor = winner?.color || 0xffffff;

        // Create a custom firework preset with winner's color
        const winnerFirework = {
            count: this.quality === 'high' ? 50 : 25,
            speed: { min: 5, max: 12 },
            life: { min: 50, max: 100 },
            size: { min: 2, max: 6 },
            colors: [winnerColor, 0xffffff, 0xffff00],
            gravity: 0.1,
            fadeOut: true,
            shrink: true
        };

        const burstCount = this.quality === 'high' ? 8 : 4;

        // Multiple firework bursts
        for (let i = 0; i < burstCount; i++) {
            setTimeout(() => {
                const x = 100 + Math.random() * (window.innerWidth - 200);
                const y = 100 + Math.random() * (window.innerHeight - 300);

                this.screenParticles.emit(x, y, winnerFirework);
            }, i * 300);
        }

        // Confetti rain
        if (this.quality === 'high') {
            for (let i = 0; i < 30; i++) {
                setTimeout(() => {
                    const x = Math.random() * window.innerWidth;
                    this.screenParticles.emit(x, -10, 'confetti', { directionX: 0, directionY: 1 });
                }, i * 100);
            }
        }

        // Big pulse
        this.background.pulse(winnerColor, 0.6);
    }

    /**
     * Manual effect trigger for external use
     */
    emitAt(x, y, preset) {
        if (this.quality === 'off') return;
        this.particles.emit(x, y, preset);
    }

    /**
     * Emit at tile coordinates
     */
    emitAtTile(tileX, tileY, preset) {
        if (this.quality === 'off') return;
        const pos = this.tileToWorld(tileX, tileY);
        this.particles.emit(pos.x, pos.y, preset);
    }

    destroy() {
        this.stopIntroMode();
        this.background.destroy();
        this.particles.destroy();
        this.screenParticles.destroy();
        this.container.destroy({ children: true });
    }
}
