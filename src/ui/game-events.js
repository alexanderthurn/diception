import { Dialog } from './dialog.js';
import { createAI } from '../core/ai/index.js';
import { GAME } from '../core/constants.js';
import { shouldShowInputHints, getInputHint, ACTION_END_TURN, ACTION_MENU } from './input-hints.js';
import { markLevelSolved } from '../scenarios/campaign-progress.js';
import { getWinProbability } from '../core/probability.js';
import { incrementStat, fireAchievementEvent, checkCampaignAchievement } from '../core/achievement-manager.js';

function showVictoryCard(humanWon, winnerColorHex, quality, campaignFinished = false) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        let cls = 'victory-overlay';
        if (campaignFinished) cls += ' victory-campaign';
        else if (humanWon)    cls += ' victory-won';
        else                  cls += ' victory-lost';
        overlay.className = cls;

        const cardColor = campaignFinished ? '#FFD700' : (winnerColorHex || '#00ffff');
        overlay.style.setProperty('--victory-color', cardColor);

        const showConfetti = campaignFinished ? quality !== 'off' : (humanWon && quality === 'high');
        if (showConfetti) {
            const confettiColors = campaignFinished
                ? ['#FFD700', '#00ffff', '#AA00FF', '#ff8800', '#ffffff', '#ffff00']
                : ['#00ffff', '#AA00FF', '#ffff00', '#00ff88', '#ff00cc', '#ffffff'];
            const count = campaignFinished ? 60 : 40;
            for (let i = 0; i < count; i++) {
                const piece = document.createElement('div');
                piece.className = 'victory-confetti';
                piece.style.left = `${Math.random() * 100}%`;
                piece.style.animationDelay = `${(Math.random() * 1.5).toFixed(2)}s`;
                piece.style.animationDuration = `${(2 + Math.random() * 2.5).toFixed(2)}s`;
                piece.style.background = confettiColors[i % confettiColors.length];
                piece.style.width = `${4 + Math.floor(Math.random() * 6)}px`;
                piece.style.height = `${8 + Math.floor(Math.random() * 10)}px`;
                overlay.appendChild(piece);
            }
        }

        const body = document.createElement('div');
        body.className = 'victory-card-body';
        const titleEl = document.createElement('div');
        titleEl.className = 'victory-title';
        if (campaignFinished) {
            titleEl.innerHTML = 'CAMPAIGN<br>COMPLETE';
            titleEl.classList.add('victory-title-campaign');
        } else {
            titleEl.textContent = humanWon ? 'VICTORY' : 'DEFEAT';
        }
        const hintEl = document.createElement('div');
        hintEl.className = 'victory-hint';
        hintEl.textContent = 'click to continue';
        body.appendChild(titleEl);
        body.appendChild(hintEl);
        overlay.appendChild(body);
        document.body.appendChild(overlay);

        const autoDismissMs = campaignFinished ? 4000 : 2500;
        const dismiss = () => {
            overlay.classList.add('fade-out');
            setTimeout(() => overlay.remove(), 400);
            resolve();
        };

        const autoTimer = setTimeout(dismiss, autoDismissMs);
        overlay.addEventListener('click', () => { clearTimeout(autoTimer); dismiss(); });
        document.addEventListener('keydown', function onKey() {
            document.removeEventListener('keydown', onKey);
            clearTimeout(autoTimer);
            dismiss();
        }, { once: true });
    });
}

/**
 * GameEventManager - Handles all game event subscriptions and turn flow
 */
export class GameEventManager {
    constructor(game, renderer, gameStarter, sessionManager, turnHistory, scenarioManager) {
        this.game = game;
        this.renderer = renderer;
        this.gameStarter = gameStarter;
        this.sessionManager = sessionManager;
        this.turnHistory = turnHistory;
        this.scenarioManager = scenarioManager;

        // Incremented on each new game start — lets pending bot-turn callbacks
        // detect that the game they were created for is no longer active.
        this._gameGeneration = 0;

        // UI components (set later)
        this.diceHUD = null;
        this.gameLog = null;
        this.playerDashboard = null;
        this.highscoreManager = null;
        this.sfx = null;
        this.effectsManager = null;
        this.gameStatsTracker = null;

        // DOM elements
        this.playerText = document.getElementById('player-turn');
        this.turnIndicator = document.getElementById('turn-indicator');
        this.endTurnBtn = document.getElementById('end-turn-btn');
        this.endTurnText = document.getElementById('end-turn-text');
        this.endTurnReinforcement = document.getElementById('end-turn-reinforcement');
        this.endTurnHint = document.getElementById('end-turn-hint');
        this.newGameHint = document.getElementById('new-game-hint');
        this.autoWinBtn = document.getElementById('auto-win-btn');

        // Callbacks
        this.getPlayerName = null;
        this.addLog = null;
        this.startTurnLog = null;
        this.finalizeTurnLog = null;

        this.scenarioBrowser = null;

        // Turn / per-attack clocks (#turn-timer) + attack quota line (#turn-attacks-left)
        this._limitHudEl = document.getElementById('turn-limit-hud');
        this._timerEl = document.getElementById('turn-timer');
        this._attacksLeftEl = document.getElementById('turn-attacks-left');
        this._wallTimerId = null;
        this._wallSecondsLeft = 0;
        this._wallTimerGen = 0;
        this._wallClockActive = false;
        this._wallTimerPaused = false;
        this._attackWallTimerId = null;
        this._attackSecondsLeft = 0;
        this._attackTimerGen = 0;
        this._attackClockActive = false;
        this._attackTimerPaused = false;
        /** Wall-clock second (floor(Date.now()/1000)) when we last played `time.ogg` */
        this._timerSfxLastBeatSec = null;
    }

    setScenarioBrowser(scenarioBrowser) {
        this.scenarioBrowser = scenarioBrowser;
    }

    /**
     * Set UI components
     */
    setUIComponents(diceHUD, gameLog, playerDashboard, highscoreManager, sfx, effectsManager, gameStatsTracker) {
        this.diceHUD = diceHUD;
        this.gameLog = gameLog;
        this.playerDashboard = playerDashboard;
        this.highscoreManager = highscoreManager;
        this.sfx = sfx;
        this.effectsManager = effectsManager;
        this.gameStatsTracker = gameStatsTracker;
    }

    /**
     * Set callback functions
     */
    setCallbacks(getPlayerName, addLog, startTurnLog, finalizeTurnLog) {
        this.getPlayerName = getPlayerName;
        this.addLog = addLog;
        this.startTurnLog = startTurnLog;
        this.finalizeTurnLog = finalizeTurnLog;
    }

