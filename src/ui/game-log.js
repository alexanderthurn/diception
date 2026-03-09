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
        this.latestSnapshotIndex = undefined;
        this.latestSnapshot = null;

        // Callbacks
        this.getPlayerName = null; // Set by main
        this.diceDataURL = null; // Set by main
    }

    setPlayerNameGetter(fn) {
        this.getPlayerName = fn;
    }

    setDiceDataURL(url) {
        this.diceDataURL = url;
    }

    clear() {
        this.logEntries.innerHTML = '';
        this.currentTurnLog = null;
        this.latestSnapshotIndex = undefined;
        this.latestSnapshot = null;
        this.turnStats = { attacks: 0, wins: 0, losses: 0, conquered: 0 };
    }

    startTurnLog(player, autoplayPlayers) {
        const playerName = this.getPlayerName(player);
        const colorHex = '#' + player.color.toString(16).padStart(6, '0');

        // Capture game state snapshot for this turn
        const snapshot = this.turnHistory.captureSnapshot(this.game);
        const snapshotIndex = this.turnHistory.length - 1;
        this.latestSnapshotIndex = snapshotIndex;
        this.latestSnapshot = snapshot;

        // Reset stats
        this.turnStats = { attacks: 0, wins: 0, losses: 0, conquered: 0 };

        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'turn-group';

        // Create header: player name + summary only
        const header = document.createElement('div');
        header.className = 'turn-header';
        header.innerHTML = `
            <span class="turn-player" style="color: ${colorHex}">${playerName}</span>
            <span class="turn-summary"></span>
        `;

        // Create details container (always visible)
        const details = document.createElement('div');
        details.className = 'turn-details';

        wrapper.appendChild(header);
        wrapper.appendChild(details);

        this.logEntries.insertBefore(wrapper, this.logEntries.firstChild);

        // Keep only last N rounds
        const maxEntries = Math.max(12, this.game.players.length * 3);
        while (this.logEntries.children.length > maxEntries) {
            this.logEntries.removeChild(this.logEntries.lastChild);
        }

        this.currentTurnLog = { wrapper, details, header, player, snapshotIndex };
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
