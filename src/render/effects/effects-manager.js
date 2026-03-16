import { Container } from 'pixi.js';
import { ParticleSystem, EffectPresets } from './particle-system.js';
import { BackgroundRenderer } from './background-renderer.js';
import { BoardEffects } from './board-effects.js';
import { GAME } from '../../core/constants.js';

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
        const app = options.renderer?.app ?? null;
        this.background = new BackgroundRenderer(stage, { app });
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
        this._holdSpawnInterval = null;
        this._pointerHeld = false;
        this._spawnX = 0;
        this._spawnY = 0;
        this._boundPointerDown = null;
        this._boundPointerMove = null;
        this._boundPointerUp = null;

        // Streak tracking for dynamic effects
        this.winStreak = 0;
        this.lastWinTime = 0;
        this.streakDecayTimer = null;

        // Board-space effects (conquest ripple, last stand, etc.)
        // Created here so pooled Graphics/Filters are allocated at startup,
        // not during gameplay — zero GC pressure per-attack.
        this.boardEffects = new BoardEffects(this.container, this.tileSize, this.gap);

        // Pending elimination: playerEliminated fires BEFORE attackResult,
        // so we store the data here and consume it in onAttack.
        this._pendingElimination = null;

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

        // Reinforcement sparkle (high only)
        this.game.on('reinforcements', (data) => {
            this.onReinforcements(data);
        });
    }

    /**
     * Set the world transform container (for screen-to-world coordinate conversion)
     */
    setWorldTransform(rootContainer) {
        this.worldTransform = rootContainer;
        // Make particles and preview map follow world transform
        if (rootContainer) {
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

        // Default armies: all bot colors spread at evenly-spaced angles around the screen.
        // Human players don't auto-spawn — they throw dice when they click/press.
        const BOT_COLORS = [0xFF0055, 0x55FF00, 0xFF00AA, 0xFF8800, 0x00AAFF, 0xFFFF00, 0xFFFFFF];
        this.background.setArmies(BOT_COLORS.map(color => ({ color, human: false })));

        this.background.setIntroMode(true);

        // Redirect zoom to dice container; pan is a no-op (matrix rain doesn't need it)
        if (this.renderer) {
            this.renderer.setPanOverride((dx, dy) => this.background.panDice(dx, dy));
            this.renderer.setZoomOverride((delta, x, y) => this.background.zoomDice(delta, x, y));
        }

        // Click spawns one die flying in a random direction
        const canvas = this.renderer?.app?.canvas;
        if (canvas) {
            this._boundPointerDown = (e) => {
                if (this.quality === 'off') return;
                if (e.pointerId >= 100) return; // gamepad — handled by onIntroSpawn/onIntroRemove/onIntroMutate
                const rect = canvas.getBoundingClientRect();
                this._spawnX = e.clientX - rect.left;
                this._spawnY = e.clientY - rect.top;
                if (e.button === 2) {
                    this.removePlayerDie(this._spawnX, this._spawnY);
                    return;
                }
                const humanCount = Math.max(1, parseInt(document.getElementById('human-count')?.value ?? '1'));
                const playerIndex = Math.floor(Math.random() * humanCount);
                this.spawnPlayerDie(playerIndex, this._spawnX, this._spawnY);
            };
            this._boundPointerUp = () => {};

            canvas.addEventListener('pointerdown', this._boundPointerDown);
            window.addEventListener('pointerup', this._boundPointerUp);
            window.addEventListener('pointercancel', this._boundPointerUp);
        }
    }

    /**
     * Spawn a player-coloured die from a screen position (gamepad / mouse interaction).
     * playerIndex maps to HUMAN_COLORS; pass -1 for a neutral click (uses army colour for that side).
     */
    spawnPlayerDie(playerIndex, screenX, screenY) {
        if (!this.introModeActive || this.quality === 'off') return;
        const color = playerIndex >= 0 ? GAME.HUMAN_COLORS[playerIndex % GAME.HUMAN_COLORS.length] : null;
        this.background.spawnDiceAt(screenX, screenY, color);
    }

    removePlayerDie(screenX, screenY) {
        if (!this.introModeActive || this.quality === 'off') return;
        this.background.removeNearestDie(screenX, screenY);
    }

    mutatePlayerDie(screenX, screenY) {
        if (!this.introModeActive || this.quality === 'off') return;
        this.background.mutateDie(screenX, screenY);
    }

    /**
     * Stop intro mode (when game starts)
     */
    stopIntroMode() {
        this.introModeActive = false;
        this.background.setIntroMode(false);

        // Restore normal pan/zoom
        if (this.renderer) {
            this.renderer.setPanOverride(null);
            this.renderer.setZoomOverride(null);
        }

        // Clean up click-to-spawn
        const canvas = this.renderer?.app?.canvas;
        if (canvas && this._boundPointerDown) {
            canvas.removeEventListener('pointerdown', this._boundPointerDown);
            window.removeEventListener('pointerup', this._boundPointerUp);
            window.removeEventListener('pointercancel', this._boundPointerUp);
        }
        this._boundPointerDown = this._boundPointerUp = null;

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

        // Scale territory glow by attack outcome (high quality, human attacker only)
        if (this.quality === 'high' && this.renderer?.grid?.tileGlow) {
            const attacker = this.game.players.find(p => p.id === result.attackerId);
            if (attacker && !attacker.isBot) {
                const maxDice = this.game.maxDice || 9;
                const tileGlow = this.renderer.grid.tileGlow;
                if (result.won) {
                    // Win: intensity = fraction of max dice the defender had
                    const defDice = result.defenderRolls?.length ?? 1;
                    tileGlow.flash(defDice / maxDice);
                } else {
                    // Loss: reduce current intensity by the attacker's dice fraction
                    const atkDice = result.attackerRolls?.length ?? 1;
                    tileGlow.dampen(atkDice / maxDice);
                }
            }
        }

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

        // Handle Dynamic Screen Shake (only for human players)
        const isHumanPlayer = this.game.currentPlayer && !this.game.currentPlayer.isBot;
        const isHighOrMedium = this.quality === 'high' || this.quality === 'medium';
        if (isHighOrMedium && this.renderer && isHumanPlayer) {
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
                // Scanline spike — increases with streak, decays automatically
                this.renderer.pulseScanline(0.8 + Math.min(this.winStreak, 8) * 0.25);
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

        // ── High-quality board effects ────────────────────────────────────────
        if (this.quality === 'high') {
            const attacker    = this.game.players.find(p => p.id === result.attackerId);
            // Bots at expert speed batch all turns in one call — skip board fx.
            const skipBoardFx = attacker?.isBot && this.renderer?.gameSpeed === 'expert';

            if (skipBoardFx) {
                // Clear any pending elimination so it doesn't bleed into the next attack.
                this._pendingElimination = null;
            } else {
                const aColor       = attacker?.color || 0xffffff;
                const attackerDice = result.attackerRolls?.length ?? 1;
                const defenderDice = result.defenderRolls?.length ?? 1;
                // "Underdog attack": attacker had equal or fewer dice than defender.
                const underdogAttack = attackerDice <= defenderDice;
                // "Brave attack": attacker had strictly fewer dice (most daring).
                const braveAttack    = attackerDice < defenderDice;

                // Brave charge: fires regardless of win/loss — the bravery is in the attempt.
                if (braveAttack) {
                    this.boardEffects.braveCharge(result.from.x, result.from.y, aColor);
                    this.particles.emit(from.x, from.y, 'braveBurst', {
                        colors: [aColor, 0xffffff, 0xffaa00],
                    });
                }

                if (result.won) {
                    // Close call tremor + burst: attacker had ≤ dice but still won.
                    if (underdogAttack) {
                        this.boardEffects.closeCallTremor(result.from.x, result.from.y);
                        this.boardEffects.closeCallTremor(result.to.x, result.to.y);
                        this.particles.emit(from.x, from.y, 'closeCallBurst');
                        this.particles.emit(to.x, to.y, 'closeCallBurst');
                    }

                    // Conquest ripple only on underdog wins.
                    if (underdogAttack) {
                        this.boardEffects.conquestRipple(result.to.x, result.to.y, aColor);
                    }

                    // Regional merge detection.
                    this._checkAndEmitMergeFlare(result, aColor);

                    // Consume pending elimination (playerEliminated fires before attackResult).
                    if (this._pendingElimination) {
                        const { color: elimColor } = this._pendingElimination;
                        this._pendingElimination = null;
                        this.boardEffects.eliminationWave(result.to.x, result.to.y, elimColor);
                    }
                }
                // On a normal loss: no board effects — brave effects already fired above if applicable.
            }
        }
    }

    /**
     * BFS to detect whether capturing result.to merged two previously
     * separate friendly regions. Emits mergeFlare if so.
     * @private
     */
    _checkAndEmitMergeFlare(result, attackerColor) {
        const map     = this.game.map;
        const toX     = result.to.x;
        const toY     = result.to.y;
        const ownerId = result.attackerId;
        const dirs    = [[0,-1],[1,0],[0,1],[-1,0]];

        // Collect attacker-owned neighbors of result.to
        const friendlyNeighbors = [];
        for (const [dx, dy] of dirs) {
            const nx = toX + dx, ny = toY + dy;
            if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;
            const tile = map.tiles[ny * map.width + nx];
            if (tile && !tile.blocked && tile.owner === ownerId) {
                friendlyNeighbors.push({ x: nx, y: ny });
            }
        }
        if (friendlyNeighbors.length < 2) return; // Need ≥2 neighbours to have a merge

        // BFS from the first neighbor, traversing attacker tiles but SKIPPING
        // result.to. If any other neighbor is unreachable → it was in a
        // different region before this capture → merge detected.
        const visited = new Set();
        const start   = friendlyNeighbors[0];
        visited.add(start.y * map.width + start.x);
        const queue = [start];

        while (queue.length > 0) {
            const curr = queue.shift();
            for (const [dx, dy] of dirs) {
                const nx2 = curr.x + dx, ny2 = curr.y + dy;
                if (nx2 === toX && ny2 === toY) continue; // Skip just-captured tile
                if (nx2 < 0 || nx2 >= map.width || ny2 < 0 || ny2 >= map.height) continue;
                const idx2 = ny2 * map.width + nx2;
                const t2   = map.tiles[idx2];
                if (t2 && !t2.blocked && t2.owner === ownerId && !visited.has(idx2)) {
                    visited.add(idx2);
                    queue.push({ x: nx2, y: ny2 });
                }
            }
        }

        for (let i = 1; i < friendlyNeighbors.length; i++) {
            const n = friendlyNeighbors[i];
            if (!visited.has(n.y * map.width + n.x)) {
                // Merge confirmed — gold ring + particle burst at bridge tile
                const pos = this.tileToWorld(toX, toY);
                this.boardEffects.mergeRing(toX, toY);
                this.particles.emit(pos.x, pos.y, 'mergeFlare', {
                    colors: [attackerColor, 0xffffff, 0xffdd00],
                });
                return; // Only need to detect once
            }
        }
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
        const viewport = window.visualViewport;
        const screenWidth = this.renderer?.app?.screen?.width || (viewport ? viewport.width : document.documentElement.clientWidth);
        const screenHeight = this.renderer?.app?.screen?.height || (viewport ? viewport.height : document.documentElement.clientHeight);

        for (let i = 0; i < burstCount; i++) {
            setTimeout(() => {
                const x = 100 + Math.random() * (screenWidth - 200);
                const y = 100 + Math.random() * (screenHeight - 300);

                this.screenParticles.emit(x, y, winnerFirework);
            }, i * 300);
        }

        // Confetti rain
        if (this.quality === 'high') {
            for (let i = 0; i < 30; i++) {
                setTimeout(() => {
                    const x = Math.random() * screenWidth;
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

        // Store for onAttack (which fires right after) to emit the board-space wave
        if (this.quality === 'high') {
            this._pendingElimination = { color: player.color };
        }
    }

    /**
     * Reinforcement sparkle — tiny upward particle bursts on each reinforced tile.
     * High quality only; tiles are staggered by 40 ms to feel like a wave.
     */
    onReinforcements(data) {
        if (this.quality !== 'high') return;
        if (!data.placements || data.placements.length === 0) return;

        const playerColor = data.player.color;
        const maxSparks   = Math.min(data.placements.length, 12); // cap for perf

        for (let i = 0; i < maxSparks; i++) {
            setTimeout(() => {
                if (this.quality !== 'high') return;
                const tile = data.placements[i];
                const pos  = this.tileToWorld(tile.x, tile.y);
                this.particles.emit(pos.x, pos.y, 'reinforceSpark', {
                    colors: [playerColor, 0xffffff, playerColor],
                });
            }, i * 40);
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
        this.boardEffects.destroy();
        this.container.destroy({ children: true });
    }
}
