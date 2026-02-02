// Sound Manager - Procedural sound generation using Web Audio API
// With pre-rendered AudioBuffers for instant playback
export class SoundManager {
    constructor() {
        this.audioContext = null;
        this.enabled = true;
        this.volume = 0.5;
        this.winStreak = 0;
        // Track pending timeouts for cleanup
        this.pendingTimeouts = [];
        // Pre-rendered sound buffers
        this.preloadedBuffers = new Map();
        this.isPreloaded = false;
    }

    init() {
        // Create AudioContext on first user interaction
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    /**
     * Pre-render all sound effects to AudioBuffers for instant playback.
     * Call this during app initialization.
     */
    async preloadAll() {
        // Ensure audio context exists
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        const sampleRate = this.audioContext.sampleRate;

        // Define all sounds to pre-render
        const soundDefinitions = {
            turnStart: [
                { freq: 440, type: 'square', duration: 0.1, delay: 0 },
                { freq: 550, type: 'square', duration: 0.15, delay: 0.08 }
            ],
            attack: [
                { freq: 220, type: 'sawtooth', duration: 0.1, delay: 0 }
            ],
            // Pre-render 6 pitch levels for win streak
            attackWin0: this._getAttackWinNotes(1),
            attackWin1: this._getAttackWinNotes(Math.pow(2, 1 / 12)),
            attackWin2: this._getAttackWinNotes(Math.pow(2, 2 / 12)),
            attackWin3: this._getAttackWinNotes(Math.pow(2, 3 / 12)),
            attackWin4: this._getAttackWinNotes(Math.pow(2, 4 / 12)),
            attackWin5: this._getAttackWinNotes(Math.pow(2, 5 / 12)),
            attackLose: [
                { freq: 300, type: 'sawtooth', duration: 0.15, delay: 0 },
                { freq: 200, type: 'sawtooth', duration: 0.2, delay: 0.12 }
            ],
            reinforce: [
                { freq: 330, type: 'triangle', duration: 0.08, delay: 0 },
                { freq: 392, type: 'triangle', duration: 0.08, delay: 0.06 },
                { freq: 523, type: 'triangle', duration: 0.12, delay: 0.12 }
            ],
            playerEliminated: [
                { freq: 200, type: 'sawtooth', duration: 0.2, delay: 0 },
                { freq: 150, type: 'sawtooth', duration: 0.25, delay: 0.15 },
                { freq: 100, type: 'sawtooth', duration: 0.3, delay: 0.30 }
            ],
            victory: [
                { freq: 523.25, type: 'square', duration: 0.12, delay: 0 },
                { freq: 659.25, type: 'square', duration: 0.12, delay: 0.15 },
                { freq: 783.99, type: 'square', duration: 0.12, delay: 0.30 },
                { freq: 1046.5, type: 'square', duration: 0.15, delay: 0.45 },
                { freq: 783.99, type: 'square', duration: 0.12, delay: 0.60 },
                { freq: 1046.5, type: 'square', duration: 0.5, delay: 0.75 },
                // Harmony overlay
                { freq: 523.25, type: 'triangle', duration: 0.5, delay: 0.75 },
                { freq: 659.25, type: 'triangle', duration: 0.5, delay: 0.75 }
            ],
            defeat: [
                { freq: 400, type: 'sawtooth', duration: 0.2, delay: 0 },
                { freq: 300, type: 'sawtooth', duration: 0.25, delay: 0.2 },
                { freq: 200, type: 'sawtooth', duration: 0.3, delay: 0.4 },
                { freq: 100, type: 'sawtooth', duration: 0.4, delay: 0.6 }
            ]
        };

        // Render each sound
        for (const [name, notes] of Object.entries(soundDefinitions)) {
            try {
                const buffer = await this._renderSound(notes, sampleRate);
                this.preloadedBuffers.set(name, buffer);
            } catch (e) {
                console.warn(`Failed to preload sound: ${name}`, e);
            }
        }

        this.isPreloaded = true;
        console.log(`Preloaded ${this.preloadedBuffers.size} sound effects`);
    }

    /**
     * Get attack win notes with pitch multiplier
     */
    _getAttackWinNotes(pitchMultiplier) {
        const basePitch = 440;
        return [
            { freq: basePitch * pitchMultiplier, type: 'square', duration: 0.1, delay: 0 },
            { freq: basePitch * pitchMultiplier * 1.25, type: 'square', duration: 0.1, delay: 0.07 },
            { freq: basePitch * pitchMultiplier * 1.5, type: 'square', duration: 0.15, delay: 0.14 }
        ];
    }

    /**
     * Render a sequence of notes to an AudioBuffer using OfflineAudioContext
     */
    async _renderSound(notes, sampleRate) {
        // Calculate total duration needed
        let maxEnd = 0;
        for (const note of notes) {
            const end = (note.delay || 0) + (note.duration || 0.15) + 0.05;
            if (end > maxEnd) maxEnd = end;
        }

        const bufferLength = Math.ceil(maxEnd * sampleRate);
        const offlineCtx = new OfflineAudioContext(1, bufferLength, sampleRate);

        for (const note of notes) {
            const oscillator = offlineCtx.createOscillator();
            const gainNode = offlineCtx.createGain();

            oscillator.type = note.type || 'square';
            oscillator.frequency.value = note.freq;
            oscillator.connect(gainNode);
            gainNode.connect(offlineCtx.destination);

            const startTime = note.delay || 0;
            const duration = note.duration || 0.15;
            const attack = 0.01;

            // Envelope
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.2, startTime + attack);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

            oscillator.start(startTime);
            oscillator.stop(startTime + duration + 0.05);
        }

        return await offlineCtx.startRendering();
    }

