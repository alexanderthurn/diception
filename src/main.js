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
import { initCheatCode, registerCheatContext } from './cheat.js';
import { markLevelSolved, unmarkLevelSolved } from './scenarios/campaign-progress.js';
import { unlockAchievement, removeAchievement, setUnlockCallback, resetAllAchievementsAndStats } from './core/achievement-manager.js';
import { isTauriContext, isSteamContext, isDesktopContext, isAndroid } from './scenarios/user-identity.js';
import { initStorage, flushStorage } from './core/storage.js';
import { KeyBindingDialog } from './input/key-binding-dialog.js';
import { AchievementsPanel } from './ui/achievements-panel.js';
import { ACHIEVEMENTS } from './core/achievements.js';
import { initCustomSelects } from './ui/custom-select.js';
import {
    GAME_ACTIONS,
    loadBindings,
    getKeysDisplayName,
    getGamepadButtonsName,
} from './input/key-bindings.js';

// Pre-compute probability tables at startup
initializeProbabilityTables();

// Initialize custom select dropdowns (replaces native <select> with styled HTML)
initCustomSelects();

// High-DPI UI scaling: on 4K/high-res displays without OS DPI scaling,
// HTML elements (buttons, dialogs, text) render at tiny physical sizes.
// We detect this via screen.width (reflects OS-level DPI scaling, not
// affected by CSS zoom or browser zoom) and set --ui-scale on :root.
// The CSS rule `html { zoom: var(--ui-scale) }` scales the entire viewport
// uniformly, so centering and fixed positioning all stay correct.
function updateUIScale() {
    const refWidth = 1280;
    const refHeight = 800;

    // Calculate scales based on both dimensions
    const scaleW = window.innerWidth / refWidth;
    const scaleH = window.innerHeight / refHeight;

    // Use the smaller scale so it doesn't overflow vertically on ultra-wide screens,
    // or horizontally on ultra-tall screens. Keep a minimum scale of 1.
    const scale = Math.max(1, Math.min(scaleW, scaleH));
    const rounded = Math.round(scale * 100) / 100;

    document.documentElement.style.setProperty('--ui-scale', rounded);
}
updateUIScale();
window.addEventListener('resize', updateUIScale);