    /**
     * Register all game event handlers
     */
    init() {
        this.game.on('turnStart', (data) => this.handleTurnStart(data));
        this.game.on('attackResult', (result) => this.handleAttackResult(result));
        this.game.on('playerEliminated', (player) => this.handlePlayerEliminated(player));
        this.game.on('reinforcements', (data) => this.handleReinforcements(data));
        this.game.on('gameOver', (data) => this.handleGameOver(data));
        this.game.on('gameStart', () => this.handleGameStart());
        this.game.on('fullBoardRule', (payload) => this.handleFullBoardRule(payload));
        this.game.on('fullBoardRandomPick', () => this.handleFullBoardRandomPick());
        this.game.on('fullBoardWinnerPending', (payload) => { void this.handleFullBoardWinnerPending(payload); });
        this.game.on('maxDiceRaised', (data) => this.handleMaxDiceRaised(data));

        // Refresh hints whenever a gamepad connects/disconnects so the correct
        // controller icon is shown immediately (before the first button press).
        this.renderer.inputManager.on('gamepadChange', () => this.refreshHints());
        window.addEventListener('gamepadconnected', () => this.refreshHints());
    }

    handleTurnStart(data) {
        this._endAllHumanClocks();

        const autoplayPlayers = this.gameStarter.getAutoplayPlayers();
        const playerAIs = this.gameStarter.getPlayerAIs();
        const gameSpeed = this.gameStarter.getGameSpeed();

        // 🏆 ACHIEVEMENT: ACH_STREAK_3/4/5/6/7 — reset consecutive-attack streak each new turn
        if (!data.player.isBot) {
            this._flushStreakAchievement();
            this._attackStreak = 0;
            this._streakTile = null;
        }

        // Hide dice result HUD when turn starts
        if (this.diceHUD) this.diceHUD.hide();

        // Auto-save at start of turn
        this.turnHistory.saveAutoSave(this.game);

        const name = this.getPlayerName ? this.getPlayerName(data.player) : (data.player.isBot ? `Bot ${data.player.id}` : `Player ${data.player.id}`);
        this.playerText.textContent = `${name}'s Turn`;
        this.playerText.style.color = '#' + data.player.color.toString(16).padStart(6, '0');

        // Update dashboard to reflect new active player
        if (this.playerDashboard) this.playerDashboard.update();

        // Start a new turn group in the log
        if (this.startTurnLog) this.startTurnLog(data.player);

        // Check if this player should be automated
        const shouldAutomate = data.player.isBot || autoplayPlayers.has(data.player.id);

        // Update turn indicator (bots only)
        if (data.player.isBot) {
            const colorHex = '#' + data.player.color.toString(16).padStart(6, '0');
            const playerAI = playerAIs.get(data.player.id);
            const aiName = playerAI?.name || 'Bot';
            this.turnIndicator.innerHTML = `<span style="color:${colorHex}">${aiName} ${data.player.id}</span> is playing...`;
            this.turnIndicator.classList.remove('hidden');
        } else {
            this.turnIndicator.classList.add('hidden');
        }

        // Play turn sound for human players only
        if (!data.player.isBot && !autoplayPlayers.has(data.player.id)) {
            if (this.sfx) this.sfx.turnStart();
        }

        if (shouldAutomate) {
            this.handleAutomatedTurn(data.player, playerAIs, gameSpeed, autoplayPlayers);
        } else {
            this.handleHumanTurn(data.player, autoplayPlayers, gameSpeed);
        }
    }

    handleAutomatedTurn(player, playerAIs, gameSpeed, autoplayPlayers) {
        this.hideAttackLimitDisplay();

        // Hide End Turn button during bot turns
        this.endTurnBtn.classList.add('hidden');
        this.endTurnBtn.disabled = true;

        // Show auto-win button if any human has autoplay enabled
        if (gameSpeed !== 'beginner' && autoplayPlayers.size > 0) {
            const playerColorHex = '#' + player.color.toString(16).padStart(6, '0');
            this.autoWinBtn.classList.remove('hidden');
            this.autoWinBtn.classList.add('active');
            this.autoWinBtn.style.boxShadow = `0 0 15px ${playerColorHex}`;
            this.autoWinBtn.style.borderColor = playerColorHex;
        } else {
            this.autoWinBtn.classList.add('hidden');
        }
        if (this.endTurnText) this.endTurnText.textContent = 'END TURN';
        if (this.endTurnReinforcement) this.endTurnReinforcement.textContent = '';

        // Check if all human players have autoplay enabled
        const humanPlayers = this.game.players.filter(p => !p.isBot);
        const allHumansOnAutoplay = humanPlayers.length > 0 && humanPlayers.every(p => autoplayPlayers.has(p.id));

        // If all humans on autoplay, run headless fast-forward (skip all rendering)
        if (allHumansOnAutoplay) {
            this.runHeadlessFastForward(player, playerAIs, autoplayPlayers);
            return;
        }

        // Calculate delay based on game speed
        let delay = 500;
        let effectiveSpeed = gameSpeed;

        if (gameSpeed === 'expert') {
            delay = 10;
        } else if (gameSpeed === 'normal') {
            delay = player.isBot ? 300 : 500;
        } else if (gameSpeed === 'beginner') {
            delay = player.isBot ? 800 : 1000;
        }

        // Hold bots until the map reveal animation finishes
        const revealWait = this.effectsManager?._revealEndsAt
            ? Math.max(0, this.effectsManager._revealEndsAt - Date.now())
            : 0;

        const myGen = this._gameGeneration;
        setTimeout(async () => {
            // Abort if a new game started while this timer was pending
            if (this._gameGeneration !== myGen) return;

            // Ensure autoplay AI exists for human players with autoplay enabled
            if (!player.isBot && autoplayPlayers.has(player.id) && !playerAIs.has(player.id)) {
                playerAIs.set(player.id, createAI('autoplay', this.game, player.id));
            }

            const playerAI = playerAIs.get(player.id);
            if (playerAI) {
                await playerAI.takeTurn(effectiveSpeed);
            }
            if (this._gameGeneration !== myGen) return;
            this.game.endTurn();
        }, delay + revealWait);
    }

