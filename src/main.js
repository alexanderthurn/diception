import { Game } from './core/game.js';
import { Renderer } from './render/renderer.js';
import { InputController } from './input/input-controller.js';
import { InputManager } from './input/input-manager.js';
import { createAI } from './core/ai/index.js';
import { SoundManager } from './audio/sound-manager.js';
import { EffectsManager } from './render/effects/effects-manager.js';
import { ScenarioManager } from './scenarios/scenario-manager.js';
import { TurnHistory } from './scenarios/turn-history.js';
import { MapEditor } from './editor/map-editor.js';
import { TileRenderer } from './render/tile-renderer.js';
import { GamepadCursorManager } from './input/gamepad-cursor-manager.js';
import { AudioController } from './ui/audio-controller.js';
import { GameLog } from './ui/game-log.js';
import { PlayerDashboard } from './ui/player-dashboard.js';
import { DiceHUD } from './ui/dice-hud.js';
import { HighscoreManager } from './ui/highscore-manager.js';
import { Dialog } from './ui/dialog.js';

// New modular components
import { ConfigManager } from './ui/config-manager.js';
import { SessionManager } from './core/session-manager.js';
import { TournamentRunner } from './core/tournament-runner.js';
import { ScenarioBrowser } from './ui/scenario-browser.js';
import { GameStarter } from './core/game-starter.js';
import { GameEventManager } from './ui/game-events.js';
import { ProbabilityCalculator } from './ui/probability-calculator.js';
import { initializeProbabilityTables } from './core/probability.js';

// Pre-compute probability tables at startup
initializeProbabilityTables();


