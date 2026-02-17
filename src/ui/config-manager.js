/**
 * ConfigManager - Handles settings persistence and UI synchronization
 * Manages localStorage settings, map size presets, and config sliders
 */
import { GAME } from '../core/constants.js';

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
            mapSizeLabel: document.getElementById('map-size-label'),
            mapSizeRow: document.querySelector('.map-size-row'),
            mapStyleGroup: document.getElementById('map-style-group'),
            loadedScenarioName: document.getElementById('loaded-scenario-name'),
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
            botAISelect: document.getElementById('bot-ai-select'),
            tournamentGamesInput: document.getElementById('tournament-games'),
            tournamentConfig: document.getElementById('tournament-config'),
            scenariosBtn: document.getElementById('scenarios-btn'),
            deselectScenarioBtn: document.getElementById('deselect-scenario-btn')
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
        const savedTournamentGames = localStorage.getItem('dicy_tournamentGames') || '100';

        // Load effects quality
        let savedEffectsQuality = localStorage.getItem('effectsQuality') || 'medium';
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
        el.tournamentGamesInput.value = savedTournamentGames;
        el.effectsQualityInput.value = savedEffectsQuality;
        this.updateEffectsQualityClass(savedEffectsQuality);

        // Load saved AI selection
        if (this.selectedBotAI && Array.from(el.botAISelect.options).some(o => o.value === this.selectedBotAI)) {
            el.botAISelect.value = this.selectedBotAI;
        }

        // Initialize tournament config visibility
        if (parseInt(savedHumanCount) === 0) {
            el.tournamentConfig.style.display = 'block';
        }

        // Initial map size display
        this.updateMapSizeDisplay();
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
        });

        el.diceSidesInput.addEventListener('input', () => {
            el.diceSidesVal.textContent = el.diceSidesInput.value;
            localStorage.setItem('dicy_diceSides', el.diceSidesInput.value);
            handleChange();
        });

        el.humanCountInput.addEventListener('change', () => {
            localStorage.setItem('dicy_humanCount', el.humanCountInput.value);
            // Show tournament config when humans = 0
            const humans = parseInt(el.humanCountInput.value);
            el.tournamentConfig.style.display = humans === 0 ? 'block' : 'none';
            handleChange();
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
        });

        el.gameModeInput.addEventListener('change', () => {
            localStorage.setItem('dicy_gameMode', el.gameModeInput.value);
            handleChange();
        });

        el.tournamentGamesInput.addEventListener('input', () => {
            localStorage.setItem('dicy_tournamentGames', el.tournamentGamesInput.value);
        });

        el.botAISelect.addEventListener('change', () => {
            this.selectedBotAI = el.botAISelect.value;
            localStorage.setItem('dicy_botAI', this.selectedBotAI);
        });

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
     * Update UI to show connected gamepads and their assigned colors
     */
    updateGamepadStatus(indices) {
        const el = this.elements;


        // Auto-adjust human count if more gamepads are connected than currently selected
        // (but only if we aren't already in a game/scenario context which usually locks counts)
        const currentHumans = parseInt(el.humanCountInput.value);
        if (indices.length > currentHumans) {
            el.humanCountInput.value = indices.length;
            localStorage.setItem('dicy_humanCount', indices.length.toString());
        }
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
     * Update loaded scenario display (or reset to slider mode)
     */
    updateLoadedScenarioDisplay(scenarioName) {
        this.updateLoadedLevelDisplay(scenarioName ? { owner: scenarioName } : null, scenarioName ? 0 : null);
    }

    /**
     * Update loaded level display (campaign owner + level index)
     */
    updateLoadedLevelDisplay(campaignOwner, levelIndex) {
        const el = this.elements;
        if (campaignOwner != null) {
            const label = levelIndex != null ? `${campaignOwner} #${levelIndex}` : campaignOwner;
            el.loadedScenarioName.textContent = label;
            el.loadedScenarioName.style.display = 'block';
            el.loadedScenarioName.title = 'Click to open campaign browser';
            el.mapSizeInput.style.display = 'none';
            el.mapSizeVal.style.display = 'none';
            el.mapStyleGroup.style.display = 'none';
            el.mapSizeLabel.textContent = 'Map';

            if (el.scenariosBtn) el.scenariosBtn.classList.add('hidden');
            if (el.deselectScenarioBtn) el.deselectScenarioBtn.classList.remove('hidden');
        } else {
            el.loadedScenarioName.textContent = '';
            el.loadedScenarioName.style.display = 'none';
            el.mapSizeInput.style.display = 'block';
            el.mapSizeVal.style.display = 'inline';
            el.mapStyleGroup.style.display = 'block';
            el.mapSizeLabel.textContent = 'Map Size';

            if (el.scenariosBtn) el.scenariosBtn.classList.remove('hidden');
            if (el.deselectScenarioBtn) el.deselectScenarioBtn.classList.add('hidden');
        }
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
        } else {
            this.updateConfigFromScenario(level);
        }
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
    }

    /**
     * Get current game configuration from UI
     */
    getGameConfig() {
        const el = this.elements;
        const sizePreset = this.getMapSize(parseInt(el.mapSizeInput.value));

        return {
            humanCount: parseInt(el.humanCountInput.value),
            botCount: parseInt(el.botCountInput.value),
            mapWidth: sizePreset.width,
            mapHeight: sizePreset.height,
            maxDice: parseInt(el.maxDiceInput.value),
            diceSides: parseInt(el.diceSidesInput.value),
            mapStyle: el.mapStyleInput.value,
            gameMode: el.gameModeInput.value,
            gameSpeed: el.gameSpeedInput.value,
            effectsQuality: el.effectsQualityInput.value,
            botAI: this.selectedBotAI
        };
    }

    /**
     * Save current settings to localStorage
     */
    saveCurrentSettings() {
        const config = this.getGameConfig();
        localStorage.setItem('dicy_mapSize', `${config.mapWidth}x${config.mapHeight}`);
        localStorage.setItem('dicy_humanCount', config.humanCount.toString());
        localStorage.setItem('dicy_botCount', config.botCount.toString());
        localStorage.setItem('dicy_maxDice', config.maxDice.toString());
        localStorage.setItem('dicy_diceSides', config.diceSides.toString());
        localStorage.setItem('dicy_gameSpeed', config.gameSpeed);
        localStorage.setItem('dicy_mapStyle', config.mapStyle);
        localStorage.setItem('dicy_gameMode', config.gameMode);
        localStorage.setItem('effectsQuality', config.effectsQuality);
    }


    /**
     * Update body class based on effects quality
     */
    updateEffectsQualityClass(quality) {
        document.body.classList.remove('fx-high', 'fx-medium', 'fx-off');
        document.body.classList.add(`fx-${quality}`);
    }
}