async function init() {
    // Load cloud save data into localStorage before anything else reads it
    await initStorage();

    // Sync achievement state from Steam — Steam's backend is authoritative,
    // so if the .sav file wasn't synced (e.g. first launch on a new machine),
    // achievements already unlocked in Steam will be merged in.
    if (window.steam?.getUnlockedAchievements) {
        try {
            const allIds = ACHIEVEMENTS.map(a => a.id);
            const steamUnlocked = await window.steam.getUnlockedAchievements(allIds);
            const local = JSON.parse(localStorage.getItem('dicy_ach_unlocked') || '[]');
            const merged = [...new Set([...local, ...steamUnlocked])];

            // Steam → localStorage: pull any Steam achievements missing locally
            if (merged.length > local.length) {
                localStorage.setItem('dicy_ach_unlocked', JSON.stringify(merged));
                console.log(`[achievements] Pulled ${merged.length - local.length} achievement(s) from Steam`);
            }

            // localStorage → Steam: push any local achievements missing in Steam
            const steamSet = new Set(steamUnlocked);
            const topush = local.filter(id => !steamSet.has(id));
            for (const id of topush) {
                await window.steam.unlockAchievement(id);
                console.log(`[achievements] Pushed to Steam: ${id}`);
            }
        } catch (e) {
            console.warn('[achievements] Steam sync failed:', e);
        }
    }

    // Sync stats from Steam — Steam's stat backend is always authoritative.
    // Whichever device was used most recently may have overwritten the .sav
    // with lower values, so we take the max of local and Steam.
    if (window.steam?.getStatI32) {
        const STEAM_STATS = [
            { localKey: 'gamesPlayed',  steamName: 'STAT_GAMES_PLAYED'  },
            { localKey: 'gamesWon',     steamName: 'STAT_GAMES_WON'     },
            { localKey: 'underdogWins', steamName: 'STAT_UNDERDOG_WINS' },
            { localKey: 'streak3',      steamName: 'STAT_STREAK_3'      },
            { localKey: 'streak4',      steamName: 'STAT_STREAK_4'      },
            { localKey: 'streak5',      steamName: 'STAT_STREAK_5'      },
            { localKey: 'streak6',      steamName: 'STAT_STREAK_6'      },
            { localKey: 'streak7',      steamName: 'STAT_STREAK_7'      },
        ];
        try {
            const localStats = JSON.parse(localStorage.getItem('dicy_ach_stats') || '{}');
            let changed = false;
            for (const { localKey, steamName } of STEAM_STATS) {
                const steamVal = await window.steam.getStatI32(steamName);
                const localVal = localStats[localKey] || 0;
                if (steamVal > localVal) {
                    localStats[localKey] = steamVal;
                    changed = true;
                    console.log(`[stats] Synced ${localKey} from Steam: ${localVal} → ${steamVal}`);
                }
            }
            if (changed) {
                localStorage.setItem('dicy_ach_stats', JSON.stringify(localStats));
            }
        } catch (e) {
            console.warn('[stats] Steam sync failed:', e);
        }
    }

    // Load spritesheet
    try {
        await Assets.load('assets/gfx/diception.json');
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
    setVersionText('game-version');

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
        // Show and wire all quit buttons
        const handleQuit = async () => {
            if (await Dialog.confirm('Are you sure you want to exit the game?', 'EXIT GAME?')) {
                await flushStorage();
                if (window.steam) {
                    window.steam.quit();
                } else if (window.android) {
                    window.android.quit();
                } else if (isTauriContext()) {
                    try {
                        const { getCurrentWindow } = await import('@tauri-apps/api/window');
                        await getCurrentWindow().close();
                    } catch (e) {
                        console.error('Tauri exit failed:', e);
                        window.close();
                    }
                } else {
                    window.close();
                }
            }
        };
        const mainQuitBtn = document.getElementById('main-quit-btn');
        if (mainQuitBtn) {
            mainQuitBtn.classList.remove('hidden');
            mainQuitBtn.addEventListener('click', handleQuit);
        }
    }

    // Steam-specific identity display
    if (window.steam) {
        window.steam.getUserName().then(name => {
            console.log('Steam User:', name);
            const creditsElements = document.querySelectorAll('.credits');
            creditsElements.forEach(credits => {
                credits.innerHTML = `<span class="steam-login-info" style="color: #66c0f4">Hi, ${name}</span>`;
            });
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

    // Cheat: ccc/vvv on campaign level tiles (mark/unmark solved)
    if (window.location.hostname === 'localhost') {
        registerCheatContext({
            isActive: () => scenarioBrowser?._hoveredLevelIndex != null,
            onCCC: () => {
                const owner = scenarioBrowser.selectedCampaign?.owner;
                const idx = scenarioBrowser._hoveredLevelIndex;
                if (owner == null || idx == null) return;
                markLevelSolved(owner, idx);
                scenarioBrowser.renderLevelGrid(scenarioBrowser.selectedCampaign);
                console.log(`🎮 CHEAT: marked level ${idx} solved in ${owner}`);
            },
            onVVV: () => {
                const owner = scenarioBrowser.selectedCampaign?.owner;
                const idx = scenarioBrowser._hoveredLevelIndex;
                if (owner == null || idx == null) return;
                unmarkLevelSolved(owner, idx);
                scenarioBrowser.renderLevelGrid(scenarioBrowser.selectedCampaign);
                console.log(`🎮 CHEAT: unmarked level ${idx} in ${owner}`);
            },
        });
    }

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
    // startIntroMode() called only after loading screen is dismissed (see onLoadingDismiss)

    // Hide game world until loading screen is gone — prevents showing resumed game during loading
    renderer.rootContainer.alpha = 0;
    // Background dice also start hidden and fade in after loading screen
    effectsManager.background.container.alpha = 0;

    const input = new InputController(game, renderer, inputManager);

    // Loading Screen - onDismiss set after scenarioBrowser is ready
    let onLoadingDismiss = null;
    const loadingScreen = new LoadingScreen(inputManager, {
        onDismissStart: () => {
            // Spawn dice immediately so they exist during the fade-in window
            if (game.players.length === 0) effectsManager.startIntroMode();
            // Fade in background dice over 700ms (across the 850ms loading-screen fade-out)
            const bgStart = performance.now();
            const bgDuration = 700;
            const bgFadeTick = () => {
                const t = Math.min(1, (performance.now() - bgStart) / bgDuration);
                effectsManager.background.container.alpha = t;
                if (t < 1) requestAnimationFrame(bgFadeTick);
            };
            requestAnimationFrame(bgFadeTick);
        },
        onDismiss: () => {
            sfxManager.markReady();
            if (onLoadingDismiss) onLoadingDismiss();
            // Fade in the game world over 0.3s
            const start = performance.now();
            const duration = 300;
            const fadeTick = () => {
                const t = Math.min(1, (performance.now() - start) / duration);
                renderer.rootContainer.alpha = t;
                if (t < 1) requestAnimationFrame(fadeTick);
            };
            requestAnimationFrame(fadeTick);
        }
    });
    loadingScreen.setInputController(input);

    // Initialize Gamepad Cursors
    const gamepadCursors = new GamepadCursorManager(game, inputManager);
    gamepadCursors.onIntroSpawn = (playerIndex, x, y) => effectsManager.spawnPlayerDie(playerIndex, x, y);
    inputManager.gamepadCursorManager = gamepadCursors;

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

            if (renderer.app && renderer.app.renderer) {
                renderer.app.renderer.resize(w, h);
            }
            renderer.autoFitCamera();
        }, delay);
    });

    // Wire tile selection to effects
    const originalSelect = input.select.bind(input);
    input.select = (x, y, sourceId) => {
        originalSelect(x, y, sourceId);
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
        renderGamepadAssignments();
    });
    // Initial update in case gamepads are already connected
    configManager.updateGamepadStatus(Array.from(inputManager.connectedGamepadIndices || []));

    // ── Gamepad side panel ────────────────────────────────────────────────────
    const gamepadSidePanel = document.getElementById('gamepad-side-panel');

    function renderGamepadAssignments() {
        if (!gamepadSidePanel) return;
        // Only show gamepads activated this session (cursor exists) — avoids stale saved assignments
        const gcm = inputManager.gamepadCursorManager;
        const gamepads = Array.from(inputManager.connectedGamepadIndices || [])
            .filter(idx => gcm?.cursors?.has(idx))
            .sort();
        const setupVisible = !document.getElementById('setup-modal')?.classList.contains('hidden');
        const pauseVisible = !document.getElementById('pause-modal')?.classList.contains('hidden');

        const humanCount = parseInt(document.getElementById('human-count')?.value ?? '1');

        if (gamepads.length === 0 || (!setupVisible && !pauseVisible) || humanCount <= 1) {
            gamepadSidePanel.classList.remove('gp-panel-active');
            return;
        }
        gamepadSidePanel.innerHTML = '';

        // Title
        const title = document.createElement('div');
        title.className = 'gp-panel-title';
        title.textContent = 'CONTROLLERS';
        gamepadSidePanel.appendChild(title);

        // One row per human player
        for (let i = 0; i < humanCount; i++) {
            const pColor = '#' + GAME.HUMAN_COLORS[i % GAME.HUMAN_COLORS.length].toString(16).padStart(6, '0');
            const assignedGPs = gamepads.filter(g => inputManager.getGamepadAssignment(g) === i);

            const row = document.createElement('div');
            row.className = 'gp-player-row';

            const playerLabel = document.createElement('div');
            playerLabel.className = 'gp-player-label';
            playerLabel.style.setProperty('--gp-color', pColor);
            playerLabel.textContent = `P${i + 1}`;
            row.appendChild(playerLabel);

            const joinBtn = document.createElement('button');
            joinBtn.className = 'tron-btn gp-join-btn';
            joinBtn.title = `Click with gamepad to join as Player ${i + 1}`;
            joinBtn.textContent = 'JOIN';
            joinBtn.addEventListener('click', () => {
                const gpIdx = inputManager.lastClickingGamepad;
                if (gpIdx != null) inputManager.setGamepadAssignment(gpIdx, i);
            });
            row.appendChild(joinBtn);

            for (const gpIdx of assignedGPs) {
                const chip = document.createElement('button');
                chip.className = 'tron-btn gp-chip';
                chip.style.setProperty('--gp-color', pColor);
                chip.title = `Remove GP${gpIdx}`;
                chip.addEventListener('click', (e) => {
                    e.stopPropagation();
                    inputManager.gamepadCursorManager?.kickGamepad(gpIdx);
                });
                row.appendChild(chip);
            }

            gamepadSidePanel.appendChild(row);
        }

        // Master row — unrestricted gamepads that can control any player's turn
        const masterGPs = gamepads.filter(g => {
            const a = inputManager.getGamepadAssignment(g);
            return a === 'master' || (typeof a === 'number' && a >= humanCount);
        });
        const masterRow = document.createElement('div');
        masterRow.className = 'gp-player-row';
        const masterLabel = document.createElement('div');
        masterLabel.className = 'gp-player-label gp-player-label-master';
        masterLabel.textContent = '—';
        masterRow.appendChild(masterLabel);

        const masterJoinBtn = document.createElement('button');
        masterJoinBtn.className = 'tron-btn gp-join-btn gp-join-btn-master';
        masterJoinBtn.title = 'Click with gamepad to become unrestricted (any player)';
        masterJoinBtn.textContent = 'JOIN';
        masterJoinBtn.addEventListener('click', () => {
            const gpIdx = inputManager.lastClickingGamepad;
            if (gpIdx != null) inputManager.setGamepadAssignment(gpIdx, 'master');
        });
        masterRow.appendChild(masterJoinBtn);
        for (const gpIdx of masterGPs) {
            const chip = document.createElement('button');
            chip.className = 'tron-btn gp-chip';
            chip.style.setProperty('--gp-color', '#666');
            chip.title = `Remove GP${gpIdx}`;
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                inputManager.gamepadCursorManager?.kickGamepad(gpIdx);
            });
            masterRow.appendChild(chip);
        }
        gamepadSidePanel.appendChild(masterRow);

        gamepadSidePanel.classList.add('gp-panel-active');
    }

    function redistributeGamepads() {
        const gcm = inputManager.gamepadCursorManager;
        if (!gcm) return;
        const humanCount = Math.max(1, parseInt(document.getElementById('human-count')?.value ?? '1'));
        const activatedIndices = [...gcm.activatedGamepads].sort((a, b) => a - b);
        activatedIndices.forEach((idx, i) => {
            inputManager.setGamepadAssignment(idx, humanCount <= 1 ? 0 : i % humanCount);
        });
    }

    // When human count changes: redistribute all gamepads, then re-render
    document.getElementById('human-count')?.addEventListener('change', () => {
        redistributeGamepads();
        renderGamepadAssignments();
    });

    // When a new gamepad joins: respect saved assignment if valid, otherwise auto-assign
    inputManager.on('gamepadActivated', ({ index }) => {
        const gcm = inputManager.gamepadCursorManager;
        const humanCount = Math.max(1, parseInt(document.getElementById('human-count')?.value ?? '1'));

        // Keep saved assignment if it's still valid for the current human count
        if (inputManager.gamepadAssignments.has(index)) {
            const saved = inputManager.gamepadAssignments.get(index);
            const valid = saved === 'master' || (typeof saved === 'number' && (humanCount <= 1 ? saved === 0 : saved < humanCount));
            if (valid) {
                renderGamepadAssignments();
                return;
            }
        }

        // No valid saved assignment — find first empty slot
        if (humanCount <= 1) {
            inputManager.setGamepadAssignment(index, 0);
        } else {
            const occupied = new Set();
            for (const idx of gcm.activatedGamepads) {
                if (idx === index) continue;
                const a = inputManager.getGamepadAssignment(idx);
                if (typeof a === 'number' && a < humanCount) occupied.add(a);
            }
            let assignTo = -1;
            for (let i = 0; i < humanCount; i++) {
                if (!occupied.has(i)) { assignTo = i; break; }
            }
            if (assignTo === -1) {
                const pos = [...gcm.activatedGamepads].sort((a, b) => a - b).indexOf(index);
                assignTo = pos % humanCount;
            }
            inputManager.setGamepadAssignment(index, assignTo);
        }
        renderGamepadAssignments();
    });

    // Re-render on any assignment change (e.g. manual chip reassignment)
    inputManager.on('gamepadAssignmentChange', renderGamepadAssignments);

    // Sync visibility when setup or pause modal is shown/hidden
    const _gpPanelObs = { attributes: true, attributeFilter: ['class'] };
    new MutationObserver(renderGamepadAssignments).observe(document.getElementById('setup-modal'), _gpPanelObs);
    new MutationObserver(renderGamepadAssignments).observe(document.getElementById('pause-modal'), _gpPanelObs);

    renderGamepadAssignments();

    const sessionManager = new SessionManager(game, renderer, effectsManager, turnHistory, mapEditor);
    const scenarioBrowser = new ScenarioBrowser(configManager, mapEditor);
    sessionManager.setScenarioBrowser(scenarioBrowser);
    sessionManager.setConfigManager(configManager);
    scenarioBrowser.setEffectsManager(effectsManager);
    await scenarioBrowser.init();
    configManager.setupInputListeners(effectsManager, renderer);

    const gameStarter = new GameStarter(
        game, renderer, effectsManager, turnHistory,
        configManager, scenarioBrowser, scenarioManager
    );
    scenarioBrowser.setOnStartGame(() => gameStarter.startGame());
    scenarioBrowserOpen = () => scenarioBrowser.open();
    sessionManagerRef = sessionManager;

    const showStartupDialogs = async () => {
        if (!localStorage.getItem('dicy_steam_welcome_shown')) {
            localStorage.setItem('dicy_steam_welcome_shown', '1');
            localStorage.setItem('dicy_gameSpeed', 'beginner');
            if (configManager.elements?.gameSpeedInput) {
                configManager.elements.gameSpeedInput.value = 'beginner';
            }
            const tutorialCampaign = scenarioBrowser.campaignManager.getCampaign('tutorial');
            if (tutorialCampaign) {
                scenarioBrowser.selectedCampaign = tutorialCampaign;
                scenarioBrowser.selectAndPlayLevel(0, { immediateStart: true });
            }
        }
    };

    // Show dialogs in parallel with loading
    showStartupDialogs();

    onLoadingDismiss = async () => {
        if (game.players.length > 0) {
            // Auto-resume: no modal change fires, so reveal back button manually
            document.getElementById('global-back-btn')?.classList.remove('hidden');
            return;
        }
        // startIntroMode() already called in onDismissStart for the fade-in effect
        if (localStorage.getItem('dicy_campaignMode')) {
            await scenarioBrowser.showCampaignView();
            scenarioBrowser.restoreLastSelectedCampaign();
            scenarioBrowser.scenarioBrowserModal.classList.remove('hidden');
        } else {
            document.getElementById('main-menu').classList.remove('hidden');
        }
    };

    // Initialize Sound & Audio
    const sfxManager = new SoundManager();
    // Pre-render all sound effects during loading for instant playback
    sfxManager.preloadAll().catch(e => console.warn('Sound preload failed:', e));

    // Play feuerware logo sting immediately on startup (native Audio avoids pixi/sound race)
    if (localStorage.getItem('dicy_musicEnabled') !== 'false' && localStorage.getItem('dicy_sfxEnabled') !== 'false') {
        try {
            const fwSting = new Audio('./assets/sfx/feuerware.ogg');
            fwSting.volume = parseFloat(localStorage.getItem('dicy_sfxVolume') ?? '0.3');
            fwSting.play().catch(() => {}); // silently ignored if browser blocks autoplay
        } catch (e) {}
    }
    const audioController = new AudioController(sfxManager);
    audioController.init();

    // Achievement toast notification
    {
        const toast     = document.getElementById('achievement-toast');
        const toastIcon = document.getElementById('achievement-toast-icon');
        const toastName = document.getElementById('achievement-toast-name');
        const ACHIEVEMENTS_MAP = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));
        let toastQueue = [];
        let toastActive = false;

        const showNext = () => {
            if (!toastQueue.length) { toastActive = false; return; }
            toastActive = true;
            const { id, name } = toastQueue.shift();
            const iconClass = id.replace(/_/g, '-');
            toastIcon.className = `sprite-icon ${iconClass}`;
            toastName.textContent = name;
            // Slide in
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
            sfxManager.victory();
            // Hold then slide out
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(24px)';
                setTimeout(showNext, 380);
            }, 3500);
        };

        const getFriendlyName = (id) => {
            const a = ACHIEVEMENTS_MAP[id];
            if (!a) return id;
            if (a.type === 'campaign') return a.campaign.replace(/^./, c => c.toUpperCase()) + ' Complete';
            if (a.type === 'stat') {
                if (a.stat === 'gamesPlayed')  return `${a.threshold.toLocaleString()} Games Played`;
                if (a.stat === 'gamesWon')     return 'First Win';
                if (a.stat === 'underdogWins') return `${a.threshold.toLocaleString()} Underdog Wins`;
            }
            if (a.type === 'event') {
                if (a.event === 'won4vs6')       return 'David vs. Goliath';
                if (a.event === 'attackStreak3') return '3 Attack Streak';
                if (a.event === 'attackStreak4') return '4 Attack Streak';
                if (a.event === 'attackStreak5') return '5 Attack Streak';
                if (a.event === 'attackStreak6') return '6 Attack Streak';
                if (a.event === 'attackStreak7') return '7 Attack Streak';
                if (a.event === 'won8PlayerGame') return 'Last Standing';
                if (a.event === 'pureBots')      return 'Bot Tournament';
                if (a.event === 'pureHumans')    return 'Human Only';
            }
            return id;
        };

        setUnlockCallback((id) => {
            toastQueue.push({ id, name: getFriendlyName(id) });
            if (!toastActive) showNext();
        });
    }

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

    // --- DISPLAY & GRAPHICS SETUP ---
    const desktopDisplayGroup = document.getElementById('desktop-display-controls');
    const gfxDisplayMode = document.getElementById('gfx-display-mode');
    const gfxResolution = document.getElementById('gfx-resolution');
    const gfxAntialias = document.getElementById('gfx-antialias');
    const gfxFramerate = document.getElementById('gfx-framerate');
    const gfxFps = document.getElementById('gfx-fps');

    // 1. Initialize Values from Storage
    const savedAA = localStorage.getItem('dicy_gfx_antialias') || 'off';
    if (gfxAntialias) gfxAntialias.value = savedAA;

    const savedFPS = localStorage.getItem('dicy_gfx_framerate') || 'vsync';
    if (gfxFramerate) gfxFramerate.value = savedFPS;

    // Wait until renderer exists to apply framerate
    const applyFramerate = (val) => {
        if (!renderer || !renderer.app) return;
        if (val === 'vsync') {
            renderer.app.ticker.maxFPS = Math.min(window.screen.refreshRate || 60, 120);
        } else {
            renderer.app.ticker.maxFPS = parseInt(val, 10);
        }
    };

    if (gfxAntialias) {
        gfxAntialias.addEventListener('change', async (e) => {
            localStorage.setItem('dicy_gfx_antialias', e.target.value);
            const ok = await Dialog.confirm('Changing Anti-Aliasing requires a restart. Reload now?', 'RESTART REQUIRED');
            if (ok) { await flushStorage(); window.location.reload(); }
        });
    }

    if (gfxFramerate) {
        gfxFramerate.addEventListener('change', (e) => {
            const val = e.target.value;
            localStorage.setItem('dicy_gfx_framerate', val);
            applyFramerate(val);
        });

        // Apply immediately
        applyFramerate(savedFPS);
    }

    const savedFPSDisplay = localStorage.getItem('dicy_gfx_fps') || 'off';
    if (gfxFps) {
        gfxFps.value = savedFPSDisplay;
        gfxFps.addEventListener('change', (e) => {
            localStorage.setItem('dicy_gfx_fps', e.target.value);
            const fpsCounter = document.getElementById('fps-counter');
            if (fpsCounter) fpsCounter.classList.toggle('hidden', e.target.value !== 'on');
        });
    }

    // 2. Tauri / Desktop Only Settings
    if (isDesktopContext()) {
        if (desktopDisplayGroup) desktopDisplayGroup.classList.remove('hidden');

        const savedMode = localStorage.getItem('dicy_gfx_display_mode') || 'fullscreen';
        if (gfxDisplayMode) gfxDisplayMode.value = savedMode;

        const savedRes = localStorage.getItem('dicy_gfx_resolution') || '1.0';
        if (gfxResolution) gfxResolution.value = savedRes;

        // Monitor selection — populate dropdown and apply saved monitor
        const gfxMonitor = document.getElementById('gfx-monitor');
        const savedMonitorIndex = parseInt(localStorage.getItem('dicy_gfx_monitor') ?? '-1', 10);

        const applyMonitor = async (win, monitors, monitorIndex) => {
            if (monitorIndex < 0 || monitorIndex >= monitors.length) {
                console.log('[monitor] applyMonitor: index out of range', monitorIndex, monitors.length);
                return;
            }
            const mon = monitors[monitorIndex];
            const { PhysicalPosition } = await import('@tauri-apps/api/dpi');
            // Place the window at the top-left of the target monitor with a small offset
            // (avoids issues with centering when window is larger than monitor)
            const x = mon.position.x + 60;
            const y = mon.position.y + 60;
            console.log(`[monitor] moving to monitor ${monitorIndex} "${mon.name}" at physical (${x}, ${y})`);
            await win.setPosition(new PhysicalPosition(x, y));
        };

        const applyDesktopGraphics = async (modeVal, scaleVal, monitorIndex) => {
            try {
                const { getCurrentWindow, availableMonitors } = await import('@tauri-apps/api/window');
                const win = getCurrentWindow();
                const monitors = await availableMonitors();

                console.log(`[monitor] applyDesktopGraphics mode=${modeVal} monitorIndex=${monitorIndex} monitors=${monitors.length}`);

                // Must exit fullscreen before setPosition works — the OS ignores
                // position changes while the window is in fullscreen mode.
                const isFS = await win.isFullscreen();
                if (isFS) {
                    await win.setFullscreen(false);
                    // Wait for the OS to finish restoring the windowed frame
                    await new Promise(r => setTimeout(r, 400));
                }

                // Move to target monitor
                await applyMonitor(win, monitors, monitorIndex);

                // Apply desired display mode
                if (modeVal === 'fullscreen') {
                    await win.setFullscreen(true);
                    await win.setDecorations(true);
                } else {
                    await win.setDecorations(true);
                    await win.unmaximize();
                    // Restore saved window size and position
                    const savedW = parseInt(localStorage.getItem('dicy_win_w'), 10);
                    const savedH = parseInt(localStorage.getItem('dicy_win_h'), 10);
                    const savedWinX = parseInt(localStorage.getItem('dicy_win_x'), 10);
                    const savedWinY = parseInt(localStorage.getItem('dicy_win_y'), 10);
                    if (!isNaN(savedW) && savedW > 100 && !isNaN(savedH) && savedH > 100) {
                        const { PhysicalSize } = await import('@tauri-apps/api/dpi');
                        await win.setSize(new PhysicalSize(savedW, savedH));
                    }
                    if (!isNaN(savedWinX) && !isNaN(savedWinY)) {
                        const { PhysicalPosition: PP } = await import('@tauri-apps/api/dpi');
                        await win.setPosition(new PP(savedWinX, savedWinY));
                    }
                }

                if (renderer && renderer.app && renderer.app.renderer) {
                    const scaleRatio = parseFloat(scaleVal);
                    if (!isNaN(scaleRatio) && scaleRatio < 1.0) {
                        renderer.app.renderer.resolution = scaleRatio * Math.min(window.devicePixelRatio || 1, 1.5);
                        renderer.app.canvas.style.imageRendering = 'pixelated';
                    } else {
                        renderer.app.renderer.resolution = Math.min(window.devicePixelRatio || 1, 1.5);
                        renderer.app.canvas.style.imageRendering = 'auto';
                    }
                    window.dispatchEvent(new Event('resize'));
                }
            } catch (err) {
                console.warn("Failed to apply Tauri window settings:", err);
            }
        };

        // Populate monitor dropdown
        if (gfxMonitor) {
            (async () => {
                try {
                    const { availableMonitors, currentMonitor } = await import('@tauri-apps/api/window');
                    const monitors = await availableMonitors();
                    const current = await currentMonitor();

                    gfxMonitor.innerHTML = '';
                    monitors.forEach((mon, i) => {
                        const label = mon.name || `Monitor ${i + 1}`;
                        const opt = document.createElement('option');
                        opt.value = String(i);
                        opt.textContent = `${i + 1}: ${label} (${mon.size.width}×${mon.size.height})`;
                        gfxMonitor.appendChild(opt);
                    });

                    // Select saved, otherwise default to current monitor
                    if (savedMonitorIndex >= 0 && savedMonitorIndex < monitors.length) {
                        gfxMonitor.value = String(savedMonitorIndex);
                    } else {
                        const currentIdx = monitors.findIndex(m => m.name === current?.name);
                        gfxMonitor.value = String(currentIdx >= 0 ? currentIdx : 0);
                    }

                    // Auto-save monitor when the user drags the window to another screen
                    const { getCurrentWindow } = await import('@tauri-apps/api/window');
                    const win = getCurrentWindow();
                    let lastMonitorName = current?.name;
                    win.onMoved(async () => {
                        try {
                            // Save window position (only in windowed mode)
                            const isFS = await win.isFullscreen();
                            if (!isFS) {
                                const pos = await win.outerPosition();
                                localStorage.setItem('dicy_win_x', String(pos.x));
                                localStorage.setItem('dicy_win_y', String(pos.y));
                            }
                            const { currentMonitor: getCurrent, availableMonitors: getMonitors } = await import('@tauri-apps/api/window');
                            const nowMonitor = await getCurrent();
                            if (!nowMonitor || nowMonitor.name === lastMonitorName) return;
                            lastMonitorName = nowMonitor.name;
                            const allMonitors = await getMonitors();
                            const idx = allMonitors.findIndex(m => m.name === nowMonitor.name);
                            if (idx < 0) return;
                            localStorage.setItem('dicy_gfx_monitor', String(idx));
                            if (gfxMonitor) gfxMonitor.value = String(idx);
                            // Flush immediately so the save survives an OS-level close
                            await flushStorage();
                        } catch (_) {}
                    });
                    win.onResized(async () => {
                        try {
                            const isFS = await win.isFullscreen();
                            if (!isFS) {
                                const size = await win.outerSize();
                                localStorage.setItem('dicy_win_w', String(size.width));
                                localStorage.setItem('dicy_win_h', String(size.height));
                            }
                        } catch (_) {}
                    });
                } catch (err) {
                    console.warn('[monitor] Could not list monitors:', err);
                    if (gfxMonitor) gfxMonitor.innerHTML = '<option value="">N/A</option>';
                }
            })();

            gfxMonitor.addEventListener('change', async (e) => {
                const idx = parseInt(e.target.value, 10);
                localStorage.setItem('dicy_gfx_monitor', e.target.value);
                await flushStorage();
                await applyDesktopGraphics(
                    localStorage.getItem('dicy_gfx_display_mode') || 'fullscreen',
                    localStorage.getItem('dicy_gfx_resolution') || '1.0',
                    idx
                );
            });
        }

        // Apply on boot — delay lets the OS finish restoring window state first
        console.log(`[monitor] boot: savedMonitorIndex=${savedMonitorIndex} savedMode=${savedMode}`);
        setTimeout(() => applyDesktopGraphics(savedMode, savedRes, savedMonitorIndex), 800);

        if (gfxDisplayMode) {
            gfxDisplayMode.addEventListener('change', async (e) => {
                const val = e.target.value;
                localStorage.setItem('dicy_gfx_display_mode', val);
                await flushStorage();
                window.location.reload();
            });
        }

        if (gfxResolution) {
            gfxResolution.addEventListener('change', async (e) => {
                const val = e.target.value;
                localStorage.setItem('dicy_gfx_resolution', val);
                await flushStorage();
                window.location.reload();
            });
        }
        // Alt+Enter: toggle fullscreen ↔ windowed
        window.addEventListener('keydown', async (e) => {
            if (e.altKey && e.key === 'Enter') {
                e.preventDefault();
                const current = localStorage.getItem('dicy_gfx_display_mode') || 'fullscreen';
                const next    = current === 'fullscreen' ? 'window' : 'fullscreen';
                localStorage.setItem('dicy_gfx_display_mode', next);
                if (gfxDisplayMode) gfxDisplayMode.value = next;
                await flushStorage();
                await applyDesktopGraphics(
                    next,
                    localStorage.getItem('dicy_gfx_resolution') || '1.0',
                    parseInt(localStorage.getItem('dicy_gfx_monitor') ?? '-1', 10)
                );
            }
        });

        // Gamepad type toggle
        // (wired in refreshControlsSection below)
    }

    // Initialize Game Event Manager
    const gameEventManager = new GameEventManager(
        game, renderer, gameStarter, sessionManager, turnHistory, scenarioManager
    );
    gameEventManager.setUIComponents(diceHUD, gameLog, playerDashboard, highscoreManager, sfxManager, effectsManager, gameStatsTracker);
    gameEventManager.setCallbacks(getPlayerName, addLog, startTurnLog, finalizeTurnLog);
    gameEventManager.setScenarioBrowser(scenarioBrowser);
    gameEventManager.init();
    sessionManager.setGameEventManager(gameEventManager);

    // Refresh UI hints whenever bindings are reloaded after configuration
    inputManager.on('bindingsReloaded', () => gameEventManager.refreshHints());

    // Tournament Runner
    const tournamentRunner = new TournamentRunner(configManager);

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

    // Menu Navigation
    setupMenuNavigation(effectsManager, audioController, inputManager, gameStarter, renderer, mapEditor);


    // Check for auto-resume
    setTimeout(() => {
        const config = configManager.getGameConfig();
        console.log('Auto-resume: gameSpeed from config =', config.gameSpeed);

        // Initialize gameStarter's state so it's available during turn handlers
        // This matches what happens in gameStarter.startGame()
        gameStarter.gameSpeed = config.gameSpeed;
        gameStarter.turnTimeLimit = config.turnTimeLimit ?? 0;

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

            Dialog.alert(`Saved as #${levelIndex} in 'Your Campaign'`);
        }
    };

    // Pause menu save button
    document.getElementById('pause-save-btn')?.addEventListener('click', async () => {
        await openSaveScenarioDialog(gameLog.latestSnapshotIndex);
    });
}

