import { createAI } from './ai/index.js';
import { Dialog } from '../ui/dialog.js';

/**
 * Attacks per turn + wall-clock seconds from level data and/or UI config.
 * Legacy `turnTimeLimit` in scenarios: 10/15/30/60 → seconds; 0/1/3/5 → attacks.
 */
function resolveTurnLimitsFromLevel(level, config) {
    let ap = level?.attacksPerTurn;
    let sec = level?.secondsPerTurn;
    let secAtk = level?.secondsPerAttack;
    const raw = level?.turnTimeLimit;
    if (raw != null && raw !== '') {
        const v = Number(raw);
        if ([10, 15, 30, 60].includes(v)) {
            if (sec == null || sec === '') sec = v;
        } else if ([0, 1, 3, 5].includes(v)) {
            if (ap == null || ap === '') ap = v;
        }
    }
    const attacksPerTurn = Math.max(0, Number(ap ?? config?.attacksPerTurn ?? 0) || 0);
    const secondsPerTurn = Math.max(0, Number(sec ?? config?.secondsPerTurn ?? 0) || 0);
    const secondsPerAttack = Math.max(0, Number(secAtk ?? config?.secondsPerAttack ?? 0) || 0);
    return { attacksPerTurn, secondsPerTurn, secondsPerAttack };
}

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
        this.mapEditor = null;

        // Player AIs
        this.playerAIs = new Map();

        // Autoplay state
        this.autoplayPlayers = new Set();

        // Game speed
        this.gameSpeed = 'beginner';

        // Play mode ('classic' | 'parallel' | 'parallel-s')
        this.playMode = 'classic';

        /** Max attacks per active-player turn (0 = unlimited). Mirrored from game during play. */
        this.attacksPerTurn = 0;

        /** Wall-clock seconds per turn (0 = unlimited). Not enforced in parallel modes. */
        this.secondsPerTurn = 0;

        /** Wall-clock seconds per attack (0 = unlimited). Not enforced in parallel modes. */
        this.secondsPerAttack = 0;

        // Parallel-mode bot timers (setInterval IDs)
        this._parallelBotTimers = [];

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

    getAttacksPerTurn() {
        return this.attacksPerTurn;
    }

    getSecondsPerTurn() {
        return this.secondsPerTurn;
    }

    getSecondsPerAttack() {
        return this.secondsPerAttack;
    }

    getPlayMode() {
        return this.playMode;
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
     * Start a new game from the setup screen (persists settings).
     */
    startGame() {
        const config = this.configManager.getGameConfig();

        if (config.humanCount + config.botCount < 2) {
            Dialog.alert('A game must have at least 2 players!');
            return;
        }

        this.configManager.saveCurrentSettings();
        this.prepareAndBegin(config, {});
    }

    /**
     * New match with the same settings as the current setup UI (new RNG seed). Use from pause or game-over Rematch.
     */
    startFreshSameSettings() {
        const config = this.configManager.getGameConfig();

        if (config.humanCount + config.botCount < 2) {
            Dialog.alert('A game must have at least 2 players!');
            return;
        }

        const seed = (Math.imul(Date.now(), 0x9e3779b1) ^ (Math.random() * 0x7fffffff | 0)) >>> 0;
        this.prepareAndBegin(config, { mapSeed: seed, skipSaveSettings: true });
    }

    /**
     * Shared launch path for startGame / startFreshSameSettings.
     * @param {object} config - from ConfigManager.getGameConfig()
     * @param {object} options
     * @param {number} [options.mapSeed] - 32-bit seed for procedural randomness (skirmish / procedural campaign)
     * @param {boolean} [options.skipSaveSettings] - do not write localStorage (in-match restart)
     */
    prepareAndBegin(config, options = {}) {
        const { mapSeed, skipSaveSettings = false } = options;

        this.gameSpeed = config.gameSpeed;
        this.attacksPerTurn = config.attacksPerTurn ?? 0;
        this.secondsPerTurn = config.secondsPerTurn ?? 0;
        this.secondsPerAttack = config.secondsPerAttack ?? 0;
        this.playMode = config.playMode ?? 'classic';
        this.renderer.setGameSpeed(this.gameSpeed);

        this._stopParallelBotTimers();
        this.effectsManager.cancelAll();

        this.effectsManager.setQuality(config.effectsQuality);
        this.renderer.setEffectsQuality(config.effectsQuality);
        this.effectsManager.stopIntroMode();
        this.renderer.setDiceSides(config.diceSides);

        this.autoplayPlayers.clear();

        this.turnHistory.clearAutoSave();

        // Clear any lingering selection/hover visuals from the previous game
        this.renderer.setSelection(null, null, null);
        this.renderer.setCursor(null, null, null);
        if (this.renderer.grid?.hoverTiles) {
            this.renderer.grid.hoverTiles.clear();
            this.renderer.grid._lastHoverCursorId = null;
        }

        if (this.mapEditor && this.mapEditor.isOpen) {
            this.mapEditor.close();
        }

        if (this.gameLog) this.gameLog.clear();
        if (this.addLog) {
            this.addLog(skipSaveSettings ? '🎲 New match!' : 'Game started!', '');
        }

        this.setupModal.classList.add('hidden');
        document.getElementById('main-menu')?.classList.add('hidden');
        document.querySelectorAll('.game-ui').forEach(el => el.classList.remove('hidden'));
        document.getElementById('dice-result-hud')?.classList.add('hidden');

        const fullBoardRule = config.fullBoardRule || 'nothing';

        const applyScenarioBranch = (pendingLevel) => {
            this.scenarioManager.applyScenarioToGame(this.game, pendingLevel);
            const { attacksPerTurn: ap, secondsPerTurn: secLim, secondsPerAttack: secAtkLim } = resolveTurnLimitsFromLevel(pendingLevel, config);
            this.game.fullBoardRule = fullBoardRule;
            this.game._fullBoardRuleFired = false;
            this.game.attacksPerTurn = ap;
            this.game.secondsPerTurn = secLim;
            this.game.secondsPerAttack = secAtkLim;
            this.game.attacksUsedThisTurn = 0;
            this.attacksPerTurn = ap;
            this.secondsPerTurn = secLim;
            this.secondsPerAttack = secAtkLim;
            this.game.emit('gameStart', { players: this.game.players, map: this.game.map });
            this.game.startTurn();
            this.initializePlayerAIs(config.botAI);
        };

        const isCampaignMode = localStorage.getItem('dicy_campaignMode');

        if (isCampaignMode) {
            this.scenarioBrowser.loadPendingScenarioIfNeeded();
            const pendingLevel = this.scenarioBrowser.getPendingScenario();

            if (pendingLevel?.type === 'config') {
                const [w, h] = (pendingLevel.mapSize || '6x6').split('x').map(Number);
                const { attacksPerTurn: apLvl, secondsPerTurn: secLvl, secondsPerAttack: secAtkLvl } = resolveTurnLimitsFromLevel(pendingLevel, config);
                this.attacksPerTurn = apLvl;
                this.secondsPerTurn = secLvl;
                this.secondsPerAttack = secAtkLvl;
                const gameConfig = {
                    humanCount: 1,
                    botCount: pendingLevel.bots ?? 1,
                    mapWidth: w,
                    mapHeight: h,
                    maxDice: pendingLevel.maxDice ?? 8,
                    diceSides: pendingLevel.diceSides ?? 6,
                    mapStyle: pendingLevel.mapStyle || 'full',
                    gameMode: pendingLevel.gameMode || 'classic',
                    fullBoardRule,
                    mapSeed,
                    attacksPerTurn: apLvl,
                    secondsPerTurn: secLvl,
                    secondsPerAttack: secAtkLvl,
                };
                if (pendingLevel.humanStartsFirst === true) gameConfig.humanStartsFirst = true;
                if (pendingLevel.startingPlayerId !== undefined && pendingLevel.startingPlayerId !== null) {
                    gameConfig.startingPlayerId = pendingLevel.startingPlayerId;
                }
                this.game.startGame(gameConfig);
                this.attacksPerTurn = this.game.attacksPerTurn;
                this.secondsPerTurn = this.game.secondsPerTurn;
                this.secondsPerAttack = this.game.secondsPerAttack;
                this.initializePlayerAIs(pendingLevel.botAI || 'easy');
            } else if (pendingLevel && pendingLevel.type !== 'map') {
                applyScenarioBranch(pendingLevel);
            } else {
                const gameConfig = {
                    humanCount: config.humanCount,
                    botCount: config.botCount,
                    mapWidth: config.mapWidth,
                    mapHeight: config.mapHeight,
                    maxDice: config.maxDice,
                    diceSides: config.diceSides,
                    mapStyle: config.mapStyle,
                    gameMode: config.gameMode,
                    fullBoardRule,
                    mapSeed
                };
                if (pendingLevel?.type === 'map') {
                    gameConfig.predefinedMap = pendingLevel;
                    gameConfig.mapWidth = pendingLevel.width;
                    gameConfig.mapHeight = pendingLevel.height;
                    if (pendingLevel.bots != null) gameConfig.botCount = pendingLevel.bots;
                    if (pendingLevel.maxDice != null) gameConfig.maxDice = pendingLevel.maxDice;
                    if (pendingLevel.diceSides != null) gameConfig.diceSides = pendingLevel.diceSides;
                    const { attacksPerTurn: apMap, secondsPerTurn: secMap, secondsPerAttack: secAtkMap } = resolveTurnLimitsFromLevel(pendingLevel, config);
                    gameConfig.attacksPerTurn = apMap;
                    gameConfig.secondsPerTurn = secMap;
                    gameConfig.secondsPerAttack = secAtkMap;
                    if (pendingLevel.humanStartsFirst === true) gameConfig.humanStartsFirst = true;
                    if (pendingLevel.startingPlayerId !== undefined && pendingLevel.startingPlayerId !== null) {
                        gameConfig.startingPlayerId = pendingLevel.startingPlayerId;
                    }
                    this.attacksPerTurn = apMap;
                    this.secondsPerTurn = secMap;
                    this.secondsPerAttack = secAtkMap;
                } else {
                    gameConfig.attacksPerTurn = config.attacksPerTurn ?? 0;
                    gameConfig.secondsPerTurn = config.secondsPerTurn ?? 0;
                    gameConfig.secondsPerAttack = config.secondsPerAttack ?? 0;
                    this.attacksPerTurn = gameConfig.attacksPerTurn;
                    this.secondsPerTurn = gameConfig.secondsPerTurn;
                    this.secondsPerAttack = gameConfig.secondsPerAttack;
                }
                this.game.startGame(gameConfig);
                this.attacksPerTurn = this.game.attacksPerTurn;
                this.secondsPerTurn = this.game.secondsPerTurn;
                this.secondsPerAttack = this.game.secondsPerAttack;
                const botAI = (pendingLevel?.type === 'map' && pendingLevel?.botAI) || config.botAI;
                this.initializePlayerAIs(botAI);
            }
        } else {
            const gameConfig = {
                humanCount: config.humanCount,
                botCount: config.botCount,
                mapWidth: config.mapWidth,
                mapHeight: config.mapHeight,
                maxDice: config.maxDice,
                diceSides: config.diceSides,
                mapStyle: config.mapStyle,
                gameMode: config.gameMode,
                fullBoardRule,
                mapSeed,
                attacksPerTurn: config.attacksPerTurn ?? 0,
                secondsPerTurn: config.secondsPerTurn ?? 0,
                secondsPerAttack: config.secondsPerAttack ?? 0,
            };
            this.attacksPerTurn = gameConfig.attacksPerTurn;
            this.secondsPerTurn = gameConfig.secondsPerTurn;
            this.secondsPerAttack = gameConfig.secondsPerAttack;
            this.game.startGame(gameConfig);
            this.attacksPerTurn = this.game.attacksPerTurn;
            this.secondsPerTurn = this.game.secondsPerTurn;
            this.secondsPerAttack = this.game.secondsPerAttack;
            this.initializePlayerAIs(config.botAI);
        }

        this.turnHistory.saveAutoSave(this.game);

        this.game.playMode = this.playMode;

        if (this.playMode === 'parallel' || this.playMode === 'parallel-s') {
            this._startParallelBotTimers();
        }

        setTimeout(() => {
            this.renderer.autoFitCamera();
        }, 50);
    }

    /** @param {import('../editor/map-editor.js').MapEditor | null} editor */
    setMapEditor(editor) {
        this.mapEditor = editor;
    }

    /** Background attack timers for bots in parallel mode. */
    _startParallelBotTimers() {
        this._stopParallelBotTimers();
        const intervals = { easy: 10000, medium: 5000, hard: 2000, autoplay: 3000 };

        for (const player of this.game.players) {
            if (!player.isBot) continue;
            const ai = this.playerAIs.get(player.id);
            if (!ai) continue;
            const ms = intervals[ai.name?.toLowerCase()] ?? 5000;
            const id = setInterval(() => this._doParallelBotAttack(player, ai), ms);
            this._parallelBotTimers.push(id);
        }
    }

    _stopParallelBotTimers() {
        this._parallelBotTimers.forEach(id => clearInterval(id));
        this._parallelBotTimers = [];
    }

    _doParallelBotAttack(player, ai) {
        if (this.game.gameOver || !player.alive) return;
        if (this.game.currentPlayer?.id === player.id) return;

        const excludeId = this.playMode === 'parallel-s' ? this.game.currentPlayer?.id : null;
        const move = ai.chooseBestAttack(excludeId);
        if (move) {
            this.game.attack(move.from.x, move.from.y, move.to.x, move.to.y, player.id);
        }
    }

    /**
     * Initialize AIs for all players
     */
    initializePlayerAIs(botAI) {
        this.clearPlayerAIs();

        const aiCycle = ['easy', 'medium', 'hard'];
        let botIndex = 0;

        for (const player of this.game.players) {
            if (!player.isBot) {
                player.name = this.getPlayerName ? this.getPlayerName(player) : `Human ${player.id + 1}`;
                continue;
            }

            let aiId;
            if (botAI === 'custom') {
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
