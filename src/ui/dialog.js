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
                buttons = [{ text: 'OK', value: true, className: 'tron-btn' }]
            } = options;

            // Create Overlay/Container
            const overlay = document.createElement('div');
            overlay.className = 'dialog-overlay';

            // Create Dialog Box
            const dialog = document.createElement('div');
            dialog.className = 'modal dialog-box';

            // Header
            const header = document.createElement('h1');
            header.className = 'tron-title small';

            // Wrap letters in spans for per-character animation
            [...title].forEach((char, i) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.style.setProperty('--index', i);
                header.appendChild(span);
            });

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
