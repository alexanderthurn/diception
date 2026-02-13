/**
 * LoadingScreen handles the visual presentation of the game initialization process.
 * It features a terminal-style log and a progress bar, followed by a start prompt.
 */
export class LoadingScreen {
    constructor(inputManager, opts = {}) {
        this.inputManager = inputManager;
        this.onDismiss = opts.onDismiss || null;
        this.el = document.getElementById('loading-screen');
        this.content = document.querySelector('.loading-content');
        this.progressBar = document.getElementById('loading-bar-fill');
        this.logContainer = document.getElementById('system-logs');
        this.prompt = document.getElementById('loading-prompt');
        this.icons = document.getElementById('loading-icons');

        this.isDismissed = false;
        this.progress = 0;
        this.isComplete = false;

        this.logs = [
            "CALIBRATING QUANTUM DICE...",
            "INITIALIZING NEON GRID...",
            "ESTABLISHING NEURAL LINK...",
            "SYNCING SPATIAL RECTIFIERS...",
            "BOOTING CORE SYSTEM...",
            "INITIALIZING INTERFACE..."
        ];

        this.init();
    }

    setInputController(inputController) {
        this.inputController = inputController;
    }

    init() {
        if (!this.el) return;

        // Visual setup
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const isIPad = /iPad|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;

        if (isTouch || isIPad) {
            if (this.icons) this.icons.classList.add('hidden');
        } else {
            if (this.icons) this.icons.classList.remove('hidden');
        }

        // Global dismiss for all inputs
        this.dismissHandler = this.dismiss.bind(this);
        window.addEventListener('mousedown', this.dismissHandler);
        window.addEventListener('touchstart', this.dismissHandler);
        window.addEventListener('keydown', this.dismissHandler);
        if (this.inputManager) {
            this.inputManager.on('confirm', this.dismissHandler);
        }

        // Start log sequence
        this.startLogSequence();
    }

    async startLogSequence() {
        for (const log of this.logs) {
            if (this.isDismissed) break;
            this.addLog(log);
            this.updateProgress(this.progress + (100 / this.logs.length));
            await new Promise(r => setTimeout(r, 200 + Math.random() * 400));
        }
        this.onComplete();
    }

    addLog(text) {
        if (!this.logContainer) return;

        const entry = document.createElement('div');
        entry.className = 'log-entry';

        // Removed timestamps as requested
        entry.innerHTML = `<span class="log-prefix">></span> ${text}`;
        this.logContainer.appendChild(entry);

        // Keep only last 5 logs for cleaner look
        while (this.logContainer.children.length > 5) {
            this.logContainer.removeChild(this.logContainer.firstChild);
        }

        // Auto-scroll
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }

    updateProgress(percent) {
        this.progress = Math.min(100, percent);
        if (this.progressBar) {
            this.progressBar.style.width = `${this.progress}%`;
        }
    }

    onComplete() {
        this.isComplete = true;

        // Mark entire screen as completed
        if (this.el) {
            this.el.classList.add('completed');
        }

        // Shrink loading content
        if (this.content) {
            this.content.classList.add('completed');
        }

        // Show prompt with original logic
        if (this.prompt) {
            const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
            const isIPad = /iPad|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;

            if (isTouch || isIPad) {
                this.prompt.textContent = 'Touch to Start';
            } else {
                this.prompt.textContent = 'Press any key to start';
            }

            this.prompt.classList.add('visible');
            this.prompt.style.animation = 'pulse-opacity 2s infinite ease-in-out';
        }
    }

    dismiss() {
        // Only allow dismissal if complete and no dialog is open
        if (!this.isComplete) return;
        if (document.querySelector('.dialog-overlay')) return;

        // Stage 1: Initial tap - start the atmospheric fade
        if (!this.el.classList.contains('fade-out')) {
            this.isDismissed = true; // Stop ongoing log sequences
            this.el.classList.add('fade-out');

            // Visual guidance for secondary tap
            if (this.prompt) {
                const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
                this.prompt.textContent = isTouch ? 'TOUCH AGAIN' : 'PRESS AGAIN';
                this.prompt.classList.add('pulse-fast');
            }

            // Set cooldown to prevent accidental double-activation
            this.fadeStartTime = Date.now();

            // Block UI interactions
            document.body.classList.add('interaction-shield');

            if (this.inputController) {
                this.inputController.waitTillNoTouch = true;
            }
            return;
        }

        // Stage 2: Secondary tap - final entry
        // Cooldown (350ms) ensures it was a separate interaction
        if (Date.now() - this.fadeStartTime < 350) return;

        if (this.el.style.display !== 'none') {
            this.el.style.display = 'none';
            document.body.classList.remove('interaction-shield');

            if (this.onDismiss) this.onDismiss();

            if (this.inputController) {
                this.inputController.waitTillNoTouch = false;
            }

            // Cleanup
            window.removeEventListener('mousedown', this.dismissHandler);
            window.removeEventListener('touchstart', this.dismissHandler);
            window.removeEventListener('keydown', this.dismissHandler);
            if (this.inputManager) {
                this.inputManager.off('confirm', this.dismissHandler);
            }
        }
    }
}
