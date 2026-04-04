/**
 * Reusable TRON-themed Dialog system to replace native alert/confirm
 */
export class Dialog {
    static activeOverlay = null;

    /**
     * Shows a dialog with custom options
     * @param {Object} options 
     * @param {string} options.title - Dialog title
     * @param {string} [options.message] - Text message
     * @param {HTMLElement|string} [options.content] - Custom HTML element or string content
     * @param {Array} [options.buttons] - Array of { text, value, className }
     * @returns {Promise<any>} Resolves to the value of the clicked button
     */
    static show(options) {
        return new Promise((resolve) => {
            // If another dialog is open, we could either stack them or close the old one.
            // For this game's TRON theme, let's keep it simple: one at a time.
            if (this.activeOverlay) {
                this.close(this.activeOverlay);
            }
            const {
                title,
                message = '',
                content = null,
                buttons = [{ text: 'OK', value: true, className: 'tron-btn' }],
                closeButton = false
            } = options;

            // Create Overlay/Container
            const overlay = document.createElement('div');
            overlay.className = 'dialog-overlay';

            // Create Dialog Box
            const dialog = document.createElement('div');
            dialog.className = 'modal dialog-box';

            // Header with optional close button
            const header = document.createElement('div');
            header.className = 'dialog-header' + (closeButton ? ' dialog-header-with-close dialog-header-close-left' : '');
            if (closeButton) {
                const closeBtn = document.createElement('button');
                closeBtn.className = 'dialog-close-btn';
                closeBtn.textContent = '×';
                closeBtn.setAttribute('aria-label', 'Close');
                closeBtn.addEventListener('click', () => {
                    this.close(overlay);
                    resolve('close');
                });
                header.appendChild(closeBtn);
            }
            const titleEl = document.createElement('h1');
            titleEl.className = 'tron-title small';
            [...title].forEach((char, i) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.style.setProperty('--index', i);
                titleEl.appendChild(span);
            });
            header.appendChild(titleEl);
            dialog.appendChild(header);

            // Body
            const body = document.createElement('div');
            body.className = 'dialog-body';

            if (message) {
                const p = document.createElement('p');
                p.textContent = message;
                p.style.marginBottom = '20px';
                body.appendChild(p);
            }

            if (content) {
                if (typeof content === 'string') {
                    body.innerHTML += content;
                } else if (content instanceof HTMLElement) {
                    body.appendChild(content);
                }
            }
            dialog.appendChild(body);

            // Actions Container
            const actions = document.createElement('div');
            actions.className = 'dialog-actions';

            buttons.forEach(btnConfig => {
                const btn = document.createElement('button');
                btn.className = btnConfig.className || 'tron-btn';
                btn.textContent = btnConfig.text;
                btn.addEventListener('click', () => {
                    this.close(overlay);
                    resolve(btnConfig.value);
                });
                actions.appendChild(btn);
            });
            dialog.appendChild(actions);

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            this.activeOverlay = overlay;

            // Accessibility: Focus first button or the OK button
            const firstBtn = actions.querySelector('button');
            if (firstBtn) firstBtn.focus();
        });
    }

    /**
     * Convenience method for alert
     * @param {string} message 
     * @param {string} title 
     */
    static alert(message, title = 'SYSTEM') {
        return this.show({
            title,
            message,
            buttons: [{ text: 'OK', value: true, className: 'tron-btn' }]
        });
    }

    /**
     * Convenience method for confirm
     * @param {string} message 
     * @param {string} title 
     * @returns {Promise<boolean>}
     */
    static confirm(message, title = 'CONFIRMATION') {
        return this.show({
            title,
            message,
            buttons: [
                { text: 'OK', value: true, className: 'tron-btn' },
                { text: 'CANCEL', value: false, className: 'tron-btn small' }
            ]
        });
    }

    /**
     * Shows the "Full Version" upsell dialog with Steam link
     */
    static showFullVersion() {
        const STEAM_URL = 'https://store.steampowered.com/app/4429000/DICEPTION/';
        const content = document.createElement('div');
        content.className = 'full-version-dialog-body';
        content.innerHTML = `
            <p class="full-version-intro">You are playing the demo version of Diception. Unlock the full experience.</p>
            <a href="${STEAM_URL}" target="_blank" rel="noopener" class="steam-store-link">
                <img src="assets/icons/steam-logo.png" alt="Steam" class="steam-store-logo">
                <span>Full Version</span>
            </a>
            <ul class="full-version-features">
                <li>The complete 84-level Campaign</li>
                <li>Expanded Maps and more difficult Bots</li>
                <li>Local Multiplayer for up to 8 players</li>
                <li>Mods: Parallel turns, special attack rules…</li>
                <li>Map Editor, Cloud Saves, Achievements</li>
                <li>Remote Play Together</li>
            </ul>`;
        const openStore = () => {
            if (window.steam) window.steam.openStore().catch(() => window.open(STEAM_URL, '_blank'));
            else window.open(STEAM_URL, '_blank');
        };
        content.querySelector('.steam-store-link').addEventListener('click', e => {
            e.preventDefault();
            openStore();
        });
        return this.show({
            title: 'GET IT NOW',
            content,
            closeButton: true,
            buttons: [
                { text: 'GET ON STEAM', value: 'steam', className: 'tron-btn' },
            ],
        }).then(val => { if (val === 'steam') openStore(); });
    }

    /**
     * Closes the dialog
     * @param {HTMLElement} overlay
     */
    static close(overlay) {
        if (this.activeOverlay === overlay) {
            this.activeOverlay = null;
        }
        overlay.classList.add('fade-out');
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 300);
    }
}
