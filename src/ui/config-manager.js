/**
 * ConfigManager - Handles settings persistence and UI synchronization
 * Manages localStorage settings, map size presets, and config sliders
 */
import { GAME } from '../core/constants.js';

/** Defaults for setup "Mods" panel — reset restores these. */
export const SETUP_MOD_DEFAULTS = {
    mapStyle: 'full',
    gameMode: 'classic',
    maxDice: '8',
    diceSides: '6',
    attacksPerTurn: '0',
    secondsPerTurn: '0',
    secondsPerAttack: '0',
    fullBoardRule: 'nothing',
    tournamentGames: '100',
    playMode: 'classic',
};

/** One-time split of legacy `dicy_turnTimeLimit` into attacks vs clock. */
function migrateTurnLimitStorage() {
    const legacy = localStorage.getItem('dicy_turnTimeLimit');
    if (legacy != null && legacy !== '') {
        if (localStorage.getItem('dicy_attacksPerTurn') == null) {
            if (legacy === '0' || legacy === '1' || legacy === '3' || legacy === '5') {
                localStorage.setItem('dicy_attacksPerTurn', legacy);
            } else {
                localStorage.setItem('dicy_attacksPerTurn', '0');
            }
        }
        if (localStorage.getItem('dicy_secondsPerTurn') == null) {
            if (legacy === '10' || legacy === '15' || legacy === '30' || legacy === '60') {
                localStorage.setItem('dicy_secondsPerTurn', legacy);
            } else {
                localStorage.setItem('dicy_secondsPerTurn', '0');
            }
        }
        localStorage.removeItem('dicy_turnTimeLimit');
    }
    if (localStorage.getItem('dicy_secondsPerTurn') == null) {
        localStorage.setItem('dicy_secondsPerTurn', '0');
    }
    if (localStorage.getItem('dicy_secondsPerAttack') == null) {
        localStorage.setItem('dicy_secondsPerAttack', '0');
    }
}

/** Setup Attack time select: ∞, 5, 10, 15, 30 — maps legacy `60` → `30`. */
const ATTACK_SECONDS_UI_ALLOWED = ['0', '5', '10', '15', '30'];

function normalizeAttackSecondsUi(raw) {
    const s = String(raw ?? '0').trim();
    if (ATTACK_SECONDS_UI_ALLOWED.includes(s)) return s;
    const n = Number.parseInt(s, 10);
    if (n === 60) return '30';
    if (n === 5 || n === 10 || n === 15 || n === 30) return String(n);
    return '0';
}

