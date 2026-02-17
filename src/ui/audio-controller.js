import { sound, Sound } from '@pixi/sound';

const STORAGE_KEY_INACTIVE = 'dicy_musicInactiveTracks';

/**
 * AudioController - Manages music playlist and SFX volume/toggle
 * Uses @pixi/sound for music playback
 */
export class AudioController {
    constructor(sfxManager) {
        this.sfx = sfxManager;

        // Available songs
        this.availableSongs = [
            'Neon Dice Offensive.ogg',
            'Neon Etude.ogg',
            'Neon Second Dice Offensive.ogg',
            'Neon Second Etude.ogg',
            'Neon Third Dice Offensive.ogg',
            'Neon Third Etude.ogg',
            'Grid of Echoes.ogg',
            'Neon Fourth Etude.ogg'
        ];

        // State
        this.currentSongIndex = 0;
        this.isFirstRunEver = false;
        this.musicPlaying = false;
        this.shouldAutoplayMusic = false;
        this.musicVolume_value = 0.5;

        // The @pixi/sound Sound instance for the current song
        this._musicSound = null;
        // The currently playing instance (IMediaInstance)
        this._musicInstance = null;

        // Timeouts for mobile slider auto-hide
        this.musicTimeout = null;
        this.sfxTimeout = null;

        // UI Elements (set during init)
        this.musicToggle = null;
        this.musicVolume = null;
        this.sfxToggle = null;
        this.sfxVolume = null;
    }

    init() {
        // Load saved settings
        const storedIndex = localStorage.getItem('dicy_currentSongIndex');
        if (storedIndex === null) {
            this.currentSongIndex = 0;
            this.isFirstRunEver = true;
        } else {
            this.currentSongIndex = parseInt(storedIndex, 10);
        }

        // Validate index
        if (isNaN(this.currentSongIndex) || this.currentSongIndex < 0 || this.currentSongIndex >= this.availableSongs.length) {
            console.warn('Resetting invalid song index:', this.currentSongIndex);
            this.currentSongIndex = 0;
        }

        localStorage.setItem('dicy_currentSongIndex', this.currentSongIndex.toString());

        // Load volume/enabled settings
        const savedMusicEnabled = localStorage.getItem('dicy_musicEnabled') !== 'false';
        const savedMusicVolume = parseFloat(localStorage.getItem('dicy_musicVolume') ?? '0.5');
        const savedSfxEnabled = localStorage.getItem('dicy_sfxEnabled') !== 'false';
        const savedSfxVolume = parseFloat(localStorage.getItem('dicy_sfxVolume') ?? '0.5');

        this.musicVolume_value = savedMusicVolume;
        this.shouldAutoplayMusic = savedMusicEnabled;

        // Apply SFX settings
        this.sfx.setEnabled(savedSfxEnabled);
        this.sfx.setVolume(savedSfxVolume);

        // Pre-load the current song
        this._loadSong(this.currentSongIndex);

        // Get UI elements
        this.musicToggle = document.getElementById('music-toggle');
        this.musicVolume = document.getElementById('music-volume');
        this.sfxToggle = document.getElementById('sfx-toggle');
        this.sfxVolume = document.getElementById('sfx-volume');

        // Initialize UI state
        this.musicVolume.value = savedMusicVolume * 100;
        this.sfxVolume.value = savedSfxVolume * 100;
        this.sfxToggle.textContent = savedSfxEnabled ? '🔔' : '🔕';
        this.sfxToggle.classList.toggle('active', savedSfxEnabled);
        this.musicToggle.textContent = savedMusicEnabled ? '🔊' : '🔇';
        this.musicToggle.classList.toggle('active', savedMusicEnabled);

        // Bind events
        this.bindEvents();
    }

    /**
     * Load a song by index using @pixi/sound.
     */
    _loadSong(index) {
        // Stop and remove previous music sound
        if (sound.exists('music')) {
            sound.stop('music');
            sound.remove('music');
        }
        this._musicInstance = null;

        const songPath = './music/' + encodeURIComponent(this.availableSongs[index]);
        console.log('Loading music:', songPath);

        this._musicSound = sound.add('music', {
            url: songPath,
            preload: true,
            volume: this.musicVolume_value,
        });
    }

