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
        // Only allow dismissal if complete
        if (this.isDismissed || !this.isComplete) return;

        this.isDismissed = true;

        // Block UI interactions briefly to prevent accidental clicks
        const uiOverlay = document.getElementById('ui-overlay');
        if (uiOverlay) {
            uiOverlay.classList.add('interaction-shield');
            setTimeout(() => {
                uiOverlay.classList.remove('interaction-shield');
            }, 150);
        }

        if (this.el) {
            this.el.classList.add('fade-out');
            setTimeout(() => {
                this.el.style.display = 'none';
                if (this.onDismiss) this.onDismiss();
            }, 150);
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
