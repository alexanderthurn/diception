import { createAI } from './ai/index.js';
import { Dialog } from '../ui/dialog.js';

/**
 * GameStarter - Handles game initialization and start logic
 */
export class GameStarter {
    constructor(game, renderer, effectsManager, turnHistory, configManager, scenarioBrowser, scenarioManager) {
        this.game = game;
        this.renderer = renderer;
        this.effectsManager = effectsManager;
        this.turnHistory = turnHistory;
        this.configManager = configManager;
        this.scenarioBrowser = scenarioBrowser;
        this.scenarioManager = scenarioManager;

        // Player AIs
        this.playerAIs = new Map();

        // Autoplay state
        this.autoplayPlayers = new Set();

        // Game speed
        this.gameSpeed = 'beginner';

        // DOM elements
        this.setupModal = document.getElementById('setup-modal');
        this.startBtn = document.getElementById('start-game-btn');

        // Callbacks
        this.getPlayerName = null;
        this.addLog = null;
        this.gameLog = null;
    }

    /**
     * Set callbacks and dependencies
     */
    setCallbacks(getPlayerName, addLog, gameLog) {
        this.getPlayerName = getPlayerName;
        this.addLog = addLog;
        this.gameLog = gameLog;
    }

    /**
     * Get player AI map
     */
    getPlayerAIs() {
        return this.playerAIs;
    }

    /**
     * Clear all player AIs
     */
    clearPlayerAIs() {
        this.playerAIs.clear();
    }

    /**
     * Get autoplay players set
     */
    getAutoplayPlayers() {
        return this.autoplayPlayers;
    }

    /**
     * Get current game speed
     */
    getGameSpeed() {
        return this.gameSpeed;
    }

    /**
     * Initialize start button listener
     */
    init() {
        if (this.startBtn) {
            this.startBtn.addEventListener('click', () => this.startGame());
        }
    }

    /**
     * Start a new game
     */
    startGame() {
        const config = this.configManager.getGameConfig();

        if (config.humanCount + config.botCount < 2) {
            Dialog.alert('A game must have at least 2 players!');
            return;
        }

        // Save settings
        this.configManager.saveCurrentSettings();

        // Update game speed
        this.gameSpeed = config.gameSpeed;
        this.renderer.setGameSpeed(this.gameSpeed);

        // Apply effects quality
        this.effectsManager.setQuality(config.effectsQuality);
        this.renderer.setEffectsQuality(config.effectsQuality);
        this.effectsManager.stopIntroMode();
        this.renderer.setDiceSides(config.diceSides);

        // Clear autoplay state
        this.autoplayPlayers.clear();

        // Clear previous auto-save when explicitly starting new game
        this.turnHistory.clearAutoSave();

        // Clear logs
        if (this.gameLog) this.gameLog.clear();
        if (this.addLog) this.addLog('Game started!', '');

        // Show Game UI
        this.setupModal.classList.add('hidden');
        document.querySelectorAll('.game-ui').forEach(el => el.classList.remove('hidden'));

        // Load pending scenario if needed
        this.scenarioBrowser.loadPendingScenarioIfNeeded();
        const pendingScenario = this.scenarioBrowser.getPendingScenario();

        if (pendingScenario && pendingScenario.type !== 'map') {
            // Apply the loaded scenario or replay (fixed state)
            this.scenarioManager.applyScenarioToGame(this.game, pendingScenario);
            this.game.emit('gameStart', { players: this.game.players, map: this.game.map });
            this.game.startTurn();

            // Update size display
            const sizePreset = this.configManager.getMapSize(parseInt(this.configManager.elements.mapSizeInput.value));
            this.configManager.elements.mapSizeVal.textContent = sizePreset.label;
        } else {
            // New Game (Random Map or Preset Map)
            const gameConfig = {
                humanCount: config.humanCount,
                botCount: config.botCount,
                mapWidth: config.mapWidth,
                mapHeight: config.mapHeight,
                maxDice: config.maxDice,
                diceSides: config.diceSides,
                mapStyle: config.mapStyle,
                gameMode: config.gameMode
            };

            // If it's a map type scenario, pass it as a preset
            if (pendingScenario && pendingScenario.type === 'map') {
                gameConfig.predefinedMap = pendingScenario;
                gameConfig.mapWidth = pendingScenario.width;
                gameConfig.mapHeight = pendingScenario.height;
            }

            this.game.startGame(gameConfig);
        }

        // Initialize AI for all players
        this.initializePlayerAIs(config.botAI);

        // Save the initial state for "Play Again" functionality
        this.turnHistory.saveInitialState(this.game);

        // Force update of autosave to include the newly assigned AI IDs
        this.turnHistory.saveAutoSave(this.game);

        // Ensure camera fits after game start
        setTimeout(() => {
            this.renderer.autoFitCamera();
        }, 50);
    }


    /**
     * Initialize AIs for all players
     */
    initializePlayerAIs(botAI) {
        this.clearPlayerAIs();

        // For custom mode, define the AI cycle
        const aiCycle = ['easy', 'medium', 'hard'];
        let botIndex = 0;

        for (const player of this.game.players) {
            if (!player.isBot) {
                player.name = this.getPlayerName ? this.getPlayerName(player) : `Human ${player.id + 1}`;
                continue;
            }

            // Determine AI for this bot
            let aiId;
            if (botAI === 'custom') {
                // Cycle through easy, medium, hard
                aiId = aiCycle[botIndex % aiCycle.length];
                botIndex++;
            } else {
                aiId = botAI || 'easy';
            }

            this.playerAIs.set(player.id, createAI(aiId, this.game, player.id));
            player.aiId = aiId;
            player.name = this.getPlayerName ? this.getPlayerName(player) : `Bot ${player.id}`;
        }
    }

    /**
     * Helper to get consistent player names
     */
    createPlayerNameGetter() {
        return (player) => {
            if (player.isBot) {
                const aiRunner = this.playerAIs.get(player.id);
                return aiRunner ? `${aiRunner.name} ${player.id}` : `Bot ${player.id}`;
            }
            return `Human ${player.id + 1}`;
        };
    }
}
