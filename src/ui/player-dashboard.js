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
        this.collapsedList = document.getElementById('player-collapsed-list');

        // Callbacks
        this.getPlayerName = null;
        this.onToggleAutoplay = null;
        this.diceDataURL = null;

        // State
        this.autoplayPlayers = new Set();
    }

    init() {
        // Always start collapsed
        this.playerDashboard.classList.add('collapsed');
        this.dashToggle.textContent = '[+]';

        this.dashHeader.addEventListener('click', (e) => {
            if (e.target.closest('.autoplay-toggle')) return;
            this.playerDashboard.classList.toggle('collapsed');
            this.dashToggle.textContent = this.playerDashboard.classList.contains('collapsed') ? '[+]' : '[-]';
        });

        // Collapsed tile strip is also a toggle
        this.collapsedList.addEventListener('click', () => {
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

    /**
     * Trigger a rumble animation on the active player tile
     * @param {boolean} won - true for win rumble, false for loss rumble
     */
    rumbleActive(won) {
        const activeTile = this.collapsedList.querySelector('.player-tile.active');
        if (!activeTile) return;
        const cls = won ? 'rumble-win' : 'rumble-lose';
        activeTile.classList.remove('rumble-win', 'rumble-lose');
        // Force reflow so re-adding same class restarts animation
        void activeTile.offsetWidth;
        activeTile.classList.add(cls);
        activeTile.addEventListener('animationend', () => {
            activeTile.classList.remove(cls);
        }, { once: true });
    }

    updateCollapsedView() {
        const stats = this.game.getPlayerStats();
        this.collapsedList.innerHTML = '';

        stats.forEach(p => {
            if (!p.alive && p.id === undefined) return;

            const tile = document.createElement('div');
            const r = (p.color >> 16) & 0xFF;
            const g = (p.color >> 8) & 0xFF;
            const b = p.color & 0xFF;
            const isActive = this.game.currentPlayer.id === p.id;

            tile.className = 'player-tile' +
                (isActive ? ' active' : '') +
                (!p.alive ? ' dead' : '');
            tile.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.7)`;

            // Player type icon overlay
            const typeIcon = document.createElement('span');
            typeIcon.className = p.isBot
                ? 'sprite-icon icon-autoplay player-tile-icon'
                : 'sprite-icon icon-assign player-tile-icon';
            tile.appendChild(typeIcon);

            // Dice count label (visible on wide screens via CSS)
            if (p.alive) {
                const diceLabel = document.createElement('span');
                diceLabel.className = 'player-tile-dice';
                diceLabel.textContent = p.totalDice || 0;
                tile.appendChild(diceLabel);
            }

            // Dead X overlay
            if (!p.alive) {
                const deadIcon = document.createElement('span');
                deadIcon.className = 'sprite-icon icon-close player-tile-dead';
                tile.appendChild(deadIcon);
            }

            this.collapsedList.appendChild(tile);
        });
    }

    update() {
        // Update collapsed tile view
        this.updateCollapsedView();

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
                `<button class="autoplay-toggle ${isAutoplay ? 'active' : ''}" data-player-id="${p.id}"><span class="sprite-icon icon-autoplay"></span></button>` : '';

            div.innerHTML = `
                <div class="player-info-row">
                   <div style="font-weight:bold; color: #${p.color.toString(16).padStart(6, '0')}">${playerName}</div>
                   ${autoplayBtn}
                </div>
                <div class="p-stats-row">
                   <span title="Tiles owned"><span class="sprite-icon icon-map"></span> ${p.tileCount || 0}</span>
                   <span title="Connected region size"><span class="sprite-icon icon-link"></span> ${p.connectedTiles || 0}</span>
                   <span title="Total dice" style="display: flex; align-items: center; gap: 4px;"><span class="dice-icon-sprite mini" style="background-color: #888; -webkit-mask-image: url(${this.diceDataURL}); mask-image: url(${this.diceDataURL});"></span> ${p.totalDice || 0}</span>
                   ${p.storedDice > 0 ? `<span title="Stored dice"><span class="sprite-icon icon-dice"></span> ${p.storedDice}</span>` : ''}
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