    /**
     * Run game to completion headlessly (no rendering, effects, or sounds).
     * Used when all human players have autoplay enabled.
     */
    async runHeadlessFastForward(startingPlayer, playerAIs, autoplayPlayers) {
        // Show "fast-forwarding" indicator on the auto-win button
        this.autoWinBtn.innerHTML = '<span class="sprite-icon icon-fast-forward"></span>';
        this.autoWinBtn.classList.add('active');

        // Ensure all players have AIs
        for (const p of this.game.players) {
            if (!playerAIs.has(p.id)) {
                playerAIs.set(p.id, createAI(p.isBot ? (p.aiId || 'easy') : 'autoplay', this.game, p.id));
            }
        }

        // Mute game events to skip rendering/effects/sounds
        this.game.muted = true;

        try {
            // Run the current player's turn first (they haven't attacked yet)
            const startAI = playerAIs.get(startingPlayer.id);
            if (startAI && startingPlayer.alive) {
                try {
                    await startAI.takeTurn('fast');
                } catch (e) {
                    console.warn('Fast-forward AI error (starting player):', e);
                }
            }
            if (!this.game.gameOver) {
                this.game.endTurn();
            }

            // Run remaining turns headlessly
            let turns = 0;
            const maxTurns = GAME.MAX_TURNS;

            while (!this.game.gameOver && turns < maxTurns) {
                const currentPlayer = this.game.currentPlayer;

                // Skip dead players (shouldn't happen, but safety check)
                if (!currentPlayer || !currentPlayer.alive) {
                    this.game.endTurn();
                    turns++;
                    continue;
                }

                const ai = playerAIs.get(currentPlayer.id);
                if (ai) {
                    try {
                        await ai.takeTurn('fast');
                    } catch (e) {
                        console.warn('Fast-forward AI error:', e);
                    }
                }
                this.game.endTurn();
                turns++;

                // Yield to UI every 50 turns to prevent browser freeze
                if (turns % 50 === 0) {
                    await new Promise(r => setTimeout(r, 0));
                }
            }
        } finally {
            // Always unmute, even if an error occurred
            this.game.muted = false;

            // Restore auto-win button text
            this.autoWinBtn.innerHTML = '<span class="sprite-icon icon-autoplay"></span>';
        }

        // Force renderer to show final board state
        if (this.renderer) {
            this.renderer.forceUpdate();
        }

        // Update dashboard with final state
        if (this.playerDashboard) this.playerDashboard.update();

        // Trigger game over if game ended (either by conquest or turn limit)
        if (this.game.gameOver && this.game.winner) {
            this.handleGameOver({ winner: this.game.winner, turnLimitReached: this.game.turnLimitReached });
        } else {
            // Game didn't finish (maxTurns hit) — resume normal event-driven flow
            this.game.emit('turnStart', { player: this.game.currentPlayer });
        }
    }

    handleHumanTurn(player, autoplayPlayers, gameSpeed) {
        // Show End Turn button for human turns
        this.endTurnBtn.classList.remove('hidden');
        this.endTurnBtn.disabled = false;

        // Show expected dice reinforcement on button
        const regionDice = this.game.map.findLargestConnectedRegion(player.id);
        const storedDice = player.storedDice || 0;

        if (this.endTurnText) this.endTurnText.textContent = 'END TURN';
        if (this.endTurnReinforcement) {
            this.endTurnReinforcement.textContent = `(+${regionDice + storedDice})`;
            this.endTurnReinforcement.classList.remove('hidden');
        }

        // Set button glow to player color
        const playerColorHex = '#' + player.color.toString(16).padStart(6, '0');
        this.endTurnBtn.style.boxShadow = `0 0 15px ${playerColorHex}`;
        this.endTurnBtn.style.borderColor = playerColorHex;

        // Show autoplay button in Normal/Fast mode
        if (gameSpeed !== 'beginner') {
            this.autoWinBtn.classList.remove('hidden');
            this.autoWinBtn.style.boxShadow = `0 0 15px ${playerColorHex}`;
            this.autoWinBtn.style.borderColor = playerColorHex;
            if (autoplayPlayers.has(player.id)) {
                this.autoWinBtn.classList.add('active');
            } else {
                this.autoWinBtn.classList.remove('active');
            }
        } else {
            this.autoWinBtn.classList.add('hidden');
        }

        // Update input hints on End Turn and Main Menu buttons
        this.updateEndTurnHint(gameSpeed);
        this.updateMenuHint(gameSpeed);

        this._armWallClockForHumanTurn();
        this._armAttackClockForHumanTurn();
    }

    _clearWallInterval() {
        if (this._wallTimerId != null) {
            clearInterval(this._wallTimerId);
            this._wallTimerId = null;
        }
    }

    _scheduleWallInterval() {
        this._clearWallInterval();
        const myGen = this._wallTimerGen;
        this._wallTimerId = setInterval(() => {
            if (this.game.gameOver || myGen !== this._wallTimerGen) {
                this._clearWallInterval();
                return;
            }
            this._wallSecondsLeft -= 1;
            this.updateTurnLimitHud();
            if (this._wallSecondsLeft <= 0) {
                this._clearWallInterval();
                this._wallClockActive = false;
                if (!this.game.gameOver) this.game.endTurn();
            }
        }, 1000);
    }

    _clearAttackWallInterval() {
        if (this._attackWallTimerId != null) {
            clearInterval(this._attackWallTimerId);
            this._attackWallTimerId = null;
        }
    }

    _scheduleAttackWallInterval() {
        this._clearAttackWallInterval();
        const myGen = this._attackTimerGen;
        this._attackWallTimerId = setInterval(() => {
            if (this.game.gameOver || myGen !== this._attackTimerGen) {
                this._clearAttackWallInterval();
                return;
            }
            this._attackSecondsLeft -= 1;
            this.updateTurnLimitHud();
            if (this._attackSecondsLeft <= 0) {
                this._clearAttackWallInterval();
                this._attackClockActive = false;
                if (!this.game.gameOver) this.game.endTurn();
            }
        }, 1000);
    }

    _armAttackClockForHumanTurn() {
        const sec = this.game.secondsPerAttack ?? 0;
        const parallel = this.game.playMode === 'parallel' || this.game.playMode === 'parallel-s';
        this._clearAttackWallInterval();
        if (sec <= 0 || parallel) {
            this._attackClockActive = false;
            this._attackSecondsLeft = 0;
            this.updateTurnLimitHud();
            return;
        }
        this._attackClockActive = true;
        this._attackTimerPaused = false;
        this._attackSecondsLeft = sec;
        this._attackTimerGen++;
        this.updateTurnLimitHud();
        this._scheduleAttackWallInterval();
    }

