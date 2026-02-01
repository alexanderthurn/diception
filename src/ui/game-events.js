import { Dialog } from './dialog.js';

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

        // DOM elements
        this.playerText = document.getElementById('player-turn');
        this.turnIndicator = document.getElementById('turn-indicator');
        this.endTurnBtn = document.getElementById('end-turn-btn');
        this.autoWinBtn = document.getElementById('auto-win-btn');

        // Callbacks
        this.getPlayerName = null;
        this.addLog = null;
        this.startTurnLog = null;
        this.finalizeTurnLog = null;
    }

    /**
     * Set UI components
     */
    setUIComponents(diceHUD, gameLog, playerDashboard, highscoreManager, sfx, effectsManager) {
        this.diceHUD = diceHUD;
        this.gameLog = gameLog;
        this.playerDashboard = playerDashboard;
        this.highscoreManager = highscoreManager;
        this.sfx = sfx;
        this.effectsManager = effectsManager;
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

        const name = data.player.isBot ? `Bot ${data.player.id}` : `Player ${data.player.id}`;
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
        this.endTurnBtn.textContent = 'END TURN';

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
        this.endTurnBtn.textContent = `END TURN (+${regionDice + storedDice})`;

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
            this.endTurnBtn.textContent = `END TURN (+${regionDice + storedDice})`;
        }

        if (this.playerDashboard) this.playerDashboard.update();
    }

    handlePlayerEliminated(player) {
        const name = player.isBot ? `Bot ${player.id}` : `Player ${player.id}`;
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
        const name = this.getPlayerName(data.winner);
        if (this.addLog) this.addLog(`🏆 ${name} wins the game!`, 'death');

        // Record the win
        if (this.highscoreManager) this.highscoreManager.recordWin(name);

        // Play victory or defeat sound
        if (this.sfx) {
            if (!data.winner.isBot) {
                this.sfx.victory();
            } else {
                this.sfx.defeat();
            }
        }

        // Prepare content for Dialog
        const content = document.createElement('div');

        const winnerP = document.createElement('p');
        winnerP.id = 'winner-text';
        winnerP.textContent = `${name} Wins!`;
        content.appendChild(winnerP);

        const highscoreSection = document.createElement('div');
        highscoreSection.id = 'highscore-section';
        highscoreSection.innerHTML = `
            <h3 class="highscore-title">🏆 PLAYER STATS</h3>
            <div id="highscore-list"></div>
            <div id="total-games-played" class="total-games"></div>
        `;
        content.appendChild(highscoreSection);

        setTimeout(() => {
            if (this.highscoreManager) this.highscoreManager.display(name);
        }, 10);

        const buttons = [
            { text: 'New Game', value: 'restart', className: 'tron-btn' }
        ];

        if (this.turnHistory.hasInitialState()) {
            buttons.push({ text: 'Try Again', value: 'clone', className: 'tron-btn' });
        }

        const choice = await Dialog.show({
            title: 'GAME OVER',
            content: content,
            buttons: buttons
        });

        if (choice === 'restart') {
            this.sessionManager.quitToMainMenu();
        } else if (choice === 'clone') {
            this.sessionManager.restartCurrentGame(this.addLog, this.gameStarter.getAutoplayPlayers());
        }

        // Clear auto-save on normal completion
        this.turnHistory.clearAutoSave();
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
