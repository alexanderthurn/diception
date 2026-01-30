// Sound Manager - Procedural sound generation using Web Audio API
export class SoundManager {
    constructor() {
        this.audioContext = null;
        this.enabled = true;
        this.volume = 0.5;
        this.winStreak = 0;
        // Track pending timeouts for cleanup
        this.pendingTimeouts = [];
    }

    init() {
        // Create AudioContext on first user interaction
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
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

    // Play a tone with given frequency, type, and duration
    playTone(frequency, type = 'square', duration = 0.15, attack = 0.01, release = 0.1) {
        if (!this.enabled || !this.audioContext) return;
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.type = type;
        oscillator.frequency.value = frequency;
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        const now = this.audioContext.currentTime;
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(this.volume * 0.2, now + attack);
        gainNode.gain.linearRampToValueAtTime(0, now + duration);

        oscillator.start(now);
        oscillator.stop(now + duration + 0.05);
    }

    // Play a sequence of tones
    playSequence(notes, baseDelay = 0.1) {
        notes.forEach((note, i) => {
            const timeoutId = setTimeout(() => {
                // Remove from pending list
                const idx = this.pendingTimeouts.indexOf(timeoutId);
                if (idx > -1) this.pendingTimeouts.splice(idx, 1);
                
                this.playTone(note.freq, note.type || 'square', note.duration || 0.12);
            }, i * baseDelay * 1000);
            
            // Track for cleanup
            this.pendingTimeouts.push(timeoutId);
        });
    }

    /**
     * Cancel all pending sound sequences
     */
    cancelAllPending() {
        for (const timeoutId of this.pendingTimeouts) {
            clearTimeout(timeoutId);
        }
        this.pendingTimeouts = [];
    }

    /**
     * Clean up the sound manager.
     * Cancels pending sequences and closes the audio context.
     */
    dispose() {
        this.enabled = false;
        this.cancelAllPending();
        
        if (this.audioContext) {
            // Close the audio context if supported
            if (this.audioContext.close) {
                this.audioContext.close().catch(() => {
                    // Ignore errors on close
                });
            }
            this.audioContext = null;
        }
    }

    // === GAME SOUND EFFECTS ===

    // Player's turn notification
    turnStart() {
        this.playSequence([
            { freq: 440, duration: 0.1 },
            { freq: 550, duration: 0.15 }
        ], 0.08);
    }

    // Attack initiated
    attack() {
        this.playTone(220, 'sawtooth', 0.1);
    }

    // Won a battle
    attackWin() {
        this.winStreak++;
        const basePitch = 440;
        // Increase pitch with each consecutive win (up to +5 semitones)
        const pitchMultiplier = Math.pow(2, Math.min(this.winStreak - 1, 5) / 12);

        this.playSequence([
            { freq: basePitch * pitchMultiplier, type: 'square', duration: 0.1 },
            { freq: basePitch * pitchMultiplier * 1.25, type: 'square', duration: 0.1 },
            { freq: basePitch * pitchMultiplier * 1.5, type: 'square', duration: 0.15 }
        ], 0.07);
    }

    // Lost a battle
    attackLose() {
        this.winStreak = 0;
        this.playSequence([
            { freq: 300, type: 'sawtooth', duration: 0.15 },
            { freq: 200, type: 'sawtooth', duration: 0.2 }
        ], 0.12);
    }

    // Reinforcements received
    reinforce() {
        this.playSequence([
            { freq: 330, type: 'triangle', duration: 0.08 },
            { freq: 392, type: 'triangle', duration: 0.08 },
            { freq: 523, type: 'triangle', duration: 0.12 }
        ], 0.06);
    }

    // Player eliminated
    playerEliminated() {
        this.playSequence([
            { freq: 200, type: 'sawtooth', duration: 0.2 },
            { freq: 150, type: 'sawtooth', duration: 0.25 },
            { freq: 100, type: 'sawtooth', duration: 0.3 }
        ], 0.15);
    }

    // Game over - victory
    victory() {
        // Triumphant fanfare melody
        const notes = [
            { freq: 523.25, type: 'square', duration: 0.12 }, // C5
            { freq: 659.25, type: 'square', duration: 0.12 }, // E5
            { freq: 783.99, type: 'square', duration: 0.12 }, // G5
            { freq: 1046.5, type: 'square', duration: 0.15 }, // C6
            { freq: 783.99, type: 'square', duration: 0.12 }, // G5
            { freq: 1046.5, type: 'square', duration: 0.5 }, // C6
        ];

        this.playSequence(notes, 0.15);

        // Add some richness with overlapping triangle waves for the final note
        setTimeout(() => {
            if (!this.enabled || !this.audioContext) return;
            this.playTone(523.25, 'triangle', 0.5, 0.05, 0.2); // C5 sub-harmonic
            this.playTone(659.25, 'triangle', 0.5, 0.05, 0.2); // E5 chord body
        }, 0.15 * 5 * 1000);
    }

    // Game over - defeat
    defeat() {
        this.playSequence([
            { freq: 400, type: 'sawtooth', duration: 0.2 },
            { freq: 300, type: 'sawtooth', duration: 0.25 },
            { freq: 200, type: 'sawtooth', duration: 0.3 },
            { freq: 100, type: 'sawtooth', duration: 0.4 }
        ], 0.2);
    }
}