    _restartAttackClockAfterHumanAttack() {
        const sec = this.game.secondsPerAttack ?? 0;
        const parallel = this.game.playMode === 'parallel' || this.game.playMode === 'parallel-s';
        if (sec <= 0 || parallel || this.game.gameOver) return;
        this._attackClockActive = true;
        this._attackTimerPaused = false;
        this._attackSecondsLeft = sec;
        this._attackTimerGen++;
        this.updateTurnLimitHud();
        this._scheduleAttackWallInterval();
    }

    _armWallClockForHumanTurn() {
        const sec = this.game.secondsPerTurn ?? 0;
        const parallel = this.game.playMode === 'parallel' || this.game.playMode === 'parallel-s';
        this._clearWallInterval();
        if (sec <= 0 || parallel) {
            this._wallClockActive = false;
            this._wallSecondsLeft = 0;
            this.updateTurnLimitHud();
            return;
        }
        this._wallClockActive = true;
        this._wallTimerPaused = false;
        this._wallSecondsLeft = sec;
        this._wallTimerGen++;
        this.updateTurnLimitHud();
        this._scheduleWallInterval();
    }

    _endAllHumanClocks() {
        this._clearWallInterval();
        this._clearAttackWallInterval();
        this._wallClockActive = false;
        this._attackClockActive = false;
        this._wallTimerPaused = false;
        this._attackTimerPaused = false;
        this._wallSecondsLeft = 0;
        this._attackSecondsLeft = 0;
        this._wallTimerGen++;
        this._attackTimerGen++;
        this._timerSfxLastBeatSec = null;
    }

    /** 
     * Update End Turn button hint based on game speed and input type
     */
    /** Refresh all input hints from current bindings. Call after rebinding. */
    refreshHints() {
        const gameSpeed = this.gameStarter.getGameSpeed();
        this.updateEndTurnHint(gameSpeed);
        this.updateMenuHint(gameSpeed);
    }

    _applyHint(el, hint) {
        if (!el) return;
        if (hint.html) {
            el.innerHTML = hint.html;
        } else {
            el.textContent = hint.label;
        }
        el.className = 'input-hint ' + hint.style;
        el.classList.remove('hidden');
    }

    updateEndTurnHint(gameSpeed) {
        if (!this.endTurnHint || !this.endTurnText) return;
        if (gameSpeed === 'beginner' && shouldShowInputHints(this.renderer.inputManager)) {
            const playerId = this.game?.currentPlayer?.id;
            const hint = getInputHint(ACTION_END_TURN, this.renderer.inputManager, playerId);
            if (hint) { this._applyHint(this.endTurnHint, hint); return; }
        }
        this.endTurnHint.classList.add('hidden');
    }

    updateMenuHint(gameSpeed) {
        if (!this.newGameHint) return;
        if (gameSpeed === 'beginner' && shouldShowInputHints(this.renderer.inputManager)) {
            const playerId = this.game?.currentPlayer?.id;
            const hint = getInputHint(ACTION_MENU, this.renderer.inputManager, playerId);
            if (hint) { this._applyHint(this.newGameHint, hint); return; }
        }
        this.newGameHint.classList.add('hidden');
    }

    /**
     * `time.ogg` once per real second while turn or per-attack clock matches red HUD (4…1 s, same as urgent styling).
     * Pitch rises toward zero via SoundManager.timeTick (first beep at 4s left).
     */
    _tryTimerCountdownSfx() {
        if (!this.sfx?.timeTick) return;
        const parallel = this.game.playMode === 'parallel' || this.game.playMode === 'parallel-s';
        const turnSecCfg = this.game.secondsPerTurn ?? 0;
        const atkSecCfg = this.game.secondsPerAttack ?? 0;
        const bandLo = 1;
        const bandHi = 4;
        const cand = [];
        if (!parallel && turnSecCfg > 0 && this._wallClockActive && this._wallSecondsLeft > 0) {
            const w = this._wallSecondsLeft;
            if (w >= bandLo && w <= bandHi) cand.push(w);
        }
        if (!parallel && atkSecCfg > 0 && this._attackClockActive && this._attackSecondsLeft > 0) {
            const a = this._attackSecondsLeft;
            if (a >= bandLo && a <= bandHi) cand.push(a);
        }
        if (cand.length === 0) {
            this._timerSfxLastBeatSec = null;
            return;
        }
        const secsLeft = Math.min(...cand);
        const wallChunk = Math.floor(Date.now() / 1000);
        if (this._timerSfxLastBeatSec === wallChunk) return;
        this._timerSfxLastBeatSec = wallChunk;
        this.sfx.timeTick(secsLeft);
    }

    updateTurnLimitHud() {
        if (!this._limitHudEl || !this._timerEl) return;
        const parallel = this.game.playMode === 'parallel' || this.game.playMode === 'parallel-s';
        const lim = this.gameStarter.getAttacksPerTurn();
        const turnSecCfg = this.game.secondsPerTurn ?? 0;
        const atkSecCfg = this.game.secondsPerAttack ?? 0;

        let remAttacks = null;
        if (lim > 0) {
            const rem = this.game.attacksRemaining();
            if (Number.isFinite(rem)) remAttacks = rem;
        }

        let turnSecPart = null;
        if (!parallel && turnSecCfg > 0 && this._wallClockActive && this._wallSecondsLeft > 0) {
            turnSecPart = String(this._wallSecondsLeft);
        }

        let atkSecPart = null;
        if (!parallel && atkSecCfg > 0 && this._attackClockActive && this._attackSecondsLeft > 0) {
            atkSecPart = String(this._attackSecondsLeft);
        }

        const hasTimeLine = turnSecPart != null || atkSecPart != null;
        const hasAttackLine = remAttacks != null;

        if (!hasTimeLine && !hasAttackLine) {
            this._limitHudEl.classList.add('hidden');
            this._timerSfxLastBeatSec = null;
            return;
        }

        this._limitHudEl.classList.remove('hidden');

        if (hasTimeLine) {
            this._timerEl.classList.remove('hidden');
            const parts = [];
            if (turnSecPart != null) parts.push(`${turnSecPart}s`);
            if (atkSecPart != null) parts.push(`${atkSecPart}s`);
            this._timerEl.textContent = parts.join(' · ');
        } else {
            this._timerEl.classList.add('hidden');
            this._timerEl.textContent = '';
            this._timerEl.classList.remove('timer-urgent');
        }

        const urgentMaxSec = 5;
        const urgentTurn = turnSecPart != null && parseInt(turnSecPart, 10) < urgentMaxSec;
        const urgentAtkSec = atkSecPart != null && parseInt(atkSecPart, 10) < urgentMaxSec;
        if (urgentTurn || urgentAtkSec) {
            this._timerEl.classList.add('timer-urgent');
        } else {
            this._timerEl.classList.remove('timer-urgent');
        }

        if (hasAttackLine && this._attacksLeftEl) {
            this._attacksLeftEl.classList.remove('hidden');
            const n = remAttacks;
            this._attacksLeftEl.textContent = n === 1 ? '1 attack left' : `${n} attacks left`;
        } else if (this._attacksLeftEl) {
            this._attacksLeftEl.classList.add('hidden');
            this._attacksLeftEl.textContent = '';
        }

        const tt = [];
        if (turnSecPart != null) tt.push(`${turnSecPart}s left on turn`);
        if (atkSecPart != null) tt.push(`${atkSecPart}s for this attack`);
        if (hasAttackLine) tt.push(remAttacks === 1 ? '1 attack left' : `${remAttacks} attacks left`);
        this._limitHudEl.title = tt.length ? tt.join(' · ') : 'Turn limits';

        this._tryTimerCountdownSfx();
    }

