import { Game } from './core/game.js';
import { Renderer } from './render/renderer.js';
import { InputController } from './input/input-controller.js';
import { InputManager } from './input/input-manager.js';
import { AIController } from './core/ai.js';
import { SoundManager } from './audio/sound-manager.js';
import { EffectsManager } from './render/effects/effects-manager.js';

async function init() {
    // 1. Initialize Game Logic
    const game = new Game();

    // 2. Initialize Renderer
    const container = document.getElementById('game-container');
    const renderer = new Renderer(container, game);
    await renderer.init();

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

    // 5. Initialize AI
    const ai = new AIController('aggressive');

    // 5. Initialize Music with localStorage
    const music = new Audio('./Neon Dice Offensive.mp3');
    music.loop = true;

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

    // Auto-start music on first user interaction (default ON)
    let shouldAutoplayMusic = savedMusicEnabled;

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

    // Turn-based log grouping
    let currentTurnLog = null;
    let turnStats = { attacks: 0, wins: 0, losses: 0, conquered: 0 };

    // Create a new turn group in the log
    const startTurnLog = (player) => {
        const playerName = player.isBot ? `Bot ${player.id}` : `Player ${player.id}`;
        const colorHex = '#' + player.color.toString(16).padStart(6, '0');
        const isHuman = !player.isBot && !autoplayPlayers.has(player.id);

        // Reset stats
        turnStats = { attacks: 0, wins: 0, losses: 0, conquered: 0 };

        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = `turn-group ${isHuman ? 'expanded' : ''}`;

        // Create header
        const header = document.createElement('div');
        header.className = 'turn-header';
        header.innerHTML = `
            <span class="turn-player" style="color: ${colorHex}">${playerName}</span>
            <span class="turn-summary"></span>
            <span class="turn-toggle">${isHuman ? '▼' : '▶'}</span>
        `;

        // Create details container
        const details = document.createElement('div');
        details.className = 'turn-details';

        wrapper.appendChild(header);
        wrapper.appendChild(details);

        // Toggle expand/collapse
        header.addEventListener('click', () => {
            wrapper.classList.toggle('expanded');
            header.querySelector('.turn-toggle').textContent =
                wrapper.classList.contains('expanded') ? '▼' : '▶';
        });

        logEntries.insertBefore(wrapper, logEntries.firstChild);

        // Keep only last 20 turn groups
        while (logEntries.children.length > 20) {
            logEntries.removeChild(logEntries.lastChild);
        }

        currentTurnLog = { wrapper, details, header, player, isHuman };
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
            setTimeout(() => ai.takeTurn(game), 500);
        }
    };

    const checkDominance = () => {
        const stats = game.getPlayerStats();
        const totalDice = stats.reduce((sum, p) => sum + p.totalDice, 0);
        const alivePlayers = stats.filter(p => p.alive);

        // Find human players that are not in autoplay mode
        const activeHumanStats = stats.filter(p => !p.isBot && !autoplayPlayers.has(p.id) && p.alive);

        if (activeHumanStats.length === 0) {
            // All humans are on autoplay or eliminated - check if any player is dominant
            const dominantThreshold = totalDice * 0.8;
            const dominantPlayer = stats.find(p => p.totalDice >= dominantThreshold);
            if (dominantPlayer) {
                autoWinBtn.classList.remove('hidden');
                autoWinBtn.textContent = 'Finish Fast';
            } else {
                autoWinBtn.classList.add('hidden');
            }
            return;
        }

        // Check each active human player's situation
        for (const humanStat of activeHumanStats) {
            const humanDiceRatio = humanStat.totalDice / totalDice;

            // Human is dominant (80%+ of all dice)
            if (humanDiceRatio >= 0.8) {
                autoWinBtn.classList.remove('hidden');
                autoWinBtn.textContent = 'Finish Fast';
                return;
            }

            // Human is struggling (below 40% of average, or only 2 tiles left with more players)
            const averageDicePerPlayer = totalDice / alivePlayers.length;
            const isStruggling = humanStat.totalDice < averageDicePerPlayer * 0.4 ||
                (humanStat.tileCount <= 2 && alivePlayers.length > 2);

            if (isStruggling) {
                autoWinBtn.classList.remove('hidden');
                autoWinBtn.textContent = 'Give Up';
                return;
            }
        }

        // Only 1 enemy left - show finish fast to speed up endgame
        if (alivePlayers.length === 2 && activeHumanStats.length > 0) {
            autoWinBtn.classList.remove('hidden');
            autoWinBtn.textContent = 'Finish Fast';
            return;
        }

        // No special situation - hide button
        autoWinBtn.classList.add('hidden');
    };

    autoWinBtn.addEventListener('click', () => {
        const buttonText = autoWinBtn.textContent;

        // Enable autoplay for all human players
        game.players.forEach(p => {
            if (!p.isBot) {
                toggleAutoplay(p.id, true);
            }
        });

        autoWinBtn.classList.add('hidden');

        if (buttonText === 'Give Up') {
            addLog('Giving up... letting bots finish the game.', 'death');
        } else {
            addLog('Finishing game via autoplay...', 'death');
        }
    });

    endTurnBtn.addEventListener('click', () => {
        const humanPlayers = game.players.filter(p => !p.isBot);
        if (humanPlayers.length > 1) {
            input.deselect();
        }
        game.endTurn();
    });

    newGameBtn.addEventListener('click', () => {
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
        const name = data.player.isBot ? `Bot ${data.player.id}` : `Player ${data.player.id}`;
        playerText.textContent = `${name}'s Turn`;
        playerText.style.color = '#' + data.player.color.toString(16).padStart(6, '0');

        // Start a new turn group in the log
        startTurnLog(data.player);

        // Check if this player should be automated (bot OR autoplay enabled)
        const shouldAutomate = data.player.isBot || autoplayPlayers.has(data.player.id);

        // Play turn sound for human players only
        if (!data.player.isBot && !autoplayPlayers.has(data.player.id)) {
            sfx.turnStart();
        }

        if (shouldAutomate) {
            endTurnBtn.disabled = true;
            endTurnBtn.textContent = 'END TURN';
            // In fast mode, minimal delay; otherwise use normal delays
            const delay = fastModeEnabled ? 10 : (data.player.isBot ? 300 : 500);
            setTimeout(() => {
                ai.takeTurn(game);
            }, delay);
        } else {
            endTurnBtn.disabled = false;
            // Show expected dice reinforcement on button (no emoji)
            const regionDice = game.map.findLargestConnectedRegion(data.player.id);
            const storedDice = data.player.storedDice || 0;
            endTurnBtn.textContent = `END TURN (+${regionDice + storedDice})`;

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

        const defender = game.players.find(p => p.id === result.defenderId);
        const defenderName = defender?.isBot ? `Bot ${defender.id}` : `Player ${defender?.id}`;

        const attackRoll = result.attackerRolls?.join('+') || '?';
        const defendRoll = result.defenderRolls?.join('+') || '?';
        const attackSum = result.attackerRolls?.reduce((a, b) => a + b, 0) || '?';
        const defendSum = result.defenderRolls?.reduce((a, b) => a + b, 0) || '?';

        const outcome = result.won ? '✓' : '✗';
        addLog(`→ ${defenderName}: [${attackSum}] vs [${defendSum}] ${outcome}`, result.won ? 'attack-win' : 'attack-loss');

        // Play sound for human attackers only
        const attacker = game.players.find(p => p.id === result.attackerId);
        if (attacker && !attacker.isBot && !autoplayPlayers.has(attacker.id)) {
            if (result.won) {
                sfx.attackWin();
            } else {
                sfx.attackLose();
            }
            // Update End Turn button with new expected dice (region may have changed, no emoji)
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
    const humanCountInput = document.getElementById('human-count');
    const botCountInput = document.getElementById('bot-count');
    const maxDiceInput = document.getElementById('max-dice');
    const maxDiceVal = document.getElementById('max-dice-val');
    const diceSidesInput = document.getElementById('dice-sides');
    const diceSidesVal = document.getElementById('dice-sides-val');
    const fastModeInput = document.getElementById('fast-mode');
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

    // Fast mode state - controls bot animation speed
    let fastModeEnabled = false;

    // Load saved effects quality and set dropdown
    const savedEffectsQuality = localStorage.getItem('effectsQuality') || 'high';
    effectsQualityInput.value = savedEffectsQuality;

    // Load saved setup settings
    const savedMapSize = localStorage.getItem('dicy_mapSize') || '5';
    const savedHumanCount = localStorage.getItem('dicy_humanCount') || '1';
    const savedBotCount = localStorage.getItem('dicy_botCount') || '3';
    const savedMaxDice = localStorage.getItem('dicy_maxDice') || '9';
    const savedDiceSides = localStorage.getItem('dicy_diceSides') || '6';
    const savedFastMode = localStorage.getItem('dicy_fastMode') === 'true';
    const savedMapStyle = localStorage.getItem('dicy_mapStyle') || 'random';
    const savedGameMode = localStorage.getItem('dicy_gameMode') || 'classic';

    mapSizeInput.value = savedMapSize;
    humanCountInput.value = savedHumanCount;
    botCountInput.value = savedBotCount;
    maxDiceInput.value = savedMaxDice;
    maxDiceVal.textContent = savedMaxDice;
    diceSidesInput.value = savedDiceSides;
    diceSidesVal.textContent = savedDiceSides;
    fastModeInput.checked = savedFastMode;
    mapStyleInput.value = savedMapStyle;
    gameModeInput.value = savedGameMode;

    // Map size presets: slider value -> {width, height}
    const mapSizePresets = [
        { width: 3, height: 3 },   // 1 - Tiny
        { width: 3, height: 5 },
        { width: 3, height: 4 },
        { width: 4, height: 4 },
        { width: 5, height: 5 },   // 2 - Small square
        { width: 5, height: 7 },   // 3 - Small tall
        { width: 6, height: 8 },   // 4 - Medium
        { width: 7, height: 9 },   // 5 - Medium tall (default)
        { width: 8, height: 8 },   // 6 - Medium square
        { width: 9, height: 10 },  // 7 - Large
        { width: 10, height: 12 }, // 8 - Large tall
        { width: 12, height: 12 }, // 9 - Big square
        { width: 15, height: 15 }, // 10 - Maximum
    ];

    const getMapSize = (sliderValue) => {
        const index = Math.max(0, Math.min(sliderValue - 1, mapSizePresets.length - 1));
        return mapSizePresets[index];
    };

    const updateMapSizeDisplay = () => {
        const size = getMapSize(parseInt(mapSizeInput.value));
        mapSizeVal.textContent = `${size.width}x${size.height}`;
    };

    // Initial map size display
    updateMapSizeDisplay();

    mapSizeInput.addEventListener('input', updateMapSizeDisplay);
    maxDiceInput.addEventListener('input', () => {
        maxDiceVal.textContent = maxDiceInput.value;
    });
    diceSidesInput.addEventListener('input', () => {
        diceSidesVal.textContent = diceSidesInput.value;
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
        localStorage.setItem('dicy_mapSize', sizeValue);
        localStorage.setItem('dicy_humanCount', humanCount.toString());
        localStorage.setItem('dicy_botCount', botCount.toString());
        localStorage.setItem('dicy_maxDice', maxDice.toString());
        localStorage.setItem('dicy_diceSides', diceSides.toString());
        localStorage.setItem('dicy_fastMode', fastModeInput.checked.toString());
        localStorage.setItem('dicy_mapStyle', mapStyleInput.value);
        localStorage.setItem('dicy_gameMode', gameModeInput.value);

        // Enable fast mode for this game session
        fastModeEnabled = fastModeInput.checked;
        renderer.setFastMode(fastModeEnabled);

        // Apply effects quality setting
        effectsManager.setQuality(effectsQualityInput.value);
        // Stop intro mode effects (game is starting)
        effectsManager.stopIntroMode();
        renderer.setDiceSides(diceSides);

        // Clear autoplay state
        autoplayPlayers.clear();
        logEntries.innerHTML = '';
        addLog('Game started!', '');

        game.startGame({
            humanCount,
            botCount,
            mapWidth: sizePreset.width,
            mapHeight: sizePreset.height,
            maxDice,
            diceSides,
            mapStyle: mapStyleInput.value,
            gameMode: gameModeInput.value
        });
        setupModal.classList.add('hidden');

        // Show Game UI
        document.querySelectorAll('.game-ui').forEach(el => el.classList.remove('hidden'));

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

            const playerName = p.isBot ? `Bot ${p.id}` : `Player ${p.id}`;
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

    game.on('gameStart', updatePlayerUI);
    game.on('turnStart', updatePlayerUI);
    game.on('attackResult', updatePlayerUI);
    game.on('reinforcements', updatePlayerUI);
    game.on('playerEliminated', updatePlayerUI);

    game.on('gameOver', (data) => {
        const modal = document.getElementById('game-over-modal');
        const winnerText = document.getElementById('winner-text');
        const name = data.winner.isBot ? `Bot ${data.winner.id}` : `Player ${data.winner.id}`;
        winnerText.textContent = `${name} Wins!`;
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
}

init();
