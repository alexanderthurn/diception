import {
    GAME_ACTIONS,
    DEFAULT_BINDINGS,
    loadBindings,
    saveBindings,
    getKeyDisplayName,
    getGamepadButtonName,
} from './key-bindings.js';

/**
 * KeyBindingDialog - List-based wizard to configure input bindings.
 *
 * Shows all actions at once. The active step is highlighted; completed steps
 * show their new binding. Click any row to jump to that step.
 *
 * Usage:
 *   const changed = await KeyBindingDialog.configureKeyboard(inputManager);
 *   const changed = await KeyBindingDialog.configureGamepad(gamepadIndex, inputManager);
 *
 * Returns true if bindings were saved, false if cancelled.
 */
export class KeyBindingDialog {

    static async configureKeyboard(inputManager) {
        const actions = GAME_ACTIONS.filter(a => !a.gamepadOnly);
        const bindings = loadBindings();
        const pending = { ...bindings.keyboard };

        const saved = await this._runWizard({
            title: 'CONFIGURE KEYBOARD',
            actions,
            device: 'keyboard',
            gamepadIndex: null,
            pending,
            inputManager,
        });

        if (saved) {
            bindings.keyboard = pending;
            saveBindings(bindings);
            inputManager.reloadBindings();
        }
        return saved;
    }

    static async configureGamepad(gamepadIndex, inputManager) {
        const actions = GAME_ACTIONS.filter(a => !a.keyboardOnly);
        const bindings = loadBindings();
        const pending = { ...bindings.gamepad };

        const saved = await this._runWizard({
            title: `CONFIGURE GAMEPAD ${inputManager.getHumanIndex(gamepadIndex) + 1}`,
            actions,
            device: 'gamepad',
            gamepadIndex,
            pending,
            inputManager,
        });

        if (saved) {
            bindings.gamepad = pending;
            saveBindings(bindings);
            inputManager.reloadBindings();
        }
        return saved;
    }

