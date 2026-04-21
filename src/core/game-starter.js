import { createAI } from './ai/index.js';
import { Dialog } from '../ui/dialog.js';
import { isFullVersion } from '../scenarios/user-identity.js';

/**
 * After shuffle, pick the starting player index based on bot difficulty.
 * Easy  → a human goes first (random among humans if multiple).
 * Medium → unchanged (random from shuffle).
 * Hard  → the bot right after a human in circular order goes first,
 *          so the human plays last in the first round.
 * Returns null if no adjustment is needed (all-human, all-bot, or medium).
 * @param {any[]} players - shuffled player array from game.players
 * @param {string} botAI
 * @returns {number|null}
 */
function resolveStartingPlayerByDifficulty(players, botAI, rng = Math.random) {
    const hasHumans = players.some(p => !p.isBot);
    const hasBots   = players.some(p =>  p.isBot);
    if (!hasHumans || !hasBots) return null; // pure human or pure bot game

    if (botAI === 'easy') {
        const humanIndices = players.map((p, i) => !p.isBot ? i : -1).filter(i => i >= 0);
        return humanIndices[Math.floor(rng() * humanIndices.length)];
    }

    if (botAI === 'hard') {
        const n = players.length;
        const humanIndices = players.map((p, i) => !p.isBot ? i : -1).filter(i => i >= 0);
        // Pick any human; find the nearest bot right after that human in circular order.
        // That bot starts → all remaining bots play → then human plays last.
        const humanIdx = humanIndices[Math.floor(rng() * humanIndices.length)];
        for (let offset = 1; offset < n; offset++) {
            const idx = (humanIdx + offset) % n;
            if (players[idx].isBot) return idx;
        }
    }

    return null; // medium: keep shuffle result
}

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
 * Build a complete gameConfig object from a map/config-type level.
 * All level fields take precedence over baseConfig. Pass isCampaign=true to lock humanCount to 1.
 * @param {Object} level
 * @param {Object} baseConfig - from ConfigManager.getGameConfig()
 * @param {Object} [opts]
 * @param {boolean} [opts.isCampaign]
 * @param {number} [opts.mapSeed]
 */
function buildGameConfigFromLevel(level, baseConfig, { isCampaign = false, mapSeed } = {}) {
    const { attacksPerTurn, secondsPerTurn, secondsPerAttack } = resolveTurnLimitsFromLevel(level, baseConfig);
    const gameConfig = {
        humanCount: isCampaign ? 1 : (baseConfig.humanCount ?? 1),
        botCount: level?.bots ?? baseConfig.botCount,
        mapWidth: level?.width ?? baseConfig.mapWidth,
        mapHeight: level?.height ?? baseConfig.mapHeight,
        maxDice: level?.maxDice ?? baseConfig.maxDice,
        diceSides: level?.diceSides ?? baseConfig.diceSides,
        mapStyle: level?.mapStyle ?? baseConfig.mapStyle,
        gameMode: level?.gameMode ?? baseConfig.gameMode,
        botAI: level?.botAI ?? baseConfig.botAI,
        attacksPerTurn,
        secondsPerTurn,
        secondsPerAttack,
        fullBoardRule: baseConfig.fullBoardRule,
        attackRule: baseConfig.attackRule,
        supplyRule: baseConfig.supplyRule,
        playMode: baseConfig.playMode,
        gameSpeed: baseConfig.gameSpeed,
        effectsQuality: baseConfig.effectsQuality,
        mapSeed,
    };
    if (level?.type === 'map') {
        gameConfig.predefinedMap = level;
        if (level.seed) gameConfig.mapSeed = level.seed >>> 0;
        if (level.humanStartsFirst === true) gameConfig.humanStartsFirst = true;
        if (level.startingPlayerId != null) gameConfig.startingPlayerId = level.startingPlayerId;
    }
    return gameConfig;
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
        const isTutorialCampaign = localStorage.getItem('dicy_campaignMode') === '1' &&
            localStorage.getItem('dicy_loadedCampaign') === 'Tutorial';
        if (!isFullVersion() && !isTutorialCampaign && !this.configManager.isSetupAtFreeDefaults()) {
            this.configManager.resetToFreeDefaults();
            this._onFreeVersionBlock?.();
            Dialog.showFullVersion();
            return;
        }

        const config = this.configManager.getGameConfig();

        if (config.humanCount + config.botCount < 2) {
            Dialog.alert('A game must have at least 2 players!');
            return;
        }

        this.configManager.saveCurrentSettings();
        const seed = this.configManager.consumeGameSeed();
        this.prepareAndBegin(config, { mapSeed: seed });
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
        const attackRule = config.attackRule || 'classic';
        const supplyRule = config.supplyRule || 'classic';

        const applyScenarioBranch = (pendingLevel) => {
            this.scenarioManager.applyScenarioToGame(this.game, pendingLevel);
            const { attacksPerTurn: ap, secondsPerTurn: secLim, secondsPerAttack: secAtkLim } = resolveTurnLimitsFromLevel(pendingLevel, config);
            this.game.fullBoardRule = fullBoardRule;
            this.game._fullBoardRuleFired = false;
            this.game.attackRule = attackRule;
            this.game.supplyRule = supplyRule;
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

            if (pendingLevel && pendingLevel.type !== 'map') {
                applyScenarioBranch(pendingLevel);
            } else {
                const gameConfig = buildGameConfigFromLevel(pendingLevel, config, { isCampaign: true, mapSeed });
                this.game.startGame(gameConfig);
                this.attacksPerTurn = this.game.attacksPerTurn;
                this.secondsPerTurn = this.game.secondsPerTurn;
                this.secondsPerAttack = this.game.secondsPerAttack;
                this.initializePlayerAIs(gameConfig.botAI);
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
                attackRule,
                supplyRule,
                mapSeed,
                attacksPerTurn: config.attacksPerTurn ?? 0,
                secondsPerTurn: config.secondsPerTurn ?? 0,
                secondsPerAttack: config.secondsPerAttack ?? 0,
                resolveStartingPlayer: (players, rng) => resolveStartingPlayerByDifficulty(players, config.botAI, rng),
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

    /**
     * Start a test game from the map editor.
     * Sets dicy_editorTest so exit routing returns to the editor.
     */
    startEditorTest(snapshot) {
        localStorage.setItem('dicy_editorTest', '1');
        localStorage.setItem('dicy_campaignMode', '1');
        localStorage.removeItem('dicy_loadedCampaign');
        localStorage.removeItem('dicy_loadedLevelIndex');
        this.scenarioBrowser.pendingLevel = snapshot;
        sessionStorage.setItem('dicy_editorTestSnapshot', JSON.stringify(snapshot));
        this.configManager.updateConfigFromLevel(snapshot);
        const config = this.configManager.getGameConfig();
        this.prepareAndBegin(config, {});
        // onSave may have un-hidden the campaign browser — ensure it stays hidden
        if (this.scenarioBrowser?.scenarioBrowserModal) {
            this.scenarioBrowser.scenarioBrowserModal.classList.add('hidden');
        }
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
