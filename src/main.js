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

// Global Dice Export Function
window.exportDiceIcon = async (options = {}) => {
    const {
        size = 512,
        count = 1,
        color = 0x9b59b6, // Default purple
        sides = 6
    } = options;

    console.log('Exporting dice icon with options:', { size, count, color, sides });

    // Ensure renderer is initialized
    if (!window.gameApp) {
        console.error('Game app not found. Game might not be fully initialized.');
        return;
    }

    try {
        // Create the tile container
        const container = TileRenderer.createTile({
            size,
            diceCount: count,
            diceSides: sides,
            color,
            fillAlpha: 1.0, // Solid opacity for icon
            showBorder: true
        });

        // Use PixiJS extract to get base64 image
        const image = await window.gameApp.renderer.extract.image(container);

        // Convert the HTMLImageElement to a data URL if needed, or it might already be one source
        // extract.image returns an HTMLImageElement. We can get the src from it.
        const dataUrl = image.src;

        // Create download link
        const link = document.createElement('a');
        link.download = `dice_icon_s${sides}_c${count}_${size}px.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log('Dice icon exported successfully!');

        // Cleanup
        container.destroy({ children: true });

    } catch (err) {
        console.error('Failed to export dice icon:', err);
    }
};

async function init() {
    // Show package version on loading screen early
    try {
        const loadingVersionEl = document.getElementById('loading-version');
        if (loadingVersionEl) loadingVersionEl.textContent = `v${import.meta.env.VITE_APP_VERSION}`;
    } catch (e) {
        console.warn('Failed to show loading version', e);
    }

    // 0. Steam Integration
    if (window.steam) {
        // Show Steam-only Quit button
        const quitBtn = document.getElementById('quit-game-btn');
        const quitConfirmModal = document.getElementById('quit-confirm-modal');
        const quitConfirmBtn = document.getElementById('quit-confirm-btn');
        const quitCancelBtn = document.getElementById('quit-cancel-btn');

        if (quitBtn) {
            quitBtn.classList.remove('hidden');
            quitBtn.addEventListener('click', () => {
                quitConfirmModal.classList.remove('hidden');
            });
        }

        if (quitConfirmBtn) {
            quitConfirmBtn.addEventListener('click', () => {
                window.steam.quit();
            });
        }

        if (quitCancelBtn) {
            quitCancelBtn.addEventListener('click', () => {
                quitConfirmModal.classList.add('hidden');
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

    // 1. Initialize Game Logic
    const game = new Game();

    // 2. Initialize Renderer
    const container = document.getElementById('game-container');
    const renderer = new Renderer(container, game);
    await renderer.init();

    // Expose app for export function
    window.gameApp = renderer.app;

    // Apply master dice texture to any static UI elements
    document.querySelectorAll('.dice-icon-sprite').forEach(el => {
        el.style.maskImage = `url(${TileRenderer.diceDataURL})`;
        el.style.webkitMaskImage = `url(${TileRenderer.diceDataURL})`;
    });

    // 2.5 Initialize Effects System (completely separate from renderer)
    const effectsManager = new EffectsManager(renderer.app.stage, game, {
        tileSize: 60,
        gap: 4,
        renderer: renderer
    });
    // Attach to world container so effects follow camera
    effectsManager.setWorldTransform(renderer.rootContainer);
    // Start intro mode effects (setup screen)
    effectsManager.startIntroMode();

    // 3. Initialize Input Manager (unified keyboard/gamepad)
    const inputManager = new InputManager();

    // Hide loading screen after initialization
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.classList.add('fade-out');
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 800);
    }

    // 4. Initialize Input Controller (handles game input logic)
    const input = new InputController(game, renderer, inputManager);

    // 4.5 Initialize Gamepad Cursors
    const gamepadCursors = new GamepadCursorManager(game, inputManager);

    // === FPS Counter Logic ===
    const fpsCounter = document.getElementById('fps-counter');
    const urlParams = new URLSearchParams(window.location.search);
    const showFPS = urlParams.get('fps') !== 'false'; // Default to true if not explicitly false

    // Track last measured FPS and provide an update helper so resize can refresh resolution text immediately
    let lastFPS = 0;
    let updateFPSStatus = null;

    if (showFPS && fpsCounter && renderer.app) {
        fpsCounter.classList.remove('hidden');
        let frameCount = 0;
        let lastTime = performance.now();

        // Helper updates the displayed string with lastFPS, package version and canvas resolution
        updateFPSStatus = () => {
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
    }

    // Handle window resize
    window.addEventListener('resize', () => {
        renderer.autoFitCamera();
        if (typeof updateFPSStatus === 'function') updateFPSStatus();
    });

    // Wire tile selection to effects (keeping input controller unchanged)
    const originalSelect = input.select.bind(input);
    input.select = (x, y) => {
        originalSelect(x, y);
        effectsManager.onTileClick(x, y);
    };

    // 5. Initialize AI System
    // Map player ID -> AI instance (set during game start)
    let playerAIs = new Map();
    const clearPlayerAIs = () => {
        playerAIs.clear();
    };

    // Current selected AI difficulty for all bots (default easy)
    let selectedBotAI = localStorage.getItem('dicy_botAI') || 'easy';

    // 6. Initialize Scenario System
    const scenarioManager = new ScenarioManager();
    const turnHistory = new TurnHistory();
    let pendingScenario = null; // Scenario to load when starting game

    // 7. Initialize Map Editor
    const mapEditor = new MapEditor(scenarioManager);
    mapEditor.setRenderer(renderer);
    mapEditor.init();

    // Helper to get consistent player names
    const getPlayerName = (player) => {
        if (player.isBot) {
            const aiRunner = playerAIs.get(player.id);
            return aiRunner ? `${aiRunner.name} ${player.id}` : `Bot ${player.id}`;
        }
        return `Human ${player.id + 1}`;
    };

    // === Highscore System (using HighscoreManager module) ===
    const highscoreManager = new HighscoreManager();

    // Wrapper functions for backward compatibility
    const recordWin = (winnerName) => highscoreManager.recordWin(winnerName);
    const displayHighscores = (currentWinnerName) => highscoreManager.display(currentWinnerName);

    // 5. Initialize Sound Effects Manager
    const sfxManager = new SoundManager();

    // 6. Initialize Audio Controller (handles music playlist and SFX UI)
    const audioController = new AudioController(sfxManager);
    audioController.init();

    // Alias for easier access in game events
    const sfx = sfxManager;

    // Per-player autoplay state
    const autoplayPlayers = new Set();

    // UI Bindings
    const endTurnBtn = document.getElementById('end-turn-btn');
    const newGameBtn = document.getElementById('new-game-btn');
    const autoWinBtn = document.getElementById('auto-win-btn');
    const playerText = document.getElementById('player-turn');
    const turnIndicator = document.getElementById('turn-indicator');

    // Dice Result HUD (using DiceHUD module)
    const diceHUD = new DiceHUD();
    diceHUD.setDiceDataURL(TileRenderer.diceDataURL);

    // Zoom Controls
    document.getElementById('zoom-in-btn').addEventListener('click', () => {
        renderer.zoom(-1, window.innerWidth / 2, window.innerHeight / 2);
    });

    document.getElementById('zoom-out-btn').addEventListener('click', () => {
        renderer.zoom(1, window.innerWidth / 2, window.innerHeight / 2);
    });

    // Turn-based log grouping (using GameLog module)
    const gameLog = new GameLog(game, turnHistory, scenarioManager);
    gameLog.setPlayerNameGetter(getPlayerName);
    gameLog.setDiceDataURL(TileRenderer.diceDataURL);

    // Wrapper functions for backward compatibility
    const startTurnLog = (player) => gameLog.startTurnLog(player, autoplayPlayers);
    const finalizeTurnLog = (reinforcements, saved = 0) => gameLog.finalizeTurnLog(reinforcements, saved);
    const addLog = (message, type = '') => gameLog.addEntry(message, type);

    // Dashboard UI (using PlayerDashboard module)
    const playerDashboard = new PlayerDashboard(game);
    playerDashboard.setPlayerNameGetter(getPlayerName);
    playerDashboard.setDiceDataURL(TileRenderer.diceDataURL);
    playerDashboard.setAutoplayPlayers(autoplayPlayers);

    const toggleAutoplay = (playerId, forceState) => {
        const isCurrentlyAutoplay = autoplayPlayers.has(playerId);
        const newState = forceState !== undefined ? forceState : !isCurrentlyAutoplay;

        if (newState) {
            autoplayPlayers.add(playerId);
        } else {
            autoplayPlayers.delete(playerId);
        }

        playerDashboard.update();

        // If it's currently this player's turn and we just enabled autoplay, trigger AI
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

    // Set up the autoplay toggle callback after toggleAutoplay is defined
    playerDashboard.setAutoplayToggleCallback(toggleAutoplay);
    playerDashboard.init();

    const checkDominance = () => {
        // Dominance check logic can be used for other purposes
        // autoWinBtn is now controlled in turnStart for per-player autoplay toggle
    };

    autoWinBtn.addEventListener('click', () => {
        // If any autoplay is active, disable ALL autoplay modes
        if (autoplayPlayers.size > 0) {
            autoplayPlayers.clear();
            autoWinBtn.classList.remove('active');
            playerDashboard.update();
        } else if (game.currentPlayer && !game.currentPlayer.isBot) {
            // No autoplay active - toggle for current player only
            toggleAutoplay(game.currentPlayer.id);
            if (autoplayPlayers.has(game.currentPlayer.id)) {
                autoWinBtn.classList.add('active');
            } else {
                autoWinBtn.classList.remove('active');
            }
        }
    });

    endTurnBtn.addEventListener('click', () => {
        const humanPlayers = game.players.filter(p => !p.isBot);
        if (humanPlayers.length > 1) {
            input.deselect();
        }
        game.endTurn();
    });



    // Helper to completely reset game session
    // Helper to reset UI components
    const resetUI = () => {
        // Clear logs
        gameLog.clear();

        // Hide HUDs
        diceHUD.hide();
        turnIndicator.classList.add('hidden');
        endTurnBtn.classList.add('hidden');
        autoWinBtn.classList.add('hidden');
        playerDashboard.hide();
        newGameBtn.classList.add('hidden');
    };

    // Helper to completely reset game session
    const resetGameSession = () => {
        // Close editor if open
        if (mapEditor.isOpen) {
            mapEditor.close();
        }

        // Reset game logic
        game.reset();
        turnHistory.clear();
        turnHistory.clearAutoSave();

        resetUI();

        // Clear renderer
        renderer.draw(); // Will draw empty grid

        // Hide other modals
        document.getElementById('game-over-modal').classList.add('hidden');
    };

    const quitToMainMenu = () => {
        resetGameSession();
        setupModal.classList.remove('hidden');
        document.querySelectorAll('.game-ui').forEach(el => el.classList.add('hidden'));
    };

    const restartCurrentGame = () => {
        // Close editor if open
        if (mapEditor.isOpen) {
            mapEditor.close();
        }

        const success = turnHistory.restoreInitialSnapshot(game);

        if (success) {
            resetUI();

            // Restore UI visibility
            document.querySelectorAll('.game-ui').forEach(el => el.classList.remove('hidden'));
            document.getElementById('game-over-modal').classList.add('hidden');
            document.getElementById('dash-toggle').textContent = '[-]';

            // Redraw and restart
            renderer.draw();
            playerDashboard.update();
            game.emit('turnStart', { player: game.currentPlayer });
            renderer.forceUpdate();

            // Clear any lingering auto-save from the finished game
            turnHistory.clearAutoSave();

            addLog('🔄 Game Restarted', 'info');
        }
    };

    newGameBtn.addEventListener('click', () => {
        quitToMainMenu();
    });

    // Connect InputController end turn callback
    input.setEndTurnCallback(() => {
        // Don't end turn if no game started or menu is open
        if (game.players.length === 0) return;
        if (!setupModal.classList.contains('hidden')) return;
        if (endTurnBtn.disabled) return;
        const humanPlayers = game.players.filter(p => !p.isBot);
        if (humanPlayers.length > 1) {
            input.deselect();
        }
        game.endTurn();
    });

    // Subscribe to InputManager events
    inputManager.on('endTurn', () => {
        // Don't end turn if no game started or menu is open
        if (game.players.length === 0) return;
        const isMenuOpen = !!document.querySelector('.modal:not(.hidden), .editor-overlay:not(.hidden)');
        if (isMenuOpen) return;
        if (endTurnBtn.disabled) return;
        const humanPlayers = game.players.filter(p => !p.isBot);
        if (humanPlayers.length > 1) {
            input.deselect();
        }
        game.endTurn();
    });


    // ESC key opens settings/menu
    inputManager.on('menu', () => {
        const setupModal = document.getElementById('setup-modal');
        const quitConfirmModal = document.getElementById('quit-confirm-modal');
        const isSetupOpen = !setupModal.classList.contains('hidden');
        const isQuitConfirmOpen = !quitConfirmModal.classList.contains('hidden');
        const isGameOverOpen = !document.getElementById('game-over-modal').classList.contains('hidden');

        if (isGameOverOpen) return;

        if (isQuitConfirmOpen) {
            quitConfirmModal.classList.add('hidden');
            return;
        }

        if (isSetupOpen) {
            // If at main menu (no game started), show quit confirmation on Steam
            if (window.steam && game.players.length === 0) {
                document.getElementById('quit-confirm-modal').classList.remove('hidden');
                return;
            }

            // Only allow closing if a game has actually started
            if (game.players.length > 0) {
                setupModal.classList.add('hidden');
                document.querySelectorAll('.game-ui').forEach(el => el.classList.remove('hidden'));
            }
            return;
        }

        // Show setup modal (new game menu)
        quitToMainMenu();
    });

    // Q / Gamepad X closes modals
    inputManager.on('cancel', () => {
        const quitConfirmModal = document.getElementById('quit-confirm-modal');
        if (!quitConfirmModal.classList.contains('hidden')) {
            quitConfirmModal.classList.add('hidden');
        }
    });

    // Space/Enter/Gamepad A triggers start game when in setup menu






    game.on('turnStart', (data) => {
        // Hide dice result HUD when turn starts
        diceHUD.hide();

        // Auto-save at start of turn
        turnHistory.saveAutoSave(game);

        const name = data.player.isBot ? `Bot ${data.player.id}` : `Player ${data.player.id}`;
        playerText.textContent = `${name}'s Turn`;
        playerText.style.color = '#' + data.player.color.toString(16).padStart(6, '0');

        // Start a new turn group in the log
        startTurnLog(data.player);

        // Check if this player should be automated (bot OR autoplay enabled)
        const shouldAutomate = data.player.isBot || autoplayPlayers.has(data.player.id);

        // Count human players
        const humanCount = game.players.filter(p => !p.isBot && p.alive).length;

        // Update turn indicator (Beginner mode only, bots only - replaces End Turn button)
        if (gameSpeed === 'beginner' && data.player.isBot) {
            const colorHex = '#' + data.player.color.toString(16).padStart(6, '0');
            // Get AI name from player AI registry
            const playerAI = playerAIs.get(data.player.id);
            const aiName = playerAI?.name || 'Bot';
            turnIndicator.innerHTML = `<span style="color:${colorHex}">${aiName} ${data.player.id}</span> is playing...`;
            turnIndicator.classList.remove('hidden');
        } else {
            turnIndicator.classList.add('hidden');
        }

        // Play turn sound for human players only
        if (!data.player.isBot && !autoplayPlayers.has(data.player.id)) {
            sfx.turnStart();
        }

        if (shouldAutomate) {
            // Hide End Turn button during bot turns
            endTurnBtn.classList.add('hidden');
            endTurnBtn.disabled = true;

            // Show auto-win button if any human has autoplay enabled (so they can stop it)
            // This works even during bot turns
            if (gameSpeed !== 'beginner' && autoplayPlayers.size > 0) {
                const playerColorHex = '#' + data.player.color.toString(16).padStart(6, '0');
                autoWinBtn.classList.remove('hidden');
                autoWinBtn.classList.add('active');
                autoWinBtn.style.boxShadow = `0 0 15px ${playerColorHex}`;
                autoWinBtn.style.borderColor = playerColorHex;
            } else {
                autoWinBtn.classList.add('hidden');
            }
            endTurnBtn.textContent = 'END TURN';
            // In fast mode, minimal delay; otherwise use normal delays
            // Calculate delay based on game speed
            let delay = 500; // Default slow
            if (gameSpeed === 'expert') {
                delay = 10;
            } else if (gameSpeed === 'normal') {
                delay = data.player.isBot ? 300 : 500;
            } else if (gameSpeed === 'beginner') {
                delay = data.player.isBot ? 800 : 1000;
            }

            setTimeout(async () => {
                // Use AI for this player
                const playerAI = playerAIs.get(data.player.id);
                if (playerAI) {
                    await playerAI.takeTurn(gameSpeed);
                }
                // End turn after AI finishes (or immediately if no AI)
                game.endTurn();
            }, delay);
        } else {
            // Show End Turn button for human turns
            endTurnBtn.classList.remove('hidden');
            endTurnBtn.disabled = false;
            // Show expected dice reinforcement on button (no emoji)
            const regionDice = game.map.findLargestConnectedRegion(data.player.id);
            const storedDice = data.player.storedDice || 0;
            endTurnBtn.textContent = `END TURN (+${regionDice + storedDice})`;

            // Set button glow to player color
            const playerColorHex = '#' + data.player.color.toString(16).padStart(6, '0');
            endTurnBtn.style.boxShadow = `0 0 15px ${playerColorHex}`;
            endTurnBtn.style.borderColor = playerColorHex;

            // Show autoplay button in Normal/Fast mode (not Beginner)
            if (gameSpeed !== 'beginner') {
                autoWinBtn.classList.remove('hidden');
                autoWinBtn.style.boxShadow = `0 0 15px ${playerColorHex}`;
                autoWinBtn.style.borderColor = playerColorHex;
                // Update active state
                if (autoplayPlayers.has(data.player.id)) {
                    autoWinBtn.classList.add('active');
                } else {
                    autoWinBtn.classList.remove('active');
                }
            } else {
                autoWinBtn.classList.add('hidden');
            }

            // Validate existing selection if any
            if (input.selectedTile) {
                const tile = game.map.getTile(input.selectedTile.x, input.selectedTile.y);
                if (!tile || tile.owner !== data.player.id || tile.dice <= 1) {
                    input.deselect();
                }
            }
        }

        checkDominance();
    });

    // Attack result logging
    game.on('attackResult', (result) => {
        if (result.error) return;

        // Auto-save after every attack/step
        turnHistory.saveAutoSave(game);

        // Track attack stats in game log
        if (result.attackerId === game.currentPlayer.id) {
            gameLog.recordAttack(result.won);
        }

        const attacker = game.players.find(p => p.id === result.attackerId);
        const defender = game.players.find(p => p.id === result.defenderId);
        const defenderName = defender ? getPlayerName(defender) : `Player ${result.defenderId}`;

        const attackRoll = result.attackerRolls?.join('+') || '?';
        const defendRoll = result.defenderRolls?.join('+') || '?';
        const attackSum = result.attackerRolls?.reduce((a, b) => a + b, 0) || '?';
        const defendSum = result.defenderRolls?.reduce((a, b) => a + b, 0) || '?';

        const outcome = result.won ? '✓' : '✗';
        addLog(`→ ${defenderName}: [${attackSum}] vs [${defendSum}] ${outcome}`, result.won ? 'attack-win' : 'attack-loss');

        // Show dice result in HUD (using DiceHUD module)
        const isHumanAttacker = attacker && !attacker.isBot && !autoplayPlayers.has(attacker.id);
        diceHUD.showAttackResult(result, attacker, defender, gameSpeed, autoplayPlayers);

        // Play sound for attackers
        // In Beginner mode, play sounds for all attacks (including bots)
        // In other modes, only play for human attackers
        const shouldPlaySound = isHumanAttacker || (gameSpeed === 'beginner' && attacker);

        if (shouldPlaySound) {
            if (result.won) {
                sfx.attackWin();
            } else {
                sfx.attackLose();
            }
        }

        // Update End Turn button for human attackers
        if (isHumanAttacker) {
            const regionDice = game.map.findLargestConnectedRegion(attacker.id);
            const storedDice = attacker.storedDice || 0;
            endTurnBtn.textContent = `END TURN (+${regionDice + storedDice})`;
        }

        checkDominance();
    });

    game.on('playerEliminated', (player) => {
        const name = player.isBot ? `Bot ${player.id}` : `Player ${player.id}`;
        addLog(`☠️ ${name} has been eliminated!`, 'death');
        sfx.playerEliminated();
    });

    game.on('reinforcements', (data) => {
        // Add reinforcement log entry
        let reinforceMsg = `+${data.placed}`;
        if (data.stored > 0) {
            reinforceMsg += ` (${data.stored} saved)`; // shortened
            addLog(reinforceMsg, 'reinforce-warning'); // Use warning color/style for attention
        } else if (data.placed > 0) {
            addLog(reinforceMsg, 'reinforce');
        }

        // Finalize the turn log with reinforcement info
        finalizeTurnLog(data.placed, data.stored);

        // Show reinforcement popup in HUD (using DiceHUD module)
        diceHUD.showReinforcements(data, gameSpeed, autoplayPlayers);

        // Play sound for human players only
        if (!data.player.isBot && !autoplayPlayers.has(data.player.id)) {
            sfx.reinforce();
            sfx.resetWinStreak(); // Reset streak on end of turn
        }
    });

    // Setup Logic
    const setupModal = document.getElementById('setup-modal');
    const startBtn = document.getElementById('start-game-btn');
    const mapSizeInput = document.getElementById('map-size');
    const mapSizeVal = document.getElementById('map-size-val');
    const mapSizeLabel = document.getElementById('map-size-label');
    const mapSizeRow = document.querySelector('.map-size-row');
    const mapStyleGroup = document.getElementById('map-style-group');
    const loadedScenarioName = document.getElementById('loaded-scenario-name');
    const humanCountInput = document.getElementById('human-count');
    const botCountInput = document.getElementById('bot-count');
    const maxDiceInput = document.getElementById('max-dice');
    const maxDiceVal = document.getElementById('max-dice-val');
    const diceSidesInput = document.getElementById('dice-sides');
    const diceSidesVal = document.getElementById('dice-sides-val');
    const gameSpeedInput = document.getElementById('game-speed');
    const effectsQualityInput = document.getElementById('effects-quality');
    const mapStyleInput = document.getElementById('map-style');
    const gameModeInput = document.getElementById('game-mode');

    // How to play modal logic
    const howtoBtn = document.getElementById('howto-btn');
    const howtoModal = document.getElementById('howto-modal');
    const howtoCloseBtn = document.getElementById('howto-close-btn');

    howtoBtn.addEventListener('click', () => {
        setupModal.classList.add('hidden');
        howtoModal.classList.remove('hidden');
    });

    howtoCloseBtn.addEventListener('click', () => {
        howtoModal.classList.add('hidden');
        setupModal.classList.remove('hidden');
    });

    // === Bot AI Selection ===
    const botAISelect = document.getElementById('bot-ai-select');

    // AI selection change handler
    botAISelect.addEventListener('change', () => {
        selectedBotAI = botAISelect.value;
        localStorage.setItem('dicy_botAI', selectedBotAI);
    });

    // Load saved AI selection
    if (selectedBotAI && Array.from(botAISelect.options).some(o => o.value === selectedBotAI)) {
        botAISelect.value = selectedBotAI;
    }

    // === Tournament Mode ===
    const tournamentConfig = document.getElementById('tournament-config');
    const tournamentGamesInput = document.getElementById('tournament-games');
    const runTournamentBtn = document.getElementById('run-tournament-btn');
    const tournamentResultsModal = document.getElementById('tournament-results-modal');
    const tournamentResults = document.getElementById('tournament-results');
    const tournamentCloseBtn = document.getElementById('tournament-close-btn');
    const tournamentAgainBtn = document.getElementById('tournament-again-btn');
    const tournamentDoneBtn = document.getElementById('tournament-done-btn');

    // Show tournament config when humans = 0
    humanCountInput.addEventListener('change', () => {
        const humans = parseInt(humanCountInput.value);
        tournamentConfig.style.display = humans === 0 ? 'block' : 'none';
    });

    const runTournament = async () => {
        const gameCount = parseInt(tournamentGamesInput.value);
        const botCount = parseInt(botCountInput.value);

        if (botCount < 2) {
            alert('Need at least 2 bots for a tournament');
            return;
        }

        const sizeValue = parseInt(mapSizeInput.value);
        const sizePreset = getMapSize(sizeValue);

        const configSummary = `<div class="tournament-summary">${sizePreset.width}x${sizePreset.height} sides:${diceSidesInput.value} max:${maxDiceInput.value}</div>`;

        // Show progress
        tournamentResults.innerHTML = `
            ${configSummary}
            <div class="tournament-progress">
                <div>Running tournament: <span id="tournament-progress-text">0/${gameCount}</span></div>
                <div class="tournament-progress-bar">
                    <div class="tournament-progress-fill" id="tournament-progress-fill" style="width: 0%"></div>
                </div>
            </div>
        `;
        setupModal.classList.add('hidden');
        tournamentResultsModal.classList.remove('hidden');

        const results = {};

        // AI difficulty name mapping
        const aiNames = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
        const getAIName = (aiId) => aiNames[aiId] || aiId;

        for (let i = 0; i < gameCount; i++) {
            // Create a headless game
            const tourneyGame = new Game();
            tourneyGame.startGame({
                humanCount: 0,
                botCount,
                mapWidth: sizePreset.width,
                mapHeight: sizePreset.height,
                maxDice: parseInt(maxDiceInput.value),
                diceSides: parseInt(diceSidesInput.value),
                mapStyle: mapStyleInput.value,
                gameMode: gameModeInput.value
            });

            // Assign names and create AI instances for each player
            const aiInstances = new Map();
            tourneyGame.players.forEach(p => {
                const aiId = selectedBotAI || 'easy';
                const ai = createAI(aiId, tourneyGame, p.id);
                aiInstances.set(p.id, ai);
                p.name = `${ai.name} ${p.id}`;
                p.aiId = aiId;
            });

            // Run game to completion (fast mode - no delays)
            let turns = 0;
            const maxTurns = 2000;

            while (!tourneyGame.gameOver && turns < maxTurns) {
                const currentPlayer = tourneyGame.currentPlayer;
                const ai = aiInstances.get(currentPlayer.id);

                if (ai) {
                    try {
                        await ai.takeTurn('fast');
                    } catch (e) {
                        console.warn(`Tournament AI Turn Error:`, e);
                    }
                }
                tourneyGame.endTurn();
                turns++;
            }

            // Record result
            if (tourneyGame.winner) {
                const winnerId = tourneyGame.winner.id;
                const ai = aiInstances.get(winnerId);
                const key = `${ai?.name || 'Bot'} ${winnerId}`;
                results[key] = (results[key] || 0) + 1;
            }

            // Update progress
            const progress = ((i + 1) / gameCount * 100).toFixed(1);
            document.getElementById('tournament-progress-text').textContent = `${i + 1}/${gameCount}`;
            document.getElementById('tournament-progress-fill').style.width = progress + '%';

            // Yield to UI
            if (i % 10 === 0) {
                await new Promise(r => setTimeout(r, 0));
            }
        }

        // Show results
        const sortedResults = Object.entries(results)
            .sort((a, b) => b[1] - a[1]);

        tournamentResults.innerHTML = configSummary + sortedResults.map(([name, wins], index) => {
            const percent = (wins / gameCount * 100).toFixed(1);
            return `
                <div class="tournament-result-row ${index === 0 ? 'winner' : ''}">
                    <span class="tournament-rank">${index === 0 ? '🏆' : index + 1}</span>
                    <span class="tournament-ai-name">${name}</span>
                    <span class="tournament-wins">${wins} wins</span>
                    <span class="tournament-percent">${percent}%</span>
                </div>
            `;
        }).join('');
    };

    runTournamentBtn.addEventListener('click', runTournament);
    tournamentAgainBtn.addEventListener('click', runTournament);
    tournamentCloseBtn.addEventListener('click', () => {
        tournamentResultsModal.classList.add('hidden');
        setupModal.classList.remove('hidden');
    });
    tournamentDoneBtn.addEventListener('click', () => {
        tournamentResultsModal.classList.add('hidden');
        setupModal.classList.remove('hidden');
    });

    // Game speed state - controls bot move delay and animation skipping
    let gameSpeed = 'beginner';


    // Load saved effects quality and set dropdown
    let savedEffectsQuality = localStorage.getItem('effectsQuality') || 'high';
    if (savedEffectsQuality === 'low') savedEffectsQuality = 'medium';
    effectsQualityInput.value = savedEffectsQuality;

    // Map size presets: slider value -> {width, height, label}
    // Square maps only, 3x3 to 12x12
    const mapSizePresets = [
        { width: 3, height: 3, label: '3x3' },    // 1 - Tiny
        { width: 4, height: 4, label: '4x4' },    // 2
        { width: 5, height: 5, label: '5x5' },    // 3
        { width: 6, height: 6, label: '6x6' },    // 4
        { width: 7, height: 7, label: '7x7' },    // 5 - Default
        { width: 8, height: 8, label: '8x8' },    // 6
        { width: 9, height: 9, label: '9x9' },    // 7
        { width: 10, height: 10, label: '10x10' }, // 8
        { width: 11, height: 11, label: '11x11' }, // 9
        { width: 12, height: 12, label: '12x12' }, // 10 - Maximum
    ];

    // Load saved setup settings
    // Load saved setup settings
    // Default Map Size: 2 (4x4) | Max Dice: 8
    const savedMapSizeRaw = localStorage.getItem('dicy_mapSize');

    // Convert old index format to new widthxheight format if needed
    let savedMapSizeString;
    if (!savedMapSizeRaw) {
        savedMapSizeString = '4x4'; // New default
    } else if (savedMapSizeRaw.includes('x')) {
        // Already in new format (widthxheight)
        savedMapSizeString = savedMapSizeRaw;
    } else {
        // Old format (index), convert to widthxheight
        const index = parseInt(savedMapSizeRaw) - 1;
        const preset = mapSizePresets[Math.max(0, Math.min(index, mapSizePresets.length - 1))];
        savedMapSizeString = `${preset.width}x${preset.height}`;
    }

    // Convert widthxheight string to slider value
    const [width, height] = savedMapSizeString.split('x').map(Number);
    const presetIndex = mapSizePresets.findIndex(p => p.width === width && p.height === height);
    const sliderValue = presetIndex !== -1 ? presetIndex + 1 : 2; // Default to 4x4 if not found
    const savedHumanCount = localStorage.getItem('dicy_humanCount') || '1';
    const savedBotCount = localStorage.getItem('dicy_botCount') || '3';
    const savedMaxDice = localStorage.getItem('dicy_maxDice') || '8';
    const savedDiceSides = localStorage.getItem('dicy_diceSides') || '6';
    // Map legacy fastMode to new speeds
    const legacyFastMode = localStorage.getItem('dicy_fastMode');
    let defaultSpeed = 'beginner';
    if (legacyFastMode === 'true') defaultSpeed = 'expert';
    else if (legacyFastMode === 'false') defaultSpeed = 'beginner';

    const savedGameSpeed = localStorage.getItem('dicy_gameSpeed') || defaultSpeed;

    // Default Map Style: Full Grid
    const savedMapStyle = localStorage.getItem('dicy_mapStyle') || 'full';
    const savedGameMode = localStorage.getItem('dicy_gameMode') || 'classic';
    const savedTournamentGames = localStorage.getItem('dicy_tournamentGames') || '100';

    // Load saved scenario if any
    const loadSavedScenario = () => {
        const savedScenarioName = localStorage.getItem('dicy_loadedScenario');
        if (savedScenarioName) {
            try {
                console.log('Loading saved scenario:', savedScenarioName);
                console.log('Scenario manager has', scenarioManager.scenarios.size, 'scenarios loaded');
                const scenario = scenarioManager.loadScenario(savedScenarioName);
                console.log('Loaded scenario result:', scenario ? 'found' : 'not found');
                if (scenario) {
                    pendingScenario = scenario;
                    updateConfigFromScenario(scenario);
                    updateLoadedScenarioDisplay(scenario.name);
                    console.log('Scenario loaded successfully:', scenario.name);
                } else {
                    // Scenario no longer exists, remove from localStorage
                    console.warn('Scenario not found, removing from localStorage:', savedScenarioName);
                    localStorage.removeItem('dicy_loadedScenario');
                }
            } catch (error) {
                console.warn('Failed to load saved scenario:', error);
                localStorage.removeItem('dicy_loadedScenario');
            }
        }
    };

    // Load saved scenario after a short delay to ensure scenario manager is ready
    const tryLoadScenario = (attempts = 0) => {
        const savedScenarioName = localStorage.getItem('dicy_loadedScenario');
        if (!savedScenarioName) return;

        const scenario = scenarioManager.loadScenario(savedScenarioName);
        if (scenario || attempts >= 10) {
            loadSavedScenario();
        } else {
            setTimeout(() => tryLoadScenario(attempts + 1), 50);
        }
    };

    // Check for auto-save and auto-resume if found
    const checkResume = () => {
        if (!turnHistory.hasAutoSave() || game.players.length > 0) return;

        const snapshot = turnHistory.loadAutoSave();
        if (snapshot) {
            setupModal.classList.add('hidden');
            document.querySelectorAll('.game-ui').forEach(el => el.classList.remove('hidden'));

            // Restore state
            turnHistory.applyGameState(game, snapshot.gameState);

            // Restore AIs
            clearPlayerAIs();
            game.players.forEach(p => {
                if (p.isBot) {
                    const aiId = p.aiId || 'easy';
                    playerAIs.set(p.id, createAI(aiId, game, p.id));
                }
                // Ensure name is set
                p.name = p.name || getPlayerName(p);
            });

            // Restore settings
            gameSpeed = gameSpeedInput.value;
            renderer.setGameSpeed(gameSpeed);
            renderer.setDiceSides(game.diceSides || 6);
            effectsManager.stopIntroMode();

            // Trigger start
            game.emit('gameStart', { players: game.players, map: game.map });
            game.startTurn();

            addLog(`🔄 Game automatically resumed from Turn ${game.turn}`, 'reinforce');
            setTimeout(() => renderer.autoFitCamera(), 50);
        }
    };

    setTimeout(() => {
        tryLoadScenario();
        // Check resume after attempting to load scenario
        setTimeout(checkResume, 50);
    }, 10);

    mapSizeInput.value = sliderValue;
    humanCountInput.value = savedHumanCount;
    botCountInput.value = savedBotCount;
    maxDiceInput.value = savedMaxDice;
    maxDiceVal.textContent = savedMaxDice;
    diceSidesInput.value = savedDiceSides;
    diceSidesVal.textContent = savedDiceSides;
    gameSpeedInput.value = savedGameSpeed;
    mapStyleInput.value = savedMapStyle;
    gameModeInput.value = savedGameMode;
    tournamentGamesInput.value = savedTournamentGames;

    // Initialize dependent UI based on loaded settings
    // Tournament config - show if humans = 0
    if (parseInt(savedHumanCount) === 0) {
        tournamentConfig.style.display = 'block';
    }

    const getMapSize = (sliderValue) => {
        const index = Math.max(0, Math.min(sliderValue - 1, mapSizePresets.length - 1));
        return mapSizePresets[index];
    };

    const updateMapSizeDisplay = () => {
        const size = getMapSize(parseInt(mapSizeInput.value));
        mapSizeVal.textContent = size.label;
    };

    const updateLoadedScenarioDisplay = (scenarioName) => {
        if (scenarioName) {
            loadedScenarioName.textContent = scenarioName;
            loadedScenarioName.style.display = 'block';
            loadedScenarioName.title = 'Click to unload scenario';
            // Hide slider, map size value, and map style controls
            mapSizeInput.style.display = 'none';
            mapSizeVal.style.display = 'none';
            mapStyleGroup.style.display = 'none';
            mapSizeLabel.textContent = 'Map';
        } else {
            loadedScenarioName.textContent = '';
            loadedScenarioName.style.display = 'none';
            // Show slider, map size value, and map style controls
            mapSizeInput.style.display = 'block';
            mapSizeVal.style.display = 'inline';
            mapStyleGroup.style.display = 'block';
            mapSizeLabel.textContent = 'Map Size';
        }
    };

    // Click handler to reset loaded scenario
    loadedScenarioName.addEventListener('click', () => {
        pendingScenario = null;
        localStorage.removeItem('dicy_loadedScenario');
        updateLoadedScenarioDisplay(null);
        // Reset map size display to current slider value
        updateMapSizeDisplay();
    });

    // Initial map size display
    updateMapSizeDisplay();

    // Immediate saving of settings
    mapSizeInput.addEventListener('input', () => {
        updateMapSizeDisplay();
        const sizePreset = getMapSize(parseInt(mapSizeInput.value));
        localStorage.setItem('dicy_mapSize', `${sizePreset.width}x${sizePreset.height}`);
    });
    maxDiceInput.addEventListener('input', () => {
        maxDiceVal.textContent = maxDiceInput.value;
        localStorage.setItem('dicy_maxDice', maxDiceInput.value);
    });
    diceSidesInput.addEventListener('input', () => {
        diceSidesVal.textContent = diceSidesInput.value;
        localStorage.setItem('dicy_diceSides', diceSidesInput.value);
    });
    humanCountInput.addEventListener('change', () => {
        localStorage.setItem('dicy_humanCount', humanCountInput.value);
    });
    botCountInput.addEventListener('change', () => {
        localStorage.setItem('dicy_botCount', botCountInput.value);
    });
    gameSpeedInput.addEventListener('change', () => {
        localStorage.setItem('dicy_gameSpeed', gameSpeedInput.value);
    });
    mapStyleInput.addEventListener('change', () => {
        localStorage.setItem('dicy_mapStyle', mapStyleInput.value);
    });
    gameModeInput.addEventListener('change', () => {
        localStorage.setItem('dicy_gameMode', gameModeInput.value);
    });
    tournamentGamesInput.addEventListener('input', () => {
        localStorage.setItem('dicy_tournamentGames', tournamentGamesInput.value);
    });

    // Effects quality - apply immediately
    effectsQualityInput.addEventListener('change', () => {
        const newQuality = effectsQualityInput.value;
        localStorage.setItem('effectsQuality', newQuality);
        effectsManager.setQuality(newQuality);
        renderer.setEffectsQuality(newQuality);
    });

    startBtn.addEventListener('click', () => {
        const sizeValue = mapSizeInput.value;
        const sizePreset = getMapSize(parseInt(sizeValue));
        const humanCount = parseInt(humanCountInput.value);
        const botCount = parseInt(botCountInput.value);
        const maxDice = parseInt(maxDiceInput.value);
        const diceSides = parseInt(diceSidesInput.value);

        if (humanCount + botCount < 2) {
            alert('A game must have at least 2 players in total!');
            return;
        }

        // Save setup settings
        localStorage.setItem('dicy_mapSize', `${sizePreset.width}x${sizePreset.height}`);
        localStorage.setItem('dicy_humanCount', humanCount.toString());
        localStorage.setItem('dicy_botCount', botCount.toString());
        localStorage.setItem('dicy_maxDice', maxDice.toString());
        localStorage.setItem('dicy_diceSides', diceSides.toString());
        localStorage.setItem('dicy_gameSpeed', gameSpeedInput.value);
        localStorage.setItem('dicy_mapStyle', mapStyleInput.value);
        localStorage.setItem('dicy_gameMode', gameModeInput.value);
        localStorage.setItem('effectsQuality', effectsQualityInput.value);

        // Enable speed levels for this game session
        gameSpeed = gameSpeedInput.value;
        renderer.setGameSpeed(gameSpeed);

        // Apply effects quality setting
        effectsManager.setQuality(effectsQualityInput.value);
        renderer.setEffectsQuality(effectsQualityInput.value);
        // Stop intro mode effects (game is starting)
        effectsManager.stopIntroMode();
        renderer.setDiceSides(diceSides);

        // Clear autoplay state
        autoplayPlayers.clear();
        // Clear previous auto-save when explicitly starting new game
        turnHistory.clearAutoSave();

        gameLog.clear();
        addLog('Game started!', '');

        // Show Game UI first so event handlers can set correct state
        setupModal.classList.add('hidden');
        document.querySelectorAll('.game-ui').forEach(el => el.classList.remove('hidden'));

        // Load pending scenario from localStorage if needed
        const loadPendingScenarioIfNeeded = () => {
            if (!pendingScenario) {
                const savedScenarioName = localStorage.getItem('dicy_loadedScenario');
                if (savedScenarioName) {
                    const scenario = scenarioManager.loadScenario(savedScenarioName);
                    if (scenario) {
                        pendingScenario = scenario;
                    }
                }
            }
        };

        // Start game from scenario or regular config
        loadPendingScenarioIfNeeded();

        if (pendingScenario && pendingScenario.type !== 'map') {
            // Apply the loaded scenario or replay (fixed state)
            scenarioManager.applyScenarioToGame(game, pendingScenario);
            game.emit('gameStart', { players: game.players, map: game.map });
            game.startTurn();
            pendingScenario = null;
            // Keep scenario loaded for reuse - don't clear localStorage
            // Reset map size display but keep scenario name visible
            mapSizeVal.textContent = sizePreset.label;
        } else {
            // New Game (Random Map or Preset Map)
            const config = {
                humanCount,
                botCount,
                mapWidth: sizePreset.width,
                mapHeight: sizePreset.height,
                maxDice,
                diceSides,
                mapStyle: mapStyleInput.value,
                gameMode: gameModeInput.value
            };

            // If it's a map type scenario, pass it as a preset
            if (pendingScenario && pendingScenario.type === 'map') {
                config.predefinedMap = pendingScenario;
                config.mapWidth = pendingScenario.width;
                config.mapHeight = pendingScenario.height;
                pendingScenario = null;
                // Keep scenario loaded for reuse - don't clear display or localStorage
            }

            game.startGame(config);
        }

        // Initialize AI for all players
        clearPlayerAIs();
        for (const player of game.players) {
            if (!player.isBot) {
                player.name = getPlayerName(player);
                continue;
            }

            // Use selected AI difficulty for all bots
            const aiId = selectedBotAI || 'easy';
            playerAIs.set(player.id, createAI(aiId, game, player.id));
            player.aiId = aiId;
            player.name = getPlayerName(player);
        }

        // Save the initial state for "Play Again" functionality (separate from autosave)
        turnHistory.saveInitialState(game);

        // Force update of autosave to include the newly assigned AI IDs (which were missing in the initial turnStart save)
        turnHistory.saveAutoSave(game);

        // Ensure camera fits after game start
        setTimeout(() => {
            renderer.autoFitCamera();
        }, 50);
    });

    // Player List Logic - using PlayerDashboard module
    game.on('gameStart', () => {
        // Attach names for AI serialization
        game.players.forEach(p => p.name = getPlayerName(p));
        playerDashboard.update();

        // Ensure buttons are hidden initially (turnStart will show them appropriately)
        endTurnBtn.classList.add('hidden');
        autoWinBtn.classList.add('hidden');
        turnIndicator.classList.add('hidden');
    });
    game.on('turnStart', () => playerDashboard.update());
    game.on('attackResult', () => playerDashboard.update());
    game.on('reinforcements', () => playerDashboard.update());
    game.on('playerEliminated', () => playerDashboard.update());

    game.on('gameOver', (data) => {
        const modal = document.getElementById('game-over-modal');
        const winnerText = document.getElementById('winner-text');
        const name = getPlayerName(data.winner);
        winnerText.textContent = `${name} Wins!`;

        // Record the win and display highscores
        recordWin(name);
        displayHighscores(name);

        modal.classList.remove('hidden');
        addLog(`🏆 ${name} wins the game!`, 'death');

        // Play victory or defeat sound
        if (!data.winner.isBot) {
            sfx.victory();
        } else {
            sfx.defeat();
        }

        // Conditionally show "Try Again" button only if we have a saved state
        const cloneGameBtn = document.getElementById('clone-game-btn');
        if (turnHistory.hasInitialState()) {
            cloneGameBtn.style.display = 'inline-block';
        } else {
            cloneGameBtn.style.display = 'none';
        }

        // Clear auto-save on normal completion
        turnHistory.clearAutoSave();
    });

    document.getElementById('restart-btn').addEventListener('click', () => {
        document.getElementById('game-over-modal').classList.add('hidden');
        resetGameSession(); // Ensure session is cleared when going to new game
        setupModal.classList.remove('hidden');
        document.querySelectorAll('.game-ui').forEach(el => el.classList.add('hidden'));
    });

    document.getElementById('clone-game-btn').addEventListener('click', () => {
        restartCurrentGame();
    });

    // === Scenario System UI ===
    const scenarioBrowserModal = document.getElementById('scenario-browser-modal');
    const scenarioBrowserCloseBtn = document.getElementById('scenario-browser-close-btn');
    const scenarioList = document.getElementById('scenario-list');


    const scenariosBtn = document.getElementById('scenarios-btn');
    const scenarioTabs = document.querySelectorAll('.scenario-tab');
    const newScenarioBtn = document.getElementById('new-scenario-btn');
    const scenarioImportBtn = document.getElementById('scenario-import-btn');
    const scenarioExportBtn = document.getElementById('scenario-export-btn');
    // scenarioEditorBtn removed from HTML
    const scenarioEditorBtn = document.getElementById('scenario-editor-btn');

    const saveScenarioModal = document.getElementById('save-scenario-modal');
    const saveScenarioCloseBtn = document.getElementById('save-scenario-close-btn');
    const scenarioNameInput = document.getElementById('scenario-name-input');
    const saveScenarioConfirmBtn = document.getElementById('save-scenario-confirm-btn');
    const saveScenarioCancelBtn = document.getElementById('save-scenario-cancel-btn');

    let currentScenarioTab = 'maps';
    let selectedScenarioName = null;
    let selectedScenarioData = null;
    let currentSort = { field: 'date', direction: 'desc' };
    let onlineMaps = [];
    // Dynamically determine backend URL
    let BACKEND_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:8000/backend'
        : window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '') + '/backend';

    // Override for Steam version
    if (window.steam) {
        const isSteamDev = await window.steam.isDev();
        if (isSteamDev) {
            BACKEND_URL = 'https://feuerware.com/2025/diception/dev/backend';
        } else {
            BACKEND_URL = 'https://diception.feuerware.com/backend';
        }
    }

    const fetchOnlineMaps = async () => {
        try {
            scenarioList.innerHTML = '<div class="loading-message">Loading online maps...</div>';
            const response = await fetch(`${BACKEND_URL}/list.php`);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            // Map aggregated data
            onlineMaps = data.map(m => ({
                ...m,
                isOnline: true,
                createdAt: (m.filemtime || m.created) * 1000
            }));
            renderScenarioList();
        } catch (error) {
            console.error('Error fetching online maps:', error);
            scenarioList.innerHTML = '<div class="error-message">Failed to load online maps.<br>Ensure PHP backend is running.</div>';
        }
    };

    const updateActionButtons = () => {
        // Buttons moved to rows, no global update needed
    };

    const loadSelectedScenario = async () => {
        if (!selectedScenarioName) return;

        if (selectedScenarioData && selectedScenarioData.isOnline) {
            const scenario = selectedScenarioData;
            scenario.type = scenario.type || 'map';

            pendingScenario = scenario;
            scenarioBrowserModal.classList.add('hidden');
            setupModal.classList.remove('hidden');
            updateConfigFromScenario(scenario);
            updateLoadedScenarioDisplay(scenario.name);
            return;
        }

        const scenario = scenarioManager.loadScenario(selectedScenarioName);
        if (scenario) {
            pendingScenario = scenario;
            scenarioBrowserModal.classList.add('hidden');
            setupModal.classList.remove('hidden'); // Ensure setup modal is visible
            updateConfigFromScenario(scenario);

            // Save loaded scenario to localStorage
            localStorage.setItem('dicy_loadedScenario', selectedScenarioName);
            updateLoadedScenarioDisplay(scenario.name);
        }
    };

    // Helper: Render Map Preview to Canvas
    const renderMapPreview = (canvas, scenario) => {
        const ctx = canvas.getContext('2d');
        const maxCanvasSize = 200; // Maximum preview size in pixels
        const mapWidth = scenario.width || 10;
        const mapHeight = scenario.height || 10;
        
        // Calculate tile size to fit within max canvas size
        const maxDimension = Math.max(mapWidth, mapHeight);
        const baseTileSize = 20;
        const baseGap = 2;
        
        // Scale down for large maps
        let tileSize = baseTileSize;
        let gap = baseGap;
        const fullSize = maxDimension * (baseTileSize + baseGap) + baseGap;
        if (fullSize > maxCanvasSize) {
            const scale = maxCanvasSize / fullSize;
            tileSize = Math.max(2, Math.floor(baseTileSize * scale));
            gap = Math.max(1, Math.floor(baseGap * scale));
        }

        canvas.width = mapWidth * (tileSize + gap) + gap;
        canvas.height = mapHeight * (tileSize + gap) + gap;

        // Background
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Player Colors Map
        const playerColors = {};
        if (scenario.players) {
            scenario.players.forEach(p => playerColors[p.id] = p.color);
        }

        // Draw Tiles
        if (scenario.tiles && Array.isArray(scenario.tiles)) {
            scenario.tiles.forEach(tile => {
                const x = tile.x * (tileSize + gap) + gap;
                const y = tile.y * (tileSize + gap) + gap;

                // Determine color
                let color = '#444'; // Lighter gray for better visibility against black background
                if (tile.owner !== undefined && tile.owner !== -1) {
                    const c = playerColors[tile.owner];
                    if (c !== undefined) {
                        color = '#' + c.toString(16).padStart(6, '0');
                    }
                }

                // Draw Tile
                ctx.fillStyle = color;
                ctx.fillRect(x, y, tileSize, tileSize);

                // Border
                ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, tileSize, tileSize);

                // Dice Count (only show if tiles are big enough)
                if (tile.dice && tileSize >= 10) {
                    ctx.fillStyle = '#fff';
                    const fontSize = Math.max(6, Math.floor(tileSize * 0.5));
                    ctx.font = `bold ${fontSize}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(tile.dice, x + tileSize / 2, y + tileSize / 2 + 1);
                }
            });
        }
    };

    const uploadMap = async (mapData) => {
        // Basic validation
        if (!mapData || !mapData.tiles) {
            alert('Invalid map data.');
            return;
        }

        if (!confirm(`Upload "${mapData.name || 'Untitled'}" to the server?`)) return;

        try {
            const response = await fetch(`${BACKEND_URL}/upload.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mapData)
            });
            const result = await response.json();
            if (result.success) {
                alert(result.message || 'Map uploaded successfully!');
                // Refetch if in online tab
                if (currentScenarioTab === 'online') {
                    fetchOnlineMaps();
                } else {
                    // Switch to online tab
                    const onlineTab = document.querySelector('.scenario-tab[data-tab="online"]');
                    if (onlineTab) onlineTab.click();
                }
            } else {
                alert('Upload failed: ' + (result.error || 'Unknown error'));
            }
        } catch (e) {
            alert('Upload error: ' + e.message);
        }
    };

    // Helper: Show Preview in Right Pane
    const showScenarioPreview = (scenario) => {
        const container = document.getElementById('scenario-preview-content');
        if (!container) return;

        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'preview-header';
        header.innerHTML = `<h3 class="preview-title">${scenario.name}</h3>`;
        container.appendChild(header);

        // Actions in Header
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'preview-header-actions';

        // Play Button
        const playBtn = document.createElement('button');
        playBtn.className = 'tron-btn small';
        playBtn.innerHTML = '▶ <span class="btn-text">Play</span>';
        playBtn.onclick = (e) => {
            e.stopPropagation();
            loadSelectedScenario();
        };
        actionsDiv.appendChild(playBtn);

        // Edit Button - opens scenario in editor
        const editBtn = document.createElement('button');
        editBtn.className = 'tron-btn small edit-scenario-btn';
        editBtn.innerHTML = '✏️ <span class="btn-text">Edit</span>';
        editBtn.title = 'Edit in Map Editor';
        editBtn.onclick = (e) => {
            e.stopPropagation();
            scenarioBrowserModal.classList.add('hidden');
            mapEditor.open(scenario);
            mapEditor.onClose = () => {
                renderScenarioList();
                scenarioBrowserModal.classList.remove('hidden');
            };
        };
        actionsDiv.appendChild(editBtn);

        // Export Button
        const exportBtn = document.createElement('button');
        exportBtn.className = 'tron-btn small';
        exportBtn.innerHTML = '💾 <span class="btn-text">Export as file</span>';
        exportBtn.title = 'Export as file';
        exportBtn.onclick = (e) => {
            e.stopPropagation();
            const json = scenario.isOnline ? JSON.stringify(scenario, null, 2) : scenarioManager.exportScenario(scenario.name);
            if (json) {
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${scenario.name.replace(/[^a-z0-9]/gi, '_')}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        };
        actionsDiv.appendChild(exportBtn);

        // Delete Button (only if not built-in)
        if (!scenario.isBuiltIn && !scenario.isOnline) {
            // Upload Button (for local maps only)
            if (scenario.type === 'map') {
                const uploadBtn = document.createElement('button');
                uploadBtn.className = 'tron-btn small';
                uploadBtn.innerHTML = '☁️ <span class="btn-text">Upload</span>';
                uploadBtn.title = 'Upload to Server';
                uploadBtn.style.marginRight = '5px';
                uploadBtn.onclick = (e) => {
                    e.stopPropagation();
                    uploadMap(scenario);
                };
                actionsDiv.appendChild(uploadBtn);
            }

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'tron-btn small danger';
            deleteBtn.textContent = '🗑️';
            deleteBtn.title = 'Delete Scenario';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`Delete "${scenario.name}"?`)) {
                    scenarioManager.deleteScenario(scenario.name);
                    renderScenarioList();
                }
            };
            actionsDiv.appendChild(deleteBtn);
        }

        header.appendChild(actionsDiv);

        // Content Wrapper
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'preview-container';

        // Map Canvas
        const canvas = document.createElement('canvas');
        canvas.className = 'preview-map';
        contentWrapper.appendChild(canvas);

        // Details Panel
        const details = document.createElement('div');
        details.className = 'preview-details';

        const addDetail = (label, value, className = '') => {
            const div = document.createElement('div');
            div.className = 'preview-detail-item';
            let html = '';
            if (label) html += `<span class="preview-label">${label}</span>`;
            html += `<span class="preview-value ${className}">${value}</span>`;
            div.innerHTML = html;
            details.appendChild(div);
        };

        if (scenario.author) {
            addDetail(null, scenario.author, 'author');
        }

        if (scenario.description) {
            const desc = document.createElement('div');
            desc.className = 'preview-description';
            desc.textContent = scenario.description;
            details.appendChild(desc);
        }

        // Stats
        const typeName = scenario.type === 'map' ? 'Map' : (scenario.type === 'replay' ? 'Replay' : 'Scenario');
        if (scenario.isBuiltIn) {
            addDetail('Type', `Built-in ${typeName}`);
        } else {
            addDetail('Type', `Custom ${typeName}`);
            addDetail('Created', scenario.createdAt ? new Date(scenario.createdAt).toLocaleString() : 'Unknown');
        }

        if (scenario.tiles) {
            addDetail('Tiles', scenario.tiles.length + ' / ' + (scenario.width * scenario.height));
        }



        // Append in order: Map (Left), Details (Right)
        contentWrapper.appendChild(canvas);
        contentWrapper.appendChild(details);
        container.appendChild(contentWrapper);

        // Render map
        renderMapPreview(canvas, scenario);
    };

    const renderScenarioList = () => {
        let scenarios = [];

        if (currentScenarioTab === 'online') {
            scenarios = onlineMaps;
        } else {
            scenarios = scenarioManager.listScenarios();
        }

        // Filter by tab type
        const filtered = scenarios.filter(s => {
            if (currentScenarioTab === 'online') return true; // Already filtered by source

            const type = s.type || 'scenario';
            // Scenarios tab: scenarios and built-in scenarios (but NOT maps)
            if (currentScenarioTab === 'scenarios') return (type === 'scenario' || type === 'replay' || s.isBuiltIn) && type !== 'map';
            // Maps tab: custom map layouts and built-in maps
            if (currentScenarioTab === 'maps') return type === 'map';
            return false;
        });

        // Simple sorting by date desc (default) or maintain current behavior? 
        // User asked for "simple list with names", likely sorted by Name or Date.
        // I will sort by name for clarity in list view.
        filtered.sort((a, b) => a.name.localeCompare(b.name));

        scenarioList.innerHTML = '';

        const emptyMessages = {
            scenarios: 'No scenarios found.',
            maps: 'No maps found.',
            online: 'No online maps found.'
        };

        if (filtered.length === 0) {
            scenarioList.innerHTML = `<div class="empty-message">${emptyMessages[currentScenarioTab]}</div>`;
            document.getElementById('scenario-preview-content').innerHTML = '<div class="empty-message-large">Select a scenario to view details</div>';
            selectedScenarioName = null;
            selectedScenarioData = null;
            if (scenarioExportBtn) scenarioExportBtn.disabled = true;
            return;
        }

        filtered.forEach(s => {
            const item = document.createElement('div');
            item.className = 'scenario-list-item';
            if (selectedScenarioName === s.name) {
                item.classList.add('selected');
            }

            const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '';
            const builtInLabel = s.isBuiltIn ? ' <span class="builtin-label">(built-in)</span>' : '';

            item.innerHTML = `
                <span class="list-item-name">${s.name}${builtInLabel}</span>
                <span class="list-item-date">${dateStr}</span>
            `;

            let lastClickTime = 0;
            item.addEventListener('click', () => {
                const currentTime = new Date().getTime();
                const isDouble = currentTime - lastClickTime < 400;
                lastClickTime = currentTime;

                document.querySelectorAll('.scenario-list-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                selectedScenarioName = s.name;
                selectedScenarioData = s;
                if (scenarioExportBtn) scenarioExportBtn.disabled = false;
                showScenarioPreview(s);

                if (isDouble) {
                    loadSelectedScenario();
                    lastClickTime = 0; // Prevent triple-click triggering again immediately
                }
            });

            scenarioList.appendChild(item);
        });

        // Update New Button state
        if (currentScenarioTab === 'online') {
            newScenarioBtn.style.display = 'none';
        } else {
            newScenarioBtn.style.display = 'block';
            newScenarioBtn.textContent = currentScenarioTab === 'maps' ? '+ New Map' : '+ New Scenario';
        }

        // Auto-select first item if none selected or if previously selected is gone
        if (filtered.length > 0) {
            if (!selectedScenarioName || !filtered.find(s => s.name === selectedScenarioName)) {
                // Select first
                const first = filtered[0];
                selectedScenarioName = first.name;
                selectedScenarioData = first;
                // Highlight first
                scenarioList.firstElementChild.classList.add('selected');
                showScenarioPreview(first);
            } else {
                // Re-show current
                showScenarioPreview(selectedScenarioData);
            }
        }
    };

    // Action Button Listeners
    // scenarioLoadBtn listener removed (moved to row)
    // scenarioDeleteBtn listener removed (moved to row)
    // scenarioExportBtn listener removed (moved to row)

    // Update UI config sliders from a loaded scenario
    const updateConfigFromScenario = (scenario) => {
        // Find the map size preset index that matches (or closest)
        const targetSize = scenario.width; // Square maps, so width = height
        const presetIndex = mapSizePresets.findIndex(p => p.width === targetSize);
        if (presetIndex !== -1) {
            mapSizeInput.value = presetIndex + 1;
            mapSizeVal.textContent = mapSizePresets[presetIndex].label;
        } else {
            mapSizeVal.textContent = `${scenario.width}x${scenario.height}`;
        }

        // Update dice settings
        if (scenario.maxDice && maxDiceInput) {
            maxDiceInput.value = scenario.maxDice;
            maxDiceVal.textContent = scenario.maxDice;
        }
        if (scenario.diceSides && diceSidesInput) {
            diceSidesInput.value = scenario.diceSides;
            diceSidesVal.textContent = scenario.diceSides;
        }


        if (scenario.gameMode && gameModeSelect) {
            gameModeSelect.value = scenario.gameMode;
        }

        // Update player counts ONLY for Scenarios/Replays, NOT for Maps
        // Maps should keep the user's current player configuration or use defaults, 
        // they only define the layout.
        if (scenario.type !== 'map' && scenario.players && Array.isArray(scenario.players)) {
            let humans = 0;
            let bots = 0;
            const botAIs = new Set();
            const newPerPlayerConfig = {};

            scenario.players.forEach(p => {
                if (p.isBot) {
                    bots++;
                    const aiId = p.aiId || 'easy';
                    botAIs.add(aiId);
                    // Use the correct player ID for the config (offset by human count happens in game start, 
                    // but here we might need to be careful. Game.js assigns IDs 0..humanCount-1 to humans, 
                    // and humanCount..total-1 to bots. 
                    // However, scenario players have fixed IDs. 
                    // If we just set counts, Game.js regenerates IDs. 
                    // So we should map simply by index or assume standard ordering if we want to preserve exact AI per slot.)

                    // For now, let's just collect them. Attempting to map exact IDs from scenario to new game config 
                    // is tricky if the scenario has gaps or specific ID assignments.
                    // But simpler: just fill the per-player config map for the *likely* new IDs.
                    // The new game will assign Bot 1 to ID = humanCount, Bot 2 to humanCount+1, etc.

                    // Let's assume standard packing:
                } else {
                    humans++;
                }
            });

            // Re-iterate to assign per-player config based on new logical indices
            let botIndex = 0;
            scenario.players.forEach(p => {
                if (p.isBot) {
                    const anticipatedId = humans + botIndex;
                    newPerPlayerConfig[anticipatedId] = p.aiId || 'easy';
                    botIndex++;
                }
            });

            if (humanCountInput) humanCountInput.value = humans;
            if (botCountInput) botCountInput.value = bots;

            // Update AI Selection - use the first bot's AI or keep current selection
            if (botAIs.size >= 1) {
                const ai = [...botAIs][0];
                if (botAISelect && ['easy', 'medium', 'hard'].includes(ai)) {
                    botAISelect.value = ai;
                    selectedBotAI = ai;
                }
            }
        }
    };

    // Tab switching
    // Tab switching
    scenarioTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            scenarioTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentScenarioTab = tab.dataset.tab;
            // Clear selection on tab switch
            selectedScenarioName = null;
            selectedScenarioData = null;

            if (currentScenarioTab === 'online') {
                fetchOnlineMaps();
            } else {
                renderScenarioList();
            }
        });
    });

    // Open scenario browser
    scenariosBtn.addEventListener('click', () => {
        pendingScenario = null; // Clear any pending
        selectedScenarioName = null; // Clear selection
        selectedScenarioData = null;
        renderScenarioList();
        scenarioBrowserModal.classList.remove('hidden');
    });

    // Close scenario browser
    scenarioBrowserCloseBtn.addEventListener('click', () => {
        scenarioBrowserModal.classList.add('hidden');
        setupModal.classList.remove('hidden');
    });

    // New Map/Scenario Button
    if (newScenarioBtn) {
        newScenarioBtn.addEventListener('click', () => {
            if (currentScenarioTab === 'online') {
                return;
            }

            scenarioBrowserModal.classList.add('hidden');

            const template = {
                width: 10,
                height: 10,
                name: '', // Empty name to force entry
                isBuiltIn: false,
                type: currentScenarioTab === 'scenarios' ? 'scenario' : 'map'
            };

            mapEditor.open(template);

            // Highlight name input
            setTimeout(() => {
                if (mapEditor.elements.nameInput) {
                    mapEditor.elements.nameInput.focus();
                    mapEditor.elements.nameInput.select();
                }
            }, 100);

            mapEditor.onClose = () => {
                renderScenarioList();
                scenarioBrowserModal.classList.remove('hidden');
            };
        });
    }

    // Import scenario (File Based)
    if (scenarioImportBtn) {
        scenarioImportBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';

            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    const text = await file.text();

                    // Parse and validate first
                    const scenario = scenarioManager.parseImport(text);

                    // Check for existing Name
                    const existing = scenarioManager.getScenario(scenario.name);
                    if (existing) {
                        const choice = confirm(
                            `A scenario with name "${scenario.name}" already exists.\n\n` +
                            `Click OK to REPLACE the existing scenario.\n` +
                            `Click Cancel to import as a NEW scenario.`
                        );

                        if (choice) {
                            // Replace (keep Name)
                            scenario.isBuiltIn = false;
                            scenario.createdAt = Date.now();
                        } else {
                            // Save as new (generate unique name)
                            scenario.name = scenarioManager.generateUniqueName(scenario.name);
                            scenario.isBuiltIn = false;
                            scenario.createdAt = Date.now();
                        }
                    } else {
                        // New scenario
                        scenario.isBuiltIn = false;
                        if (!scenario.createdAt) scenario.createdAt = Date.now();
                    }

                    // Save
                    scenarioManager.saveEditorScenario(scenario);

                    alert(`Imported: ${scenario.name}`);
                    renderScenarioList();
                } catch (e) {
                    alert('Import failed: ' + e.message);
                }
            };

            input.click();
        });
    }

    // Export Scenario (Footer Button - though hidden)
    if (scenarioExportBtn) {
        scenarioExportBtn.addEventListener('click', () => {
            if (!selectedScenarioName) return;

            const json = scenarioManager.exportScenario(selectedScenarioName);
            if (json) {
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${selectedScenarioData.name.replace(/[^a-z0-9]/gi, '_')}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        });
    }

    // Map Editor Launch (Selected Item) - Button removed from HTML, keeping logic conditional just in case
    if (scenarioEditorBtn) {
        scenarioEditorBtn.addEventListener('click', () => {
            // Close the scenario browser
            scenarioBrowserModal.classList.add('hidden');

            // Open editor with selected scenario (if any), or blank for new
            mapEditor.open(selectedScenarioData);

            // When editor closes, refresh the scenario list
            mapEditor.onClose = () => {
                renderScenarioList();
                scenarioBrowserModal.classList.remove('hidden');
            };
        });
    }

    // Save Scenario Modal
    saveScenarioCloseBtn.addEventListener('click', () => {
        saveScenarioModal.classList.add('hidden');
    });

    saveScenarioCancelBtn.addEventListener('click', () => {
        saveScenarioModal.classList.add('hidden');
    });

    saveScenarioConfirmBtn.addEventListener('click', () => {
        const name = scenarioNameInput.value.trim() || 'Unnamed Scenario';
        const snapshotIndex = parseInt(saveScenarioModal.dataset.snapshotIndex);

        if (!isNaN(snapshotIndex)) {
            // Save from snapshot
            const scenario = turnHistory.createScenarioFromSnapshot(game, snapshotIndex, name);
            if (scenario) {
                scenarioManager.saveEditorScenario(scenario);
                alert(`Saved: ${name}`);
            }
        } else {
            // Save current game state
            scenarioManager.saveScenario(game, name);
            alert(`Saved: ${name}`);
        }

        saveScenarioModal.classList.add('hidden');
    });

    // Clear turn history on new game
    game.on('gameStart', () => {
        turnHistory.clear();
    });
}


// --- Benchmark Tool (console only) ---
// Usage: window.benchmarkAI() in browser console
window.benchmarkAI = async () => {
    const { createAI } = await import('./core/ai/index.js');
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
