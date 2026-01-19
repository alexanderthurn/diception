import { Game } from './core/game.js';
import { Renderer } from './render/renderer.js';
import { InputController } from './input/input-controller.js';
import { InputManager } from './input/input-manager.js';
import { AIRunner } from './core/ai-runner.js';
import { AIRegistry } from './core/ai-registry.js';
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

    // 5. Initialize AI System
    const aiRegistry = new AIRegistry();
    aiRegistry.loadCustomAIs();

    // Map player ID -> AIRunner instance (set during game start)
    let playerAIs = new Map();

    // Current selected AI for all bots (default easy)
    let selectedBotAI = localStorage.getItem('dicy_botAI') || 'easy';
    // Per-player AI config (when using custom per player)
    let perPlayerAIConfig = JSON.parse(localStorage.getItem('dicy_perPlayerAIConfig') || '{}');

    // Helper to get consistent player names
    const getPlayerName = (player) => {
        if (player.isBot) {
            const aiRunner = playerAIs.get(player.id);
            return aiRunner ? `${aiRunner.name} ${player.id}` : `Bot ${player.id}`;
        }
        return `Human ${player.id + 1}`;
    };

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
        const playerName = getPlayerName(player);
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
            setTimeout(async () => {
                const playerAI = playerAIs.get(playerId);
                if (playerAI) {
                    await playerAI.takeTurn(game);
                }
            }, 500);
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
            setTimeout(async () => {
                // Use per-player AI configuration
                const playerAI = playerAIs.get(data.player.id);
                if (playerAI) {
                    await playerAI.takeTurn(game);
                } else {
                    // Fallback: end turn immediately
                    game.endTurn();
                }
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
        const defenderName = defender ? getPlayerName(defender) : `Player ${result.defenderId}`;

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

        for (const ai of ais) {
            const item = document.createElement('div');
            item.className = 'ai-list-item' + (ai.isBuiltIn ? ' builtin' : '') +
                (currentEditingAI === ai.id ? ' active' : '');
            item.textContent = ai.name + (ai.isBuiltIn ? ' (built-in)' : '');
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

        // Disable editing for built-in AIs
        const isBuiltIn = aiRegistry.builtIn.has(aiId);
        aiNameInput.disabled = isBuiltIn;
        aiCodeInput.disabled = isBuiltIn;
        saveAIBtn.disabled = isBuiltIn;
        deleteAIBtn.disabled = isBuiltIn;

        updateAIList();
    };

    const createNewAI = () => {
        currentEditingAI = null;
        aiNameInput.value = '';
        aiNameInput.disabled = false;
        aiCodeInput.disabled = false;
        saveAIBtn.disabled = false;
        deleteAIBtn.disabled = true;
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

        if (!name) {
            alert('Please enter a name for your AI');
            return;
        }

        if (currentEditingAI && aiRegistry.custom.has(currentEditingAI)) {
            // Update existing
            aiRegistry.updateCustomAI(currentEditingAI, { name, code });
        } else {
            // Create new
            const id = aiRegistry.generateId();
            aiRegistry.registerCustomAI(id, { name, code });
            currentEditingAI = id;
        }

        updateAIList();
        updateAIDropdown();
        deleteAIBtn.disabled = false;
    };

    const deleteCurrentAI = () => {
        if (!currentEditingAI) return;
        if (!confirm('Delete this AI?')) return;

        aiRegistry.deleteCustomAI(currentEditingAI);
        createNewAI();
        updateAIDropdown();
    };

    const testCurrentAI = async () => {
        if (!game.players.length) {
            alert('Start a game first to test the AI');
            return;
        }

        const code = aiCodeInput.value;
        const testRunner = new AIRunner({
            id: 'test_' + Date.now(),
            name: 'Test AI',
            code
        });

        testAIBtn.textContent = '⏳ Testing...';
        testAIBtn.disabled = true;

        try {
            await testRunner.takeTurn(game);
            testAIBtn.textContent = '✓ Done!';
        } catch (e) {
            alert('AI Error: ' + e.message);
            testAIBtn.textContent = '✗ Error';
        }

        setTimeout(() => {
            testAIBtn.textContent = '▶ Test';
            testAIBtn.disabled = false;
        }, 1500);
    };

    const generatePrompt = () => {
        const userStrategy = aiPromptInput.value.trim() || 'Create an AI that plays well';

        const prompt = `Create JavaScript code for a DICECEPTION game AI bot.

AVAILABLE API:
- api.getMyTiles() → [{x, y, dice, owner}] - Get all tiles owned by this AI
- api.getEnemyTiles() → [{x, y, dice, owner}] - Get all enemy tiles
- api.getAllTiles() → All playable tiles on the map
- api.getAdjacentTiles(x, y) → [{x, y, dice, owner}] - Get neighboring tiles
- api.getTileAt(x, y) → Get specific tile or null
- api.myId → This AI's player ID
- api.maxDice → Maximum dice per tile (usually 9)
- api.diceSides → Number of sides on each die (usually 6)
- api.attack(fromX, fromY, toX, toY) → {success: boolean, expectedWin: boolean}
- api.endTurn() → End this AI's turn
- api.save(key, value) → Persist data between games
- api.load(key) → Load persisted data
- api.log(msg) → Debug output to console
- api.getWinProbability(attackDice, defendDice) → 0-1 probability

GAME RULES:
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
        const json = aiRegistry.exportAI(currentEditingAI);
        if (json) {
            navigator.clipboard.writeText(json).then(() => {
                exportAIBtn.textContent = '✓ Copied!';
                setTimeout(() => {
                    exportAIBtn.textContent = '📤 Export';
                }, 2000);
            });
        }
    };

    const importAI = () => {
        const json = prompt('Paste AI JSON:');
        if (!json) return;

        const result = aiRegistry.importAI(json);
        if (result.success) {
            updateAIList();
            updateAIDropdown();
            loadAIForEditing(result.id);
        } else {
            alert('Import failed: ' + result.error);
        }
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

        const configSummary = `<div class="tournament-summary">Map: ${sizePreset.width}x${sizePreset.height} • Dice: D${diceSidesInput.value} (Max ${maxDiceInput.value})</div>`;

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
    const savedTournamentGames = localStorage.getItem('dicy_tournamentGames') || '100';

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

    // Immediate saving of settings
    mapSizeInput.addEventListener('input', () => {
        updateMapSizeDisplay();
        localStorage.setItem('dicy_mapSize', mapSizeInput.value);
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
    fastModeInput.addEventListener('change', () => {
        localStorage.setItem('dicy_fastMode', fastModeInput.checked.toString());
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

    // Effects quality - save and reload
    effectsQualityInput.addEventListener('change', () => {
        localStorage.setItem('effectsQuality', effectsQualityInput.value);
        if (confirm('Changing visual quality requires a reload. Reload now?')) {
            window.location.reload();
        }
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
        localStorage.setItem('effectsQuality', effectsQualityInput.value);

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

    game.on('gameStart', updatePlayerUI);
    game.on('turnStart', updatePlayerUI);
    game.on('attackResult', updatePlayerUI);
    game.on('reinforcements', updatePlayerUI);
    game.on('playerEliminated', updatePlayerUI);

    game.on('gameOver', (data) => {
        const modal = document.getElementById('game-over-modal');
        const winnerText = document.getElementById('winner-text');
        const name = getPlayerName(data.winner);
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