    /**
     * Play a preloaded sound buffer
     */
    playBuffer(name) {
        if (!this.enabled || !this.audioContext) return;
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        const buffer = this.preloadedBuffers.get(name);
        if (!buffer) {
            console.warn(`Sound buffer not found: ${name}`);
            return;
        }

        const source = this.audioContext.createBufferSource();
        const gainNode = this.audioContext.createGain();

        source.buffer = buffer;
        gainNode.gain.value = this.volume;

        source.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        source.start(0);
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

    // Play a tone with given frequency, type, and duration (fallback for non-preloaded)
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

    // Play a sequence of tones (fallback for non-preloaded)
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
        this.preloadedBuffers.clear();
    }

    // === GAME SOUND EFFECTS ===

    // Player's turn notification
    turnStart() {
        if (this.isPreloaded) {
            this.playBuffer('turnStart');
        } else {
            this.playSequence([
                { freq: 440, duration: 0.1 },
                { freq: 550, duration: 0.15 }
            ], 0.08);
        }
    }

    // Attack initiated
    attack() {
        if (this.isPreloaded) {
            this.playBuffer('attack');
        } else {
            this.playTone(220, 'sawtooth', 0.1);
        }
    }

    // Won a battle
    attackWin() {
        this.winStreak++;

        if (this.isPreloaded) {
            // Use pre-rendered pitch level (0-5)
            const level = Math.min(this.winStreak - 1, 5);
            this.playBuffer(`attackWin${level}`);
        } else {
            const basePitch = 440;
            const pitchMultiplier = Math.pow(2, Math.min(this.winStreak - 1, 5) / 12);

            this.playSequence([
                { freq: basePitch * pitchMultiplier, type: 'square', duration: 0.1 },
                { freq: basePitch * pitchMultiplier * 1.25, type: 'square', duration: 0.1 },
                { freq: basePitch * pitchMultiplier * 1.5, type: 'square', duration: 0.15 }
            ], 0.07);
        }
    }

    // Lost a battle
    attackLose() {
        this.winStreak = 0;
        if (this.isPreloaded) {
            this.playBuffer('attackLose');
        } else {
            this.playSequence([
                { freq: 300, type: 'sawtooth', duration: 0.15 },
                { freq: 200, type: 'sawtooth', duration: 0.2 }
            ], 0.12);
        }
    }

    // Reinforcements received
    reinforce() {
        if (this.isPreloaded) {
            this.playBuffer('reinforce');
        } else {
            this.playSequence([
                { freq: 330, type: 'triangle', duration: 0.08 },
                { freq: 392, type: 'triangle', duration: 0.08 },
                { freq: 523, type: 'triangle', duration: 0.12 }
            ], 0.06);
        }
    }

    // Player eliminated
    playerEliminated() {
        if (this.isPreloaded) {
            this.playBuffer('playerEliminated');
        } else {
            this.playSequence([
                { freq: 200, type: 'sawtooth', duration: 0.2 },
                { freq: 150, type: 'sawtooth', duration: 0.25 },
                { freq: 100, type: 'sawtooth', duration: 0.3 }
            ], 0.15);
        }
    }

    // Game over - victory
    victory() {
        if (this.isPreloaded) {
            this.playBuffer('victory');
        } else {
            const notes = [
                { freq: 523.25, type: 'square', duration: 0.12 },
                { freq: 659.25, type: 'square', duration: 0.12 },
                { freq: 783.99, type: 'square', duration: 0.12 },
                { freq: 1046.5, type: 'square', duration: 0.15 },
                { freq: 783.99, type: 'square', duration: 0.12 },
                { freq: 1046.5, type: 'square', duration: 0.5 },
            ];

            this.playSequence(notes, 0.15);

            setTimeout(() => {
                if (!this.enabled || !this.audioContext) return;
                this.playTone(523.25, 'triangle', 0.5, 0.05, 0.2);
                this.playTone(659.25, 'triangle', 0.5, 0.05, 0.2);
            }, 0.15 * 5 * 1000);
        }
    }

    // Game over - defeat
    defeat() {
        if (this.isPreloaded) {
            this.playBuffer('defeat');
        } else {
            this.playSequence([
                { freq: 400, type: 'sawtooth', duration: 0.2 },
                { freq: 300, type: 'sawtooth', duration: 0.25 },
                { freq: 200, type: 'sawtooth', duration: 0.3 },
                { freq: 100, type: 'sawtooth', duration: 0.4 }
            ], 0.2);
        }
    }
}
