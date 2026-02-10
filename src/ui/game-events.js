import { Dialog } from './dialog.js';
import { createAI } from '../core/ai/index.js';
import { shouldShowInputHints, getInputHint, ACTION_END_TURN } from './input-hints.js';

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
        this.autoWinBtn = document.getElementById('auto-win-btn');

        // Callbacks
        this.getPlayerName = null;
        this.addLog = null;
        this.startTurnLog = null;
        this.finalizeTurnLog = null;

        this.scenarioBrowser = null;
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
    }

    handleTurnStart(data) {
        const autoplayPlayers = this.gameStarter.getAutoplayPlayers();
        const playerAIs = this.gameStarter.getPlayerAIs();
        const gameSpeed = this.gameStarter.getGameSpeed();

        // Hide dice result HUD when turn starts
        if (this.diceHUD) this.diceHUD.hide();

        // Auto-save at start of turn
        this.turnHistory.saveAutoSave(this.game);

        const name = this.getPlayerName ? this.getPlayerName(data.player) : (data.player.isBot ? `Bot ${data.player.id}` : `Player ${data.player.id}`);
        this.playerText.textContent = `${name}'s Turn`;
        this.playerText.style.color = '#' + data.player.color.toString(16).padStart(6, '0');

        // Start a new turn group in the log
        if (this.startTurnLog) this.startTurnLog(data.player);

        // Check if this player should be automated
        const shouldAutomate = data.player.isBot || autoplayPlayers.has(data.player.id);

        // Update turn indicator (Beginner mode only, bots only)
        if (gameSpeed === 'beginner' && data.player.isBot) {
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

        // Calculate delay based on game speed
        let delay = 500;
        if (gameSpeed === 'expert') {
            delay = 10;
        } else if (gameSpeed === 'normal') {
            delay = player.isBot ? 300 : 500;
        } else if (gameSpeed === 'beginner') {
            delay = player.isBot ? 800 : 1000;
        }

        setTimeout(async () => {
            // Ensure autoplay AI exists for human players with autoplay enabled
            if (!player.isBot && autoplayPlayers.has(player.id) && !playerAIs.has(player.id)) {

                playerAIs.set(player.id, createAI('autoplay', this.game, player.id));
            }

            const playerAI = playerAIs.get(player.id);
            if (playerAI) {
                await playerAI.takeTurn(gameSpeed);
            }
            this.game.endTurn();
        }, delay);
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

        // Update input hint on End Turn button
        this.updateEndTurnHint(gameSpeed);
    }

    /** 
     * Update End Turn button hint based on game speed and input type
     */
    updateEndTurnHint(gameSpeed) {
        if (!this.endTurnHint || !this.endTurnText) return;

        // Only show hint in beginner mode
        if (gameSpeed === 'beginner' && shouldShowInputHints(this.renderer.inputManager)) {
            const hint = getInputHint(ACTION_END_TURN, this.renderer.inputManager);
            if (hint) {
                this.endTurnHint.textContent = hint.label;
                this.endTurnHint.className = 'input-hint ' + hint.style;
                this.endTurnHint.classList.remove('hidden');
                return;
            }
        }

        // Hide hint if not in beginner mode or no input device
        this.endTurnHint.classList.add('hidden');
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
        if (this.diceHUD) {
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
    }

    handlePlayerEliminated(player) {
        const name = this.getPlayerName ? this.getPlayerName(player) : (player.isBot ? `Bot ${player.id}` : `Player ${player.id}`);
        if (this.addLog) this.addLog(`☠️ ${name} has been eliminated!`, 'death');
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

        // Play sound for human players only
        if (!data.player.isBot && !autoplayPlayers.has(data.player.id) && this.sfx) {
            this.sfx.reinforce();
            this.sfx.resetWinStreak();
        }

        if (this.playerDashboard) this.playerDashboard.update();
    }

    async handleGameOver(data) {
        // Clear auto-save IMMEDIATELY on game over
        this.turnHistory.clearAutoSave();

        // Hide End Turn and game UI immediately (before winning dialog)
        this.endTurnBtn.classList.add('hidden');
        this.autoWinBtn.classList.add('hidden');

        const name = this.getPlayerName(data.winner);
        if (this.addLog) this.addLog(`🏆 ${name} wins the game!`, 'death');

        // Determine if human played and won
        const humanPlayed = this.game.players.some(p => !p.isBot);
        const humanWon = !data.winner.isBot;

        // Record the win with human stats
        if (this.highscoreManager) {
            this.highscoreManager.recordWin(name, humanPlayed, humanWon);
        }

        // Mark campaign level as solved when human wins (not in custom mode)
        const isCustomMode = localStorage.getItem('dicy_customLevelMode');
        if (humanWon && !isCustomMode) {
            const owner = localStorage.getItem('dicy_loadedCampaign');
            const idxStr = localStorage.getItem('dicy_loadedLevelIndex');
            if (owner != null && idxStr != null) {
                const { markLevelSolved } = await import('../scenarios/campaign-progress.js');
                markLevelSolved(owner, parseInt(idxStr, 10));
            }
        }

        // Play victory or defeat sound
        if (this.sfx) {
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

        // === LAST GAME STATS (always shown) ===
        if (gameStats) {
            const lastGameSection = document.createElement('div');
            lastGameSection.className = 'last-game-section';

            // Calculate total dice lost across all players
            let totalDiceLost = 0;
            Object.values(gameStats.playerStats).forEach(ps => {
                totalDiceLost += ps.diceLost;
            });

            let statsHtml = `
                <p class="dice-obituary">A total of <strong>${totalDiceLost}</strong> dice lost their lives in this battle in <strong>${gameStats.gameDuration}</strong> rounds.</p>
            `;

            // Elimination timeline (redesigned to horizontal sentence)
            statsHtml += '<div class="timeline-section-horizontal">';
            statsHtml += '<h4 class="timeline-title">Timeline</h4>';
            statsHtml += '<div class="timeline-sentence">';

            // Show eliminated players with red symbol
            gameStats.eliminationOrder.forEach(e => {
                statsHtml += `<span class="timeline-entry eliminated"><span class="symbol">✗</span> ${e.name}</span> `;
            });

            // Show winner with green check
            statsHtml += `<span class="timeline-entry winner"><span class="symbol">✓</span> ${name}</span>`;

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

        let title = humanWon ? `${name.toUpperCase()}  WINS!` : `DEFEAT — ${name.toUpperCase()}  WINS`;
        let buttons = [];

        if (isCampaignMode && this.scenarioBrowser && owner) {
            const campaign = this.scenarioBrowser.campaignManager.getCampaign(owner);
            const totalLevels = campaign?.levels?.length ?? 0;
            const hasNextLevel = humanWon && levelIndex >= 0 && levelIndex < totalLevels - 1;
            const campaignFinished = humanWon && totalLevels > 0 && levelIndex === totalLevels - 1;

            if (!campaign) {
                buttons = [{ text: 'New Game', value: 'restart', className: 'tron-btn' }];
                if (this.turnHistory.hasInitialState()) buttons.push({ text: 'Try Again', value: 'clone', className: 'tron-btn' });
            } else if (campaignFinished) {
                title = '🎉 CAMPAIGN COMPLETE! 🎉';
                const celebrationEl = document.createElement('p');
                celebrationEl.className = 'campaign-celebration';
                celebrationEl.textContent = `You conquered all ${totalLevels} levels of ${campaign?.owner || 'this campaign'}!`;
                celebrationEl.style.cssText = 'font-size: 1.2em; margin: 1em 0; color: var(--primary-color);';
                content.insertBefore(celebrationEl, content.firstChild);
            }

            if (campaign && this.turnHistory.hasInitialState()) {
                buttons.push({ text: 'Retry', value: 'clone', className: 'tron-btn' });
            }
            if (campaign) {
                if (hasNextLevel) buttons.push({ text: 'Next Level', value: 'next', className: 'tron-btn primary' });
                buttons.push({ text: 'Back to Campaign', value: 'campaign', className: 'tron-btn' });
                buttons.push({ text: 'Main Menu', value: 'restart', className: 'tron-btn' });
            }
        }
        if (buttons.length === 0) {
            buttons.push({ text: 'New Game', value: 'restart', className: 'tron-btn' });
            if (this.turnHistory.hasInitialState()) {
                buttons.push({ text: 'Try Again', value: 'clone', className: 'tron-btn' });
            }
        }

        const choice = await Dialog.show({
            title,
            content: content,
            buttons
        });

        if (choice === 'restart') {
            this.sessionManager.quitToMainMenu();
        } else if (choice === 'clone') {
            this.sessionManager.restartCurrentGame(this.addLog, this.gameStarter.getAutoplayPlayers());
        } else if (choice === 'campaign') {
            localStorage.removeItem('dicy_customLevelMode');
            await this.sessionManager.quitToCampaignScreen();
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
    }
}