async function init() {
    // Show package version
    const version = import.meta.env.VITE_APP_VERSION || '1.0.0';
    const setVersionText = (id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = `v${version}`;
    };
    setVersionText('loading-version');
    setVersionText('setup-version');

    // Wrap letters for title animation
    const wrapLetters = (selector) => {
        document.querySelectorAll(selector).forEach(el => {
            const text = el.textContent;
            el.innerHTML = '';
            [...text].forEach((char, i) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.style.setProperty('--index', i);
                el.appendChild(span);
            });
        });
    };
    wrapLetters('.tron-title');

    // Steam Integration
    if (window.steam) {
        const quitBtn = document.getElementById('quit-game-btn');
        if (quitBtn) {
            quitBtn.classList.remove('hidden');
            quitBtn.addEventListener('click', async () => {
                if (await Dialog.confirm('Are you sure you want to exit to desktop?', 'QUIT GAME?')) {
                    window.steam.quit();
                }
            });
        }

        window.steam.getUserName().then(name => {
            console.log('Steam User:', name);
            const credits = document.querySelector('.credits');
            if (credits) {
                credits.innerHTML += `<br><span style="color: #66c0f4">Logged in as ${name} (Steam)</span>`;
            }
        });
    }

    // Initialize Core Components
    const game = new Game();
    const container = document.getElementById('game-container');
    const renderer = new Renderer(container, game);
    await renderer.init();

    window.gameApp = renderer.app;

    // Apply dice texture to UI elements
    document.querySelectorAll('.dice-icon-sprite').forEach(el => {
        el.style.maskImage = `url(${TileRenderer.diceDataURL})`;
        el.style.webkitMaskImage = `url(${TileRenderer.diceDataURL})`;
    });

    // Initialize Effects System
    const effectsManager = new EffectsManager(renderer.app.stage, game, {
        tileSize: 60,
        gap: 4,
        renderer: renderer
    });
    effectsManager.setWorldTransform(renderer.rootContainer);
    effectsManager.startIntroMode();

    // Initialize Input System
    const inputManager = new InputManager();
    const input = new InputController(game, renderer, inputManager);

    // Loading Screen
    setupLoadingScreen(inputManager);

    // Initialize Gamepad Cursors
    const gamepadCursors = new GamepadCursorManager(game, inputManager);

    // FPS Counter
    setupFPSCounter(renderer);

    // Handle window resize
    window.addEventListener('resize', () => {
        renderer.autoFitCamera();
    });

    // Wire tile selection to effects
    const originalSelect = input.select.bind(input);
    input.select = (x, y) => {
        originalSelect(x, y);
        effectsManager.onTileClick(x, y);
    };

    // Initialize Managers
    const scenarioManager = new ScenarioManager();
    const turnHistory = new TurnHistory();
    const mapEditor = new MapEditor(scenarioManager);
    mapEditor.setRenderer(renderer);
    mapEditor.init();

    const configManager = new ConfigManager();
    configManager.loadSavedSettings();
    configManager.setupInputListeners(effectsManager, renderer);

    const sessionManager = new SessionManager(game, renderer, effectsManager, turnHistory, mapEditor);
    const scenarioBrowser = new ScenarioBrowser(scenarioManager, configManager, mapEditor);
    scenarioBrowser.setEffectsManager(effectsManager);
    await scenarioBrowser.init();

    const gameStarter = new GameStarter(
        game, renderer, effectsManager, turnHistory,
        configManager, scenarioBrowser, scenarioManager
    );

    // Initialize Sound & Audio
    const sfxManager = new SoundManager();
    // Pre-render all sound effects during loading for instant playback
    sfxManager.preloadAll().catch(e => console.warn('Sound preload failed:', e));
    const audioController = new AudioController(sfxManager);
    audioController.init();

    // Initialize UI Components
    const highscoreManager = new HighscoreManager();
    const diceHUD = new DiceHUD();
    diceHUD.setDiceDataURL(TileRenderer.diceDataURL);

    // Player name getter function
    const getPlayerName = gameStarter.createPlayerNameGetter();

    // Game Log
    const gameLog = new GameLog(game, turnHistory, scenarioManager);
    gameLog.setPlayerNameGetter(getPlayerName);
    gameLog.setDiceDataURL(TileRenderer.diceDataURL);
    gameLog.setSaveScenarioCallback((index, defaultName) => openSaveScenarioDialog(index, defaultName));

    // Wrapper functions
    const addLog = (message, type = '') => gameLog.addEntry(message, type);
    const startTurnLog = (player) => gameLog.startTurnLog(player, gameStarter.getAutoplayPlayers());
    const finalizeTurnLog = (reinforcements, saved = 0) => gameLog.finalizeTurnLog(reinforcements, saved);

    // Player Dashboard
    const playerDashboard = new PlayerDashboard(game);
    playerDashboard.setPlayerNameGetter(getPlayerName);
    playerDashboard.setDiceDataURL(TileRenderer.diceDataURL);
    playerDashboard.setAutoplayPlayers(gameStarter.getAutoplayPlayers());
    playerDashboard.setAutoplayToggleCallback((playerId, forceState) => {
        toggleAutoplay(playerId, forceState);
    });
    playerDashboard.init();

    // Set up session manager UI components
    sessionManager.setUIComponents(gameLog, diceHUD, playerDashboard);

    // Set up game starter callbacks
    gameStarter.setCallbacks(getPlayerName, addLog, gameLog);
    gameStarter.init();

    // Initialize Game Event Manager
    const gameEventManager = new GameEventManager(
        game, renderer, gameStarter, sessionManager, turnHistory, scenarioManager
    );
    gameEventManager.setUIComponents(diceHUD, gameLog, playerDashboard, highscoreManager, sfxManager, effectsManager);
    gameEventManager.setCallbacks(getPlayerName, addLog, startTurnLog, finalizeTurnLog);
    gameEventManager.init();

    // Tournament Runner
    const tournamentRunner = new TournamentRunner(configManager);

    // Setup scenario name click to unload
    configManager.setupScenarioNameClickHandler(() => {
        scenarioBrowser.clearPendingScenario();
    });

    // Autoplay toggle function
    const toggleAutoplay = (playerId, forceState) => {
        const autoplayPlayers = gameStarter.getAutoplayPlayers();
        const playerAIs = gameStarter.getPlayerAIs();
        const gameSpeed = gameStarter.getGameSpeed();
        const endTurnBtn = document.getElementById('end-turn-btn');

        const isCurrentlyAutoplay = autoplayPlayers.has(playerId);
        const newState = forceState !== undefined ? forceState : !isCurrentlyAutoplay;

        if (newState) {
            autoplayPlayers.add(playerId);
            // Create autoplay AI for this player if they don't have one (human players)
            if (!playerAIs.has(playerId)) {
                playerAIs.set(playerId, createAI('autoplay', game, playerId));
            }
        } else {
            autoplayPlayers.delete(playerId);
            // Remove autoplay AI for human players (keep bot AIs)
            const player = game.players.find(p => p.id === playerId);
            if (player && !player.isBot) {
                playerAIs.delete(playerId);
            }
        }

        playerDashboard.update();

        if (newState && game.currentPlayer.id === playerId && !game.gameOver) {
            endTurnBtn.disabled = true;
            endTurnBtn.textContent = 'END TURN';
            setTimeout(async () => {
                const playerAI = playerAIs.get(playerId);
                if (playerAI) {
                    await playerAI.takeTurn(gameSpeed);
                }
                game.endTurn();
            }, 500);
        }
    };

    // UI Button Bindings
    setupUIButtons(game, input, sessionManager, gameStarter, playerDashboard, toggleAutoplay, inputManager);

    // Input Manager Events
    setupInputEvents(game, inputManager, sessionManager);

    // How to Play Modal
    setupHowToPlay(effectsManager);


    // Check for auto-resume
    setTimeout(() => {
        const config = configManager.getGameConfig();
        console.log('Auto-resume: gameSpeed from config =', config.gameSpeed);

        // Initialize gameStarter's state so it's available during turn handlers
        // This matches what happens in gameStarter.startGame()
        gameStarter.gameSpeed = config.gameSpeed;

        sessionManager.checkResume(
            createAI,
            () => gameStarter.clearPlayerAIs(),
            gameStarter.getPlayerAIs(),
            getPlayerName,
            addLog,
            config.gameSpeed,
            config.effectsQuality
        );
    }, 100);

    // Save Scenario Dialog
    const openSaveScenarioDialog = async (snapshotIndex, defaultName = '') => {
        const content = document.createElement('div');
        content.className = 'save-scenario-content';
        content.innerHTML = `
            <div class="control-group">
                <label>Scenario Name</label>
                <input type="text" id="dialog-scenario-name-input" placeholder="My Epic Battle" maxlength="40" style="width: 100%; box-sizing: border-box;">
            </div>
            <p style="text-align: left; font-size: 13px; color: #aaa; margin-top: 15px;">
                This will save the current game state including map layout, player positions, and dice counts.
            </p>
        `;

        const nameInput = content.querySelector('#dialog-scenario-name-input');
        if (defaultName) nameInput.value = defaultName;

        const result = await Dialog.show({
            title: 'SAVE SCENARIO',
            content: content,
            buttons: [
                { text: '💾 Save', value: 'save', className: 'tron-btn' },
                { text: 'Cancel', value: 'cancel', className: 'tron-btn small' }
            ]
        });

        if (result === 'save') {
            const name = nameInput.value.trim() || 'Unnamed Scenario';

            if (snapshotIndex !== undefined && snapshotIndex !== null && !isNaN(parseInt(snapshotIndex))) {
                const scenario = turnHistory.createScenarioFromSnapshot(game, parseInt(snapshotIndex), name);
                if (scenario) {
                    scenarioManager.saveEditorScenario(scenario);
                    Dialog.alert(`Saved: ${name}`);
                }
            } else {
                scenarioManager.saveScenario(game, name);
                Dialog.alert(`Saved: ${name}`);
            }
        }
    };
}

