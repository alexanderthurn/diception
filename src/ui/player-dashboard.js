/**
 * PlayerDashboard - Manages the player list and dashboard UI
 */
export class PlayerDashboard {
    constructor(game) {
        this.game = game;
        this.playerDashboard = document.getElementById('player-dashboard');
        this.dashHeader = document.getElementById('dash-header');
        this.dashToggle = document.getElementById('dash-toggle');
        this.playerList = document.getElementById('player-list');
        
        // Callbacks
        this.getPlayerName = null;
        this.onToggleAutoplay = null;
        this.diceDataURL = null;
        
        // State
        this.autoplayPlayers = new Set();
    }

    init() {
        // Collapse by default on mobile
        if (window.innerWidth <= 768 || window.innerHeight <= 600) {
            this.playerDashboard.classList.add('collapsed');
            this.dashToggle.textContent = '[+]';
        }

        this.dashHeader.addEventListener('click', (e) => {
            if (e.target.closest('.autoplay-toggle')) return;
            this.playerDashboard.classList.toggle('collapsed');
            this.dashToggle.textContent = this.playerDashboard.classList.contains('collapsed') ? '[+]' : '[-]';
        });
    }

    setPlayerNameGetter(fn) {
        this.getPlayerName = fn;
    }

    setDiceDataURL(url) {
        this.diceDataURL = url;
    }

    setAutoplayToggleCallback(fn) {
        this.onToggleAutoplay = fn;
    }

    setAutoplayPlayers(autoplaySet) {
        this.autoplayPlayers = autoplaySet;
    }

    show() {
        this.playerDashboard.classList.remove('hidden');
    }

    hide() {
        this.playerDashboard.classList.add('hidden');
    }

    update() {
        const stats = this.game.getPlayerStats();
        this.playerList.innerHTML = '';

        stats.forEach(p => {
            if (!p.alive && p.id === undefined) return;

            const div = document.createElement('div');
            div.className = `player-item ${this.game.currentPlayer.id === p.id ? 'active' : ''} ${!p.alive ? 'dead' : ''}`;
            div.style.borderLeftColor = '#' + p.color.toString(16).padStart(6, '0');

            const playerName = this.getPlayerName(p);
            const isAutoplay = this.autoplayPlayers.has(p.id);

            const autoplayBtn = !p.isBot && p.alive ?
                `<button class="autoplay-toggle ${isAutoplay ? 'active' : ''}" data-player-id="${p.id}">🤖</button>` : '';

            div.innerHTML = `
                <div class="player-info-row">
                   <div style="font-weight:bold; color: #${p.color.toString(16).padStart(6, '0')}">${playerName}</div>
                   ${autoplayBtn}
                </div>
                <div class="p-stats-row">
                   <span title="Tiles owned">🗺️ ${p.tileCount || 0}</span>
                   <span title="Connected region size">🔗 ${p.connectedTiles || 0}</span>
                   <span title="Total dice" style="display: flex; align-items: center; gap: 4px;"><span class="dice-icon-sprite mini" style="background-color: #888; -webkit-mask-image: url(${this.diceDataURL}); mask-image: url(${this.diceDataURL});"></span> ${p.totalDice || 0}</span>
                   ${p.storedDice > 0 ? `<span title="Stored dice">📦 ${p.storedDice}</span>` : ''}
                </div>
            `;
            this.playerList.appendChild(div);
        });

        // Bind autoplay toggle events
        document.querySelectorAll('.autoplay-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const playerId = parseInt(btn.dataset.playerId);
                if (this.onToggleAutoplay) {
                    this.onToggleAutoplay(playerId);
                }
            });
        });
    }
}