    hideAttackLimitDisplay() {
        if (this._limitHudEl) this._limitHudEl.classList.add('hidden');
        if (this._timerEl) this._timerEl.classList.remove('timer-urgent');
        this._timerSfxLastBeatSec = null;
    }

    stopTurnTimer() {
        this._endAllHumanClocks();
        this.hideAttackLimitDisplay();
    }

    pauseTurnTimer() {
        if (this._wallTimerId != null) {
            clearInterval(this._wallTimerId);
            this._wallTimerId = null;
            this._wallTimerPaused = true;
        }
        if (this._attackWallTimerId != null) {
            clearInterval(this._attackWallTimerId);
            this._attackWallTimerId = null;
            this._attackTimerPaused = true;
        }
        this._timerSfxLastBeatSec = null;
    }

    resumeTurnTimer() {
        if (this.game.gameOver) {
            this._wallTimerPaused = false;
            this._attackTimerPaused = false;
            return;
        }
        if (this._wallTimerPaused && this._wallClockActive && this._wallSecondsLeft > 0) {
            this._wallTimerPaused = false;
            this._wallTimerGen++;
            this._scheduleWallInterval();
        } else {
            this._wallTimerPaused = false;
        }
        if (this._attackTimerPaused && this._attackClockActive && this._attackSecondsLeft > 0) {
            this._attackTimerPaused = false;
            this._attackTimerGen++;
            this._scheduleAttackWallInterval();
        } else {
            this._attackTimerPaused = false;
        }
    }

    async handleFullBoardRandomPick() {
        const tile = await (this.renderer.playFullBoardRandomPick?.() ?? Promise.resolve(null));
        if (!tile || this.game.gameOver) return;
        this.game.declareWinnerFromRandomFullBoardTile(tile.x, tile.y);
    }

    async handleFullBoardWinnerPending(payload) {
        const wid = payload?.winnerId;
        try {
            if (wid != null) {
                await this.renderer.playFullBoardWinnerReveal?.(payload.rule, wid);
            }
        } finally {
            this.game.confirmFullBoardResolution();
        }
    }

    handleMaxDiceRaised(data) {
        if (this.addLog) this.addLog(`Board full — max dice per territory is now ${data.maxDice}.`, 'info');
        if (this.renderer?.forceUpdate) this.renderer.forceUpdate(false);
    }

    _flushStreakAchievement() {
        clearTimeout(this._streakTimer);
        this._streakTimer = null;
        if (this._pendingStreakCount) {
            // Increment only the exact peak streak stat (streak of 5 → streak5 only)
            incrementStat(`streak${this._pendingStreakCount}`);
            this._pendingStreakCount = null;
        }
    }