// Helper: Setup Loading Screen
function setupLoadingScreen(inputManager) {
    const loadingScreen = document.getElementById('loading-screen');
    const loadingPrompt = document.getElementById('loading-prompt');
    const loadingIcons = document.getElementById('loading-icons');

    const dismissLoadingScreen = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (!loadingScreen || loadingScreen.classList.contains('fade-out')) return;

        loadingScreen.classList.add('fade-out');
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 800);

        window.removeEventListener('mousedown', dismissLoadingScreen);
        window.removeEventListener('touchstart', dismissLoadingScreen);
        window.removeEventListener('keydown', dismissLoadingScreen);
        inputManager.off('confirm', dismissLoadingScreen);
    };

    if (loadingScreen && loadingPrompt) {
        loadingPrompt.style.animation = 'loading-status-blink 1.5s infinite';

        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const isIPad = /iPad|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;

        loadingPrompt.style.animation = 'pulse-opacity 2s infinite ease-in-out';

        if (isTouch || isIPad) {
            loadingPrompt.textContent = 'Touch to Start';
            if (loadingIcons) loadingIcons.classList.add('hidden');
        } else {
            loadingPrompt.textContent = 'Press any key to start';
            if (loadingIcons) loadingIcons.classList.remove('hidden');
        }

        window.addEventListener('touchstart', dismissLoadingScreen);
        window.addEventListener('mousedown', dismissLoadingScreen);
        window.addEventListener('keydown', dismissLoadingScreen);

        inputManager.on('confirm', dismissLoadingScreen);
    }
}

