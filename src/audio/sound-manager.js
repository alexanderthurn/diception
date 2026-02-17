// Sound Manager - SFX playback using @pixi/sound
import { sound } from '@pixi/sound';

const SFX_PATH = './sfx/';

const SFX_FILES = {
    turnStart: 'turn-start.ogg',
    attack: 'attack.ogg',
    attackWin: 'attack-win.ogg',
    attackLose: 'attack-lose.ogg',
    reinforce: 'reinforce.ogg',
    playerEliminated: 'player-eliminated.ogg',
    victory: 'victory.ogg',
    defeat: 'defeat.ogg',
};

export class SoundManager {
    constructor() {
        this.enabled = true;
        this.volume = 0.5;
        this.winStreak = 0;
        this.isPreloaded = false;
    }

    init() {
        // @pixi/sound auto-creates the AudioContext; nothing needed here
    }

    /**
     * Pre-load all sound effects for instant playback.
     */
    async preloadAll() {
        for (const [alias, file] of Object.entries(SFX_FILES)) {
            sound.add(alias, {
                url: SFX_PATH + file,
                preload: true,
            });
        }
        this.isPreloaded = true;
        console.log(`Preloaded ${Object.keys(SFX_FILES).length} sound effects via @pixi/sound`);
    }

    /**
     * Play a loaded sound effect.
     */
    _play(alias, options = {}) {
        if (!this.enabled) return;
        if (!sound.exists(alias)) return;
        sound.play(alias, {
            volume: this.volume,
            ...options,
        });
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }

    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
    }

    resetWinStreak() {
        this.winStreak = 0;
    }

    /**
     * Clean up the sound manager.
     */
    dispose() {
        this.enabled = false;
        sound.removeAll();
    }

    // === GAME SOUND EFFECTS ===

    /** Player's turn notification */
    turnStart() {
        this._play('turnStart');
    }

    /** Attack initiated */
    attack() {
        this._play('attack');
    }

    /** Won a battle — pitch rises with consecutive wins */
    attackWin() {
        this.winStreak++;
        const semitones = Math.min(this.winStreak - 1, 5);
        const speed = Math.pow(2, semitones / 12);
        this._play('attackWin', { speed });
    }

    /** Lost a battle */
    attackLose() {
        this.winStreak = 0;
        this._play('attackLose');
    }

    /** Reinforcements received */
    reinforce() {
        this._play('reinforce');
    }

    /** Player eliminated */
    playerEliminated() {
        this._play('playerEliminated');
    }

    /** Game over — victory */
    victory() {
        this._play('victory');
    }

    /** Game over — defeat */
    defeat() {
        this._play('defeat');
    }
}