// Loading screen logic is now handled in LoadingScreen class in src/ui/loading-screen.js

// Helper: Setup FPS Counter
function setupFPSCounter(renderer) {
    const fpsCounter = document.getElementById('fps-counter');
    if (!fpsCounter || !renderer.app) return;

    const urlParams = new URLSearchParams(window.location.search);
    const showFPS = urlParams.get('fps') === 'true' || localStorage.getItem('dicy_gfx_fps') === 'on';
    if (showFPS) fpsCounter.classList.remove('hidden');

    let frameCount = 0;
    let lastTime = performance.now();
    let lastFPS = 0;

    const updateFPSStatus = () => {
        const canvas = renderer.app && (renderer.app.canvas || renderer.app.view);
        const width = canvas ? canvas.width : -3;
        const height = canvas ? canvas.height : -1;
        fpsCounter.textContent = `FPS: ${lastFPS} · ${width}x${height}`;
    };

    renderer.app.ticker.add(() => {
        if (fpsCounter.classList.contains('hidden')) return;
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
    endTurnBtn.addEventListener('click', (e) => {
        if (e.isGamepadSimulated && e.gamepadIndex !== undefined &&
            !inputManager.canGamepadControlPlayer(e.gamepadIndex, game.currentPlayer?.id)) return;
        const humanPlayers = game.players.filter(p => !p.isBot);
        if (humanPlayers.length > 1) {
            input.deselect();
        }
        game.endTurn();
    });

    // New Game Button — now opens the pause menu (wired in setupMenuNavigation)

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
    autoWinBtn.addEventListener('click', (e) => {
        if (e.isGamepadSimulated && e.gamepadIndex !== undefined &&
            !inputManager.canGamepadControlPlayer(e.gamepadIndex, game.currentPlayer?.id)) return;
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
            if (!inputManager.canGamepadControlPlayer(data.index, game.currentPlayer.id)) {
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
    inputManager.on('menu', () => {
        if (Dialog.activeOverlay) {
            Dialog.close(Dialog.activeOverlay);
            return;
        }

        const globalBackBtn = document.getElementById('global-back-btn');
        if (globalBackBtn && !globalBackBtn.classList.contains('hidden')) {
            globalBackBtn.click();
            return;
        }

        // global-back-btn is hidden → on main menu or loading screen
        // On Tauri with no game running → offer quit to desktop
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
        }
    });

    inputManager.on('cancel', () => {
        if (Dialog.activeOverlay) {
            Dialog.close(Dialog.activeOverlay);
        }
    });
}

// Helper: Setup all menu navigation (main menu, settings, howto, about, pause)
function setupMenuNavigation(effectsManager, audioController, inputManager, gameStarter, renderer, mapEditor) {
    const mainMenu = document.getElementById('main-menu');

    // Update stats display whenever the main menu becomes visible
    const _achBtnProgress  = document.getElementById('ach-btn-progress');
    const _achStatPlayed   = document.getElementById('ach-stat-played');
    const _achStatWon      = document.getElementById('ach-stat-won');
    const _achStatWinrate  = document.getElementById('ach-stat-winrate');
    const _refreshMenuStats = () => {
        const stats    = JSON.parse(localStorage.getItem('dicy_ach_stats') || '{}');
        const unlocked = JSON.parse(localStorage.getItem('dicy_ach_unlocked') || '[]');
        const played   = stats.gamesPlayed || 0;
        const won      = stats.gamesWon    || 0;
        const pct      = played > 0 ? Math.round((won / played) * 100) : 0;

        // Achievement button: unlocked / total
        if (_achBtnProgress) _achBtnProgress.textContent = `${unlocked.length} / ${ACHIEVEMENTS.length}`;

        // Achievements modal stats
        if (_achStatPlayed)  _achStatPlayed.textContent  = played.toLocaleString();
        if (_achStatWon)     _achStatWon.textContent     = won.toLocaleString();
        if (_achStatWinrate) _achStatWinrate.textContent = played > 0 ? `${pct}%` : '—';
    };
    new MutationObserver(() => {
        if (!mainMenu.classList.contains('hidden')) _refreshMenuStats();
    }).observe(mainMenu, { attributes: true, attributeFilter: ['class'] });

    const setupModal = document.getElementById('setup-modal');
    const howtoModal = document.getElementById('howto-modal');
    const settingsModal = document.getElementById('settings-modal');
    const aboutModal = document.getElementById('about-modal');
    const achievementsModal = document.getElementById('achievements-modal');
    const pauseModal = document.getElementById('pause-modal');
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
        let configHtml = '<div class="controls-configure-row" style="flex-wrap: wrap; gap: 15px;">';
        configHtml += '<div><button class="tron-btn small" id="configure-keyboard-btn" style="margin-bottom:10px;">CONFIGURE KEYBOARD</button></div>';

        // Gamepad Type toggle button (desktop only)
        if (isDesktopContext()) {
            const currentBackend = inputManager.backend || 'auto';
            const label = currentBackend === 'navigator' ? 'GAMEPAD: BROWSER' : 'GAMEPAD: NATIVE';
            configHtml += `<div><button class="tron-btn small" id="gamepad-type-toggle-btn" style="margin-bottom:10px;">${label}</button></div>`;
        }

        const connectedGamepads = Array.from(inputManager.connectedGamepadIndices || []).sort();
        connectedGamepads.forEach((rawIdx) => {
            const humanIdx = inputManager.getHumanIndex(rawIdx);
            const color = GAME.HUMAN_COLORS[humanIdx % GAME.HUMAN_COLORS.length];
            const colorHex = '#' + color.toString(16).padStart(6, '0');

            // Read saved deadzone or default to 0.15
            const savedDeadzone = localStorage.getItem('dicy_gamepad_deadzone_' + rawIdx);
            const currentDeadzone = savedDeadzone ? parseFloat(savedDeadzone) : 0.15;
            const displayPct = Math.round(currentDeadzone * 100);

            configHtml += `
            <div class="gamepad-config-group" style="margin-bottom: 20px; padding: 15px; background: rgba(0,0,0,0.3); border-left: 4px solid ${colorHex}; display: flex; flex-direction: column; gap: 10px; width: 300px; max-width: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color:${colorHex}; font-weight:bold; letter-spacing: 1px;">GP ${humanIdx + 1}</span>
                    <button class="tron-btn small gamepad-configure-btn" data-gamepad-index="${rawIdx}" style="border-color:${colorHex};color:${colorHex}; margin:0;">BINDINGS</button>
                </div>
                <div class="control-group range-row" style="margin: 0; display:flex; align-items:center; gap: 10px;">
                    <label style="margin:0; min-width: 70px;">Deadzone</label>
                    <input type="range" class="gamepad-deadzone-slider" data-gamepad-index="${rawIdx}" min="0.0" max="0.5" step="0.01" value="${currentDeadzone}" style="flex:1;">
                    <span class="deadzone-value" id="deadzone-val-${rawIdx}" style="min-width:35px; text-align:right;">${displayPct}%</span>
                </div>
            </div>`;
        });

        configHtml += '</div>';
        configArea.innerHTML = configHtml;

        // Keyboard configure button
        document.getElementById('configure-keyboard-btn')?.addEventListener('click', async () => {
            const saved = await KeyBindingDialog.configureKeyboard(inputManager);
            if (saved) refreshControlsSection();
        });

        // Gamepad Type toggle button
        document.getElementById('gamepad-type-toggle-btn')?.addEventListener('click', () => {
            const next = inputManager.backend === 'navigator' ? 'auto' : 'navigator';
            inputManager.setBackend(next);
            refreshControlsSection();
        });

        // Gamepad configure buttons
        configArea.querySelectorAll('.gamepad-configure-btn').forEach(btn => {
            const rawIdx = parseInt(btn.getAttribute('data-gamepad-index'));
            btn.addEventListener('click', async () => {
                const saved = await KeyBindingDialog.configureGamepad(rawIdx, inputManager);
                if (saved) refreshControlsSection();
            });
        });

        // Gamepad deadzone sliders
        configArea.querySelectorAll('.gamepad-deadzone-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const rawIdx = e.target.getAttribute('data-gamepad-index');
                const val = parseFloat(e.target.value);
                const displaySpan = document.getElementById('deadzone-val-' + rawIdx);
                if (displaySpan) {
                    displaySpan.textContent = Math.round(val * 100) + '%';
                }
                localStorage.setItem('dicy_gamepad_deadzone_' + rawIdx, val.toString());
            });
        });
    }

    // Refresh configure buttons when gamepads connect/disconnect
    if (inputManager) {
        inputManager.on('gamepadChange', () => refreshControlsSection());
    }

    // --- Settings open/close (shared between main menu and pause) ---
    let settingsBackCallback = null;

    function openSettings(onBack) {
        settingsBackCallback = onBack;
        refreshHowtoSections();
        bindMusicToggles();
        refreshControlsSection();
        initGameSpeedSegmented();
        settingsModal.classList.remove('hidden');
    }

    // Segmented game speed buttons — synced across all instances, immediate effect in-game
    function initGameSpeedSegmented() {
        const current = localStorage.getItem('dicy_gameSpeed') || 'beginner';
        document.querySelectorAll('.game-speed-segmented .segmented-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === current);
            btn.addEventListener('click', () => {
                const val = btn.dataset.value;
                localStorage.setItem('dicy_gameSpeed', val);
                // Sync hidden select so configManager.getGameConfig() stays accurate
                const sel = document.getElementById('game-speed');
                if (sel) { sel.value = val; sel.dispatchEvent(new Event('change')); }
                // Apply immediately to running game
                if (gameStarter) gameStarter.gameSpeed = val;
                if (renderer) renderer.setGameSpeed(val);
                // Update active state on every instance
                document.querySelectorAll('.game-speed-segmented .segmented-option').forEach(o => {
                    o.classList.toggle('active', o.dataset.value === val);
                });
            });
        });
    }
    initGameSpeedSegmented();

    // --- About open/close ---
    function openAbout(onBack) {
        refreshHowtoSections();
        bindMusicToggles();
        aboutModal.classList.remove('hidden');
        aboutModal._onBack = onBack;
    }

    // --- Main Menu button wiring ---
    const achievementsPanel = new AchievementsPanel(achievementsModal);

    document.getElementById('main-achievements-btn')?.addEventListener('click', () => {
        mainMenu.classList.add('hidden');
        achievementsPanel.open();
    });

    document.getElementById('main-campaign-btn')?.addEventListener('click', () => {
        mainMenu.classList.add('hidden');
        scenarioBrowserOpen();
    });

    document.getElementById('main-custom-btn')?.addEventListener('click', () => {
        mainMenu.classList.add('hidden');
        setupModal.classList.remove('hidden');
    });

    document.getElementById('main-howto-btn')?.addEventListener('click', () => {
        mainMenu.classList.add('hidden');
        howtoModal.classList.remove('hidden');
        if (!probabilityCalculator) {
            probabilityCalculator = new ProbabilityCalculator();
        }
    });

    document.getElementById('main-settings-btn')?.addEventListener('click', () => {
        mainMenu.classList.add('hidden');
        openSettings(() => {
            mainMenu.classList.remove('hidden');
        });
    });

    document.getElementById('main-about-btn')?.addEventListener('click', () => {
        mainMenu.classList.add('hidden');
        openAbout(() => {
            mainMenu.classList.remove('hidden');
        });
    });

    // --- Global back button (handles all screens) ---
    document.getElementById('global-back-btn')?.addEventListener('click', async () => {
        if (pauseModal && !pauseModal.classList.contains('hidden')) {
            pauseModal.classList.add('hidden');
            if (localStorage.getItem('dicy_campaignMode')) {
                await sessionManagerRef.quitToCampaignScreen();
            } else {
                sessionManagerRef.quitToCustomGame();
            }
            return;
        }
        if (settingsModal && !settingsModal.classList.contains('hidden')) {
            settingsModal.classList.add('hidden');
            if (settingsBackCallback) { settingsBackCallback(); settingsBackCallback = null; }
            return;
        }
        if (howtoModal && !howtoModal.classList.contains('hidden')) {
            howtoModal.classList.add('hidden');
            mainMenu.classList.remove('hidden');
            return;
        }
        if (achievementsModal && !achievementsModal.classList.contains('hidden')) {
            achievementsModal.classList.add('hidden');
            mainMenu.classList.remove('hidden');
            return;
        }
        if (aboutModal && !aboutModal.classList.contains('hidden')) {
            aboutModal.classList.add('hidden');
            if (aboutModal._onBack) { aboutModal._onBack(); aboutModal._onBack = null; }
            return;
        }
        if (setupModal && !setupModal.classList.contains('hidden')) {
            setupModal.classList.add('hidden');
            mainMenu.classList.remove('hidden');
            return;
        }
        const scenarioBrowserModal = document.getElementById('scenario-browser-modal');
        if (scenarioBrowserModal && !scenarioBrowserModal.classList.contains('hidden')) {
            document.getElementById('scenario-browser-close-btn')?.click();
            return;
        }
        // Editor open → on mobile close settings panel first, otherwise close editor
        if (mapEditor?.isOpen) {
            const isMobile = window.matchMedia('(max-width: 900px)').matches;
            const settingsOpen = mapEditor.elements?.settingsPanel?.classList.contains('editor-settings-open');
            if (isMobile && settingsOpen) {
                mapEditor.elements.settingsPanel.classList.remove('editor-settings-open');
            } else {
                mapEditor.close();
            }
            return;
        }
        // In-game (no modal open) → open pause menu
        if (sessionManagerRef && sessionManagerRef.isGameInProgress()) {
            pauseModal.classList.remove('hidden');
            initGameSpeedSegmented();
            syncPauseAudioBtns();
        }
    });

    // Auto-hide global back btn when on main menu or pause modal; switch icon based on context
    const globalBackBtn = document.getElementById('global-back-btn');
    const editorOverlay = document.getElementById('editor-overlay');
    const steamMenuBtn = document.getElementById('main-menu-steam-btn');
    const mainMenuBranding = document.getElementById('main-menu-branding');
    const isSteamBuild = isSteamContext();
    const showBranding = !isAndroid();
    if (steamMenuBtn) steamMenuBtn.classList.toggle('hidden', isSteamBuild);
    function updateGlobalBackVisibility() {
        const loading = document.body.classList.contains('loading-active');

        const onMainMenu = mainMenu && !mainMenu.classList.contains('hidden');
        const pauseOpen = pauseModal && !pauseModal.classList.contains('hidden');

        // Don't touch visibility while loading
        if (!loading) {
            // Hidden on main menu; visible when game running (with or without pause open)
            globalBackBtn?.classList.toggle('hidden', onMainMenu);
            mainMenuBranding?.classList.toggle('hidden', !(onMainMenu && showBranding));
        }

        // Always update icon state so it's correct when the button becomes visible
        if (globalBackBtn) {
            // Show x when pause is open, gear when game running with no overlay
            if (pauseOpen) {
                globalBackBtn.querySelector('.icon-close')?.classList.remove('hidden');
                globalBackBtn.querySelector('.icon-settings')?.classList.add('hidden');
            } else {
                const anyModalOpen = [settingsModal, howtoModal, aboutModal, setupModal,
                    document.getElementById('scenario-browser-modal'), editorOverlay]
                    .some(el => el && !el.classList.contains('hidden'));
                const showGear = !anyModalOpen && sessionManagerRef?.isGameInProgress();
                globalBackBtn.querySelector('.icon-close')?.classList.toggle('hidden', !!showGear);
                globalBackBtn.querySelector('.icon-settings')?.classList.toggle('hidden', !showGear);
            }
        }
    }
    // Zoom buttons: visible only on bare main menu, in editor, or while game is running without any overlay
    // Use #player-dashboard as the game-active indicator — shown for the full session, not per-turn
    const playerDashboard = document.getElementById('player-dashboard');
    const sbModal = document.getElementById('scenario-browser-modal');
    const zoomDialogs = [pauseModal, settingsModal, howtoModal, aboutModal, setupModal, sbModal];
    function syncToolbarAudioBtns() {
        const mainMusicBtn = document.getElementById('music-toggle');
        const mainSfxBtn = document.getElementById('sfx-toggle');
        const mainMusicVol = document.getElementById('music-volume');
        const mainSfxVol = document.getElementById('sfx-volume');
        const tbMusicBtn = document.getElementById('toolbar-music-toggle');
        const tbSfxBtn = document.getElementById('toolbar-sfx-toggle');
        const tbMusicVol = document.getElementById('toolbar-music-volume');
        const tbSfxVol = document.getElementById('toolbar-sfx-volume');
        if (tbMusicBtn && mainMusicBtn) {
            tbMusicBtn.innerHTML = mainMusicBtn.innerHTML;
            tbMusicBtn.classList.toggle('active', mainMusicBtn.classList.contains('active'));
        }
        if (tbSfxBtn && mainSfxBtn) {
            tbSfxBtn.innerHTML = mainSfxBtn.innerHTML;
            tbSfxBtn.classList.toggle('active', mainSfxBtn.classList.contains('active'));
        }
        if (tbMusicVol && mainMusicVol) tbMusicVol.value = mainMusicVol.value;
        if (tbSfxVol && mainSfxVol) tbSfxVol.value = mainSfxVol.value;
    }

    function updateZoomVisibility() {
        const onMainMenu = mainMenu && !mainMenu.classList.contains('hidden');
        const inEditor = editorOverlay && !editorOverlay.classList.contains('hidden');
        const gameActive = playerDashboard && !playerDashboard.classList.contains('hidden');
        const show = inEditor || gameActive;
        document.querySelectorAll('.zoom-control').forEach(el => el.classList.toggle('hidden', !show));
        document.querySelectorAll('.main-menu-control').forEach(el => el.classList.add('hidden'));
    }

    const obsOpts = { attributes: true, attributeFilter: ['class'] };
    if (mainMenu) new MutationObserver(updateGlobalBackVisibility).observe(mainMenu, obsOpts);
    if (pauseModal) new MutationObserver(updateGlobalBackVisibility).observe(pauseModal, obsOpts);
    if (settingsModal) new MutationObserver(updateGlobalBackVisibility).observe(settingsModal, obsOpts);
    if (howtoModal) new MutationObserver(updateGlobalBackVisibility).observe(howtoModal, obsOpts);
    if (aboutModal) new MutationObserver(updateGlobalBackVisibility).observe(aboutModal, obsOpts);
    if (setupModal) new MutationObserver(updateGlobalBackVisibility).observe(setupModal, obsOpts);
    if (sbModal) new MutationObserver(updateGlobalBackVisibility).observe(sbModal, obsOpts);
    if (editorOverlay) new MutationObserver(updateGlobalBackVisibility).observe(editorOverlay, obsOpts);

    // Wire zoom visibility to all relevant state changes
    const zoomObs = new MutationObserver(updateZoomVisibility);
    if (mainMenu) zoomObs.observe(mainMenu, obsOpts);
    if (editorOverlay) zoomObs.observe(editorOverlay, obsOpts);
    if (playerDashboard) zoomObs.observe(playerDashboard, obsOpts);
    zoomDialogs.forEach(el => { if (el) zoomObs.observe(el, obsOpts); });
    updateZoomVisibility();

    // --- Pause menu wiring ---

    function syncPauseAudioBtns() {
        // Sync toggle icons from the main (settings) toggle buttons
        const mainMusicBtn = document.getElementById('music-toggle');
        const mainSfxBtn = document.getElementById('sfx-toggle');
        const pauseMusicBtn = document.getElementById('pause-music-toggle');
        const pauseSfxBtn = document.getElementById('pause-sfx-toggle');
        if (pauseMusicBtn && mainMusicBtn) {
            pauseMusicBtn.innerHTML = mainMusicBtn.innerHTML;
            pauseMusicBtn.classList.toggle('active', mainMusicBtn.classList.contains('active'));
        }
        if (pauseSfxBtn && mainSfxBtn) {
            pauseSfxBtn.innerHTML = mainSfxBtn.innerHTML;
            pauseSfxBtn.classList.toggle('active', mainSfxBtn.classList.contains('active'));
        }
        // Sync slider values from settings sliders
        const pauseMusicVol = document.getElementById('pause-music-volume');
        const pauseSfxVol = document.getElementById('pause-sfx-volume');
        const mainMusicVol = document.getElementById('music-volume');
        const mainSfxVol = document.getElementById('sfx-volume');
        if (pauseMusicVol && mainMusicVol) pauseMusicVol.value = mainMusicVol.value;
        if (pauseSfxVol && mainSfxVol) pauseSfxVol.value = mainSfxVol.value;
    }

    // Toggles delegate to the main buttons so AudioController handles everything
    document.getElementById('pause-music-toggle')?.addEventListener('click', () => {
        document.getElementById('music-toggle')?.click();
        syncPauseAudioBtns();
    });

    document.getElementById('pause-sfx-toggle')?.addEventListener('click', () => {
        document.getElementById('sfx-toggle')?.click();
        syncPauseAudioBtns();
    });

    document.getElementById('toolbar-music-toggle')?.addEventListener('click', () => {
        const isMobile = window.innerWidth <= 768 || window.innerHeight <= 600;
        const tbVol = document.getElementById('toolbar-music-volume');
        if (isMobile && tbVol) {
            const isVisible = tbVol.classList.contains('visible');
            document.querySelectorAll('#music-controls input[type="range"]').forEach(el => el.classList.remove('visible'));
            if (!isVisible) tbVol.classList.add('visible');
        }
        document.getElementById('music-toggle')?.click();
        syncToolbarAudioBtns();
    });

    document.getElementById('toolbar-sfx-toggle')?.addEventListener('click', () => {
        const isMobile = window.innerWidth <= 768 || window.innerHeight <= 600;
        const tbVol = document.getElementById('toolbar-sfx-volume');
        if (isMobile && tbVol) {
            const isVisible = tbVol.classList.contains('visible');
            document.querySelectorAll('#music-controls input[type="range"]').forEach(el => el.classList.remove('visible'));
            if (!isVisible) tbVol.classList.add('visible');
        }
        document.getElementById('sfx-toggle')?.click();
        syncToolbarAudioBtns();
    });

    document.getElementById('toolbar-music-volume')?.addEventListener('input', (e) => {
        const main = document.getElementById('music-volume');
        if (main) { main.value = e.target.value; main.dispatchEvent(new Event('input')); }
    });

    document.getElementById('toolbar-sfx-volume')?.addEventListener('input', (e) => {
        const main = document.getElementById('sfx-volume');
        if (main) { main.value = e.target.value; main.dispatchEvent(new Event('input')); }
    });

    // Sliders mirror to the settings sliders and dispatch input so AudioController picks them up
    document.getElementById('pause-music-volume')?.addEventListener('input', (e) => {
        const main = document.getElementById('music-volume');
        if (main) { main.value = e.target.value; main.dispatchEvent(new Event('input')); }
    });

    document.getElementById('pause-sfx-volume')?.addEventListener('input', (e) => {
        const main = document.getElementById('sfx-volume');
        if (main) { main.value = e.target.value; main.dispatchEvent(new Event('input')); }
    });

    document.getElementById('pause-resume-btn')?.addEventListener('click', () => {
        pauseModal.classList.add('hidden');
    });

    document.getElementById('pause-retry-btn')?.addEventListener('click', () => {
        pauseModal.classList.add('hidden');
        const retryBtn = document.getElementById('retry-game-btn');
        retryBtn?.click();
    });

    document.getElementById('pause-mainmenu-btn')?.addEventListener('click', async () => {
        pauseModal.classList.add('hidden');
        if (localStorage.getItem('dicy_campaignMode')) {
            await sessionManagerRef.quitToCampaignScreen();
        } else {
            sessionManagerRef.quitToCustomGame();
        }
    });

    clearStorageBtn?.addEventListener('click', async () => {
        const keepCampaigns = keepCampaignsCheck?.checked && keepCampaignsRow && !keepCampaignsRow.classList.contains('hidden');
        const msg = keepCampaigns
            ? 'Clear all stored data except your campaigns?'
            : 'Clear all stored data? This cannot be undone.';
        const ok = await Dialog.confirm(msg, 'CLEAR STORAGE?');
        if (ok) {
            clearAllStorage();
            await resetAllAchievementsAndStats();
            Dialog.alert('Storage cleared. The page will reload.');
            window.location.reload();
        }
    });
}

// scenarioBrowserOpen / sessionManagerRef set by caller via module-level vars
let scenarioBrowserOpen = () => {};
let sessionManagerRef = null;

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
