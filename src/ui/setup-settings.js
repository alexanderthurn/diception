/**
 * SetupSettings - Handles loading and saving of game setup settings
 */

// Map size presets
export const MAP_SIZE_PRESETS = [
    { width: 3, height: 3, label: '3x3' },
    { width: 4, height: 4, label: '4x4' },
    { width: 5, height: 5, label: '5x5' },
    { width: 6, height: 6, label: '6x6' },
    { width: 7, height: 7, label: '7x7' },
    { width: 8, height: 8, label: '8x8' },
    { width: 9, height: 9, label: '9x9' },
    { width: 10, height: 10, label: '10x10' },
    { width: 11, height: 11, label: '11x11' },
    { width: 12, height: 12, label: '12x12' },
];

export class SetupSettings {
    constructor() {
        this.settings = this.loadAll();
    }

    loadAll() {
        // Convert old map size format if needed
        const savedMapSizeRaw = localStorage.getItem('dicy_mapSize');
        let savedMapSizeString;
        if (!savedMapSizeRaw) {
            savedMapSizeString = '4x4';
        } else if (savedMapSizeRaw.includes('x')) {
            savedMapSizeString = savedMapSizeRaw;
        } else {
            const index = parseInt(savedMapSizeRaw) - 1;
            const preset = MAP_SIZE_PRESETS[Math.max(0, Math.min(index, MAP_SIZE_PRESETS.length - 1))];
            savedMapSizeString = `${preset.width}x${preset.height}`;
        }

        const [width, height] = savedMapSizeString.split('x').map(Number);
        const presetIndex = MAP_SIZE_PRESETS.findIndex(p => p.width === width && p.height === height);
        const sliderValue = presetIndex !== -1 ? presetIndex + 1 : 2;

        // Map legacy fastMode to new speeds
        const legacyFastMode = localStorage.getItem('dicy_fastMode');
        let defaultSpeed = 'beginner';
        if (legacyFastMode === 'true') defaultSpeed = 'expert';
        else if (legacyFastMode === 'false') defaultSpeed = 'beginner';

        return {
            mapSize: sliderValue,
            humanCount: localStorage.getItem('dicy_humanCount') || '1',
            botCount: localStorage.getItem('dicy_botCount') || '3',
            maxDice: localStorage.getItem('dicy_maxDice') || '8',
            diceSides: localStorage.getItem('dicy_diceSides') || '6',
            gameSpeed: localStorage.getItem('dicy_gameSpeed') || defaultSpeed,
            mapStyle: localStorage.getItem('dicy_mapStyle') || 'full',
            gameMode: localStorage.getItem('dicy_gameMode') || 'classic',
            tournamentGames: localStorage.getItem('dicy_tournamentGames') || '100',
            effectsQuality: localStorage.getItem('effectsQuality') || 'high',
            botAI: localStorage.getItem('dicy_botAI') || 'easy',
            perPlayerAIConfig: JSON.parse(localStorage.getItem('dicy_perPlayerAIConfig') || '{}'),
        };
    }

    getMapSize(sliderValue) {
        const index = Math.max(0, Math.min(sliderValue - 1, MAP_SIZE_PRESETS.length - 1));
        return MAP_SIZE_PRESETS[index];
    }

    save(key, value) {
        localStorage.setItem(`dicy_${key}`, value.toString());
        this.settings[key] = value;
    }

    saveMapSize(sliderValue) {
        const sizePreset = this.getMapSize(sliderValue);
        localStorage.setItem('dicy_mapSize', `${sizePreset.width}x${sizePreset.height}`);
        this.settings.mapSize = sliderValue;
    }

    savePerPlayerAIConfig(config) {
        localStorage.setItem('dicy_perPlayerAIConfig', JSON.stringify(config));
        this.settings.perPlayerAIConfig = config;
    }

    get(key) {
        return this.settings[key];
    }
}