    handleAttackResult(result) {
        if (result.error) return;

        const autoplayPlayers = this.gameStarter.getAutoplayPlayers();
        const gameSpeed = this.gameStarter.getGameSpeed();

        // Auto-save after every attack
        this.turnHistory.saveAutoSave(this.game);

        // Track attack stats
        if (result.attackerId === this.game.currentPlayer.id && this.gameLog) {
            this.gameLog.recordAttack(result.won);
        }

        // ── Achievement hooks (human attacks only) ───────────────────────────
        const attackerPlayer = this.game.players.find(p => p.id === result.attackerId);
        if (attackerPlayer && !attackerPlayer.isBot) {
            const attackerDice = result.attackerRolls.length;
            const defenderDice = result.defenderRolls.length;

            if (result.won) {
                // 🏆 ACHIEVEMENT: ACH_UNDERDOG_5/10/50/100/500
                const winChance = getWinProbability(attackerDice, defenderDice, this.game.diceSides);
                if (winChance < 1 / 3) incrementStat('underdogWins');

                // 🏆 ACHIEVEMENT: ACH_DAVID
                if (attackerDice === 4 && defenderDice === 6) fireAchievementEvent('won4vs6');

                // 🏆 ACHIEVEMENT: ACH_STREAK_3/4/5/6/7
                // Streak only continues if attacking FROM the just-conquered territory
                const fromMatchesLastConquest = this._streakTile
                    && result.from.x === this._streakTile.x
                    && result.from.y === this._streakTile.y;
                if (!fromMatchesLastConquest) {
                    this._flushStreakAchievement();
                    this._attackStreak = 0;
                }
                this._attackStreak = (this._attackStreak || 0) + 1;
                this._streakTile = { x: result.to.x, y: result.to.y };
                // Debounce: only the peak streak of each chain increments its stat.
                // Cancel any pending lower count and reschedule with the new peak.
                clearTimeout(this._streakTimer);
                if (this._attackStreak >= 3) {
                    this._pendingStreakCount = Math.min(this._attackStreak, 7);
                    this._streakTimer = setTimeout(() => this._flushStreakAchievement(), 800);
                }
            } else {
                // 🏆 ACHIEVEMENT: ACH_STREAK_3/4/5/6/7 — reset on any loss
                this._flushStreakAchievement();
                this._attackStreak = 0;
                this._streakTile = null;
            }
        }

        const attacker = this.game.players.find(p => p.id === result.attackerId);
        const defender = this.game.players.find(p => p.id === result.defenderId);
        const defenderName = defender ? this.getPlayerName(defender) : `Player ${result.defenderId}`;

        const attackRollStr = result.attackerRolls.join('+');
        const defendRollStr = result.defenderRolls.join('+');
        const outcome = result.won ? '✓' : '✗';
        const operator = result.won ? '>' : '≤';
        if (this.addLog) {
            this.addLog(`${attackRollStr}=${result.attackerSum}${operator}${result.defenderSum}=${defendRollStr} → ${defenderName} ${outcome}`, result.won ? 'attack-win' : 'attack-loss');
        }

        // Show dice result in HUD
        const isHumanAttackerForHUD = attacker && !attacker.isBot && !autoplayPlayers.has(attacker.id);
        if (this.diceHUD && gameSpeed === 'beginner' && isHumanAttackerForHUD && !this.diceHUD.skipDramatic) {
            // Dramatic center overlay first, then small HUD after dismiss
            this.renderer.inputManager?.setSuspended(true);
            this.diceHUD.showDramaticAttackResult(result, attacker, defender, this.sfx, this.getPlayerName, () => {
                this.renderer.inputManager?.setSuspended(false);
                this.diceHUD.showAttackResult(result, attacker, defender, gameSpeed, autoplayPlayers);
            });
        } else if (this.diceHUD) {
            this.diceHUD.showAttackResult(result, attacker, defender, gameSpeed, autoplayPlayers);
        }

        // Play sound
        const isHumanAttacker = attacker && !attacker.isBot && !autoplayPlayers.has(attacker.id);
        const shouldPlaySound = isHumanAttacker || (gameSpeed === 'beginner' && attacker);

        if (shouldPlaySound && this.sfx) {
            if (result.won) {
                this.sfx.attackWin();
            } else {
                this.sfx.attackLose();
            }
        }

        // Update End Turn button
        if (isHumanAttacker) {
            const regionDice = this.game.map.findLargestConnectedRegion(attacker.id);
            const storedDice = attacker.storedDice || 0;

            if (this.endTurnText) this.endTurnText.textContent = 'END TURN';
            if (this.endTurnReinforcement) {
                this.endTurnReinforcement.textContent = `(+${regionDice + storedDice})`;
            }
        }

        if (this.playerDashboard) this.playerDashboard.update();

        // Rumble active tile on attack outcome
        // Always for humans, for bots only on beginner/medium (not expert)
        if (this.playerDashboard) {
            const isHuman = attacker && !attacker.isBot && !autoplayPlayers.has(attacker.id);
            const isBotWithAnimation = attacker && (attacker.isBot || autoplayPlayers.has(attacker.id)) && gameSpeed !== 'expert';
            if (isHuman || isBotWithAnimation) {
                this.playerDashboard.rumbleActive(result.won);
            }
        }

        this.updateTurnLimitHud();

        const lim = this.gameStarter.getAttacksPerTurn();
        if (
            isHumanAttacker &&
            this.game.currentPlayer &&
            result.attackerId === this.game.currentPlayer.id &&
            !this.game.gameOver &&
            (lim <= 0 || this.game.attacksRemaining() > 0)
        ) {
            this._restartAttackClockAfterHumanAttack();
        }

        if (
            lim > 0 &&
            this.game.attacksRemaining() <= 0 &&
            this.game.currentPlayer &&
            result.attackerId === this.game.currentPlayer.id &&
            !this.game.currentPlayer.isBot &&
            !autoplayPlayers.has(result.attackerId) &&
            !this.game.gameOver
        ) {
            setTimeout(() => {
                if (!this.game.gameOver) this.game.endTurn();
            }, 320);
        }
    }

    handleFullBoardRule({ rule, fromAttack }) {
        if (rule !== 'autoplay_humans') return;

        const autoplayPlayers = this.gameStarter.getAutoplayPlayers();
        const playerAIs = this.gameStarter.getPlayerAIs();
        const gameSpeed = this.gameStarter.getGameSpeed();

        for (const p of this.game.players) {
            if (!p.isBot && p.alive) {
                autoplayPlayers.add(p.id);
                if (!playerAIs.has(p.id)) {
                    playerAIs.set(p.id, createAI('autoplay', this.game, p.id));
                }
            }
        }

        if (this.playerDashboard) this.playerDashboard.update();

        const cur = this.game.currentPlayer;
        if (
            !fromAttack ||
            !cur ||
            cur.isBot ||
            !autoplayPlayers.has(cur.id) ||
            this.game.gameOver
        ) {
            return;
        }

        this.handleAutomatedTurn(cur, playerAIs, gameSpeed, autoplayPlayers);
    }

    handlePlayerEliminated(player) {
        const name = this.getPlayerName ? this.getPlayerName(player) : (player.isBot ? `Bot ${player.id}` : `Player ${player.id}`);
        if (this.addLog) this.addLog(`${name} has been eliminated!`, 'death', 'icon-skull');
        if (this.sfx) this.sfx.playerEliminated();
        if (this.playerDashboard) this.playerDashboard.update();
    }

    handleReinforcements(data) {
        const autoplayPlayers = this.gameStarter.getAutoplayPlayers();
        const gameSpeed = this.gameStarter.getGameSpeed();

        let reinforceMsg = `+${data.placed}`;
        if (data.stored > 0) {
            reinforceMsg += ` (${data.stored} saved)`;
            if (this.addLog) this.addLog(reinforceMsg, 'reinforce-warning');
        } else if (data.placed > 0) {
            if (this.addLog) this.addLog(reinforceMsg, 'reinforce');
        }

        if (this.finalizeTurnLog) this.finalizeTurnLog(data.placed, data.stored);

        // Show reinforcement popup in HUD
        if (this.diceHUD) this.diceHUD.showReinforcements(data, gameSpeed, autoplayPlayers);

        // Play sound for human players only (not in expert speed)
        if (!data.player.isBot && !autoplayPlayers.has(data.player.id) && this.sfx && gameSpeed !== 'expert') {
            this.sfx.reinforce();
            this.sfx.resetWinStreak();
        }

        if (this.playerDashboard) this.playerDashboard.update();
    }