export class ConfigManager {
    constructor() {
        // Map size presets: slider value -> {width, height, label}
        // Square maps only, 3x3 to 12x12
        this.mapSizePresets = [
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

        // Cache DOM elements
        this.elements = {
            mapSizeInput: document.getElementById('map-size'),
            mapSizeVal: document.getElementById('map-size-val'),
            mapStyleGroup: document.getElementById('map-style-group'),
            humanCountInput: document.getElementById('human-count'),
            botCountInput: document.getElementById('bot-count'),
            maxDiceInput: document.getElementById('max-dice'),
            maxDiceVal: document.getElementById('max-dice-val'),
            diceSidesInput: document.getElementById('dice-sides'),
            diceSidesVal: document.getElementById('dice-sides-val'),
            gameSpeedInput: document.getElementById('game-speed'),
            effectsQualityInput: document.getElementById('effects-quality'),
            mapStyleInput: document.getElementById('map-style'),
            gameModeInput: document.getElementById('game-mode'),
            playModeInput: null, // Managed dynamically in gamepad side panel
            botAISelect: document.getElementById('bot-ai-select'),
            tournamentGamesInput: document.getElementById('tournament-games'),
            tournamentConfig: document.getElementById('tournament-config'),
            turnTimeLimitInput: document.getElementById('turn-time-limit'),
            turnSecondsLimitInput: document.getElementById('turn-seconds-limit'),
            attackSecondsLimitInput: document.getElementById('attack-seconds-limit'),
            fullBoardRuleInput: document.getElementById('full-board-rule'),
        };

        // Current selected bot AI
        this.selectedBotAI = localStorage.getItem('dicy_botAI') || 'easy';
    }

    /**
     * Load all saved settings from localStorage and apply to UI
     */
    loadSavedSettings() {
        const el = this.elements;

        // Set slider limits from GAME constants
        if (el.maxDiceInput) {
            el.maxDiceInput.max = GAME.MAX_DICE_PER_TERRITORY;
        }
        if (el.diceSidesInput) {
            el.diceSidesInput.max = GAME.MAX_DICE_SIDES;
        }

        // Load saved map size (convert old index format if needed)
        const savedMapSizeRaw = localStorage.getItem('dicy_mapSize');
        let savedMapSizeString;
        if (!savedMapSizeRaw) {
            savedMapSizeString = '4x4'; // New default
        } else if (savedMapSizeRaw.includes('x')) {
            savedMapSizeString = savedMapSizeRaw;
        } else {
            // Old format (index), convert to widthxheight
            const index = parseInt(savedMapSizeRaw) - 1;
            const preset = this.mapSizePresets[Math.max(0, Math.min(index, this.mapSizePresets.length - 1))];
            savedMapSizeString = `${preset.width}x${preset.height}`;
        }

        // Convert widthxheight string to slider value
        const [width, height] = savedMapSizeString.split('x').map(Number);
        const presetIndex = this.mapSizePresets.findIndex(p => p.width === width && p.height === height);
        const sliderValue = presetIndex !== -1 ? presetIndex + 1 : 2; // Default to 4x4

        // Load other settings with defaults
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

        const savedMapStyle = localStorage.getItem('dicy_mapStyle') || 'full';
        const savedGameMode = localStorage.getItem('dicy_gameMode') || 'classic';
        const savedPlayMode = localStorage.getItem('dicy_playMode') || 'classic';
        const savedTournamentGames = localStorage.getItem('dicy_tournamentGames') || '100';
        migrateTurnLimitStorage();
        const savedAttacksPerTurn = localStorage.getItem('dicy_attacksPerTurn') || '0';
        const savedSecondsPerTurn = localStorage.getItem('dicy_secondsPerTurn') || '0';
        let savedSecondsPerAttack = localStorage.getItem('dicy_secondsPerAttack') || '0';
        const normSecondsPerAttack = normalizeAttackSecondsUi(savedSecondsPerAttack);
        if (normSecondsPerAttack !== savedSecondsPerAttack) {
            savedSecondsPerAttack = normSecondsPerAttack;
            localStorage.setItem('dicy_secondsPerAttack', normSecondsPerAttack);
        }

        const savedFullBoardRule = localStorage.getItem('dicy_fullBoardRule') || 'nothing';

        // Load effects quality
        let savedEffectsQuality = localStorage.getItem('effectsQuality') || 'high';
        if (savedEffectsQuality === 'low') savedEffectsQuality = 'medium';

        // Apply to UI
        el.mapSizeInput.value = sliderValue;
        el.humanCountInput.value = savedHumanCount;
        el.botCountInput.value = savedBotCount;
        el.maxDiceInput.value = savedMaxDice;
        el.maxDiceVal.textContent = savedMaxDice;
        el.diceSidesInput.value = savedDiceSides;
        el.diceSidesVal.textContent = savedDiceSides;
        el.gameSpeedInput.value = savedGameSpeed;
        el.mapStyleInput.value = savedMapStyle;
        el.gameModeInput.value = savedGameMode;
        if (el.playModeInput) el.playModeInput.value = savedPlayMode;
        el.tournamentGamesInput.value = savedTournamentGames;
        el.effectsQualityInput.value = savedEffectsQuality;
        if (el.turnTimeLimitInput) el.turnTimeLimitInput.value = savedAttacksPerTurn;
        if (el.turnSecondsLimitInput) el.turnSecondsLimitInput.value = savedSecondsPerTurn;
        if (el.attackSecondsLimitInput) el.attackSecondsLimitInput.value = normSecondsPerAttack;
        if (el.fullBoardRuleInput) el.fullBoardRuleInput.value = savedFullBoardRule;
        this.updateEffectsQualityClass(savedEffectsQuality);

        // Load saved AI selection
        if (this.selectedBotAI && Array.from(el.botAISelect.options).some(o => o.value === this.selectedBotAI)) {
            el.botAISelect.value = this.selectedBotAI;
        }

        // Initialize tournament config visibility
        if (el.tournamentConfig) {
            el.tournamentConfig.classList.toggle('hidden', parseInt(savedHumanCount, 10) !== 0);
        }

        // Initial map size display
        this.updateMapSizeDisplay();
        this.syncSetupModsExpanderFromStorage();
    }

    /**
     * True when every Mods control matches SETUP_MOD_DEFAULTS (play mode included).
     */
    areModsAtDefaults() {
        const el = this.elements;
        const d = SETUP_MOD_DEFAULTS;
        const ap = el.turnTimeLimitInput?.value ?? '0';
        const sec = el.turnSecondsLimitInput?.value ?? '0';
        const secAtk = el.attackSecondsLimitInput?.value ?? '0';
        const pm = localStorage.getItem('dicy_playMode') ?? d.playMode;
        return (
            el.mapStyleInput?.value === d.mapStyle &&
            el.gameModeInput?.value === d.gameMode &&
            String(el.maxDiceInput?.value) === d.maxDice &&
            String(el.diceSidesInput?.value) === d.diceSides &&
            String(ap) === d.attacksPerTurn &&
            String(sec) === d.secondsPerTurn &&
            String(secAtk) === d.secondsPerAttack &&
            (el.fullBoardRuleInput?.value || 'nothing') === d.fullBoardRule &&
            String(el.tournamentGamesInput?.value) === d.tournamentGames &&
            pm === d.playMode
        );
    }

    _setSetupModsPanelOpen(open) {
        const panel = document.getElementById('setup-mods-panel');
        const toggle = document.getElementById('setup-mods-toggle');
        if (!panel || !toggle) return;
        panel.classList.toggle('hidden', !open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.classList.toggle('setup-mods-toggle--open', open);
    }

    _applySetupModsToolbar(nonDefault) {
        const resetBtn = document.getElementById('setup-mods-reset');
        const toggle = document.getElementById('setup-mods-toggle');
        if (resetBtn) resetBtn.classList.toggle('hidden', !nonDefault);
        if (toggle) toggle.classList.toggle('hidden', nonDefault);
    }

    /** Highlight each Mods control that differs from SETUP_MOD_DEFAULTS. */
    syncSetupModsFieldHighlights() {
        const el = this.elements;
        const d = SETUP_MOD_DEFAULTS;
        const pmEl = document.getElementById('play-mode');
        const playMode = pmEl?.value ?? localStorage.getItem('dicy_playMode') ?? d.playMode;

        /** @type {Array<[string, () => boolean]>} */
        const rows = [
            ['map-style-group', () => el.mapStyleInput?.value !== d.mapStyle],
            ['setup-game-mode-group', () => el.gameModeInput?.value !== d.gameMode],
            ['setup-tournament-games-group', () => String(el.tournamentGamesInput?.value) !== d.tournamentGames],
            ['setup-max-dice-group', () => String(el.maxDiceInput?.value) !== d.maxDice],
            ['setup-dice-sides-group', () => String(el.diceSidesInput?.value) !== d.diceSides],
            ['setup-attacks-limit-group', () => String(el.turnTimeLimitInput?.value ?? '0') !== d.attacksPerTurn],
            ['setup-turn-seconds-group', () => String(el.turnSecondsLimitInput?.value ?? '0') !== d.secondsPerTurn],
            ['setup-attack-seconds-group', () => String(el.attackSecondsLimitInput?.value ?? '0') !== d.secondsPerAttack],
            ['setup-full-board-rule-group', () => (el.fullBoardRuleInput?.value || 'nothing') !== d.fullBoardRule],
            ['setup-play-mode-group', () => playMode !== d.playMode],
        ];
        for (const [id, differs] of rows) {
            const node = document.getElementById(id);
            if (node) node.classList.toggle('setup-mod-nondefault', differs());
        }
    }

    /** Show/hide Mods fields (button toggle). */
    toggleSetupModsPanel() {
        const panel = document.getElementById('setup-mods-panel');
        if (!panel) return;
        const isOpen = !panel.classList.contains('hidden');
        this._setSetupModsPanelOpen(!isOpen);
    }

    /** Open Mods + badge when any mod differs; collapsed when all default (initial load). */
    syncSetupModsExpanderFromStorage() {
        const badge = document.getElementById('setup-mods-active-badge');
        const nonDefault = !this.areModsAtDefaults();
        if (badge) badge.classList.toggle('hidden', !nonDefault);
        this._applySetupModsToolbar(nonDefault);
        this.syncSetupModsFieldHighlights();
        this._setSetupModsPanelOpen(nonDefault);
    }

    /** After user tweaks a mod: keep badge accurate and expand if they left defaults. */
    syncSetupModsExpanderLive() {
        const badge = document.getElementById('setup-mods-active-badge');
        const nonDefault = !this.areModsAtDefaults();
        if (badge) badge.classList.toggle('hidden', !nonDefault);
        this._applySetupModsToolbar(nonDefault);
        this.syncSetupModsFieldHighlights();
        if (nonDefault) this._setSetupModsPanelOpen(true);
    }

    /** Reset all Mods (not map size, humans, bots, bot AI, or game speed). */
    resetModsToDefaults() {
        const el = this.elements;
        const d = SETUP_MOD_DEFAULTS;

        el.mapStyleInput.value = d.mapStyle;
        localStorage.setItem('dicy_mapStyle', d.mapStyle);

        el.gameModeInput.value = d.gameMode;
        localStorage.setItem('dicy_gameMode', d.gameMode);

        el.maxDiceInput.value = d.maxDice;
        el.maxDiceVal.textContent = d.maxDice;
        localStorage.setItem('dicy_maxDice', d.maxDice);

        el.diceSidesInput.value = d.diceSides;
        el.diceSidesVal.textContent = d.diceSides;
        localStorage.setItem('dicy_diceSides', d.diceSides);

        if (el.turnTimeLimitInput) {
            el.turnTimeLimitInput.value = d.attacksPerTurn;
            localStorage.setItem('dicy_attacksPerTurn', d.attacksPerTurn);
        }
        if (el.turnSecondsLimitInput) {
            el.turnSecondsLimitInput.value = d.secondsPerTurn;
            localStorage.setItem('dicy_secondsPerTurn', d.secondsPerTurn);
        }
        if (el.attackSecondsLimitInput) {
            el.attackSecondsLimitInput.value = d.secondsPerAttack;
            localStorage.setItem('dicy_secondsPerAttack', d.secondsPerAttack);
        }
        if (el.fullBoardRuleInput) {
            el.fullBoardRuleInput.value = d.fullBoardRule;
            localStorage.setItem('dicy_fullBoardRule', d.fullBoardRule);
        }

        el.tournamentGamesInput.value = d.tournamentGames;
        localStorage.setItem('dicy_tournamentGames', d.tournamentGames);

        localStorage.setItem('dicy_playMode', d.playMode);
        const playModeEl = document.getElementById('play-mode');
        if (playModeEl) playModeEl.value = d.playMode;

        this.syncSetupModsExpanderFromStorage();
    }

    /**
     * Set up all input change listeners for saving settings
     */
    setupInputListeners(effectsManager, renderer, onConfigChange = null) {
        const el = this.elements;

        const handleChange = () => {
            if (onConfigChange) onConfigChange();
        };

        el.mapSizeInput.addEventListener('input', () => {
            this.updateMapSizeDisplay();
            const sizePreset = this.getMapSize(parseInt(el.mapSizeInput.value));
            localStorage.setItem('dicy_mapSize', `${sizePreset.width}x${sizePreset.height}`);
            handleChange();
        });

        el.maxDiceInput.addEventListener('input', () => {
            el.maxDiceVal.textContent = el.maxDiceInput.value;
            localStorage.setItem('dicy_maxDice', el.maxDiceInput.value);
            handleChange();
            this.syncSetupModsExpanderLive();
        });

        el.diceSidesInput.addEventListener('input', () => {
            el.diceSidesVal.textContent = el.diceSidesInput.value;
            localStorage.setItem('dicy_diceSides', el.diceSidesInput.value);
            handleChange();
            this.syncSetupModsExpanderLive();
        });

        el.humanCountInput.addEventListener('change', () => {
            localStorage.setItem('dicy_humanCount', el.humanCountInput.value);
            const humans = parseInt(el.humanCountInput.value, 10);
            if (el.tournamentConfig) {
                el.tournamentConfig.classList.toggle('hidden', humans !== 0);
            }
            handleChange();
            this.syncSetupModsFieldHighlights();
        });

        el.botCountInput.addEventListener('change', () => {
            localStorage.setItem('dicy_botCount', el.botCountInput.value);
            handleChange();
        });

        el.gameSpeedInput.addEventListener('change', () => {
            localStorage.setItem('dicy_gameSpeed', el.gameSpeedInput.value);
            // Speed change doesn't necessarily clear scenario
        });

        el.mapStyleInput.addEventListener('change', () => {
            localStorage.setItem('dicy_mapStyle', el.mapStyleInput.value);
            handleChange();
            this.syncSetupModsExpanderLive();
        });

        el.gameModeInput.addEventListener('change', () => {
            localStorage.setItem('dicy_gameMode', el.gameModeInput.value);
            handleChange();
            this.syncSetupModsExpanderLive();
        });
        // playMode is managed dynamically in the gamepad side panel

        el.tournamentGamesInput.addEventListener('input', () => {
            localStorage.setItem('dicy_tournamentGames', el.tournamentGamesInput.value);
            this.syncSetupModsExpanderLive();
        });

        el.botAISelect.addEventListener('change', () => {
            this.selectedBotAI = el.botAISelect.value;
            localStorage.setItem('dicy_botAI', this.selectedBotAI);
        });

        if (el.turnTimeLimitInput) {
            el.turnTimeLimitInput.addEventListener('change', () => {
                localStorage.setItem('dicy_attacksPerTurn', el.turnTimeLimitInput.value);
                this.syncSetupModsExpanderLive();
            });
        }

        if (el.turnSecondsLimitInput) {
            el.turnSecondsLimitInput.addEventListener('change', () => {
                localStorage.setItem('dicy_secondsPerTurn', el.turnSecondsLimitInput.value);
                this.syncSetupModsExpanderLive();
            });
        }

        if (el.attackSecondsLimitInput) {
            el.attackSecondsLimitInput.addEventListener('change', () => {
                localStorage.setItem('dicy_secondsPerAttack', el.attackSecondsLimitInput.value);
                this.syncSetupModsExpanderLive();
            });
        }

        if (el.fullBoardRuleInput) {
            el.fullBoardRuleInput.addEventListener('change', () => {
                localStorage.setItem('dicy_fullBoardRule', el.fullBoardRuleInput.value);
                this.syncSetupModsExpanderLive();
            });
        }

        // Effects quality - apply immediately
        el.effectsQualityInput.addEventListener('change', () => {
            const newQuality = el.effectsQualityInput.value;
            localStorage.setItem('effectsQuality', newQuality);
            if (effectsManager) effectsManager.setQuality(newQuality);
            if (renderer) renderer.setEffectsQuality(newQuality);
            this.updateEffectsQualityClass(newQuality);
        });
    }

    /**
     * Called when connected gamepads change (for any future UI updates).
     */
    updateGamepadStatus(_indices) {
        // No-op: human count is set manually by the player.
    }
    /**
     * Get map size preset from slider value
     */
    getMapSize(sliderValue) {
        const index = Math.max(0, Math.min(sliderValue - 1, this.mapSizePresets.length - 1));
        return this.mapSizePresets[index];
    }

    /**
     * Update map size display text
     */
    updateMapSizeDisplay() {
        const size = this.getMapSize(parseInt(this.elements.mapSizeInput.value));
        this.elements.mapSizeVal.textContent = size.label;
    }

    /**
     * Update UI config from a loaded level (config, scenario, or map type)
     */
    updateConfigFromLevel(level) {
        if (!level) return;
        if (level.type === 'config') {
            const [w, h] = (level.mapSize || '6x6').split('x').map(Number);
            const presetIndex = this.mapSizePresets.findIndex(p => p.width === w && p.height === h);
            if (presetIndex !== -1) {
                this.elements.mapSizeInput.value = presetIndex + 1;
                this.elements.mapSizeVal.textContent = this.mapSizePresets[presetIndex].label;
            }
            this.elements.mapStyleInput.value = level.mapStyle || 'full';
            this.elements.gameModeInput.value = level.gameMode || 'classic';
            this.elements.humanCountInput.value = '1';
            this.elements.botCountInput.value = String(level.bots ?? 1);
            this.elements.maxDiceInput.value = level.maxDice ?? 8;
            this.elements.maxDiceVal.textContent = level.maxDice ?? 8;
            this.elements.diceSidesInput.value = level.diceSides ?? 6;
            this.elements.diceSidesVal.textContent = level.diceSides ?? 6;
            this.elements.botAISelect.value = level.botAI || 'easy';
            this.selectedBotAI = level.botAI || 'easy';

            let ap = level.attacksPerTurn;
            let sec = level.secondsPerTurn;
            const raw = level.turnTimeLimit;
            if (raw != null && raw !== '') {
                const v = Number(raw);
                if ([10, 15, 30, 60].includes(v)) {
                    if (sec == null || sec === '') sec = v;
                } else if ([0, 1, 3, 5].includes(v)) {
                    if (ap == null || ap === '') ap = v;
                }
            }
            const elc = this.elements;
            if (elc.turnTimeLimitInput != null && ap != null) elc.turnTimeLimitInput.value = String(ap);
            if (elc.turnSecondsLimitInput != null && sec != null) elc.turnSecondsLimitInput.value = String(sec);
            if (elc.attackSecondsLimitInput != null && level.secondsPerAttack != null) {
                elc.attackSecondsLimitInput.value = normalizeAttackSecondsUi(level.secondsPerAttack);
            }
        } else {
            this.updateConfigFromScenario(level);
            return;
        }
        this.syncSetupModsExpanderLive();
    }

    /**
     * Update UI config sliders from a loaded scenario
     */
    updateConfigFromScenario(scenario) {
        const el = this.elements;

        // Find the map size preset index that matches (or closest)
        const targetSize = scenario.width;
        const presetIndex = this.mapSizePresets.findIndex(p => p.width === targetSize);
        if (presetIndex !== -1) {
            el.mapSizeInput.value = presetIndex + 1;
            el.mapSizeVal.textContent = this.mapSizePresets[presetIndex].label;
        } else {
            el.mapSizeVal.textContent = `${scenario.width}x${scenario.height}`;
        }

        // Update dice settings
        if (scenario.maxDice && el.maxDiceInput) {
            el.maxDiceInput.value = scenario.maxDice;
            el.maxDiceVal.textContent = scenario.maxDice;
        }
        if (scenario.diceSides && el.diceSidesInput) {
            el.diceSidesInput.value = scenario.diceSides;
            el.diceSidesVal.textContent = scenario.diceSides;
        }

        if (scenario.gameMode && el.gameModeInput) {
            el.gameModeInput.value = scenario.gameMode;
        }

        // Update player counts ONLY for Scenarios/Replays, NOT for Maps
        if (scenario.type !== 'map' && scenario.players && Array.isArray(scenario.players)) {
            let humans = 0;
            let bots = 0;
            const botAIs = new Set();

            scenario.players.forEach(p => {
                if (p.isBot) {
                    bots++;
                    const aiId = p.aiId || 'easy';
                    botAIs.add(aiId);
                } else {
                    humans++;
                }
            });

            if (el.humanCountInput) el.humanCountInput.value = humans;
            if (el.botCountInput) el.botCountInput.value = bots;

            // Update AI Selection - use the first bot's AI or keep current selection
            if (botAIs.size >= 1) {
                const ai = [...botAIs][0];
                if (el.botAISelect && ['easy', 'medium', 'hard', 'custom'].includes(ai)) {
                    el.botAISelect.value = ai;
                    this.selectedBotAI = ai;
                }
            }
        }

        if (scenario.turnTimeLimit != null && scenario.turnTimeLimit !== '') {
            const v = String(scenario.turnTimeLimit);
            if (el.turnSecondsLimitInput && ['0', '10', '15', '30', '60'].includes(v)) {
                el.turnSecondsLimitInput.value = v;
            }
        }
        if (scenario.secondsPerTurn != null && scenario.secondsPerTurn !== '' && el.turnSecondsLimitInput) {
            el.turnSecondsLimitInput.value = String(scenario.secondsPerTurn);
        }
        if (scenario.attacksPerTurn != null && scenario.attacksPerTurn !== '' && el.turnTimeLimitInput) {
            el.turnTimeLimitInput.value = String(scenario.attacksPerTurn);
        }
        if (scenario.secondsPerAttack != null && scenario.secondsPerAttack !== '' && el.attackSecondsLimitInput) {
            el.attackSecondsLimitInput.value = normalizeAttackSecondsUi(scenario.secondsPerAttack);
        }

        this.syncSetupModsExpanderLive();
    }

    /**
     * Get current game configuration from UI
     */
    getGameConfig() {
        const el = this.elements;
        const sizePreset = this.getMapSize(parseInt(el.mapSizeInput.value));
        const ap = parseInt(el.turnTimeLimitInput?.value ?? '0', 10);
        const sec = parseInt(el.turnSecondsLimitInput?.value ?? '0', 10);
        const secAtk = parseInt(el.attackSecondsLimitInput?.value ?? '0', 10);

        return {
            humanCount: parseInt(el.humanCountInput.value),
            botCount: parseInt(el.botCountInput.value),
            mapWidth: sizePreset.width,
            mapHeight: sizePreset.height,
            maxDice: parseInt(el.maxDiceInput.value),
            diceSides: parseInt(el.diceSidesInput.value),
            mapStyle: el.mapStyleInput.value,
            gameMode: el.gameModeInput.value,
            playMode: localStorage.getItem('dicy_playMode') ?? 'classic',
            gameSpeed: el.gameSpeedInput.value,
            effectsQuality: el.effectsQualityInput.value,
            botAI: this.selectedBotAI,
            attacksPerTurn: Number.isFinite(ap) ? Math.max(0, ap) : 0,
            secondsPerTurn: Number.isFinite(sec) ? Math.max(0, sec) : 0,
            secondsPerAttack: Number.isFinite(secAtk) ? Math.max(0, secAtk) : 0,
            fullBoardRule: el.fullBoardRuleInput?.value || 'nothing',
        };
    }

    /**
     * Save current settings to localStorage
     */
    saveCurrentSettings() {
        const el = this.elements;
        const config = this.getGameConfig();
        localStorage.setItem('dicy_mapSize', `${config.mapWidth}x${config.mapHeight}`);
        localStorage.setItem('dicy_humanCount', config.humanCount.toString());
        localStorage.setItem('dicy_botCount', config.botCount.toString());
        localStorage.setItem('dicy_maxDice', config.maxDice.toString());
        localStorage.setItem('dicy_diceSides', config.diceSides.toString());
        localStorage.setItem('dicy_gameSpeed', config.gameSpeed);
        localStorage.setItem('dicy_mapStyle', config.mapStyle);
        localStorage.setItem('dicy_gameMode', config.gameMode);
        localStorage.setItem('dicy_playMode', config.playMode);
        localStorage.setItem('effectsQuality', config.effectsQuality);
        localStorage.setItem('dicy_attacksPerTurn', el.turnTimeLimitInput?.value ?? '0');
        localStorage.setItem('dicy_secondsPerTurn', el.turnSecondsLimitInput?.value ?? '0');
        localStorage.setItem('dicy_secondsPerAttack', el.attackSecondsLimitInput?.value ?? '0');
        localStorage.setItem('dicy_fullBoardRule', config.fullBoardRule || 'nothing');
    }


    /**
     * Update body class based on effects quality
     */
    updateEffectsQualityClass(quality) {
        document.body.classList.remove('fx-high', 'fx-medium', 'fx-off');
        document.body.classList.add(`fx-${quality}`);
    }
}
