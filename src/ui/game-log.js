/**
 * GameLog - Manages turn-based log grouping in the UI
 */
export class GameLog {
    constructor(game, turnHistory, scenarioManager) {
        this.game = game;
        this.turnHistory = turnHistory;
        this.scenarioManager = scenarioManager;
        
        this.logEntries = document.getElementById('log-entries');
        this.currentTurnLog = null;
        this.turnStats = { attacks: 0, wins: 0, losses: 0, conquered: 0 };
        
        // Callbacks
        this.getPlayerName = null; // Set by main
        this.onRestoreSnapshot = null; // Set by main
        this.diceDataURL = null; // Set by main
    }

    setPlayerNameGetter(fn) {
        this.getPlayerName = fn;
    }

    setDiceDataURL(url) {
        this.diceDataURL = url;
    }

    setRestoreSnapshotCallback(fn) {
        this.onRestoreSnapshot = fn;
    }

    clear() {
        this.logEntries.innerHTML = '';
        this.currentTurnLog = null;
        this.turnStats = { attacks: 0, wins: 0, losses: 0, conquered: 0 };
    }

    startTurnLog(player, autoplayPlayers) {
        const playerName = this.getPlayerName(player);
        const colorHex = '#' + player.color.toString(16).padStart(6, '0');
        const isHuman = !player.isBot && !autoplayPlayers.has(player.id);

        // Capture game state snapshot for this turn
        const snapshot = this.turnHistory.captureSnapshot(this.game);
        const snapshotIndex = this.turnHistory.length - 1;

        // Reset stats
        this.turnStats = { attacks: 0, wins: 0, losses: 0, conquered: 0 };

        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'turn-group expanded';
        wrapper.dataset.snapshotIndex = snapshotIndex;

        // Create header with action buttons
        const header = document.createElement('div');
        header.className = 'turn-header';
        header.innerHTML = `
            <span class="turn-player" style="color: ${colorHex}">${playerName}</span>
            <span class="turn-summary"></span>
            <span class="turn-actions">
                <button class="turn-action-btn" data-action="jump" title="Jump to this turn">⏪</button>
                <button class="turn-action-btn" data-action="save" title="Save as scenario">💾</button>
            </span>
            <span class="turn-toggle">▼</span>
        `;

        // Create details container
        const details = document.createElement('div');
        details.className = 'turn-details';

        wrapper.appendChild(header);
        wrapper.appendChild(details);

        // Handle action button clicks
        header.querySelector('[data-action="jump"]').addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(wrapper.dataset.snapshotIndex);
            if (this.onRestoreSnapshot) {
                this.onRestoreSnapshot(idx);
            }
        });

        header.querySelector('[data-action="save"]').addEventListener('click', (e) => {
            e.stopPropagation();
            const saveScenarioModal = document.getElementById('save-scenario-modal');
            const scenarioNameInput = document.getElementById('scenario-name-input');
            saveScenarioModal.dataset.snapshotIndex = wrapper.dataset.snapshotIndex;
            scenarioNameInput.value = `Turn ${snapshot.turn} - ${playerName}`;
            saveScenarioModal.classList.remove('hidden');
        });

        // Toggle expand/collapse
        header.addEventListener('click', (e) => {
            if (e.target.closest('.turn-action-btn')) return;
            wrapper.classList.toggle('expanded');
            header.querySelector('.turn-toggle').textContent =
                wrapper.classList.contains('expanded') ? '▼' : '▶';
        });

        this.logEntries.insertBefore(wrapper, this.logEntries.firstChild);

        // Keep only last 3 rounds
        const maxEntries = Math.max(12, this.game.players.length * 3);
        while (this.logEntries.children.length > maxEntries) {
            this.logEntries.removeChild(this.logEntries.lastChild);
        }

        this.currentTurnLog = { wrapper, details, header, player, isHuman, snapshotIndex };
    }

    finalizeTurnLog(reinforcements, saved = 0) {
        if (!this.currentTurnLog) return;

        const { header } = this.currentTurnLog;
        const summary = header.querySelector('.turn-summary');

        let summaryHtml = '';
        if (this.turnStats.attacks > 0) {
            summaryHtml = `⚔️${this.turnStats.wins}/${this.turnStats.attacks}`;
            if (this.turnStats.conquered > 0) {
                summaryHtml += ` 🏴${this.turnStats.conquered}`;
            }
        }
        if (reinforcements > 0) {
            summaryHtml += ` +${reinforcements}<span class="dice-icon-sprite mini" style="background-color: #888; -webkit-mask-image: url(${this.diceDataURL}); mask-image: url(${this.diceDataURL});"></span>`;
        }
        if (saved > 0) {
            summaryHtml += ` 📦${saved}`;
        }
        if (!summaryHtml) {
            summaryHtml = '(no action)';
        }

        summary.innerHTML = summaryHtml;

        // For bots/autoplay, collapse the log after their turn
        if (!this.currentTurnLog.isHuman) {
            this.currentTurnLog.wrapper.classList.remove('expanded');
            this.currentTurnLog.header.querySelector('.turn-toggle').textContent = '▶';
        }
    }

    addEntry(message, type = '') {
        if (!this.currentTurnLog) return;

        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = message;
        this.currentTurnLog.details.insertBefore(entry, this.currentTurnLog.details.firstChild);
    }

    recordAttack(won) {
        this.turnStats.attacks++;
        if (won) {
            this.turnStats.wins++;
            this.turnStats.conquered++;
        }
    }

    getCurrentTurnLog() {
        return this.currentTurnLog;
    }
}