// Helper: Setup FPS Counter
function setupFPSCounter(renderer) {
    const fpsCounter = document.getElementById('fps-counter');
    const urlParams = new URLSearchParams(window.location.search);
    const showFPS = urlParams.get('fps') !== 'false';

    if (showFPS && fpsCounter && renderer.app) {
        fpsCounter.classList.remove('hidden');
        let frameCount = 0;
        let lastTime = performance.now();
        let lastFPS = 0;

        const updateFPSStatus = () => {
            const canvas = renderer.app && (renderer.app.canvas || renderer.app.view);
            const width = canvas ? canvas.width : -3;
            const height = canvas ? canvas.height : -1;
            fpsCounter.textContent = `FPS: ${lastFPS} · v${import.meta.env.VITE_APP_VERSION} · ${width}x${height}`;
        };

        renderer.app.ticker.add(() => {
            frameCount++;
            const currentTime = performance.now();
            if (currentTime - lastTime >= 1000) {
                lastFPS = Math.round((frameCount * 1000) / (currentTime - lastTime));
                updateFPSStatus();
                frameCount = 0;
                lastTime = currentTime;
            }
        });

        window.addEventListener('resize', updateFPSStatus);
    }
}

// Helper: Setup UI Buttons
function setupUIButtons(game, input, sessionManager, gameStarter, playerDashboard, toggleAutoplay, inputManager) {
    const endTurnBtn = document.getElementById('end-turn-btn');
    const newGameBtn = document.getElementById('new-game-btn');
    const autoWinBtn = document.getElementById('auto-win-btn');
    const setupModal = document.getElementById('setup-modal');

    // Zoom Controls
    document.getElementById('zoom-in-btn').addEventListener('click', () => {
        sessionManager.renderer.zoom(-1, window.innerWidth / 2, window.innerHeight / 2);
    });

    document.getElementById('zoom-out-btn').addEventListener('click', () => {
        sessionManager.renderer.zoom(1, window.innerWidth / 2, window.innerHeight / 2);
    });

    // End Turn Button
    endTurnBtn.addEventListener('click', () => {
        const humanPlayers = game.players.filter(p => !p.isBot);
        if (humanPlayers.length > 1) {
            input.deselect();
        }
        game.endTurn();
    });

    // New Game Button
    newGameBtn.addEventListener('click', () => {
        sessionManager.quitToMainMenu();
    });

    // Auto-Win Button
    autoWinBtn.addEventListener('click', () => {
        const autoplayPlayers = gameStarter.getAutoplayPlayers();
        if (autoplayPlayers.size > 0) {
            autoplayPlayers.clear();
            autoWinBtn.classList.remove('active');
            playerDashboard.update();
        } else if (game.currentPlayer && !game.currentPlayer.isBot) {
            toggleAutoplay(game.currentPlayer.id);
            if (autoplayPlayers.has(game.currentPlayer.id)) {
                autoWinBtn.classList.add('active');
            } else {
                autoWinBtn.classList.remove('active');
            }
        }
    });

    // Connect InputController end turn callback
    input.setEndTurnCallback((data) => {
        if (game.players.length === 0) return;
        if (!setupModal.classList.contains('hidden')) return;
        if (endTurnBtn.disabled) return;

        if (data && data.index !== undefined) {
            if (game.currentPlayer.id !== data.index) {
                console.log(`Gamepad ${data.index} tried to end turn, but it's player ${game.currentPlayer.id}'s turn.`);
                return;
            }
        }

        const humanPlayers = game.players.filter(p => !p.isBot);
        if (humanPlayers.length > 1) {
            input.deselect();
        }
        game.endTurn();
    });
}