    /**
     * Play the currently loaded song.
     */
    _playCurrent() {
        if (!sound.exists('music')) return;

        // Stop any existing playback
        sound.stop('music');

        sound.volume('music', this.musicVolume_value);
        const instance = sound.play('music', {
            loop: false,
            complete: () => this.loadNextSong(),
        });

        // instance might be a Promise if still loading
        if (instance && typeof instance.then === 'function') {
            instance.then(inst => { this._musicInstance = inst; });
        } else {
            this._musicInstance = instance;
        }
    }

    bindEvents() {
        // Music toggle
        this.musicToggle.addEventListener('click', () => this.handleMusicToggle());

        // Music volume
        this.musicVolume.addEventListener('input', (e) => {
            this.musicVolume_value = e.target.value / 100;
            if (sound.exists('music')) {
                sound.volume('music', this.musicVolume_value);
            }
            localStorage.setItem('dicy_musicVolume', this.musicVolume_value.toString());
            this.resetSliderTimeout(this.musicVolume, 'musicTimeout');
        });

        // SFX toggle
        this.sfxToggle.addEventListener('click', () => this.handleSfxToggle());

        // SFX volume
        this.sfxVolume.addEventListener('input', (e) => {
            this.sfx.setVolume(e.target.value / 100);
            localStorage.setItem('dicy_sfxVolume', (e.target.value / 100).toString());
            this.resetSliderTimeout(this.sfxVolume, 'sfxTimeout');
        });

        // Close sliders on outside click (mobile)
        document.addEventListener('click', (e) => {
            if (window.innerWidth > 768 && window.innerHeight > 720) return;
            if (!e.target.closest('#music-controls')) {
                document.querySelectorAll('#music-controls input[type="range"]').forEach(el => el.classList.remove('visible'));
            }
        });

        // First interaction - init audio context
        document.body.addEventListener('click', () => {
            this.sfx.init();
            if (this.shouldAutoplayMusic && !this.musicPlaying) {
                this._playCurrent();
                this.musicToggle.textContent = '🔊';
                this.musicToggle.classList.add('active');
                this.musicPlaying = true;
            }
            this.shouldAutoplayMusic = false;
        }, { once: true });
    }

