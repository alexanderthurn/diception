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
        this.renderer = options.renderer || null;

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

        // Screen-space particle system for UI effects (fireworks, confetti)
        this.screenParticles = new ParticleSystem(stage, { zIndex: 200 });

        // Load saved quality
        this.loadQuality();

        // Bind game events
        this.bindEvents();

        // Intro mode state
        this.introModeActive = false;
        this.introInterval = null;

        // Streak tracking for dynamic effects
        this.winStreak = 0;
        this.lastWinTime = 0;
        this.streakDecayTimer = null;
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



        // Player elimination
        this.game.on('playerEliminated', (player) => {
            this.onPlayerEliminated(player);
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
        const wasOff = this.quality === 'off';
        this.quality = quality;
        this.background.setQuality(quality);
        this.particles.setQuality(quality);
        this.screenParticles.setQuality(quality);
        this.saveQuality();

        // If quality was off and now active, and intro mode is active, restart intro effects
        if (wasOff && quality !== 'off' && this.introModeActive) {
            this.startIntroMode();
        }
    }

    loadQuality() {
        let saved = localStorage.getItem('effectsQuality');
        if (saved === 'low') saved = 'medium'; // Merge low into medium
        if (saved && ['off', 'medium', 'high'].includes(saved)) {
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

        // Track win streak for dynamic effects (only for current player's attacks)
        const now = Date.now();
        if (result.won) {
            if (now - this.lastWinTime < 2000) { // Win within 2 seconds
                this.winStreak++;
            } else {
                this.winStreak = 1;
            }
            this.lastWinTime = now;
        } else {
            this.winStreak = 0;
        }

        // Handle Dynamic Screen Shake
        const isHighOrMedium = this.quality === 'high' || this.quality === 'medium';
        if (isHighOrMedium && this.renderer) {
            let shakeIntensity = 0;
            if (result.won) {
                // Streak scaling: start only with second attack (winStreak > 1)
                if (this.winStreak > 1) {
                    shakeIntensity = 2 + Math.min(this.winStreak - 1, 10) * 1.5;
                }
            } else {
                // Loss results in a sharp jolt
                shakeIntensity = 12; // Increased slightly for better visibility
            }

            // Scale shake by quality
            if (this.quality === 'medium') shakeIntensity *= 0.6;

            if (shakeIntensity > 0) {
                this.renderer.screenShake(shakeIntensity, result.won ? 200 : 400);
            }
        }

        // Explosion on defender
        setTimeout(() => {
            if (result.won) {
                // Victory - green/cyan burst
                this.particles.emit(to.x, to.y, 'victoryExplosion');

                // Background pulse increases with streak
                const intensity = 0.2 + Math.min(this.winStreak, 10) * 0.05;
                this.background.pulse(0x00ff00, intensity);
            } else {
                // Defeat - intensified effects for losses
                this.particles.emit(to.x, to.y, 'defeatExplosion');
                if (isHighOrMedium) {
                    // Extra "smoke" particles on loss - more of them for visibility
                    for (let i = 0; i < 3; i++) {
                        this.particles.emit(to.x, to.y, 'introStream', {
                            directionX: (Math.random() - 0.5) * 0.5,
                            directionY: -1
                        });
                    }
                }
                this.background.pulse(0xAA00FF, 0.5); // Bigger/longer pulse on loss (was 0.3)
            }
        }, 100); // Small delay for trail to reach target
    }

    /**
     * Turn start - subtle pulse
     */
    onTurnStart(player) {
        if (this.quality === 'off') return;

        // Reset streak on turn start
        this.winStreak = 0;
        this.lastWinTime = 0;

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
     * Player elimination effect
     */
    onPlayerEliminated(player) {
        if (this.quality === 'off') return;

        // Show growing square flare in player color
        this.background.startEliminationFlare(player.color);
        this.background.pulse(player.color, 0.6);

        // Screenshake for the impact
        if (this.renderer) {
            this.renderer.screenShake(20, 800);
        }
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
