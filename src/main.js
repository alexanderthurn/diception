import { Assets } from 'pixi.js';
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
import { createScenarioFromGame } from './scenarios/scenario-data.js';
import { TileRenderer } from './render/tile-renderer.js';
import { GamepadCursorManager } from './input/gamepad-cursor-manager.js';
import { AudioController } from './ui/audio-controller.js';
import { GameLog } from './ui/game-log.js';
import { PlayerDashboard } from './ui/player-dashboard.js';
import { DiceHUD } from './ui/dice-hud.js';
import { HighscoreManager } from './ui/highscore-manager.js';
import { GameStatsTracker } from './ui/game-stats-tracker.js';
import { Dialog } from './ui/dialog.js';
import { ProbabilityCalculator } from './ui/probability-calculator.js';

// New modular components
import { ConfigManager } from './ui/config-manager.js';
import { GAME } from './core/constants.js';
import { SessionManager } from './core/session-manager.js';
import { TournamentRunner } from './core/tournament-runner.js';
import { ScenarioBrowser } from './ui/scenario-browser.js';
import { GameStarter } from './core/game-starter.js';
import { GameEventManager } from './ui/game-events.js';
import { LoadingScreen } from './ui/loading-screen.js';
import { initializeProbabilityTables } from './core/probability.js';
import { initCheatCode } from './cheat.js';
import { isTauriContext, isDesktopContext, isAndroid } from './scenarios/user-identity.js';
import { KeyBindingDialog } from './input/key-binding-dialog.js';
import {
    GAME_ACTIONS,
    loadBindings,
    getKeysDisplayName,
    getGamepadButtonsName,
} from './input/key-bindings.js';

// Pre-compute probability tables at startup
initializeProbabilityTables();


// Detect whether this device needs on-screen zoom buttons.
// Touch devices and devices without a precise pointer (mouse) get them.
// If the user actually scrolls with a mouse wheel, the class is removed.
(function detectZoomNeed() {
    const hasTouch = navigator.maxTouchPoints > 0;
    const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
    if (hasTouch || !hasFinePointer) {
        document.body.classList.add('needs-zoom-controls');
    }
    window.addEventListener('wheel', () => {
        document.body.classList.remove('needs-zoom-controls');
    }, { once: true, passive: true });
})();

