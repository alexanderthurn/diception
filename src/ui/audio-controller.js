/**
 * AudioController - Manages music playlist and SFX volume/toggle
 */
export class AudioController {
    constructor(sfxManager) {
        this.sfx = sfxManager;

        // Available songs
        this.availableSongs = [
            'Neon Dice Offensive.mp3',
            'Neon Etude.mp3',
            'Neon Second Dice Offensive.mp3',
            'Neon Second Etude.mp3',
            'Neon Third Dice Offensive.mp3',
            'Neon Third Etude.mp3',
            'Grid of Echoes.mp3',
            'Neon Fourth Etude.mp3'
        ];

        // State
        this.currentSongIndex = 0;
        this.isFirstRunEver = false;
        this.musicPlaying = false;
        this.shouldAutoplayMusic = false;
        this.music = null;

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

        // Create audio element
        const songPath = '/' + encodeURIComponent(this.availableSongs[this.currentSongIndex]);
        console.log('Loading audio:', songPath);
        this.music = new Audio(songPath);

        this.music.addEventListener('error', (e) => {
            console.error('Audio load error for:', this.music.src, e);
        });

        // Load volume/enabled settings
        const savedMusicEnabled = localStorage.getItem('dicy_musicEnabled') !== 'false';
        const savedMusicVolume = parseFloat(localStorage.getItem('dicy_musicVolume') ?? '0.5');
        const savedSfxEnabled = localStorage.getItem('dicy_sfxEnabled') !== 'false';
        const savedSfxVolume = parseFloat(localStorage.getItem('dicy_sfxVolume') ?? '0.5');

        this.music.volume = savedMusicVolume;
        this.shouldAutoplayMusic = savedMusicEnabled;

        // Apply SFX settings
        this.sfx.setEnabled(savedSfxEnabled);
        this.sfx.setVolume(savedSfxVolume);

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

        // Bind events
        this.bindEvents();
    }

    bindEvents() {
        // Song ended - play next
        this.music.addEventListener('ended', () => this.loadNextSong());

        // Music toggle
        this.musicToggle.addEventListener('click', () => this.handleMusicToggle());

        // Music volume
        this.musicVolume.addEventListener('input', (e) => {
            this.music.volume = e.target.value / 100;
            localStorage.setItem('dicy_musicVolume', (e.target.value / 100).toString());
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
                this.music.play();
                this.musicToggle.textContent = '🔊';
                this.musicPlaying = true;
            }
            this.shouldAutoplayMusic = false;
        }, { once: true });
    }

    loadNextSong() {
        this.currentSongIndex = (this.currentSongIndex + 1) % this.availableSongs.length;
        this.music.src = '/' + encodeURIComponent(this.availableSongs[this.currentSongIndex]);
        localStorage.setItem('dicy_currentSongIndex', this.currentSongIndex.toString());

        if (this.musicPlaying) {
            this.music.play();
        }
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
                    this.music.play();
                } else {
                    this.loadNextSong();
                }
                this.musicToggle.textContent = '🔊';
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
            this.music.pause();
            this.musicToggle.textContent = '🔇';
            this.musicPlaying = false;
        } else {
            this.musicPlaying = true;
            if (this.isFirstRunEver) {
                this.isFirstRunEver = false;
                this.music.play();
            } else {
                this.loadNextSong();
            }
            this.musicToggle.textContent = '🔊';
        }
        localStorage.setItem('dicy_musicEnabled', this.musicPlaying.toString());
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