    /** @private */
    static _runWizard({ title, actions, device, gamepadIndex, pending, inputManager }) {
        return new Promise((resolve) => {
            inputManager.setSuspended(true);

            let stepIndex = 0;
            let captureCleanup = null;
            let stepToken = 0;

            // --- Build overlay ---
            const overlay = document.createElement('div');
            overlay.className = 'dialog-overlay keybinding-overlay';

            const box = document.createElement('div');
            box.className = 'modal dialog-box keybinding-box';

            // Header
            const header = document.createElement('div');
            header.className = 'dialog-header';
            const titleEl = document.createElement('h1');
            titleEl.className = 'tron-title small';
            [...title].forEach((char, i) => {
                const span = document.createElement('span');
                span.textContent = char;
                span.style.setProperty('--index', i);
                titleEl.appendChild(span);
            });
            header.appendChild(titleEl);
            box.appendChild(header);

            // Body - list
            const body = document.createElement('div');
            body.className = 'dialog-body keybinding-body';

            const list = document.createElement('div');
            list.className = 'keybinding-list';

            // Helper: get display name + style for a binding entry
            function getBindingDisplay(action) {
                if (device === 'keyboard') {
                    const codes = pending[action.id];
                    if (!codes || codes.length === 0) return null;
                    return { label: getKeyDisplayName(codes[0]), style: 'keyboard' };
                } else {
                    const buttons = pending[action.id];
                    if (!buttons || buttons.length === 0) return null;
                    const btn = buttons[0];
                    return { label: getGamepadButtonName(btn), style: _gpStyle(btn) };
                }
            }

            // Build rows
            const rowData = actions.map((action, i) => {
                const row = document.createElement('div');
                row.className = 'keybinding-row keybinding-row-pending';

                const labelEl = document.createElement('span');
                labelEl.className = 'keybinding-row-label';
                labelEl.textContent = action.label;

                const keyEl = document.createElement('span');
                const bd = getBindingDisplay(action);
                if (bd) {
                    keyEl.textContent = bd.label;
                    keyEl.className = 'keybinding-row-key input-hint ' + bd.style;
                } else {
                    keyEl.textContent = '—';
                    keyEl.className = 'keybinding-row-key keybinding-row-key-empty';
                }

                row.appendChild(labelEl);
                row.appendChild(keyEl);

                // Click to jump to this step
                row.addEventListener('click', () => {
                    if (captureCleanup) captureCleanup();
                    captureCleanup = null;
                    stepIndex = i;
                    stepToken++;
                    updateStep();
                });

                list.appendChild(row);
                return { row, keyEl };
            });

            body.appendChild(list);
            box.appendChild(body);

            // Footer buttons
            const footer = document.createElement('div');
            footer.className = 'dialog-actions';

            const skipBtn = document.createElement('button');
            skipBtn.className = 'tron-btn small';
            skipBtn.textContent = 'SKIP';

            const saveBtn = document.createElement('button');
            saveBtn.className = 'tron-btn small';
            saveBtn.textContent = 'SAVE';

            const resetBtn = document.createElement('button');
            resetBtn.className = 'tron-btn small';
            resetBtn.textContent = 'RESET';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'tron-btn small';
            cancelBtn.textContent = 'CANCEL';

            footer.appendChild(skipBtn);
            footer.appendChild(saveBtn);
            footer.appendChild(resetBtn);
            footer.appendChild(cancelBtn);
            box.appendChild(footer);

            overlay.appendChild(box);
            document.body.appendChild(overlay);

            // --- Step logic ---
            function updateStep() {
                stepToken++;

                rowData.forEach(({ row }, i) => {
                    row.classList.remove('keybinding-row-active', 'keybinding-row-done', 'keybinding-row-pending');
                    if (i < stepIndex) {
                        row.classList.add('keybinding-row-done');
                    } else if (i === stepIndex) {
                        row.classList.add('keybinding-row-active');
                    } else {
                        row.classList.add('keybinding-row-pending');
                    }
                });

                if (stepIndex >= actions.length) {
                    finish(true);
                    return;
                }

                // Show waiting indicator on active row
                const { keyEl } = rowData[stepIndex];
                keyEl.textContent = '...';
                keyEl.className = 'keybinding-row-key keybinding-row-key-waiting';

                rowData[stepIndex].row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                if (captureCleanup) captureCleanup();
                captureCleanup = startCapture(actions[stepIndex]);
            }

            // Remove a captured value from every OTHER action's pending binding.
            // Updates those rows' displays immediately so the user sees the conflict resolved.
            function resolveConflicts(assignedActionId, value) {
                for (let i = 0; i < actions.length; i++) {
                    const act = actions[i];
                    if (act.id === assignedActionId) continue;
                    const vals = pending[act.id];
                    if (!Array.isArray(vals)) continue;
                    const filtered = vals.filter(v => v !== value);
                    if (filtered.length === vals.length) continue; // not affected
                    pending[act.id] = filtered;
                    // Update that row's key badge
                    const { keyEl } = rowData[i];
                    const bd = getBindingDisplay(act);
                    if (bd) {
                        keyEl.textContent = bd.label;
                        keyEl.className = 'keybinding-row-key input-hint ' + bd.style;
                    } else {
                        keyEl.textContent = '—';
                        keyEl.className = 'keybinding-row-key keybinding-row-key-empty';
                    }
                }
            }

            function markCaptured(displayLabel, style) {
                const token = stepToken;
                const { keyEl } = rowData[stepIndex];
                keyEl.textContent = displayLabel;
                keyEl.className = 'keybinding-row-key input-hint ' + style + ' keybinding-key-new';
                // Brief pause so user sees the captured key, then advance
                setTimeout(() => {
                    if (stepToken === token) {
                        stepIndex++;
                        updateStep();
                    }
                }, 350);
            }

            function finish(save) {
                document.removeEventListener('keydown', onEscape, true);
                if (captureCleanup) captureCleanup();
                inputManager.setSuspended(false);
                overlay.classList.add('fade-out');
                setTimeout(() => overlay.remove(), 300);
                resolve(save);
            }

            // --- Input capture ---
            function startCapture(action) {
                return device === 'keyboard' ? captureKeyboard(action) : captureGamepad(action, gamepadIndex);
            }

            function captureKeyboard(action) {
                let ready = false;
                setTimeout(() => { ready = true; }, 150);

                const blocked = new Set(['escape']);

                function onKeyDown(e) {
                    if (!ready) return;
                    const code = e.code.toLowerCase();
                    if (blocked.has(code)) return;
                    e.preventDefault();
                    e.stopPropagation();

                    pending[action.id] = [code];
                    resolveConflicts(action.id, code);
                    document.removeEventListener('keydown', onKeyDown, true);
                    markCaptured(getKeyDisplayName(code), 'keyboard');
                }

                function onKeyUp(e) {
                    e.preventDefault();
                    e.stopPropagation();
                }

                document.addEventListener('keydown', onKeyDown, true);
                document.addEventListener('keyup', onKeyUp, true);

                return () => {
                    document.removeEventListener('keydown', onKeyDown, true);
                    document.removeEventListener('keyup', onKeyUp, true);
                };
            }

            function captureGamepad(action, gpIndex) {
                const gamepads = navigator.getGamepads();
                const gp = gamepads[gpIndex];
                const baseline = gp ? gp.buttons.map(b => b.pressed) : [];

                let rafId = null;
                let done = false;

                function poll() {
                    if (done) return;
                    const gpds = navigator.getGamepads();
                    const current = gpds[gpIndex];
                    if (current) {
                        for (let i = 0; i < current.buttons.length; i++) {
                            if (current.buttons[i].pressed && !(baseline[i] || false)) {
                                done = true;
                                pending[action.id] = [i];
                                resolveConflicts(action.id, i);
                                markCaptured(getGamepadButtonName(i), _gpStyle(i));
                                return;
                            }
                        }
                        for (let i = 0; i < current.buttons.length; i++) {
                            if (current.buttons[i].pressed) baseline[i] = true;
                        }
                    }
                    rafId = requestAnimationFrame(poll);
                }

                rafId = requestAnimationFrame(poll);
                return () => {
                    done = true;
                    if (rafId) cancelAnimationFrame(rafId);
                };
            }

            // --- Button handlers ---
            skipBtn.addEventListener('click', () => {
                if (captureCleanup) captureCleanup();
                captureCleanup = null;
                // Restore the current binding label (not changed)
                const { keyEl } = rowData[stepIndex];
                const bd = getBindingDisplay(actions[stepIndex]);
                if (bd) {
                    keyEl.textContent = bd.label;
                    keyEl.className = 'keybinding-row-key input-hint ' + bd.style;
                } else {
                    keyEl.textContent = '—';
                    keyEl.className = 'keybinding-row-key keybinding-row-key-empty';
                }
                stepIndex++;
                updateStep();
            });

            resetBtn.addEventListener('click', () => {
                if (captureCleanup) captureCleanup();
                captureCleanup = null;
                // Reset pending to defaults for this device only
                const defaults = DEFAULT_BINDINGS[device];
                Object.keys(defaults).forEach(id => { pending[id] = [...defaults[id]]; });
                // Refresh all row displays
                rowData.forEach(({ keyEl }, i) => {
                    const bd = getBindingDisplay(actions[i]);
                    if (bd) {
                        keyEl.textContent = bd.label;
                        keyEl.className = 'keybinding-row-key input-hint ' + bd.style;
                    } else {
                        keyEl.textContent = '—';
                        keyEl.className = 'keybinding-row-key keybinding-row-key-empty';
                    }
                });
                stepIndex = 0;
                updateStep();
            });

            saveBtn.addEventListener('click', () => finish(true));

            cancelBtn.addEventListener('click', () => finish(false));

            function onEscape(e) {
                if (e.code === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    finish(false);
                }
            }
            document.addEventListener('keydown', onEscape, true);

            // Start first step
            updateStep();
        });
    }
}

/** Map gamepad button index to CSS hint style. */
function _gpStyle(btnIndex) {
    const face = { 0: 'gamepad-a', 1: 'gamepad-b', 2: 'gamepad-x', 3: 'gamepad-y' };
    if (btnIndex >= 12 && btnIndex <= 15) return 'gamepad-dpad';
    return face[btnIndex] ?? 'gamepad-btn';
}