// Helper: Setup Input Events
function setupInputEvents(game, inputManager, sessionManager) {
    const setupModal = document.getElementById('setup-modal');

    inputManager.on('menu', () => {
        const isSetupOpen = !setupModal.classList.contains('hidden');

        if (Dialog.activeOverlay) {
            Dialog.close(Dialog.activeOverlay);
            return;
        }

        if (isSetupOpen) {
            if (window.steam && game.players.length === 0) {
                Dialog.confirm('Are you sure you want to exit to desktop?', 'QUIT GAME?').then(choice => {
                    if (choice) window.steam.quit();
                });
                return;
            }

            if (game.players.length > 0) {
                setupModal.classList.add('hidden');
                document.querySelectorAll('.game-ui').forEach(el => el.classList.remove('hidden'));
            }
            return;
        }

        sessionManager.quitToMainMenu();
    });

    inputManager.on('cancel', () => {
        if (Dialog.activeOverlay) {
            Dialog.close(Dialog.activeOverlay);
        }
    });
}

// Helper: Setup How to Play Modal
function setupHowToPlay(effectsManager) {
    const howtoBtn = document.getElementById('howto-btn');
    const howtoModal = document.getElementById('howto-modal');
    const howtoCloseBtn = document.getElementById('howto-close-btn');
    const setupModal = document.getElementById('setup-modal');

    // Initialize probability calculator (once)
    let probabilityCalculator = null;

    howtoBtn.addEventListener('click', () => {
        setupModal.classList.add('hidden');
        howtoModal.classList.remove('hidden');

        // Initialize probability calculator on first open
        if (!probabilityCalculator) {
            probabilityCalculator = new ProbabilityCalculator();
        }
    });

    howtoCloseBtn.addEventListener('click', () => {
        howtoModal.classList.add('hidden');
        setupModal.classList.remove('hidden');
        effectsManager.startIntroMode();
    });
}

// --- Benchmark Tool (console only) ---
window.benchmarkAI = async () => {

    const aiTypes = ['easy', 'medium', 'hard'];

    console.log(`%c🤖 AI Round Robin: ${aiTypes.join(', ')}`, "font-weight:bold; font-size:16px; color:#0ff");

    const tableData = {};
    aiTypes.forEach(row => {
        tableData[row] = {};
        aiTypes.forEach(col => {
            tableData[row][col] = '0/10';
        });
    });

    const runGame = async (ai1Type, ai2Type) => {
        const game = new Game();
        game.startGame({
            humanCount: 0, botCount: 2,
            mapWidth: 4, mapHeight: 4,
            maxDice: 9, diceSides: 6,
            mapStyle: 'random', gameMode: 'classic'
        });

        const aiInstances = new Map();
        game.players.forEach((p, idx) => {
            const aiType = idx === 0 ? ai1Type : ai2Type;
            aiInstances.set(p.id, createAI(aiType, game, p.id));
            p.aiId = aiType;
        });

        let turns = 0;
        while (game.players.filter(p => p.alive).length > 1 && turns < 500) {
            const ai = aiInstances.get(game.currentPlayer.id);
            if (ai) await ai.takeTurn('fast');
            game.endTurn();
            turns++;
        }
        return game.winner ? game.winner.id : -1;
    };

    for (let i = 0; i < aiTypes.length; i++) {
        for (let j = i; j < aiTypes.length; j++) {
            const ai1 = aiTypes[i], ai2 = aiTypes[j];
            console.log(`Matchup: ${ai1} vs ${ai2}...`);
            let wins1 = 0, wins2 = 0;

            for (let g = 0; g < 10; g++) {
                const reversed = g % 2 === 1;
                const winnerId = await runGame(reversed ? ai2 : ai1, reversed ? ai1 : ai2);
                if (winnerId !== -1) {
                    if ((winnerId === 0) === !reversed) wins1++;
                    else wins2++;
                }
                await new Promise(r => setTimeout(r, 0));
            }

            tableData[ai1][ai2] = `${wins1}/${10 - wins1}`;
            tableData[ai2][ai1] = `${wins2}/${10 - wins2}`;
        }
    }

    console.log("✅ Benchmark Complete");
    console.table(tableData);
};


init();