async function init() {
    // Load spritesheet
    try {
        await Assets.load('gfx/diception.json');
        console.log('Spritesheet loaded');
    } catch (e) {
        console.error('Failed to load spritesheet:', e);
    }

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

    // App Integration (Tauri)
    if (isTauriContext()) {
        const quitBtn = document.getElementById('quit-game-btn');
        if (quitBtn) {
            quitBtn.classList.remove('hidden');
            quitBtn.addEventListener('click', async () => {
                if (await Dialog.confirm('Are you sure you want to exit the game?', 'EXIT GAME?')) {
                    if (window.steam) {
                        window.steam.quit();
                    } else if (isTauriContext()) {
                        try {
                            const { getCurrentWindow } = await import('@tauri-apps/api/window');
                            await getCurrentWindow().close();
                        } catch (e) {
                            console.error('Tauri exit failed:', e);
                            window.close();
                        }
                    } else if (isAndroid()) {
                        window.close();
                    } else {
                        window.close();
                    }
                }
            });
        }
    }

    // Steam Input — initialise in the background; non-blocking, optional
    if (window.steam?.inputInit) {
        import('./input/steam-input-adapter.js').then(({ steamInput }) => {
            steamInput.init().then(ok => {
                if (ok) console.log('[SteamInput] Ready');
            });
        });
    }

    // Steam-specific identity display
    if (window.steam) {
        window.steam.getUserName().then(name => {
            console.log('Steam User:', name);
            const credits = document.querySelector('.credits');
            if (credits) {
                // Remove existing if any to avoid duplicates on hot reload or similar
                const existing = credits.querySelector('.steam-login-info');
                if (existing) existing.remove();
                credits.innerHTML += `<br><span class="steam-login-info" style="color: #66c0f4">Logged in as ${name} (Steam)</span>`;
            }
        });
    }

    // Initialize Input System (create before renderer needs it)
    const inputManager = new InputManager();

    // Initialize Core Components
    const game = new Game();
    const container = document.getElementById('game-container');
    const renderer = new Renderer(container, game, inputManager);
    await renderer.init();

    initCheatCode(game, renderer);

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

    const input = new InputController(game, renderer, inputManager);

    // Loading Screen - onDismiss set after scenarioBrowser is ready
    let onLoadingDismiss = null;
    const loadingScreen = new LoadingScreen(inputManager, {
        onDismiss: () => { if (onLoadingDismiss) onLoadingDismiss(); }
    });
    loadingScreen.setInputController(input);

    // Initialize Gamepad Cursors
    const gamepadCursors = new GamepadCursorManager(game, inputManager);

    // FPS Counter
    setupFPSCounter(renderer);

    // Handle window resize with a small delay for mobile bars to settle
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        // On iOS, the dimensions update can be slightly delayed after the resize event
        const delay = (navigator.userAgent.match(/iPhone|iPad|iPod/i)) ? 100 : 50;
        resizeTimeout = setTimeout(() => {
            const w = window.innerWidth;
            const h = window.innerHeight;

            // Update container size explicitly if needed (though CSS should handle it)
            if (container) {
                container.style.width = `${w}px`;
                container.style.height = `${h}px`;
            }

            if (renderer.app && renderer.app.renderer) {
                renderer.app.renderer.resize(w, h);
            }
            renderer.autoFitCamera();
        }, delay);
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
    mapEditor.setInputManager(inputManager);
    mapEditor.init();

    const configManager = new ConfigManager();
    configManager.loadSavedSettings();

    // Update gamepad status in menu
    inputManager.on('gamepadChange', (indices) => {
        configManager.updateGamepadStatus(indices);
        mapEditor.updateEditorInputHints?.();
    });
    // Initial update in case gamepads are already connected
    configManager.updateGamepadStatus(Array.from(inputManager.connectedGamepadIndices || []));

    const sessionManager = new SessionManager(game, renderer, effectsManager, turnHistory, mapEditor);
    const scenarioBrowser = new ScenarioBrowser(configManager, mapEditor);
    sessionManager.setScenarioBrowser(scenarioBrowser);
    sessionManager.setConfigManager(configManager);
    scenarioBrowser.setEffectsManager(effectsManager);
    await scenarioBrowser.init();
    configManager.setupInputListeners(effectsManager, renderer, () => {
        scenarioBrowser.clearPendingScenario();
    });

    const gameStarter = new GameStarter(
        game, renderer, effectsManager, turnHistory,
        configManager, scenarioBrowser, scenarioManager
    );
    scenarioBrowser.setOnStartGame(() => gameStarter.startGame());

    const showStartupDialogs = async () => {
        if (!localStorage.getItem('dicy_steam_welcome_shown')) {
            const choice = await Dialog.show({
                title: 'Welcome',
                message: 'Choose your game speed:',
                buttons: [
                    { text: 'Beginner (shows all rolls)', value: 'beginner', className: 'tron-btn' },
                    { text: 'Normal', value: 'normal', className: 'tron-btn' },
                    { text: 'Expert (no time to waste)', value: 'expert', className: 'tron-btn' }
                ]
            });
            const speed = choice;
            localStorage.setItem('dicy_gameSpeed', speed);
            localStorage.setItem('dicy_steam_welcome_shown', '1');
            if (configManager.elements?.gameSpeedInput) {
                configManager.elements.gameSpeedInput.value = speed;
            }

            if (speed === 'beginner') {
                const tutorialCampaign = scenarioBrowser.campaignManager.getCampaign('tutorial');
                if (tutorialCampaign) {
                    scenarioBrowser.selectedCampaign = tutorialCampaign;
                    scenarioBrowser.selectAndPlayLevel(0, { immediateStart: true });
                }
            }
        }


        // Web only: show promotional dialog on 2nd visit, then every 5th visit
        if (!window.steam && !localStorage.getItem('dicy_enjoying_dialog_disabled')) {
            const count = parseInt(localStorage.getItem('dicy_web_visit_count') || '0', 10) + 1;
            localStorage.setItem('dicy_web_visit_count', String(count));
            if (count % 5 === 0) {
                const choice = await Dialog.show({
                    title: 'ENJOYING?',
                    message: 'If you want to support this game, you can buy an extended version (including more campaigns):',
                    content: '<div class="dialog-store-links"><p><a href="https://store.steampowered.com/app/STEAM_APPID" target="_blank" rel="noopener" class="highlight-link">Steam</a> – Cloud Saves, Achievements</p><p><a href="https://play.google.com/store/apps/details?id=PLACEHOLDER_PACKAGE" target="_blank" rel="noopener" class="highlight-link">Google Play</a> – Android version</p></div>',
                    buttons: [
                        { text: 'Later', value: true, className: 'tron-btn' },
                        { text: "Don't show again", value: 'dont_show', className: 'tron-btn' }
                    ]
                });
                if (choice === 'dont_show') {
                    localStorage.setItem('dicy_enjoying_dialog_disabled', '1');
                }
            }
        }
    };

    // Show dialogs in parallel with loading
    showStartupDialogs();

    onLoadingDismiss = async () => {
        if (localStorage.getItem('dicy_campaignMode')) {
            if (game.players.length > 0) return;
            document.getElementById('setup-modal').classList.add('hidden');
            await scenarioBrowser.showCampaignView();
            scenarioBrowser.restoreLastSelectedCampaign();
            scenarioBrowser.scenarioBrowserModal.classList.remove('hidden');
            effectsManager.startIntroMode();
        }
    };

    // Initialize Sound & Audio
    const sfxManager = new SoundManager();
    // Pre-render all sound effects during loading for instant playback
    sfxManager.preloadAll().catch(e => console.warn('Sound preload failed:', e));
    const audioController = new AudioController(sfxManager);
    audioController.init();

    // Initialize UI Components
    const highscoreManager = new HighscoreManager();
    const gameStatsTracker = new GameStatsTracker(game);
    const diceHUD = new DiceHUD();
    diceHUD.setDiceDataURL(TileRenderer.diceDataURL);

    // Player name getter function
    const getPlayerName = gameStarter.createPlayerNameGetter();

    // Game Log
    const gameLog = new GameLog(game, turnHistory, scenarioManager);
    gameLog.setPlayerNameGetter(getPlayerName);
    gameLog.setDiceDataURL(TileRenderer.diceDataURL);
    gameLog.setSaveScenarioCallback((index) => openSaveScenarioDialog(index));

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
    gameEventManager.setUIComponents(diceHUD, gameLog, playerDashboard, highscoreManager, sfxManager, effectsManager, gameStatsTracker);
    gameEventManager.setCallbacks(getPlayerName, addLog, startTurnLog, finalizeTurnLog);
    gameEventManager.setScenarioBrowser(scenarioBrowser);
    gameEventManager.init();

    // Refresh UI hints whenever bindings are reloaded after configuration
    inputManager.on('bindingsReloaded', () => gameEventManager.refreshHints());

    // Tournament Runner
    const tournamentRunner = new TournamentRunner(configManager);

    // Setup scenario name click to open campaign browser
    if (configManager.elements.loadedScenarioName) {
        configManager.elements.loadedScenarioName.addEventListener('click', () => {
            scenarioBrowser.open();
        });
    }

    // Setup deselect button to unload scenario
    if (configManager.elements.deselectScenarioBtn) {
        configManager.elements.deselectScenarioBtn.addEventListener('click', () => {
            scenarioBrowser.clearPendingScenario();
            configManager.updateLoadedLevelDisplay(null, null);
        });
    }

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

        if (game.currentPlayer.id === playerId && !game.gameOver) {
            const endTurnText = document.getElementById('end-turn-text');
            const endTurnReinforcement = document.getElementById('end-turn-reinforcement');

            if (newState) {
                // Now on autoplay: disable button
                endTurnBtn.disabled = true;
                if (endTurnText) endTurnText.textContent = 'END TURN';
                if (endTurnReinforcement) endTurnReinforcement.textContent = '';

                setTimeout(async () => {
                    const playerAI = playerAIs.get(playerId);
                    if (playerAI) {
                        await playerAI.takeTurn(gameSpeed);
                    }
                    game.endTurn();
                }, 500);
            } else {
                // Returning to human: enable button and show reinforcements
                endTurnBtn.disabled = false;
                const player = game.players.find(p => p.id === playerId);
                if (player) {
                    const regionDice = game.map.findLargestConnectedRegion(player.id);
                    const storedDice = player.storedDice || 0;
                    if (endTurnText) endTurnText.textContent = 'END TURN';
                    if (endTurnReinforcement) {
                        endTurnReinforcement.textContent = `(+${regionDice + storedDice})`;
                    }
                }
            }
        }
    };

    // UI Button Bindings
    setupUIButtons(game, input, sessionManager, gameStarter, playerDashboard, toggleAutoplay, inputManager);

    // Input Manager Events
    setupInputEvents(game, inputManager, sessionManager);

    // How to Play Modal
    setupHowToPlay(effectsManager, audioController, inputManager);


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

    // Save Scenario
    const openSaveScenarioDialog = async (snapshotIndex) => {
        let scenario = null;
        if (snapshotIndex !== undefined && snapshotIndex !== null && !isNaN(parseInt(snapshotIndex))) {
            scenario = turnHistory.createScenarioFromSnapshot(game, parseInt(snapshotIndex), '');
        } else {
            scenario = createScenarioFromGame(game, '');
        }

        if (scenario) {
            // Ensure ID is removed
            delete scenario.id;

            // Save to user campaign
            await scenarioBrowser.campaignManager.ensureUserCampaign();
            const levelIndex = scenarioBrowser.campaignManager.userCampaign.levels.length + 1;
            scenarioBrowser.campaignManager.setUserLevel(-1, scenario);

            Dialog.alert(`Saved as #${levelIndex}`);
        }
    };
}

