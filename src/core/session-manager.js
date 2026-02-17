/**
 * SessionManager - Handles game session lifecycle
 * Manages reset, restart, auto-save, and resume functionality
 */
export class SessionManager {
    constructor(game, renderer, effectsManager, turnHistory, mapEditor) {
        this.game = game;
        this.renderer = renderer;
        this.effectsManager = effectsManager;
        this.turnHistory = turnHistory;
        this.mapEditor = mapEditor;

        // UI components set later
        this.gameLog = null;
        this.diceHUD = null;
        this.playerDashboard = null;

        // DOM elements
        this.setupModal = document.getElementById('setup-modal');
        this.turnIndicator = document.getElementById('turn-indicator');
        this.endTurnBtn = document.getElementById('end-turn-btn');
        this.autoWinBtn = document.getElementById('auto-win-btn');
        this.newGameBtn = document.getElementById('new-game-btn');
        this.retryGameBtn = document.getElementById('retry-game-btn');
        this.retrySeparator = document.querySelector('.retry-separator');

        this.scenarioBrowser = null;
        this.configManager = null;

        game.on('gameStart', () => {
            this.updateNewGameBtnLabel();
            this.updateRetryBtnVisibility();
        });
    }

    setScenarioBrowser(scenarioBrowser) {
        this.scenarioBrowser = scenarioBrowser;
    }

    setConfigManager(configManager) {
        this.configManager = configManager;
    }

    /**
     * Update new-game button label based on campaign mode (desktop: text + title)
     */
    updateNewGameBtnLabel() {
        if (!this.newGameBtn) return;
        const isCampaignMode = localStorage.getItem('dicy_campaignMode');
        const btnText = this.newGameBtn.querySelector('.btn-text');
        if (isCampaignMode) {
            this.newGameBtn.title = 'Back to Campaign';
            if (btnText) btnText.textContent = 'BACK TO CAMPAIGN';
        } else {
            this.newGameBtn.title = 'Main Menu';
            if (btnText) btnText.textContent = 'MAIN MENU';
        }
    }

    /**
     * Update retry button visibility based on whether we have an initial state to retry
     */
    updateRetryBtnVisibility() {
        if (!this.retryGameBtn) return;
        const hasInitialState = this.turnHistory.hasInitialState();
        this.retryGameBtn.classList.toggle('hidden', !hasInitialState);
        if (this.retrySeparator) this.retrySeparator.classList.toggle('hidden', !hasInitialState);
    }

    /**
     * Set UI components that need to be reset
     */
    setUIComponents(gameLog, diceHUD, playerDashboard) {
        this.gameLog = gameLog;
        this.diceHUD = diceHUD;
        this.playerDashboard = playerDashboard;
    }

    /**
     * Reset UI components to initial state
     */
    resetUI() {
        // Clear logs
        if (this.gameLog) this.gameLog.clear();

        // Hide HUDs
        if (this.diceHUD) this.diceHUD.hide();
        if (this.turnIndicator) this.turnIndicator.classList.add('hidden');
        if (this.endTurnBtn) this.endTurnBtn.classList.add('hidden');
        if (this.autoWinBtn) this.autoWinBtn.classList.add('hidden');
        if (this.playerDashboard) this.playerDashboard.hide();
        if (this.newGameBtn) this.newGameBtn.classList.add('hidden');
        if (this.retryGameBtn) this.retryGameBtn.classList.add('hidden');
        if (this.retrySeparator) this.retrySeparator.classList.add('hidden');
    }

    /**
     * Completely reset game session
     */
    resetGameSession() {
        // Close editor if open
        if (this.mapEditor && this.mapEditor.isOpen) {
            this.mapEditor.close();
        }

        // Reset game logic
        this.game.reset();
        this.turnHistory.clear();
        this.turnHistory.clearAutoSave();

        this.resetUI();

        // Clear renderer
        this.renderer.draw(); // Will draw empty grid
    }

    /**
     * Quit to main menu
     */
    quitToMainMenu() {
        this.resetGameSession();
        if (this.endTurnBtn) this.endTurnBtn.classList.add('hidden');
        localStorage.removeItem('dicy_campaignMode');
        localStorage.removeItem('dicy_customLevelMode');

        // Clear any pending scenario/level in memory
        if (this.scenarioBrowser) {
            this.scenarioBrowser.clearPendingScenario();
        }

        // Update ConfigManager UI to clear loaded level display
        if (this.configManager) {
            this.configManager.updateLoadedLevelDisplay(null, null);
        }

        this.setupModal.classList.remove('hidden');
        document.querySelectorAll('.game-ui').forEach(el => el.classList.add('hidden'));
        if (this.effectsManager) this.effectsManager.startIntroMode();
    }

