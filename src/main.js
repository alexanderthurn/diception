import { Game } from './core/game.js';
import { Renderer } from './render/renderer.js';
import { InputController } from './input/input-controller.js';
import { InputManager } from './input/input-manager.js';
import { AIRunner } from './core/ai-runner.js';
import { AIRegistry } from './core/ai-registry.js';
import { SoundManager } from './audio/sound-manager.js';
import { EffectsManager } from './render/effects/effects-manager.js';
import { ScenarioManager } from './scenarios/scenario-manager.js';
import { TurnHistory } from './scenarios/turn-history.js';
import { MapEditor } from './editor/map-editor.js';
import { TileRenderer } from './render/tile-renderer.js';

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
    // 1. Initialize Game Logic
    const game = new Game();

    // 2. Initialize Renderer
    const container = document.getElementById('game-container');
    const renderer = new Renderer(container, game);
    await renderer.init();

    // Expose app for export function
    window.gameApp = renderer.app;

    // 2.5 Initialize Effects System (completely separate from renderer)
    const effectsManager = new EffectsManager(renderer.app.stage, game, {
        tileSize: 60,
        gap: 4
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

    // Wire tile selection to effects (keeping input controller unchanged)
    const originalSelect = input.select.bind(input);
    input.select = (x, y) => {
        originalSelect(x, y);
        effectsManager.onTileClick(x, y);
    };

    // 5. Initialize AI System
    const aiRegistry = new AIRegistry();
    aiRegistry.loadCustomAIs();

    // Map player ID -> AIRunner instance (set during game start)
    let playerAIs = new Map();

    // Current selected AI for all bots (default easy)
    let selectedBotAI = localStorage.getItem('dicy_botAI') || 'easy';
    // Per-player AI config (when using custom per player)
    let perPlayerAIConfig = JSON.parse(localStorage.getItem('dicy_perPlayerAIConfig') || '{}');

    // 6. Initialize Scenario System
    const scenarioManager = new ScenarioManager();
    const turnHistory = new TurnHistory();
    let pendingScenario = null; // Scenario to load when starting game

    // 7. Initialize Map Editor
    const mapEditor = new MapEditor(scenarioManager, aiRegistry);
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

    // === Highscore System ===
    const HIGHSCORE_STORAGE_KEY = 'dicy_highscores';

    // Load highscores from localStorage
    const loadHighscores = () => {
        try {
            return JSON.parse(localStorage.getItem(HIGHSCORE_STORAGE_KEY)) || { wins: {}, totalGames: 0 };
        } catch (e) {
            return { wins: {}, totalGames: 0 };
        }
    };

    // Save highscores to localStorage
    const saveHighscores = (data) => {
        localStorage.setItem(HIGHSCORE_STORAGE_KEY, JSON.stringify(data));
    };

    // Record a win for a player
    const recordWin = (winnerName) => {
        const data = loadHighscores();
        data.wins[winnerName] = (data.wins[winnerName] || 0) + 1;
        data.totalGames = (data.totalGames || 0) + 1;
        saveHighscores(data);
        return data;
    };

    // Display highscores in the GAME OVER modal
    const displayHighscores = (currentWinnerName) => {
        const data = loadHighscores();
        const highscoreList = document.getElementById('highscore-list');
        const totalGamesEl = document.getElementById('total-games-played');

        // Sort by wins descending
        const sortedWins = Object.entries(data.wins)
            .sort((a, b) => b[1] - a[1]);

        if (sortedWins.length === 0) {
            highscoreList.innerHTML = '<div class="highscore-item"><span class="highscore-player-name">No stats yet</span></div>';
        } else {
            highscoreList.innerHTML = sortedWins.map(([name, wins]) => {
                const isHighlighted = name === currentWinnerName ? 'highlighted' : '';
                return `
                    <div class="highscore-item ${isHighlighted}">
                        <span class="highscore-player-name">${name}</span>
                        <span class="highscore-wins">${wins} 🏆</span>
                    </div>
                `;
            }).join('');
        }

        totalGamesEl.textContent = `Total Games Played: ${data.totalGames || 0}`;
    };

    // 5. Initialize Music Playlist with localStorage
    // Define available songs (MP3 files in public directory)
    const availableSongs = [
        'Neon Dice Offensive.mp3',
        'Neon Etude.mp3',
        'Neon Odds.mp3'

    ];

    let currentSongIndex = 0;
    const storedIndex = localStorage.getItem('dicy_currentSongIndex');

    if (storedIndex === null) {
        // First time ever: start with first title
        currentSongIndex = 0;
    } else {
        // Game restart: increment index (rotate playlist)
        currentSongIndex = (parseInt(storedIndex, 10) + 1) % availableSongs.length;
    }

    // Save immediately so this counts as the "last started title"
    localStorage.setItem('dicy_currentSongIndex', currentSongIndex.toString());

    const music = new Audio('./' + availableSongs[currentSongIndex]);

    // Load saved settings - music ON by default unless user explicitly disabled
    const savedMusicEnabled = localStorage.getItem('dicy_musicEnabled') !== 'false'; // Default ON
    const savedMusicVolume = parseFloat(localStorage.getItem('dicy_musicVolume') ?? '0.5');
    const savedSfxEnabled = localStorage.getItem('dicy_sfxEnabled') !== 'false'; // Default on
    const savedSfxVolume = parseFloat(localStorage.getItem('dicy_sfxVolume') ?? '0.5');

    music.volume = savedMusicVolume;
    let musicPlaying = false;

    const musicToggle = document.getElementById('music-toggle');
    const musicVolume = document.getElementById('music-volume');

    musicVolume.value = savedMusicVolume * 100;


    // Function to load and play the next song
    function loadNextSong() {
        currentSongIndex = (currentSongIndex + 1) % availableSongs.length;
        music.src = './' + availableSongs[currentSongIndex];
        localStorage.setItem('dicy_currentSongIndex', currentSongIndex.toString());

        if (musicPlaying) {
            music.play();
        }
    }


    // Auto-start music on first user interaction (default ON)
    let shouldAutoplayMusic = savedMusicEnabled;

    // Handle song end - play next song
    music.addEventListener('ended', () => {
        loadNextSong();
    });

    musicToggle.addEventListener('click', () => {
        if (musicPlaying) {
            music.pause();
            musicToggle.textContent = '🔇';
            musicPlaying = false;
        } else {
            music.play();
            musicToggle.textContent = '🔊';
            musicPlaying = true;
        }
        localStorage.setItem('dicy_musicEnabled', musicPlaying.toString());
    });

    musicVolume.addEventListener('input', (e) => {
        music.volume = e.target.value / 100;
        localStorage.setItem('dicy_musicVolume', (e.target.value / 100).toString());
    });


    // 6. Initialize Sound Effects with localStorage
    const sfx = new SoundManager();
    sfx.setEnabled(savedSfxEnabled);
    sfx.setVolume(savedSfxVolume);

    const sfxToggle = document.getElementById('sfx-toggle');
    const sfxVolume = document.getElementById('sfx-volume');
    sfxVolume.value = savedSfxVolume * 100;
    sfxToggle.textContent = savedSfxEnabled ? '🔔' : '🔕';
    sfxToggle.classList.toggle('active', savedSfxEnabled);

    // Ensure audio context is created on first interaction
    document.body.addEventListener('click', () => {
        sfx.init();
        // Auto-play music on first click if it was enabled before
        if (shouldAutoplayMusic && !musicPlaying) {
            music.play();
            musicToggle.textContent = '🔊';
            musicPlaying = true;
        }
        shouldAutoplayMusic = false;
    }, { once: true });

    sfxToggle.addEventListener('click', () => {
        const enabled = !sfx.enabled;
        sfx.setEnabled(enabled);
        sfxToggle.textContent = enabled ? '🔔' : '🔕';
        sfxToggle.classList.toggle('active', enabled);
        localStorage.setItem('dicy_sfxEnabled', enabled.toString());
    });

    sfxVolume.addEventListener('input', (e) => {
        sfx.setVolume(e.target.value / 100);
        localStorage.setItem('dicy_sfxVolume', (e.target.value / 100).toString());
    });

    // Per-player autoplay state
    const autoplayPlayers = new Set();

    // UI Bindings
    const endTurnBtn = document.getElementById('end-turn-btn');
    const newGameBtn = document.getElementById('new-game-btn');
    const autoWinBtn = document.getElementById('auto-win-btn');
    const playerText = document.getElementById('player-turn');
    const logEntries = document.getElementById('log-entries');
    const turnIndicator = document.getElementById('turn-indicator');
    const diceResultHud = document.getElementById('dice-result-hud');
    const diceResultContent = document.getElementById('dice-result-content');

    // Turn-based log grouping
    let currentTurnLog = null;
    let turnStats = { attacks: 0, wins: 0, losses: 0, conquered: 0 };

    // Create a new turn group in the log
    const startTurnLog = (player) => {
        const playerName = getPlayerName(player);
        const colorHex = '#' + player.color.toString(16).padStart(6, '0');
        const isHuman = !player.isBot && !autoplayPlayers.has(player.id);

        // Capture game state snapshot for this turn
        const snapshot = turnHistory.captureSnapshot(game);
        const snapshotIndex = turnHistory.length - 1;

        // Reset stats
        turnStats = { attacks: 0, wins: 0, losses: 0, conquered: 0 };

        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = `turn-group ${isHuman ? 'expanded' : ''}`;
        wrapper.dataset.snapshotIndex = snapshotIndex;

        // Create header with action buttons
        const header = document.createElement('div');
        header.className = 'turn-header';
        header.innerHTML = `
            <span class="turn-player" style="color: ${colorHex}">${playerName}</span>
            <span class="turn-summary"></span>
            <span class="turn-actions">
                <button class="turn-action-btn" data-action="jump" title="Jump to this turn">⏪</button>
                <button class="turn-action-btn" data-action="save" title="Save as scenario">💾</button>
            </span>
            <span class="turn-toggle">${isHuman ? '▼' : '▶'}</span>
        `;

        // Create details container
        const details = document.createElement('div');
        details.className = 'turn-details';

        wrapper.appendChild(header);
        wrapper.appendChild(details);

        // Handle action button clicks
        header.querySelector('[data-action="jump"]').addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(wrapper.dataset.snapshotIndex);
            if (turnHistory.restoreSnapshot(game, idx)) {
                // Clear log and restart UI
                logEntries.innerHTML = '';
                turnHistory.snapshots.length = idx + 1; // Truncate future history
                renderer.forceUpdate();
                updatePlayerUI();
                game.emit('turnStart', { player: game.currentPlayer });
            }
        });

        header.querySelector('[data-action="save"]').addEventListener('click', (e) => {
            e.stopPropagation();
            // Store the snapshot index for the save modal
            saveScenarioModal.dataset.snapshotIndex = wrapper.dataset.snapshotIndex;
            scenarioNameInput.value = `Turn ${snapshot.turn} - ${playerName}`;
            saveScenarioModal.classList.remove('hidden');
        });

        // Toggle expand/collapse (only on main header area, not buttons)
        header.addEventListener('click', (e) => {
            if (e.target.closest('.turn-action-btn')) return;
            wrapper.classList.toggle('expanded');
            header.querySelector('.turn-toggle').textContent =
                wrapper.classList.contains('expanded') ? '▼' : '▶';
        });

        logEntries.insertBefore(wrapper, logEntries.firstChild);

        // Keep only last 20 turn groups
        while (logEntries.children.length > 20) {
            logEntries.removeChild(logEntries.lastChild);
        }

        currentTurnLog = { wrapper, details, header, player, isHuman, snapshotIndex };
    };

    // Update summary when turn ends
    const finalizeTurnLog = (reinforcements, saved = 0) => {
        if (!currentTurnLog) return;

        const { header } = currentTurnLog;
        const summary = header.querySelector('.turn-summary');

        let summaryText = '';
        if (turnStats.attacks > 0) {
            summaryText = `⚔️${turnStats.wins}/${turnStats.attacks}`;
            if (turnStats.conquered > 0) {
                summaryText += ` 🏴${turnStats.conquered}`;
            }
        }
        if (reinforcements > 0) {
            summaryText += ` +${reinforcements}🎲`;
        }
        if (saved > 0) {
            summaryText += ` 📦${saved}`;
        }
        if (!summaryText) {
            summaryText = '(no action)';
        }

        summary.textContent = summaryText;
    };

    // Helper to add log entry to current turn group (newest at top)
    const addLog = (message, type = '') => {
        if (!currentTurnLog) return;

        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = message;
        currentTurnLog.details.insertBefore(entry, currentTurnLog.details.firstChild);
    };

    // Dashboard Toggle (works on all screen sizes)
    const playerDashboard = document.getElementById('player-dashboard');
    const dashHeader = document.getElementById('dash-header');
    const dashToggle = document.getElementById('dash-toggle');

    // Collapse by default on mobile
    if (window.innerWidth <= 768) {
        playerDashboard.classList.add('collapsed');
        dashToggle.textContent = '[+]';
    }

    dashHeader.addEventListener('click', (e) => {
        // Don't toggle if clicking on autoplay buttons inside
        if (e.target.closest('.autoplay-toggle')) return;

        playerDashboard.classList.toggle('collapsed');
        dashToggle.textContent = playerDashboard.classList.contains('collapsed') ? '[+]' : '[-]';
    });

    const toggleAutoplay = (playerId, forceState) => {
        const isCurrentlyAutoplay = autoplayPlayers.has(playerId);
        const newState = forceState !== undefined ? forceState : !isCurrentlyAutoplay;

        if (newState) {
            autoplayPlayers.add(playerId);
        } else {
            autoplayPlayers.delete(playerId);
        }

        updatePlayerUI();

        // If it's currently this player's turn and we just enabled autoplay, trigger AI
        if (newState && game.currentPlayer.id === playerId && !game.gameOver) {
            endTurnBtn.disabled = true;
            endTurnBtn.textContent = 'END TURN';
            setTimeout(async () => {
                const playerAI = playerAIs.get(playerId);
                if (playerAI) {
                    await playerAI.takeTurn(game, gameSpeed);
                }
            }, 500);
        }
    };

    const checkDominance = () => {
        // Dominance check logic can be used for other purposes
        // autoWinBtn is now controlled in turnStart for per-player autoplay toggle
    };

    autoWinBtn.addEventListener('click', () => {
        // If any autoplay is active, disable ALL autoplay modes
        if (autoplayPlayers.size > 0) {
            autoplayPlayers.clear();
            autoWinBtn.classList.remove('active');
            updatePlayerUI();
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
    const resetGameSession = () => {
        // Close editor if open
        if (mapEditor.isOpen) {
            mapEditor.close();
        }

        // Reset game logic
        game.reset();

        // Clear logs
        logEntries.innerHTML = '';
        currentTurnLog = null;
        turnStats = { attacks: 0, wins: 0, losses: 0, conquered: 0 };

        // Hide HUDs
        diceResultHud.classList.add('hidden');
        turnIndicator.classList.add('hidden');
        endTurnBtn.classList.add('hidden');
        autoWinBtn.classList.add('hidden');
        playerDashboard.classList.add('hidden');
        newGameBtn.classList.add('hidden');

        // Clear renderer
        renderer.draw(); // Will draw empty grid
    };

    newGameBtn.addEventListener('click', () => {
        resetGameSession();
        // Show setup modal and hide game UI
        setupModal.classList.remove('hidden');
        document.querySelectorAll('.game-ui').forEach(el => el.classList.add('hidden'));
        // Also hide game over modal if it's open
        document.getElementById('game-over-modal').classList.add('hidden');
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
        if (!setupModal.classList.contains('hidden')) return;
        if (endTurnBtn.disabled) return;
        const humanPlayers = game.players.filter(p => !p.isBot);
        if (humanPlayers.length > 1) {
            input.deselect();
        }
        game.endTurn();
    });


    // ESC key opens settings/menu
    inputManager.on('menu', () => {
        const isSetupOpen = !setupModal.classList.contains('hidden');
        const isGameOverOpen = !document.getElementById('game-over-modal').classList.contains('hidden');

        if (isGameOverOpen) return;

        if (isSetupOpen) {
            // Only allow closing if a game has actually started
            if (game.players.length > 0) {
                setupModal.classList.add('hidden');
                document.querySelectorAll('.game-ui').forEach(el => el.classList.remove('hidden'));
            }
            return;
        }

        // Show setup modal (new game menu)
        resetGameSession();
        setupModal.classList.remove('hidden');
        document.querySelectorAll('.game-ui').forEach(el => el.classList.add('hidden'));
    });

    // Space/Enter/Gamepad A triggers start game when in setup menu
    const triggerStartIfMenuOpen = () => {
        const isSetupOpen = !setupModal.classList.contains('hidden');
        const isGameOverOpen = !document.getElementById('game-over-modal').classList.contains('hidden');

        if (isSetupOpen) {
            startBtn.click();
            return true;
        }
        if (isGameOverOpen) {
            document.getElementById('restart-btn').click();
            return true;
        }
        return false;
    };

    inputManager.on('confirm', () => {
        triggerStartIfMenuOpen();
    });

    inputManager.on('endTurn', () => {
        // Only trigger start if in menu, otherwise let the normal endTurn handler work
        const isSetupOpen = !setupModal.classList.contains('hidden');
        const isGameOverOpen = !document.getElementById('game-over-modal').classList.contains('hidden');
        if (isSetupOpen || isGameOverOpen) {
            triggerStartIfMenuOpen();
        }
    });

    game.on('turnStart', (data) => {
        // Hide dice result HUD when turn starts
        diceResultHud.classList.add('hidden');

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
                // Use per-player AI configuration
                const playerAI = playerAIs.get(data.player.id);
                if (playerAI) {
                    await playerAI.takeTurn(game, gameSpeed);
                } else {
                    // Fallback: end turn immediately
                    game.endTurn();
                }
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

        // Reset turn stats if new attacker (should be cleared on turn start actually, but just in case)
        if (result.attackerId === game.currentPlayer.id) {
            turnStats.attacks++;
            if (result.won) {
                turnStats.wins++;
                turnStats.conquered++;
            }
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

        // Show dice result in HUD
        const isHumanAttacker = attacker && !attacker.isBot && !autoplayPlayers.has(attacker.id);
        const shouldShowHUD = gameSpeed === 'beginner' || (gameSpeed === 'normal' && isHumanAttacker);

        if (shouldShowHUD) {
            const attackerColor = attacker ? '#' + attacker.color.toString(16).padStart(6, '0') : '#ffffff';
            const defenderColor = defender ? '#' + defender.color.toString(16).padStart(6, '0') : '#ffffff';

            // Build dice icons HTML with + between each die
            // If more than 6 dice, show as multiplier format (e.g. 7x 🎲)
            const buildDiceDisplay = (count, sum, color) => {
                let icons = '';
                if (count > 6) {
                    icons = `<span style="color:${color}; font-weight: bold; font-size: 16px; margin-right: 2px;">${count}x</span><span class="dice-icon" style="color:${color}">🎲</span>`;
                } else {
                    for (let i = 0; i < count; i++) {
                        icons += `<span class="dice-icon" style="color:${color}">🎲</span>`;
                        if (i < count - 1) icons += '<span class="dice-plus">+</span>';
                    }
                }
                return `${icons}<span class="dice-sum" style="color:${color}">${sum}</span>`;
            };

            diceResultContent.innerHTML = `
                <div class="dice-group">
                    ${buildDiceDisplay(result.attackerRolls.length, attackSum, attackerColor)}
                </div>
                <span class="vs-indicator ${result.won ? 'win' : 'loss'}">${result.won ? '>' : '≤'}</span>
                <div class="dice-group">
                    ${buildDiceDisplay(result.defenderRolls.length, defendSum, defenderColor)}
                </div>
            `;

            // Set HUD glow to attacker color
            diceResultHud.style.borderColor = attackerColor;
            diceResultHud.style.boxShadow = `0 0 15px ${attackerColor}40`;

            diceResultHud.classList.remove('hidden');

            // Auto-hide after 1.5 seconds
            clearTimeout(diceResultHud._hideTimeout);
            diceResultHud._hideTimeout = setTimeout(() => {
                diceResultHud.classList.add('hidden');
            }, 1500);
        }

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

        // Show reinforcement popup in HUD
        const isHuman = !data.player.isBot && !autoplayPlayers.has(data.player.id);
        const shouldShowHUD = gameSpeed === 'beginner' || (gameSpeed === 'normal' && isHuman);

        if (shouldShowHUD && (data.placed > 0 || data.stored > 0)) {
            const playerColor = '#' + data.player.color.toString(16).padStart(6, '0');
            const fontSize = isHuman ? 36 : 24;
            const storedSize = isHuman ? 20 : 14;

            let content = `<span style="color:${playerColor}; font-size: ${fontSize}px; font-weight: bold;">+${data.placed} 🎲</span>`;
            if (data.stored > 0) {
                content += ` <span style="color:#ffaa00; font-size: ${storedSize}px;">(${data.stored} saved)</span>`;
            }

            diceResultContent.innerHTML = content;

            // Set HUD glow to player color
            diceResultHud.style.borderColor = playerColor;
            diceResultHud.style.boxShadow = `0 0 ${isHuman ? 25 : 15}px ${playerColor}60`;

            // Bigger padding for human
            diceResultHud.style.padding = isHuman ? '12px 24px' : '6px 16px';

            diceResultHud.classList.remove('hidden');

            // Add bounce animation for human
            if (isHuman) {
                diceResultHud.style.animation = 'reinforce-bounce 0.5s ease-out';
                diceResultHud.addEventListener('animationend', () => {
                    diceResultHud.style.animation = '';
                }, { once: true });
            }

            // Auto-hide after 2.5 seconds (longer for human)
            const hideDelay = isHuman ? 3000 : 2000;
            clearTimeout(diceResultHud._hideTimeout);
            diceResultHud._hideTimeout = setTimeout(() => {
                diceResultHud.classList.add('hidden');
            }, hideDelay);
        }

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

    // === AI Editor Modal Logic ===
    const aiEditorModal = document.getElementById('ai-editor-modal');
    const aiEditorCloseBtn = document.getElementById('ai-editor-close-btn');
    const manageAIsBtn = document.getElementById('manage-ais-btn');
    const aiList = document.getElementById('ai-list');
    const aiNameInput = document.getElementById('ai-name-input');
    const aiCodeInput = document.getElementById('ai-code-input');
    const aiPromptInput = document.getElementById('ai-prompt-input');
    const newAIBtn = document.getElementById('new-ai-btn');
    const saveAIBtn = document.getElementById('save-ai-btn');
    const testAIBtn = document.getElementById('test-ai-btn');
    const deleteAIBtn = document.getElementById('delete-ai-btn');
    const exportAIBtn = document.getElementById('export-ai-btn');
    const importAIBtn = document.getElementById('import-ai-btn');
    const generatePromptBtn = document.getElementById('generate-prompt-btn');
    const botAISelect = document.getElementById('bot-ai-select');
    const apiDocsHeader = document.querySelector('.collapsible-header');
    const apiDocs = document.querySelector('.ai-api-docs');

    let currentEditingAI = null;

    // Populate AI dropdown and list
    const updateAIDropdown = () => {
        const ais = aiRegistry.getAllAIs();
        // Clear custom options from dropdown (keep 5 built-in: easy, medium, hard, adaptive, custom)
        while (botAISelect.options.length > 5) {
            botAISelect.remove(5);
        }
        // Add custom AIs
        for (const ai of ais.filter(a => !a.isBuiltIn)) {
            const option = document.createElement('option');
            option.value = ai.id;
            option.textContent = ai.name;
            botAISelect.appendChild(option);
        }
        // Restore selection
        if (selectedBotAI && Array.from(botAISelect.options).some(o => o.value === selectedBotAI)) {
            botAISelect.value = selectedBotAI;
        }
    };

    const updateAIList = () => {
        const ais = aiRegistry.getAllAIs();
        aiList.innerHTML = '';

        // Count name occurrences to detect duplicates
        const nameCounts = {};
        for (const ai of ais) {
            nameCounts[ai.name] = (nameCounts[ai.name] || 0) + 1;
        }

        for (const ai of ais) {
            const item = document.createElement('div');
            item.className = 'ai-list-item' + (ai.isBuiltIn ? ' builtin' : '') +
                (currentEditingAI === ai.id ? ' active' : '');

            // Show UUID suffix for duplicates
            let displayName = ai.name;
            if (nameCounts[ai.name] > 1 && ai.uuid) {
                displayName += ` (${ai.uuid.slice(-6)})`;
            }
            displayName += ai.isBuiltIn ? ' (built-in)' : '';

            item.textContent = displayName;
            item.dataset.aiId = ai.id;
            item.addEventListener('click', () => loadAIForEditing(ai.id));
            aiList.appendChild(item);
        }
    };

    const loadAIForEditing = (aiId) => {
        const ai = aiRegistry.getAI(aiId);
        if (!ai) return;

        currentEditingAI = aiId;
        aiNameInput.value = ai.name;
        aiCodeInput.value = ai.code;
        aiPromptInput.value = ai.prompt || '';

        // Hide test results when switching AIs
        const resultsContainer = document.getElementById('ai-test-results');
        if (resultsContainer) resultsContainer.classList.add('hidden');

        // Hide/show controls based on built-in status
        const isBuiltIn = aiRegistry.builtIn.has(aiId);
        aiNameInput.disabled = isBuiltIn;
        aiCodeInput.disabled = isBuiltIn;

        // Hide save/delete for built-in AIs
        saveAIBtn.style.display = isBuiltIn ? 'none' : '';
        deleteAIBtn.style.display = isBuiltIn ? 'none' : '';

        updateAIList();
    };

    const createNewAI = () => {
        currentEditingAI = null;
        aiNameInput.value = '';
        aiNameInput.disabled = false;
        aiCodeInput.disabled = false;
        saveAIBtn.style.display = '';
        deleteAIBtn.style.display = 'none';
        aiCodeInput.value = `// Your AI code here
// Use api.getMyTiles(), api.attack(), etc.

const myTiles = api.getMyTiles().filter(t => t.dice > 1);

for (const tile of myTiles) {
    const neighbors = api.getAdjacentTiles(tile.x, tile.y);
    for (const target of neighbors) {
        if (target.owner !== api.myId && tile.dice > target.dice) {
            api.attack(tile.x, tile.y, target.x, target.y);
        }
    }
}

api.endTurn();`;
        updateAIList();
    };

    const saveCurrentAI = () => {
        const name = aiNameInput.value.trim();
        const code = aiCodeInput.value;
        const prompt = aiPromptInput.value.trim();

        if (!name) {
            alert('Please enter a name for your AI');
            return;
        }

        if (currentEditingAI && aiRegistry.custom.has(currentEditingAI)) {
            // Update existing
            aiRegistry.updateCustomAI(currentEditingAI, { name, code, prompt });
        } else {
            // Create new
            const id = aiRegistry.generateId();
            aiRegistry.registerCustomAI(id, { name, code, prompt });
            currentEditingAI = id;
        }

        updateAIList();
        updateAIDropdown();
        deleteAIBtn.style.display = '';

        // Show success feedback
        saveAIBtn.textContent = '✓ Saved!';
        setTimeout(() => {
            saveAIBtn.textContent = '💾 Save';
        }, 2000);
    };

    const deleteCurrentAI = () => {
        if (!currentEditingAI) return;
        if (!confirm('Delete this AI?')) return;

        aiRegistry.deleteCustomAI(currentEditingAI);
        createNewAI();
        updateAIDropdown();
    };

    const testCurrentAI = async () => {
        const code = aiCodeInput.value;
        const aiName = aiNameInput.value.trim() || 'Test AI';

        // Get UI elements
        const resultsContainer = document.getElementById('ai-test-results');
        const statusEl = document.getElementById('ai-test-status');
        const tableBody = document.querySelector('#ai-test-table tbody');

        // Show results container
        resultsContainer.classList.remove('hidden');
        tableBody.innerHTML = '';

        // Step 1: Validate JS syntax
        statusEl.className = 'running';
        statusEl.textContent = '⏳ Validating code syntax...';

        try {
            new Function('api', code);
        } catch (e) {
            statusEl.className = 'error';
            statusEl.textContent = `❌ Syntax Error: ${e.message}`;
            return;
        }

        statusEl.textContent = '✓ Syntax valid. Starting benchmark...';
        testAIBtn.textContent = '⏳ Running...';
        testAIBtn.disabled = true;

        // Step 2: Get all opponent AIs
        const allAIs = [
            aiRegistry.getAI('easy'),
            aiRegistry.getAI('medium'),
            aiRegistry.getAI('hard'),
            ...Array.from(aiRegistry.custom.values())
        ].filter(Boolean);

        // Create temp AI definition for testing
        const testAI = {
            id: 'test_' + Date.now(),
            name: aiName,
            code: code
        };

        const results = [];

        // Step 3: Run games against each opponent
        const runGame = async (ai1, ai2) => {
            const testGame = new Game();
            testGame.startGame({
                humanCount: 0,
                botCount: 2,
                mapWidth: 4,
                mapHeight: 4,
                maxDice: 9,
                diceSides: 6,
                mapStyle: 'fullgrid',
                gameMode: 'classic'
            });

            const ids = [ai1.id, ai2.id];
            const codes = [ai1.code, ai2.code];
            testGame.players.forEach((p, idx) => {
                p.aiId = ids[idx];
                p.aiCode = codes[idx];
            });

            let turns = 0;
            const maxTurns = 500;

            while (testGame.players.filter(p => p.alive).length > 1 && turns < maxTurns) {
                const p = testGame.currentPlayer;
                if (p.alive) {
                    const w = testGame.map.width;
                    const tilesWithCoords = testGame.map.tiles.map((t, idx) => ({ ...t, x: idx % w, y: Math.floor(idx / w) }));

                    const api = {
                        getMyTiles: () => tilesWithCoords.filter(t => t.owner === p.id && !t.blocked),
                        getEnemyTiles: () => tilesWithCoords.filter(t => t.owner !== p.id && !t.blocked),
                        getAllTiles: () => tilesWithCoords.filter(t => !t.blocked),
                        getAdjacentTiles: (x, y) => testGame.map.getAdjacentTiles(x, y),
                        getTileAt: (x, y) => testGame.map.getTile(x, y),
                        getLargestConnectedRegion: (pid) => testGame.map.findLargestConnectedRegion(pid),
                        getReinforcements: (pid) => {
                            const r = testGame.map.findLargestConnectedRegion(pid);
                            const pl = testGame.players.find(pp => pp.id === pid);
                            return r + (pl ? (pl.storedDice || 0) : 0);
                        },
                        getPlayerInfo: (pid) => testGame.players.find(pp => pp.id === pid) || null,
                        get players() { return testGame.players; },
                        simulateAttack: (fromX, fromY, toX, toY) => {
                            const fromT = testGame.map.getTile(fromX, fromY);
                            const toT = testGame.map.getTile(toX, toY);
                            if (!fromT || !toT || fromT.owner !== p.id || fromT.dice <= 1) return { success: false };
                            const eWin = fromT.dice > toT.dice;
                            const origFromD = fromT.dice;
                            const origToD = toT.dice;
                            const origToO = toT.owner;
                            let mR = 0, eR = 0;

                            if (eWin) {
                                fromT.dice = 1;
                                toT.owner = p.id;
                                toT.dice = origFromD - 1;
                                mR = testGame.map.findLargestConnectedRegion(p.id) + (p.storedDice || 0);
                                if (origToO !== null) eR = testGame.map.findLargestConnectedRegion(origToO);
                                fromT.dice = origFromD;
                                toT.owner = origToO;
                                toT.dice = origToD;
                            } else {
                                mR = testGame.map.findLargestConnectedRegion(p.id) + (p.storedDice || 0);
                                if (origToO !== null) eR = testGame.map.findLargestConnectedRegion(origToO);
                            }
                            return { success: true, expectedWin: eWin, myPredictedReinforcements: mR, enemyPredictedReinforcements: eR };
                        },
                        get myId() { return p.id; },
                        get maxDice() { return testGame.maxDice; },
                        get diceSides() { return testGame.diceSides; },
                        get mapWidth() { return testGame.map.width; },
                        get mapHeight() { return testGame.map.height; },
                        attack: (fx, fy, tx, ty) => {
                            const ft = testGame.map.getTile(fx, fy);
                            const tt = testGame.map.getTile(tx, ty);
                            if (ft && tt && ft.owner === p.id && ft.dice > tt.dice) {
                                testGame.attack(fx, fy, tx, ty);
                                return { success: true, expectedWin: true };
                            }
                            return { success: false };
                        },
                        endTurn: () => { },
                        load: () => null,
                        save: () => null,
                        log: () => { },
                        getWinProbability: (a, d) => 1 / (1 + Math.exp(-(a * 3.5 - d * 3.5) / 2))
                    };

                    try {
                        const fn = new Function('api', p.aiCode);
                        fn(api);
                    } catch (e) { }
                }
                testGame.endTurn();
                turns++;
            }
            return testGame.winner ? testGame.winner.id : -1;
        };

        // Run benchmark for each opponent
        for (const opponent of allAIs) {
            statusEl.textContent = `⏳ Testing vs ${opponent.name}...`;
            let wins = 0;
            let draws = 0;

            for (let g = 0; g < 10; g++) {
                const reversed = g % 2 === 1;
                const winnerId = await runGame(
                    reversed ? opponent : testAI,
                    reversed ? testAI : opponent
                );

                if (winnerId === -1) {
                    // Draw (max turns reached)
                    draws++;
                } else {
                    // Determine if testAI won
                    const testAIIsP0 = !reversed;
                    const winnerIsP0 = winnerId === 0;
                    if (winnerIsP0 === testAIIsP0) wins++;
                }

                await new Promise(r => setTimeout(r, 0));
            }

            const losses = 10 - wins - draws;
            const winRate = Math.round(wins * 10);

            results.push({ opponent: opponent.name, wins, draws, losses, winRate });

            // Update table incrementally
            const row = document.createElement('tr');
            const winRateClass = winRate >= 60 ? 'win-rate-good' : (winRate >= 40 ? 'win-rate-ok' : 'win-rate-bad');
            row.innerHTML = `
                <td>${opponent.name}</td>
                <td>${wins}</td>
                <td>${draws}</td>
                <td>${losses}</td>
                <td class="${winRateClass}">${winRate}%</td>
            `;
            tableBody.appendChild(row);
        }

        // Compute overall stats
        const totalWins = results.reduce((s, r) => s + r.wins, 0);
        const totalGames = results.length * 10;
        const overallRate = Math.round(totalWins / totalGames * 100);

        statusEl.className = '';
        statusEl.textContent = `✅ Benchmark complete! Overall: ${totalWins}/${totalGames} wins (${overallRate}%) on 4x4 full grid`;

        testAIBtn.textContent = '▶ Test';
        testAIBtn.disabled = false;
    };

    const generatePrompt = () => {
        const userStrategy = aiPromptInput.value.trim() || 'Create an AI that plays well';

        const prompt = `Create JavaScript code for a DICEPTION game AI bot.

AVAILABLE API:
Game State:
- api.getMyTiles() → [{x, y, dice, owner}] - Get all tiles owned by this AI
- api.getEnemyTiles() → [{x, y, dice, owner}] - Get all enemy tiles
- api.getAllTiles() → All playable tiles on the map
- api.getAdjacentTiles(x, y) → [{x, y, dice, owner}] - Get neighboring tiles
- api.getTileAt(x, y) → Get specific tile or null
- api.myId → This AI's player ID
- api.maxDice → Maximum dice per tile (usually 9)
- api.diceSides → Number of sides on each die (usually 6)
- api.mapWidth, api.mapHeight → Map dimensions
- api.players → Array of all players [{id, alive, storedDice}]

Strategy Helpers:
- api.getLargestConnectedRegion(playerId) → Size of largest connected territory
- api.getReinforcements(playerId) → Total reinforcements player will receive (region size + stored dice)
- api.getPlayerInfo(playerId) → Player object {id, alive, storedDice} or null
- api.simulateAttack(fromX, fromY, toX, toY) → Predict attack WITHOUT executing:
    Returns {success, expectedWin, myPredictedReinforcements, enemyPredictedReinforcements}
    Use this to evaluate which moves would most improve your position!

Actions:
- api.attack(fromX, fromY, toX, toY) → {success: boolean, expectedWin: boolean}
- api.endTurn() → End this AI's turn

Utilities:
- api.save(key, value) → Persist data between games
- api.load(key) → Load persisted data
- api.log(msg) → Debug output to console
- api.getWinProbability(attackDice, defendDice) → 0-1 probability

GAME RULES:
- The game is turn based and the rules similar to risk, kdice or dicewars.
- Attacker must have dice > 1 to attack
- Both sides roll all their dice, highest sum wins
- On win: attacker moves to captured tile with (dice-1), leaving 1 behind
- On loss: attacker drops to 1 die
- At end of turn, player gets reinforcements equal to largest connected region

USER'S STRATEGY REQUEST:
${userStrategy}

Return ONLY the JavaScript code, no explanations or markdown. The code will run inside a sandboxed environment with access to the 'api' object.`;

        navigator.clipboard.writeText(prompt).then(() => {
            generatePromptBtn.textContent = '✓ Copied!';
            setTimeout(() => {
                generatePromptBtn.textContent = '📋 Copy Prompt to Clipboard';
            }, 2000);
        }).catch(() => {
            alert('Could not copy to clipboard. Please manually select and copy the text.');
        });
    };

    const exportAI = () => {
        if (!currentEditingAI) {
            alert('Select an AI to export');
            return;
        }
        const data = aiRegistry.exportAI(currentEditingAI);
        if (data) {
            // Create and download JSON file
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${data.name.replace(/[^a-z0-9]/gi, '_')}_ai.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            exportAIBtn.textContent = '✓ Downloaded!';
            setTimeout(() => {
                exportAIBtn.textContent = '📤 Export';
            }, 2000);
        }
    };

    const importAI = () => {
        // Create hidden file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                const result = aiRegistry.importAI(data);
                if (result.success) {
                    updateAIList();
                    updateAIDropdown();
                    loadAIForEditing(result.id);

                    if (result.replaced) {
                        importAIBtn.textContent = '✓ Updated!';
                    } else {
                        importAIBtn.textContent = '✓ Imported!';
                    }
                    setTimeout(() => {
                        importAIBtn.textContent = '📥 Import';
                    }, 2000);
                } else {
                    alert('Import failed: ' + result.error);
                }
            } catch (err) {
                alert('Failed to read file: ' + err.message);
            }
        };

        input.click();
    };

    // Event handlers
    manageAIsBtn.addEventListener('click', () => {
        setupModal.classList.add('hidden');
        aiEditorModal.classList.remove('hidden');
        updateAIList();
        if (!currentEditingAI) {
            loadAIForEditing('easy');
        }
    });

    aiEditorCloseBtn.addEventListener('click', () => {
        aiEditorModal.classList.add('hidden');
        setupModal.classList.remove('hidden');
        // Hide test results when closing editor
        const resultsContainer = document.getElementById('ai-test-results');
        if (resultsContainer) resultsContainer.classList.add('hidden');
    });

    // Close button for test results
    document.getElementById('ai-test-close-btn').addEventListener('click', () => {
        document.getElementById('ai-test-results').classList.add('hidden');
    });

    newAIBtn.addEventListener('click', createNewAI);
    saveAIBtn.addEventListener('click', saveCurrentAI);
    deleteAIBtn.addEventListener('click', deleteCurrentAI);
    testAIBtn.addEventListener('click', testCurrentAI);
    exportAIBtn.addEventListener('click', exportAI);
    importAIBtn.addEventListener('click', importAI);
    generatePromptBtn.addEventListener('click', generatePrompt);

    // API docs toggle
    apiDocsHeader.addEventListener('click', () => {
        apiDocs.classList.toggle('open');
    });

    // Per-player AI config DOM elements
    const perPlayerAIConfigEl = document.getElementById('per-player-ai-config');
    const perPlayerAIList = document.getElementById('per-player-ai-list');

    // Generate AI dropdown options HTML
    const getAIOptionsHTML = (selectedValue = 'easy') => {
        const ais = aiRegistry.getAllAIs();
        let html = '';
        for (const ai of ais) {
            const selected = ai.id === selectedValue ? ' selected' : '';
            html += `<option value="${ai.id}"${selected}>${ai.name}</option>`;
        }
        return html;
    };

    // Update per-player AI config based on bot count
    const updatePerPlayerConfig = () => {
        const botCount = parseInt(botCountInput.value);
        const humanCount = parseInt(humanCountInput.value);

        perPlayerAIList.innerHTML = '';

        for (let i = 0; i < botCount; i++) {
            // Player IDs for bots start after human players
            const playerId = humanCount + i;
            const savedAI = perPlayerAIConfig[playerId] || 'easy';

            const row = document.createElement('div');
            row.className = 'per-player-ai-row';
            row.innerHTML = `
                <span class="bot-label">Bot ${i + 1}</span>
                <select class="per-player-ai-select" data-player-id="${playerId}">
                    ${getAIOptionsHTML(savedAI)}
                </select>
            `;
            perPlayerAIList.appendChild(row);
        }

        // Add change listeners
        perPlayerAIList.querySelectorAll('.per-player-ai-select').forEach(select => {
            select.addEventListener('change', () => {
                perPlayerAIConfig[select.dataset.playerId] = select.value;
                localStorage.setItem('dicy_perPlayerAIConfig', JSON.stringify(perPlayerAIConfig));
            });
        });
    };

    // AI selection change - show/hide per-player config
    botAISelect.addEventListener('change', () => {
        selectedBotAI = botAISelect.value;
        localStorage.setItem('dicy_botAI', selectedBotAI);

        if (selectedBotAI === 'custom') {
            perPlayerAIConfigEl.style.display = 'flex';
            updatePerPlayerConfig();
        } else {
            perPlayerAIConfigEl.style.display = 'none';
        }
    });

    // Update per-player config when bot count changes
    botCountInput.addEventListener('change', () => {
        if (selectedBotAI === 'custom') {
            updatePerPlayerConfig();
        }
    });

    // Load saved AI selection (per-player config updated later after bot count is loaded)
    if (selectedBotAI) {
        botAISelect.value = selectedBotAI;
    }
    updateAIDropdown();

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

        // Helper to get AI id for a player
        const getPlayerAIId = (playerId) => {
            if (selectedBotAI === 'custom') {
                return perPlayerAIConfig[playerId] || 'easy';
            }
            return selectedBotAI;
        };

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

            // Assign names for API
            tourneyGame.players.forEach(p => {
                const aiId = getPlayerAIId(p.id);
                const aiDef = aiRegistry.getAI(aiId);
                const aiName = aiDef ? aiDef.name : aiId;
                p.name = `${aiName} ${p.id}`;
            });

            // Run game to completion using simple direct AI (no Web Workers for speed)
            let turns = 0;
            const maxTurns = 2000;
            while (!tourneyGame.gameOver && turns < maxTurns) {
                // Simple synchronous AI execution
                const currentPlayer = tourneyGame.currentPlayer;
                const playerAIId = getPlayerAIId(currentPlayer.id);

                // Check if simple built-in AI (fast path)
                if (['easy', 'medium', 'hard'].includes(playerAIId)) {
                    const mapWidth = tourneyGame.map.width;
                    const myTiles = [];
                    tourneyGame.map.tiles.forEach((t, idx) => {
                        if (t.owner === currentPlayer.id && t.dice > 1) {
                            myTiles.push({
                                tile: t,
                                x: idx % mapWidth,
                                y: Math.floor(idx / mapWidth)
                            });
                        }
                    });

                    // Simple attack logic
                    for (const { tile, x, y } of myTiles) {
                        if (tourneyGame.gameOver) break;
                        const neighbors = tourneyGame.map.getAdjacentTiles(x, y);
                        for (const target of neighbors) {
                            if (target.owner !== currentPlayer.id) {
                                const diff = tile.dice - target.dice;
                                const shouldAttack = playerAIId === 'easy' ? diff >= 0 :
                                    playerAIId === 'medium' ? diff >= 1 :
                                        diff >= 2 || tile.dice >= 7; // hard
                                if (shouldAttack && tile.dice > 1) {
                                    tourneyGame.attack(x, y, target.x, target.y);
                                }
                            }
                        }
                    }
                    tourneyGame.endTurn();
                } else {
                    // Custom or Adaptive AI -> Execute code synchronously
                    const aiDef = aiRegistry.getAI(playerAIId);
                    if (aiDef) { // Fallback to easy if missing

                        // Mock API for synchronous execution (subset of full API)
                        const actions = [];
                        let turnEnded = false;
                        let moveCount = 0;
                        const maxMoves = 200;

                        const api = {
                            getMyTiles: () => tourneyGame.map.tiles.filter(t => t.owner === currentPlayer.id && !t.blocked).map(t => ({ ...t, x: tourneyGame.map.tiles.indexOf(t) % tourneyGame.map.width, y: Math.floor(tourneyGame.map.tiles.indexOf(t) / tourneyGame.map.width) })),
                            getEnemyTiles: () => tourneyGame.map.tiles.filter(t => t.owner !== currentPlayer.id && !t.blocked).map(t => ({ ...t, x: tourneyGame.map.tiles.indexOf(t) % tourneyGame.map.width, y: Math.floor(tourneyGame.map.tiles.indexOf(t) / tourneyGame.map.width) })),
                            getAllTiles: () => tourneyGame.map.tiles.filter(t => !t.blocked).map(t => ({ ...t, x: tourneyGame.map.tiles.indexOf(t) % tourneyGame.map.width, y: Math.floor(tourneyGame.map.tiles.indexOf(t) / tourneyGame.map.width) })),
                            getAdjacentTiles: (x, y) => tourneyGame.map.getAdjacentTiles(x, y),
                            getTileAt: (x, y) => tourneyGame.map.getTile(x, y),

                            // --- NEW API METHODS ---
                            getLargestConnectedRegion: (playerId) => {
                                return tourneyGame.map.findLargestConnectedRegion(playerId);
                            },

                            getReinforcements: (playerId) => {
                                const region = tourneyGame.map.findLargestConnectedRegion(playerId);
                                const player = tourneyGame.players.find(p => p.id === playerId);
                                const stored = player ? (player.storedDice || 0) : 0;
                                return region + stored;
                            },

                            getPlayerInfo: (playerId) => {
                                return tourneyGame.players.find(p => p.id === playerId) || null;
                            },

                            get players() { return tourneyGame.players; },

                            simulateAttack: (fromX, fromY, toX, toY) => {
                                const fromTile = tourneyGame.map.getTile(fromX, fromY);
                                const toTile = tourneyGame.map.getTile(toX, toY);

                                if (!fromTile || !toTile || fromTile.owner !== currentPlayer.id || fromTile.dice <= 1) {
                                    return { success: false, reason: 'invalid_move' };
                                }

                                // Temporarily mutate state for simulation
                                const originalFromOwner = fromTile.owner;
                                const originalFromDice = fromTile.dice;
                                const originalToOwner = toTile.owner;
                                const originalToDice = toTile.dice;

                                const expectedWin = fromTile.dice > toTile.dice;
                                let myReinforcements = 0;
                                let enemyReinforcements = 0;
                                const enemyId = originalToOwner;

                                if (expectedWin) {
                                    fromTile.dice = 1;
                                    toTile.owner = currentPlayer.id;
                                    toTile.dice = originalFromDice - 1;

                                    myReinforcements = tourneyGame.map.findLargestConnectedRegion(currentPlayer.id);
                                    myReinforcements += (currentPlayer.storedDice || 0);

                                    if (enemyId !== null) {
                                        const enemy = tourneyGame.players.find(p => p.id === enemyId);
                                        enemyReinforcements = tourneyGame.map.findLargestConnectedRegion(enemyId);
                                        if (enemy) enemyReinforcements += (enemy.storedDice || 0);
                                    }

                                    // Revert
                                    fromTile.owner = originalFromOwner;
                                    fromTile.dice = originalFromDice;
                                    toTile.owner = originalToOwner;
                                    toTile.dice = originalToDice;

                                    // Also revert fromTile ownership if it changed (it didn't in this logic, only dice)
                                } else {
                                    // Attack failed - state unchanged w.r.t regions
                                    myReinforcements = tourneyGame.map.findLargestConnectedRegion(currentPlayer.id);
                                    myReinforcements += (currentPlayer.storedDice || 0);

                                    if (enemyId !== null) {
                                        const enemy = tourneyGame.players.find(p => p.id === enemyId);
                                        enemyReinforcements = tourneyGame.map.findLargestConnectedRegion(enemyId);
                                        if (enemy) enemyReinforcements += (enemy.storedDice || 0);
                                    }
                                }

                                return {
                                    success: true,
                                    expectedWin,
                                    myPredictedReinforcements: myReinforcements,
                                    enemyPredictedReinforcements: enemyReinforcements
                                };
                            },
                            // -----------------------

                            getMyId: () => currentPlayer.id, // Legacy support
                            get myId() { return currentPlayer.id; },
                            get maxDice() { return tourneyGame.maxDice; },
                            get diceSides() { return tourneyGame.diceSides; },
                            get mapWidth() { return tourneyGame.map.width; },
                            get mapHeight() { return tourneyGame.map.height; },

                            attack: (fromX, fromY, toX, toY) => {
                                if (turnEnded || moveCount >= maxMoves) return { success: false };

                                // Validate ownership matches current player
                                const fromTile = tourneyGame.map.getTile(fromX, fromY);
                                if (!fromTile || fromTile.owner !== currentPlayer.id) return { success: false };

                                actions.push({ type: 'attack', fromX, fromY, toX, toY });
                                moveCount++;

                                // Simulate for AI state tracking (simplified)
                                const toTile = tourneyGame.map.getTile(toX, toY);
                                if (toTile && fromTile.dice > toTile.dice) {
                                    return { success: true, expectedWin: true };
                                }
                                return { success: true, expectedWin: false };
                            },
                            endTurn: () => {
                                turnEnded = true;
                            },
                            log: () => { }, // Silence logs
                            save: () => { }, // No storage in tournaments for speed
                            load: () => null,
                            getWinProbability: (att, def) => 1 / (1 + Math.exp(-(att - def) / 2))
                        };

                        try {
                            const aiFn = new Function('api', aiDef.code);
                            aiFn(api);

                            // Execute actions
                            for (const action of actions) {
                                if (tourneyGame.gameOver) break;
                                if (action.type === 'attack') {
                                    try {
                                        tourneyGame.attack(action.fromX, action.fromY, action.toX, action.toY);
                                    } catch (e) { }
                                }
                            }
                        } catch (e) {
                            console.warn(`AI Error (${playerAIId}):`, e);
                        }
                    }
                    tourneyGame.endTurn();
                }

                turns++;
            }

            // Record result
            // Record result
            if (tourneyGame.winner) {
                const winnerId = tourneyGame.winner.id;
                const aiId = getPlayerAIId(winnerId);
                const aiDef = aiRegistry.getAI(aiId);
                const aiName = aiDef ? aiDef.name : aiId;

                // Consistent naming with main game (e.g. "Easy 1" instead of "Easy (Player 1)")
                const key = `${aiName} ${winnerId}`;
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
    const savedEffectsQuality = localStorage.getItem('effectsQuality') || 'high';
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
        const savedScenarioId = localStorage.getItem('dicy_loadedScenario');
        if (savedScenarioId) {
            try {
                console.log('Loading saved scenario:', savedScenarioId);
                console.log('Scenario manager has', scenarioManager.scenarios.size, 'scenarios loaded');
                const scenario = scenarioManager.loadScenario(savedScenarioId);
                console.log('Loaded scenario result:', scenario ? 'found' : 'not found');
                if (scenario) {
                    pendingScenario = scenario;
                    updateConfigFromScenario(scenario);
                    updateLoadedScenarioDisplay(scenario.name);
                    console.log('Scenario loaded successfully:', scenario.name);
                } else {
                    // Scenario no longer exists, remove from localStorage
                    console.warn('Scenario not found, removing from localStorage:', savedScenarioId);
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
        const savedScenarioId = localStorage.getItem('dicy_loadedScenario');
        if (!savedScenarioId) return;

        const scenario = scenarioManager.loadScenario(savedScenarioId);
        if (scenario || attempts >= 10) {
            loadSavedScenario();
        } else {
            setTimeout(() => tryLoadScenario(attempts + 1), 50);
        }
    };

    setTimeout(() => tryLoadScenario(), 10);

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

    // Per-player AI config - update after bot count is set
    if (selectedBotAI === 'custom') {
        perPlayerAIConfigEl.style.display = 'flex';
        updatePerPlayerConfig();
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
            loadedScenarioName.style.display = 'inline';
            loadedScenarioName.style.cursor = 'pointer';
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
        logEntries.innerHTML = '';
        addLog('Game started!', '');

        // Show Game UI first so event handlers can set correct state
        setupModal.classList.add('hidden');
        document.querySelectorAll('.game-ui').forEach(el => el.classList.remove('hidden'));

        // Load pending scenario from localStorage if needed
        const loadPendingScenarioIfNeeded = () => {
            if (!pendingScenario) {
                const savedScenarioId = localStorage.getItem('dicy_loadedScenario');
                if (savedScenarioId) {
                    const scenario = scenarioManager.loadScenario(savedScenarioId);
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
        playerAIs.clear();
        for (const player of game.players) {
            // Get AI config for this player
            let aiId;
            if (selectedBotAI === 'custom') {
                // Use per-player config
                aiId = perPlayerAIConfig[player.id] || 'easy';
            } else {
                // Same AI for all
                aiId = selectedBotAI;
            }
            const aiDef = aiRegistry.getAI(aiId);
            if (aiDef) {
                playerAIs.set(player.id, new AIRunner(aiDef));
            }
        }

        // Ensure camera fits after game start
        setTimeout(() => {
            renderer.autoFitCamera();
        }, 50);
    });

    // Player List Logic with autoplay toggles
    const playerList = document.getElementById('player-list');
    const updatePlayerUI = () => {
        const stats = game.getPlayerStats();
        playerList.innerHTML = '';

        stats.forEach(p => {
            if (!p.alive && p.id === undefined) return;

            const div = document.createElement('div');
            div.className = `player-item ${game.currentPlayer.id === p.id ? 'active' : ''} ${!p.alive ? 'dead' : ''}`;
            div.style.borderLeftColor = '#' + p.color.toString(16).padStart(6, '0');

            const playerName = getPlayerName(p);
            const isAutoplay = autoplayPlayers.has(p.id);

            // Only show autoplay toggle for human players
            const autoplayBtn = !p.isBot && p.alive ?
                `<button class="autoplay-toggle ${isAutoplay ? 'active' : ''}" data-player-id="${p.id}">🤖</button>` : '';

            div.innerHTML = `
                <div class="player-info-row">
                   <div style="font-weight:bold; color: #${p.color.toString(16).padStart(6, '0')}">${playerName}</div>
                   ${autoplayBtn}
                </div>
                <div class="p-stats-row">
                   <span title="Tiles owned">🗺️ ${p.tileCount || 0}</span>
                   <span title="Connected region size">🔗 ${p.connectedTiles || 0}</span>
                   <span title="Total dice">🎲 ${p.totalDice || 0}</span>
                   ${p.storedDice > 0 ? `<span title="Stored dice">📦 ${p.storedDice}</span>` : ''}
                </div>
            `;
            playerList.appendChild(div);
        });

        // Bind autoplay toggle events
        document.querySelectorAll('.autoplay-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const playerId = parseInt(btn.dataset.playerId);
                toggleAutoplay(playerId);
            });
        });
    };

    game.on('gameStart', () => {
        // Attach names for AI serialization
        game.players.forEach(p => p.name = getPlayerName(p));
        updatePlayerUI();

        // Ensure buttons are hidden initially (turnStart will show them appropriately)
        endTurnBtn.classList.add('hidden');
        autoWinBtn.classList.add('hidden');
        turnIndicator.classList.add('hidden');
    });
    game.on('turnStart', updatePlayerUI);
    game.on('attackResult', updatePlayerUI);
    game.on('reinforcements', updatePlayerUI);
    game.on('playerEliminated', updatePlayerUI);

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
    });

    document.getElementById('restart-btn').addEventListener('click', () => {
        document.getElementById('game-over-modal').classList.add('hidden');
        setupModal.classList.remove('hidden');
        document.querySelectorAll('.game-ui').forEach(el => el.classList.add('hidden'));
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
    let selectedScenarioId = null;
    let selectedScenarioData = null;
    let currentSort = { field: 'date', direction: 'desc' };

    const updateActionButtons = () => {
        // Buttons moved to rows, no global update needed
    };

    const loadSelectedScenario = () => {
        if (!selectedScenarioId) return;
        const scenario = scenarioManager.loadScenario(selectedScenarioId);
        if (scenario) {
            pendingScenario = scenario;
            scenarioBrowserModal.classList.add('hidden');
            setupModal.classList.remove('hidden'); // Ensure setup modal is visible
            updateConfigFromScenario(scenario);

            // Save loaded scenario to localStorage
            localStorage.setItem('dicy_loadedScenario', selectedScenarioId);
            updateLoadedScenarioDisplay(scenario.name);
        }
    };

    // Helper: Render Map Preview to Canvas
    // Helper: Render Map Preview to Canvas
    const renderMapPreview = (canvas, scenario) => {
        const ctx = canvas.getContext('2d');
        const tileSize = 20; // Larger tiles for detail view
        const gap = 2;

        canvas.width = (scenario.width || 10) * (tileSize + gap) + gap;
        canvas.height = (scenario.height || 10) * (tileSize + gap) + gap;

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

                // Dice Count
                if (tile.dice) {
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 10px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(tile.dice, x + tileSize / 2, y + tileSize / 2 + 1);
                }
            });
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
        editBtn.className = 'tron-btn small';
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

        // Delete Button (only if not built-in)
        if (!scenario.isBuiltIn) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'tron-btn small danger';
            deleteBtn.textContent = '🗑️';
            deleteBtn.title = 'Delete Scenario';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`Delete "${scenario.name}"?`)) {
                    scenarioManager.deleteScenario(scenario.id);
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
        const scenarios = scenarioManager.listScenarios();

        // Filter by tab type
        const filtered = scenarios.filter(s => {
            const type = s.type || 'replay';
            if (currentScenarioTab === 'replays') return type === 'replay' && !s.isBuiltIn;
            // Scenarios tab: scenarios and built-in scenarios (but NOT maps)
            if (currentScenarioTab === 'scenarios') return (type === 'scenario' || s.isBuiltIn) && type !== 'map';
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
            replays: 'No saved replays.',
            scenarios: 'No scenarios found.',
            maps: 'No maps found.'
        };

        if (filtered.length === 0) {
            scenarioList.innerHTML = `<div class="empty-message">${emptyMessages[currentScenarioTab]}</div>`;
            document.getElementById('scenario-preview-content').innerHTML = '<div class="empty-message-large">Select a scenario to view details</div>';
            scenarioList.innerHTML = `<div class="empty-message">${emptyMessages[currentScenarioTab]}</div>`;
            document.getElementById('scenario-preview-content').innerHTML = '<div class="empty-message-large">Select a scenario to view details</div>';
            selectedScenarioId = null;
            selectedScenarioData = null;
            if (scenarioExportBtn) scenarioExportBtn.disabled = true;
            return;
        }

        filtered.forEach(s => {
            const item = document.createElement('div');
            item.className = 'scenario-list-item';
            if (selectedScenarioId === s.id) {
                item.classList.add('selected');
            }

            const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '';
            const builtInLabel = s.isBuiltIn ? ' <span class="builtin-label">(built-in)</span>' : '';

            item.innerHTML = `
                <span class="list-item-name">${s.name}${builtInLabel}</span>
                <span class="list-item-date">${dateStr}</span>
            `;

            item.addEventListener('click', () => {
                document.querySelectorAll('.scenario-list-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                item.classList.add('selected');
                selectedScenarioId = s.id;
                selectedScenarioData = s;
                if (scenarioExportBtn) scenarioExportBtn.disabled = false;
                showScenarioPreview(s);
            });

            item.addEventListener('dblclick', () => loadSelectedScenario());

            scenarioList.appendChild(item);
        });

        // Update New Button state
        if (currentScenarioTab === 'replays') {
            newScenarioBtn.style.display = 'none';
        } else {
            newScenarioBtn.style.display = 'block';
            newScenarioBtn.textContent = currentScenarioTab === 'maps' ? '+ New Map' : '+ New Scenario';
        }

        // Auto-select first item if none selected or if previously selected is gone
        if (filtered.length > 0) {
            if (!selectedScenarioId || !filtered.find(s => s.id === selectedScenarioId)) {
                // Select first
                const first = filtered[0];
                selectedScenarioId = first.id;
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

        // Update player counts
        if (scenario.players && Array.isArray(scenario.players)) {
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

            // Update AI Selection
            if (botAIs.size === 1) {
                // All same AI
                const ai = [...botAIs][0];
                if (botAISelect) {
                    botAISelect.value = ai;
                    selectedBotAI = ai;
                    perPlayerAIConfigEl.style.display = 'none';
                }
            } else if (botAIs.size > 1) {
                // Mixed AIs -> Custom
                if (botAISelect) {
                    botAISelect.value = 'custom';
                    selectedBotAI = 'custom';

                    // Populate the global config object
                    Object.assign(perPlayerAIConfig, newPerPlayerConfig);

                    // Show UI and update
                    perPlayerAIConfigEl.style.display = 'flex';
                    updatePerPlayerConfig();
                }
            }
            // If 0 bots, doesn't matter much, keep previous or default
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
            selectedScenarioId = null;
            selectedScenarioData = null;
            renderScenarioList();
        });
    });

    // Open scenario browser
    scenariosBtn.addEventListener('click', () => {
        pendingScenario = null; // Clear any pending
        selectedScenarioId = null; // Clear selection
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

                    // Check for existing ID
                    const existing = scenarioManager.getScenario(scenario.id);
                    if (existing) {
                        const choice = confirm(
                            `A scenario with ID "${scenario.id}" already exists.\n\n` +
                            `Click OK to REPLACE the existing scenario.\n` +
                            `Click Cancel to import as a NEW scenario.`
                        );

                        if (choice) {
                            // Replace (keep ID)
                            // Mark as custom and update timestamp
                            scenario.isBuiltIn = false;
                            scenario.createdAt = Date.now();
                        } else {
                            // Save as new (generate new ID)
                            const prefix = scenario.type === 'map' ? 'map' : 'scenario';
                            scenario.id = scenarioManager.generateUniqueId(prefix);
                            scenario.isBuiltIn = false;
                            scenario.createdAt = Date.now();
                            // Append (Copy) to name
                            scenario.name = scenario.name + ' (Imported)';
                        }
                    } else {
                        // New scenario, ensure internal fields are correct
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

    // Export Scenario (Footer Button)
    if (scenarioExportBtn) {
        scenarioExportBtn.addEventListener('click', () => {
            if (!selectedScenarioId) return;

            const json = scenarioManager.exportScenario(selectedScenarioId);
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


// --- Benchmark Tool ---
window.benchmarkAI = async () => {
    // Create local registry instance
    const aiRegistry = new AIRegistry();
    aiRegistry.loadCustomAIs();

    // Gather all AIs
    const allAIs = [
        aiRegistry.getAI('easy'),
        aiRegistry.getAI('medium'),
        aiRegistry.getAI('hard'),
        ...Array.from(aiRegistry.custom.values())
    ].filter(Boolean);

    console.log(`%c🤖 AI Round Robin: ${allAIs.map(a => a.name).join(', ')}`, "font-weight:bold; font-size:16px; color:#0ff");

    // Initialize Data Table (Object for console.table)
    const tableData = {};
    allAIs.forEach(rowAI => {
        tableData[rowAI.name] = {};
        allAIs.forEach(colAI => {
            tableData[rowAI.name][colAI.name] = '0/10';
        });
    });

    const updateCell = (ai1Name, ai2Name, wins, losses) => {
        if (tableData[ai1Name]) tableData[ai1Name][ai2Name] = `${wins}/${losses}`;
    };

    const runGame = async (ai1, ai2) => {
        const game = new Game();
        game.startGame({
            humanCount: 0,
            botCount: 2,
            mapWidth: 4,
            mapHeight: 4,
            maxDice: 9,
            diceSides: 6,
            mapStyle: 'random',
            gameMode: 'classic'
        });

        // Config players
        const ids = [ai1.id, ai2.id];
        game.players.forEach((p, idx) => {
            p.aiId = ids[idx];
            p.name = `${aiRegistry.getAI(p.aiId).name} ${p.id}`;
        });

        let turns = 0;
        const maxTurns = 500;

        while (game.players.filter(p => p.alive).length > 1 && turns < maxTurns) {
            const p = game.currentPlayer;
            if (p.alive) {
                const aiDef = aiRegistry.getAI(p.aiId);
                const w = game.map.width;
                const tilesWithCoords = game.map.tiles.map((t, idx) => ({ ...t, x: idx % w, y: Math.floor(idx / w) }));

                const api = {
                    getMyTiles: () => tilesWithCoords.filter(t => t.owner === p.id && !t.blocked),
                    getEnemyTiles: () => tilesWithCoords.filter(t => t.owner !== p.id && !t.blocked),
                    getAllTiles: () => tilesWithCoords.filter(t => !t.blocked),
                    getAdjacentTiles: (x, y) => game.map.getAdjacentTiles(x, y),
                    getTileAt: (x, y) => game.map.getTile(x, y),
                    getLargestConnectedRegion: (pid) => game.map.findLargestConnectedRegion(pid),
                    getReinforcements: (pid) => {
                        const r = game.map.findLargestConnectedRegion(pid);
                        const pl = game.players.find(pp => pp.id === pid);
                        return r + (pl ? (pl.storedDice || 0) : 0);
                    },
                    getPlayerInfo: (pid) => game.players.find(pp => pp.id === pid) || null,
                    get players() { return game.players; },
                    simulateAttack: (fromX, fromY, toX, toY) => {
                        const fromT = game.map.getTile(fromX, fromY);
                        const toT = game.map.getTile(toX, toY);
                        if (!fromT || !toT || fromT.owner !== p.id || fromT.dice <= 1) return { success: false };
                        const eWin = fromT.dice > toT.dice;
                        const origFromD = fromT.dice;
                        const origFromO = fromT.owner;
                        const origToD = toT.dice;
                        const origToO = toT.owner;
                        const eId = origToO;
                        let mR = 0, eR = 0;

                        if (eWin) {
                            fromT.dice = 1;
                            toT.owner = p.id;
                            toT.dice = origFromD - 1;
                            mR = game.map.findLargestConnectedRegion(p.id) + (p.storedDice || 0);
                            if (eId !== null) eR = game.map.findLargestConnectedRegion(eId) + (game.players.find(pp => pp.id === eId)?.storedDice || 0);
                            fromT.dice = origFromD;
                            toT.owner = origToO;
                            toT.dice = origToD;
                        } else {
                            mR = game.map.findLargestConnectedRegion(p.id) + (p.storedDice || 0);
                            if (eId !== null) eR = game.map.findLargestConnectedRegion(eId) + (game.players.find(pp => pp.id === eId)?.storedDice || 0);
                        }
                        return { success: true, expectedWin: eWin, myPredictedReinforcements: mR, enemyPredictedReinforcements: eR };
                    },
                    get myId() { return p.id; },
                    get maxDice() { return game.maxDice; },
                    get diceSides() { return game.diceSides; },
                    get mapWidth() { return game.map.width; },
                    get mapHeight() { return game.map.height; },
                    attack: (fx, fy, tx, ty) => {
                        const ft = game.map.getTile(fx, fy);
                        const tt = game.map.getTile(tx, ty);
                        if (ft && tt && ft.owner === p.id && ft.dice > tt.dice) {
                            game.attack(fx, fy, tx, ty);
                            return { success: true, expectedWin: true };
                        }
                        return { success: false };
                    },
                    endTurn: () => { /* no-op in sync loop */ },
                    load: () => null,
                    save: () => null,
                    log: () => { },
                    getWinProbability: (a, d) => 1 / (1 + Math.exp(-(a * 3.5 - d * 3.5) / 2))
                };

                if (aiDef) {
                    try {
                        const fn = new Function('api', aiDef.code);
                        fn(api);
                    } catch (e) { }
                }
            }
            game.endTurn();
            turns++;
        }
        return game.winner ? game.winner.id : -1;
    };

    // Round Robin
    for (let i = 0; i < allAIs.length; i++) {
        for (let j = i; j < allAIs.length; j++) {
            const ai1 = allAIs[i];
            const ai2 = allAIs[j];

            console.log(`Matchup: ${ai1.name} vs ${ai2.name}...`);
            let wins1 = 0;
            let wins2 = 0;

            // Run 10 games
            for (let g = 0; g < 10; g++) {
                // Alternate starting positions for fairness
                const reversed = g % 2 === 1;
                const winnerId = await runGame(reversed ? ai2 : ai1, reversed ? ai1 : ai2);

                if (winnerId !== -1) {
                    const ai1IsP0 = !reversed;
                    const winnerIsP0 = winnerId === 0;
                    if (winnerIsP0 === ai1IsP0) wins1++;
                    else wins2++;
                }

                await new Promise(r => setTimeout(r, 0));
            }

            updateCell(ai1.name, ai2.name, wins1, 10 - wins1);
            updateCell(ai2.name, ai1.name, wins2, 10 - wins2);
        }
    }

    console.log("✅ Benchmark Complete");
    console.table(tableData);
};

init();