    /** @returns {string[]} Filenames marked inactive (excluded from play loop) */
    getInactiveTracks() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_INACTIVE);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    /** @param {string} filename - Song filename */
    /** @param {boolean} active - true = in playlist, false = excluded */
    setTrackActive(filename, active) {
        const inactive = this.getInactiveTracks();
        const set = new Set(inactive);
        if (active) {
            set.delete(filename);
        } else {
            set.add(filename);
        }
        localStorage.setItem(STORAGE_KEY_INACTIVE, JSON.stringify([...set]));
    }

    /** @returns {string[]} Songs that are in the play loop (all if none explicitly inactive) */
    getActiveSongs() {
        const inactive = new Set(this.getInactiveTracks());
        const active = this.availableSongs.filter(s => !inactive.has(s));
        return active.length > 0 ? active : this.availableSongs;
    }

    loadNextSong() {
        const activeSongs = this.getActiveSongs();
        const currentFileName = this.availableSongs[this.currentSongIndex];
        let idx = activeSongs.indexOf(currentFileName);
        if (idx < 0) idx = 0;
        idx = (idx + 1) % activeSongs.length;
        const nextFileName = activeSongs[idx];
        this.currentSongIndex = this.availableSongs.indexOf(nextFileName);

        this._loadSong(this.currentSongIndex);
        localStorage.setItem('dicy_currentSongIndex', this.currentSongIndex.toString());

        if (this.musicPlaying) {
            this._playCurrent();
        }
    }

    /**
     * Plays a specific song by filename.
     * Also marks it as active if it was inactive.
     */
    playSong(filename) {
        const idx = this.availableSongs.indexOf(filename);
        if (idx === -1) return;

        // Ensure it's active so it stays in the rotation
        this.setTrackActive(filename, true);

        this.currentSongIndex = idx;
        this._loadSong(idx);
        localStorage.setItem('dicy_currentSongIndex', this.currentSongIndex.toString());

        this.musicPlaying = true;
        localStorage.setItem('dicy_musicEnabled', 'true');
        if (this.musicToggle) {
            this.musicToggle.textContent = '🔊';
            this.musicToggle.classList.add('active');
        }

        this._playCurrent();
    }

    getMobileAction(isEnabled, volumeSlider) {
        if (window.innerWidth > 768 && window.innerHeight > 720) return null;

        const isVisible = volumeSlider.classList.contains('visible');

        if (!isEnabled) return 'unmute-show';
        if (isEnabled && isVisible) return 'hide';
        return 'mute';
    }

    showSliderWithTimeout(slider, timeoutKey) {
        document.querySelectorAll('#music-controls input[type="range"]').forEach(el => el.classList.remove('visible'));
        slider.classList.add('visible');

        this[timeoutKey] = setTimeout(() => {
            slider.classList.remove('visible');
        }, 3000);
    }

    resetSliderTimeout(slider, timeoutKey) {
        if (window.innerWidth <= 768 || window.innerHeight <= 720) {
            slider.classList.add('visible');
            clearTimeout(this[timeoutKey]);
            this[timeoutKey] = setTimeout(() => {
                slider.classList.remove('visible');
            }, 3000);
        }
    }

    handleMusicToggle() {
        const action = this.getMobileAction(this.musicPlaying, this.musicVolume);

        if (action === 'unmute-show') {
            clearTimeout(this.musicTimeout);
            this.showSliderWithTimeout(this.musicVolume, 'musicTimeout');
            if (!this.musicPlaying) {
                this.musicPlaying = true;
                if (this.isFirstRunEver) {
                    this.isFirstRunEver = false;
                    this._playCurrent();
                } else {
                    this.loadNextSong();
                }
                this.musicToggle.textContent = '🔊';
                this.musicToggle.classList.add('active');
                localStorage.setItem('dicy_musicEnabled', 'true');
            }
            return;
        }

        if (action === 'hide') {
            clearTimeout(this.musicTimeout);
            this.musicVolume.classList.remove('visible');
            return;
        }

        // Desktop or mute action
        if (this.musicPlaying) {
            // Pause/stop music
            if (sound.exists('music')) {
                sound.pause('music');
            }
            this.musicToggle.textContent = '🔇';
            this.musicPlaying = false;
        } else {
            this.musicPlaying = true;
            if (this.isFirstRunEver) {
                this.isFirstRunEver = false;
                this._playCurrent();
            } else {
                // Resume if paused, otherwise load next
                if (sound.exists('music') && this._musicSound?.isPlaying === false) {
                    // Try resuming
                    sound.resume('music');
                } else {
                    this.loadNextSong();
                }
            }
            this.musicToggle.textContent = '🔊';
        }
        localStorage.setItem('dicy_musicEnabled', this.musicPlaying.toString());
        this.musicToggle.classList.toggle('active', this.musicPlaying);
    }

    handleSfxToggle() {
        const action = this.getMobileAction(this.sfx.enabled, this.sfxVolume);

        if (action === 'unmute-show') {
            clearTimeout(this.sfxTimeout);
            this.showSliderWithTimeout(this.sfxVolume, 'sfxTimeout');
            if (!this.sfx.enabled) {
                this.sfx.setEnabled(true);
                this.sfxToggle.textContent = '🔔';
                this.sfxToggle.classList.add('active');
                localStorage.setItem('dicy_sfxEnabled', 'true');
            }
            return;
        }

        if (action === 'hide') {
            clearTimeout(this.sfxTimeout);
            this.sfxVolume.classList.remove('visible');
            return;
        }

        const enabled = !this.sfx.enabled;
        this.sfx.setEnabled(enabled);
        this.sfxToggle.textContent = enabled ? '🔔' : '🔕';
        this.sfxToggle.classList.toggle('active', enabled);
        localStorage.setItem('dicy_sfxEnabled', enabled.toString());
    }
}