// Loading screen logic is now handled in LoadingScreen class in src/ui/loading-screen.js

// Helper: Setup FPS Counter
function setupFPSCounter(renderer) {
    const fpsCounter = document.getElementById('fps-counter');
    const urlParams = new URLSearchParams(window.location.search);
    const showFPS = urlParams.get('fps') === 'true';

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
    const retryGameBtn = document.getElementById('retry-game-btn');
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

    // New Game Button (Back to Campaign when started from campaign)
    newGameBtn.addEventListener('click', async () => {
        if (localStorage.getItem('dicy_campaignMode')) {
            await sessionManager.quitToCampaignScreen();
        } else {
            sessionManager.quitToMainMenu();
        }
    });

    // Retry Current Game Button
    if (retryGameBtn) {
        retryGameBtn.addEventListener('click', () => {
            sessionManager.restartCurrentGame((msg, type) => {
                const gameLog = sessionManager.gameLog;
                if (gameLog && gameLog.addEntry) {
                    gameLog.addEntry(msg, type);
                }
            }, gameStarter.getAutoplayPlayers());
        });
    }

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
            const humanIndex = inputManager.getHumanIndex(data.index);
            if (game.currentPlayer.id !== humanIndex) {
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
            if (isTauriContext() && game.players.length === 0) {
                Dialog.confirm('Are you sure you want to exit to desktop?', 'QUIT GAME?').then(async choice => {
                    if (choice) {
                        if (window.steam) {
                            window.steam.quit();
                        } else if (isTauriContext()) {
                            try {
                                const { getCurrentWindow } = await import('@tauri-apps/api/window');
                                await getCurrentWindow().close();
                            } catch (e) {
                                console.error('Tauri exit failed:', e);
                                window.close();
                            }
                        } else if (isAndroid()) {
                            window.close();
                        }
                    }
                });
                return;
            }

            if (game.players.length > 0) {
                sessionManager.effectsManager?.stopIntroMode();
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
function setupHowToPlay(effectsManager, audioController, inputManager) {
    const howtoBtn = document.getElementById('howto-btn');
    const howtoModal = document.getElementById('howto-modal');
    const howtoCloseBtn = document.getElementById('howto-close-btn');
    const setupModal = document.getElementById('setup-modal');
    const keepCampaignsRow = document.getElementById('howto-keep-campaigns-row');
    const keepCampaignsCheck = document.getElementById('howto-keep-campaigns');
    const clearStorageBtn = document.getElementById('howto-clear-storage-btn');
    const musicListEl = document.getElementById('howto-music-list');

    // Initialize probability calculator (once)
    let probabilityCalculator = null;

    function refreshHowtoSections() {
        // Show "Keep campaigns" only if user has a campaign
        const userCampaign = localStorage.getItem('dicy_userCampaign');
        const hasUserCampaign = userCampaign && userCampaign !== '[]' && userCampaign !== '{}';
        keepCampaignsRow.classList.toggle('hidden', !hasUserCampaign);
        if (hasUserCampaign) keepCampaignsCheck.checked = true;

        // Build music list with buttons and active toggles
        if (audioController && musicListEl) {
            const inactive = new Set(audioController.getInactiveTracks());
            musicListEl.innerHTML = audioController.availableSongs.map(filename => {
                const isActive = !inactive.has(filename);
                const displayName = filename.replace(/\.(mp3|ogg)$/i, '');
                return `<li class="howto-music-item">
                    <span class="howto-music-name" data-filename="${filename.replace(/"/g, '&quot;')}">${displayName}</span>
                    <button type="button" class="howto-music-toggle tron-btn small ${isActive ? 'active' : ''}" data-filename="${filename.replace(/"/g, '&quot;')}" title="${isActive ? 'Active in playlist' : 'Inactive (excluded from loop)'}">${isActive ? '✓' : '○'}</button>
                </li>`;
            }).join('');
        }
    }

    function bindMusicToggles() {
        if (!musicListEl) return;

        // Name click -> Play song
        musicListEl.querySelectorAll('.howto-music-name').forEach(el => {
            el.addEventListener('click', () => {
                const filename = el.getAttribute('data-filename');
                audioController.playSong(filename);
                refreshHowtoSections();
                bindMusicToggles();
            });
        });

        // Toggle click -> Update playlist + Play if enabling
        musicListEl.querySelectorAll('.howto-music-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const filename = btn.getAttribute('data-filename');
                const inactive = new Set(audioController.getInactiveTracks());
                const isActive = !inactive.has(filename);
                const newState = !isActive;

                audioController.setTrackActive(filename, newState);

                if (newState) {
                    audioController.playSong(filename);
                } else if (audioController.availableSongs[audioController.currentSongIndex] === filename && audioController.musicPlaying) {
                    audioController.handleMusicToggle();
                }

                refreshHowtoSections();
                bindMusicToggles();
            });
        });
    }

    function clearAllStorage() {
        const keepCampaigns = keepCampaignsCheck.checked && keepCampaignsRow && !keepCampaignsRow.classList.contains('hidden');
        let savedCampaign = null;
        if (keepCampaigns) {
            savedCampaign = localStorage.getItem('dicy_userCampaign');
        }
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key) localStorage.removeItem(key);
        }
        if (savedCampaign !== null) {
            localStorage.setItem('dicy_userCampaign', savedCampaign);
        }
    }

    // Controls table: fixed rows that are not configurable
    const FIXED_CONTROLS = [
        { label: 'Navigate Cursor', keyboard: '-', gamepad: 'Left Stick' },
        { label: 'Zoom', keyboard: 'Wheel', gamepad: 'L2 / R2' },
        { label: 'Cursor Speed', keyboard: '-', gamepad: 'L1 / R1' },
    ];

    // Gamepad column for keyboardOnly actions (uses analog stick, not a button)
    const GAMEPAD_FIXED_LABELS = {
        pan_up: 'Right Stick',
        pan_down: 'Right Stick',
        pan_left: 'Right Stick',
        pan_right: 'Right Stick',
    };

    function refreshControlsSection() {
        const tbody = document.getElementById('controls-table-body');
        const configArea = document.getElementById('controls-configure-area');
        if (!tbody || !configArea) return;

        const bindings = loadBindings();

        // Build tbody rows
        let html = '';

        // Fixed rows first
        for (const row of FIXED_CONTROLS) {
            html += `<tr><td>${row.label}</td><td>${row.keyboard}</td><td>${row.gamepad}</td></tr>`;
        }

        // Configurable actions
        for (const action of GAME_ACTIONS) {
            const kbCodes = bindings.keyboard[action.id] || [];
            const kbDisplay = getKeysDisplayName(kbCodes);
            let gpDisplay;
            if (action.keyboardOnly) {
                gpDisplay = GAMEPAD_FIXED_LABELS[action.id] || 'Right Stick';
            } else {
                const gpBtns = bindings.gamepad[action.id] || [];
                gpDisplay = getGamepadButtonsName(gpBtns);
            }
            html += `<tr><td>${action.label}</td><td>${kbDisplay}</td><td>${gpDisplay}</td></tr>`;
        }

        tbody.innerHTML = html;

        // Build configure buttons
        let configHtml = '<div class="controls-configure-row">';
        configHtml += '<button class="tron-btn small" id="configure-keyboard-btn">CONFIGURE KEYBOARD</button>';

        const connectedGamepads = Array.from(inputManager.connectedGamepadIndices || []).sort();
        connectedGamepads.forEach((rawIdx) => {
            const humanIdx = inputManager.getHumanIndex(rawIdx);
            const color = GAME.HUMAN_COLORS[humanIdx % GAME.HUMAN_COLORS.length];
            const colorHex = '#' + color.toString(16).padStart(6, '0');
            configHtml += `<button class="tron-btn small" data-gamepad-index="${rawIdx}" style="border-color:${colorHex};color:${colorHex}">CONFIGURE GAMEPAD ${humanIdx + 1}</button>`;
        });

        configHtml += '</div>';
        configArea.innerHTML = configHtml;

        // Keyboard configure button
        document.getElementById('configure-keyboard-btn')?.addEventListener('click', async () => {
            const saved = await KeyBindingDialog.configureKeyboard(inputManager);
            if (saved) refreshControlsSection();
        });

        // Gamepad configure buttons
        configArea.querySelectorAll('[data-gamepad-index]').forEach(btn => {
            const rawIdx = parseInt(btn.getAttribute('data-gamepad-index'));
            btn.addEventListener('click', async () => {
                const saved = await KeyBindingDialog.configureGamepad(rawIdx, inputManager);
                if (saved) refreshControlsSection();
            });
        });
    }

    // Refresh configure buttons when gamepads connect/disconnect
    if (inputManager) {
        inputManager.on('gamepadChange', () => refreshControlsSection());
    }

    howtoBtn.addEventListener('click', () => {
        setupModal.classList.add('hidden');
        howtoModal.classList.remove('hidden');
        effectsManager.stopIntroMode();
        refreshHowtoSections();
        bindMusicToggles();
        refreshControlsSection();

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

    clearStorageBtn?.addEventListener('click', async () => {
        const keepCampaigns = keepCampaignsCheck?.checked && keepCampaignsRow && !keepCampaignsRow.classList.contains('hidden');
        const msg = keepCampaigns
            ? 'Clear all stored data except your campaigns?'
            : 'Clear all stored data? This cannot be undone.';
        const ok = await Dialog.confirm(msg, 'CLEAR STORAGE?');
        if (ok) {
            clearAllStorage();
            Dialog.alert('Storage cleared. The page will reload.');
            window.location.reload();
        }
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