    /**
     * Quit to campaign screen (when in campaign mode)
     */
    async quitToCampaignScreen() {
        this.resetGameSession();
        if (this.endTurnBtn) this.endTurnBtn.classList.add('hidden');
        this.setupModal.classList.add('hidden');
        document.querySelectorAll('.game-ui').forEach(el => el.classList.add('hidden'));
        if (this.scenarioBrowser) {
            await this.scenarioBrowser.showCampaignView();
            this.scenarioBrowser.restoreLastSelectedCampaign();
            this.scenarioBrowser.scenarioBrowserModal.classList.remove('hidden');
        }
        if (this.effectsManager) this.effectsManager.startIntroMode();
    }

    /**
     * Restart current game from initial state
     * @param {Function} addLog - Function to add log entries
     * @param {Set} autoplayPlayers - Set of autoplay player IDs (to preserve)
     */
    restartCurrentGame(addLog, autoplayPlayers) {
        // Close editor if open
        if (this.mapEditor && this.mapEditor.isOpen) {
            this.mapEditor.close();
        }

        const success = this.turnHistory.restoreInitialSnapshot(this.game);

        if (success) {
            this.resetUI();

            // Restore UI visibility
            document.querySelectorAll('.game-ui').forEach(el => el.classList.remove('hidden'));
            this.updateNewGameBtnLabel();
            this.updateRetryBtnVisibility();
            const dashToggle = document.getElementById('dash-toggle');
            if (dashToggle) dashToggle.textContent = '[-]';

            // Redraw and restart
            this.renderer.draw();
            if (this.playerDashboard) this.playerDashboard.update();
            this.game.emit('turnStart', { player: this.game.currentPlayer });
            this.renderer.forceUpdate();

            // Clear any lingering auto-save from the finished game
            this.turnHistory.clearAutoSave();

            if (addLog) addLog('🔄 Game Restarted', 'info');
        }

        return success;
    }

    /**
     * Check for auto-save and resume if found
     * @param {Function} createAI - Function to create AI instances
     * @param {Function} clearPlayerAIs - Function to clear AI map
     * @param {Map} playerAIs - Map of player AIs
     * @param {Function} getPlayerName - Function to get player name
     * @param {Function} addLog - Function to add log entries
     * @param {string} gameSpeed - Current game speed setting
     */
    checkResume(createAI, clearPlayerAIs, playerAIs, getPlayerName, addLog, gameSpeed, effectsQuality) {
        if (!this.turnHistory.hasAutoSave() || this.game.players.length > 0) return false;

        const snapshot = this.turnHistory.loadAutoSave();
        if (snapshot) {
            // Guard against resuming finished games
            let isFinished = snapshot.gameState && snapshot.gameState.gameOver;

            // Robust check: If gameOver flag is false but only one owner remains, it's finished
            if (!isFinished && snapshot.gameState && snapshot.gameState.map && snapshot.gameState.map.tiles) {
                const owners = new Set();
                snapshot.gameState.map.tiles.forEach(t => {
                    if (!t.blocked && t.owner !== undefined && t.owner !== null) {
                        owners.add(t.owner);
                    }
                });
                if (owners.size === 1) {
                    isFinished = true;
                }
            }

            if (isFinished) {
                console.log('checkResume: Skipping resume for finished game (determined by gameOver flag or map state)');
                this.turnHistory.clearAutoSave();
                return false;
            }

            this.setupModal.classList.add('hidden');
            document.querySelectorAll('.game-ui').forEach(el => el.classList.remove('hidden'));
            this.updateNewGameBtnLabel();
            this.updateRetryBtnVisibility();

            // Restore state
            this.turnHistory.applyGameState(this.game, snapshot.gameState);

            // Restore AIs
            clearPlayerAIs();
            this.game.players.forEach(p => {
                if (p.isBot) {
                    const aiId = p.aiId || 'easy';
                    playerAIs.set(p.id, createAI(aiId, this.game, p.id));
                }
                // Ensure name is set
                p.name = p.name || getPlayerName(p);
            });

            // Restore settings - match what happens in gameStarter.startGame()
            console.log('checkResume: Setting gameSpeed to', gameSpeed);
            this.renderer.setGameSpeed(gameSpeed);
            this.renderer.setDiceSides(this.game.diceSides || 6);

            // Apply effects quality settings
            if (effectsQuality && this.effectsManager) {
                this.effectsManager.setQuality(effectsQuality);
                this.renderer.setEffectsQuality(effectsQuality);
            }
            if (this.effectsManager) this.effectsManager.stopIntroMode();

            // Trigger start
            this.game.emit('gameStart', { players: this.game.players, map: this.game.map });
            this.game.startTurn();

            if (addLog) addLog(`🔄 Game automatically resumed from Turn ${this.game.turn}`, 'reinforce');
            setTimeout(() => this.renderer.autoFitCamera(), 50);

            return true;
        }

        return false;
    }

    /**
     * Check if a game is currently in progress
     */
    isGameInProgress() {
        return this.game.players.length > 0;
    }
}
