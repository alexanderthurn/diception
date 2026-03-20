// Sound Manager - SFX playback using @pixi/sound
import { sound } from '@pixi/sound';

const SFX_PATH = './assets/sfx/';

const SFX_FILES = {
    turnStart: 'turn-start.ogg',
    attack: 'attack.ogg',
    attackWin: 'attack-win.ogg',
    attackLose: 'attack-lose.ogg',
    reinforce: 'reinforce.ogg',
    playerEliminated: 'player-eliminated.ogg',
    victory: 'victory.ogg',
    defeat: 'defeat.ogg',
    time: 'time.ogg',
    coin: 'coin.ogg',
    button: 'button.ogg',
};

export class SoundManager {
    constructor() {
        this.enabled = true;
        this.volume = 0.3;
        this.winStreak = 0;
        this.isPreloaded = false;
        this.isReady = false; // blocked until loading screen is dismissed
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

    /** Unblock SFX playback — call once the loading screen is dismissed. */
    markReady() {
        this.isReady = true;
    }

    /**
     * Play a loaded sound effect.
     */
    _play(alias, options = {}) {
        if (!this.isReady) return;
        if (!this.enabled) return;
        if (document.hidden) return;
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
    turnStart(speed = 1.0) {
        this._play('turnStart', { speed });
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
    reinforce(speed = 1.0) {
        this._play('reinforce', { speed });
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

    /** Single die placed during supply animation */
    coin() {
        this._play('coin', { speed: 0.90 + Math.random() * 0.20 });
    }

    /** Full-board random picker: one step tick — soft, pitch-varied coin */
    coinSweepStep() {
        this._play('coin', {
            speed: 0.84 + Math.random() * 0.34,
            volume: this.volume * 0.28,
        });
    }

    /** Generic UI button click */
    button() {
        this._play('button', { speed: 0.85 + Math.random() * 0.30, volume: this.volume * 0.5 });
    }

    /**
     * Timer tick sound — pitch rises as time runs out (aligned with red HUD: 4…1 s left).
     * secsLeft: 4 → normal pitch, 1 → highest pitch (3 semitones up)
     */
    timeTick(secsLeft) {
        const semitones = Math.max(0, 4 - secsLeft); // 0 at 4s max, 3 at 1s
        const speed = Math.pow(2, semitones / 12);
        this._play('time', { speed });
    }
}