    async handleGameOver(data) {
        // Stop turn timer
        this.stopTurnTimer();

        // Ensure headless fast-forward mode is deactivated
        this.game.muted = false;

        // Deactivate autoplay so the next game starts normally
        this.gameStarter.getAutoplayPlayers().clear();

        // Clear auto-save IMMEDIATELY on game over
        this.turnHistory.clearAutoSave();

        // Hide End Turn and game UI immediately (before winning dialog)
        this.endTurnBtn.classList.add('hidden');
        this.autoWinBtn.classList.add('hidden');

        const name = this.getPlayerName(data.winner);
        const turnLimitReached = data.turnLimitReached || false;
        const fullBoardResolution = data.fullBoardResolution || false;
        if (this.addLog) {
            if (turnLimitReached) {
                this.addLog(`Turn limit reached! ${name} wins by dice count!`, 'death', 'icon-timer');
            } else if (fullBoardResolution) {
                this.addLog(`Board settled — ${name} wins!`, 'death', 'icon-target');
            } else {
                this.addLog(`${name} wins the game!`, 'death', 'icon-achievements');
            }
        }

        // Determine if human played and won
        const humanPlayed = this.game.players.some(p => !p.isBot);
        const humanWon = data.winner && !data.winner.isBot;

        // Record the win with human stats
        if (this.highscoreManager && data.winner) {
            this.highscoreManager.recordWin(name, humanPlayed, humanWon);
        }

        const allBots   = this.game.players.every(p => p.isBot);
        const allHumans = this.game.players.every(p => !p.isBot);

        // 🏆 ACHIEVEMENT: ACH_GAMES_10 / 50 / 100 / 150 / 200 / 300 / 400 / 500 / 1000 / 10000
        if (humanPlayed) incrementStat('gamesPlayed');

        // 🏆 ACHIEVEMENT: ACH_PURE_BOTS
        if (allBots) fireAchievementEvent('pureBots');

        // 🏆 ACHIEVEMENT: ACH_PURE_HUMANS
        if (allHumans && this.game.players.length >= 2) fireAchievementEvent('pureHumans');

        if (humanWon && data.winner) {
            // 🏆 ACHIEVEMENT: ACH_FIRST_WIN
            incrementStat('gamesWon');

            // 🏆 ACHIEVEMENT: ACH_SURVIVOR
            if (this.game.players.length >= 8) fireAchievementEvent('won8PlayerGame');
        }

        // Mark campaign level as solved when human wins
        if (humanWon && data.winner) {
            const owner = localStorage.getItem('dicy_loadedCampaign');
            const idxStr = localStorage.getItem('dicy_loadedLevelIndex');
            if (owner != null && idxStr != null) {
                markLevelSolved(owner, parseInt(idxStr, 10));

                // 🏆 ACHIEVEMENT: ACH_TUTORIAL / ACH_CHAPTER1 / ACH_CHAPTER2 / ACH_CHAPTER3 / ACH_CHAPTER4
                const campaign = this.scenarioBrowser?.campaignManager.getCampaign(owner);
                if (campaign) checkCampaignAchievement(owner, campaign.levels.length);
            }
        }

        // Play victory or defeat sound
        if (this.sfx && data.winner) {
            if (!data.winner.isBot) {
                this.sfx.victory();
            } else {
                this.sfx.defeat();
            }
        }

        // Get game stats
        const gameStats = this.gameStatsTracker?.getGameStats();

        // Prepare content for Dialog
        const content = document.createElement('div');
        content.className = 'game-over-content';

        const humanCount = this.game.players.filter(p => !p.isBot).length;
        const summaryP = document.createElement('p');
        summaryP.className = 'game-over-summary';
        summaryP.textContent = humanCount === 1
            ? (humanWon ? "You've won the game." : "You've lost.")
            : 'Game over.';
        content.appendChild(summaryP);

        // === LAST GAME STATS (always shown) ===
        if (gameStats) {
            const lastGameSection = document.createElement('div');
            lastGameSection.className = 'last-game-section';

            let statsHtml = '';
            // Elimination timeline (redesigned to horizontal sentence)
            statsHtml += '<div class="timeline-section-horizontal">';
            statsHtml += '<h4 class="timeline-title">Timeline</h4>';
            statsHtml += '<div class="timeline-sentence">';

            // Show eliminated players with red symbol
            // During headless fast-forward, playerEliminated events were muted,
            // so we need to check game state directly for eliminated players
            const trackedIds = new Set(gameStats.eliminationOrder.map(e => e.playerId));
            const deadPlayers = this.game.players.filter(p => !p.alive);

            // Show tracked eliminations first (in order)
            gameStats.eliminationOrder.forEach(e => {
                statsHtml += `<span class="timeline-entry eliminated"><span class="sprite-icon icon-cross"></span> ${e.name}</span> `;
            });

            // Show any untracked eliminations (from headless mode)
            deadPlayers.forEach(p => {
                if (!trackedIds.has(p.id)) {
                    const pName = this.getPlayerName(p);
                    statsHtml += `<span class="timeline-entry eliminated"><span class="sprite-icon icon-cross"></span> ${pName}</span> `;
                }
            });

            if (turnLimitReached || fullBoardResolution) {
                // Show all surviving players — winner gets ✓ (green), others get ≈ (yellow)
                const survivors = this.game.players.filter(p => p.alive);
                survivors.forEach(p => {
                    const pName = this.getPlayerName(p);
                    if (data.winner && p.id === data.winner.id) {
                        statsHtml += `<span class="timeline-entry winner"><span class="sprite-icon icon-check"></span> ${pName}</span> `;
                    } else {
                        statsHtml += `<span class="timeline-entry survivor"><span class="symbol">≈</span> ${pName}</span> `;
                    }
                });
            } else {
                // Show winner with green check
                statsHtml += `<span class="timeline-entry winner"><span class="sprite-icon icon-check"></span> ${name}</span>`;
            }

            statsHtml += '</div>';
            statsHtml += '</div>';

            lastGameSection.innerHTML = statsHtml;
            content.appendChild(lastGameSection);
        }

        // === HUMAN STATS SECTION (only if human played) ===
        if (humanPlayed && this.highscoreManager) {
            const humanStats = this.highscoreManager.getHumanStats();

            const humanSection = document.createElement('div');
            humanSection.className = 'human-stats-section';
            humanSection.innerHTML = `
                <h3 class="highscore-title">TOTAL</h3>
                <div class="human-stats-row">
                    <span class="human-stat">
                        <span class="stat-label">Games</span>
                        <span class="stat-value">${humanStats.gamesPlayed}</span>
                    </span>
                    <span class="human-stat">
                        <span class="stat-label">Wins</span>
                        <span class="stat-value">${humanStats.wins}</span>
                    </span>
                    <span class="human-stat">
                        <span class="stat-label">Win Rate</span>
                        <span class="stat-value">${humanStats.winRate}%</span>
                    </span>
                </div>
            `;
            content.appendChild(humanSection);
        }

        const isCampaignMode = localStorage.getItem('dicy_campaignMode');
        const owner = localStorage.getItem('dicy_loadedCampaign');
        const idxStr = localStorage.getItem('dicy_loadedLevelIndex');
        const levelIndex = idxStr != null ? parseInt(idxStr, 10) : -1;

        let title;
        if (humanCount === 1) {
            title = humanWon ? 'WON' : 'DEFEAT';
        } else {
            title = name;
        }
        let buttons = [];
        let campaignFinished = false;

        if (isCampaignMode && this.scenarioBrowser && owner) {
            const campaign = this.scenarioBrowser.campaignManager.getCampaign(owner);
            const totalLevels = campaign?.levels?.length ?? 0;
            const hasNextLevel = humanWon && levelIndex >= 0 && levelIndex < totalLevels - 1;
            campaignFinished = humanWon && totalLevels > 0 && levelIndex === totalLevels - 1;

            if (!campaign) {
                buttons = [{ text: 'Exit', value: 'exit', className: 'tron-btn' }];
            } else if (campaignFinished) {
                title = 'CAMPAIGN COMPLETE!';
                const celebrationEl = document.createElement('p');
                celebrationEl.className = 'campaign-celebration';
                celebrationEl.textContent = `You finished all ${totalLevels} levels of ${campaign?.owner || 'this campaign'}!`;
                celebrationEl.style.cssText = 'font-size: 1.2em; margin: 1em 0; color: var(--primary-color);';
                content.insertBefore(celebrationEl, content.firstChild);
            }

            if (campaign) {
                if (hasNextLevel) {
                    buttons.push({ text: 'Next Level', value: 'next', className: 'tron-btn' });
                }

                if (campaignFinished) {
                    buttons.push({ text: 'Exit', value: 'exit', className: 'tron-btn' });
                } else {
                    buttons.push({ text: 'Exit', value: 'exit', className: 'tron-btn' });
                }
            }
        }
        if (buttons.length === 0) {
            buttons.push({ text: 'Exit', value: 'exit', className: 'tron-btn' });
        }

        if (!campaignFinished && !buttons.some(b => b.value === 'rematch')) {
            const rematchBtn = { text: 'Rematch', value: 'rematch', className: 'tron-btn' };
            const exitIdx = buttons.findIndex(b => b.value === 'exit');
            if (exitIdx >= 0) {
                buttons.splice(exitIdx + 1, 0, rematchBtn);
            } else {
                buttons.unshift(rematchBtn);
            }
        }

        for (const b of buttons) {
            b.className = 'tron-btn';
        }
        if (campaignFinished) {
            const ex = buttons.find((b) => b.value === 'exit');
            if (ex) ex.className = 'tron-btn primary';
        } else if (buttons.some((b) => b.value === 'next')) {
            const nx = buttons.find((b) => b.value === 'next');
            if (nx) nx.className = 'tron-btn primary';
        } else if (buttons.some((b) => b.value === 'rematch')) {
            const rm = buttons.find((b) => b.value === 'rematch');
            if (rm) rm.className = 'tron-btn primary';
        } else {
            const ex = buttons.find((b) => b.value === 'exit');
            if (ex) ex.className = 'tron-btn primary';
        }

        // Put primary first in DOM order → first focus for Dialog + gamepad D-pad navigation
        const primaryVal = campaignFinished
            ? 'exit'
            : buttons.some((b) => b.value === 'next')
                ? 'next'
                : buttons.some((b) => b.value === 'rematch')
                    ? 'rematch'
                    : 'exit';
        const prim = buttons.find((b) => b.value === primaryVal);
        const rest = buttons.filter((b) => b !== prim);
        const tailKeys =
            primaryVal === 'next'
                ? ['exit', 'rematch']
                : primaryVal === 'rematch'
                    ? ['next', 'exit']
                    : ['next', 'rematch', 'exit'].filter((k) => k !== primaryVal);
        const tail = tailKeys.map((k) => rest.find((b) => b.value === k)).filter(Boolean);
        const seen = new Set([prim, ...tail]);
        const leftover = rest.filter((b) => !seen.has(b));
        if (prim) {
            buttons = [prim, ...tail, ...leftover];
        }

        const gameSpeed = this.gameStarter.getGameSpeed();
        const effectsQuality = this.effectsManager?.quality ?? 'high';
        if (gameSpeed === 'expert' || effectsQuality === 'off') {
            // Expert speed or effects off: no delay, no card — show dialog immediately
        } else if (humanPlayed) {
            const winnerColorHex = humanWon
                ? (data.winner?.color != null ? '#' + data.winner.color.toString(16).padStart(6, '0') : '#00ffff')
                : '#AA00FF';
            if (campaignFinished) {
                this.effectsManager?.onCampaignComplete(data);
            }
            await showVictoryCard(humanWon, winnerColorHex, effectsQuality, campaignFinished);
        } else {
            // Pure-bot game: brief delay so effects can play
            await new Promise(r => setTimeout(r, 1000));
        }

        const choice = await Dialog.show({
            title,
            content: content,
            buttons
        });

        if (choice === 'exit') {
            if (campaignFinished && this.scenarioBrowser) {
                this.scenarioBrowser.clearPendingScenario();
            }
            if (campaignFinished) {
                await this.sessionManager.quitToMainMenu();
            } else if (isCampaignMode && this.scenarioBrowser) {
                await this.sessionManager.quitToCampaignScreen();
            } else {
                this.sessionManager.quitToCustomGame();
            }
        } else if (choice === 'rematch') {
            document.querySelectorAll('.game-ui').forEach(el => el.classList.remove('hidden'));
            this.gameStarter.startFreshSameSettings();
        } else if (choice === 'next') {
            const campaign = owner ? this.scenarioBrowser.campaignManager.getCampaign(owner) : null;
            const nextIndex = levelIndex + 1;
            if (campaign && this.scenarioBrowser.campaignManager.getLevel(campaign, nextIndex)) {
                this.scenarioBrowser.selectedCampaign = campaign;
                this.scenarioBrowser.selectAndPlayLevel(nextIndex, { immediateStart: true });
            }
        }
    }

    handleGameStart() {
        // Invalidate any pending bot-turn callbacks from the previous game
        this._gameGeneration++;

        // Reset per-session HUD preferences
        this.diceHUD?.resetSession();

        // Attach names for AI serialization
        this.game.players.forEach(p => {
            p.name = this.getPlayerName(p);
        });

        if (this.playerDashboard) this.playerDashboard.update();

        // Ensure buttons are hidden initially
        this.endTurnBtn.classList.add('hidden');
        this.autoWinBtn.classList.add('hidden');
        this.turnIndicator.classList.add('hidden');

        // Clear turn history
        this.turnHistory.clear();

        this._endAllHumanClocks();
        this.hideAttackLimitDisplay();
    }
}
