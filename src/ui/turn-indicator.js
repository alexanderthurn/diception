/**
 * TurnIndicator - Manages the turn indicator and end turn button
 */
export class TurnIndicator {
    constructor(game) {
        this.game = game;
        this.turnIndicator = document.getElementById('turn-indicator');
        this.endTurnBtn = document.getElementById('end-turn-btn');
        this.autoWinBtn = document.getElementById('auto-win-btn');
        this.playerText = document.getElementById('player-turn');
        this.endTurnText = document.getElementById('end-turn-text');
        this.endTurnReinforcement = document.getElementById('end-turn-reinforcement');
    }

    updatePlayerText(player) {
        const name = player.isBot ? `Bot ${player.id}` : `Player ${player.id}`;
        this.playerText.textContent = `${name}'s Turn`;
        this.playerText.style.color = '#' + player.color.toString(16).padStart(6, '0');
    }

    showBotPlaying(player, aiName) {
        const colorHex = '#' + player.color.toString(16).padStart(6, '0');
        this.turnIndicator.innerHTML = `<span style="color:${colorHex}">${aiName} ${player.id}</span> is playing...`;
        this.turnIndicator.classList.remove('hidden');
    }

    hideTurnIndicator() {
        this.turnIndicator.classList.add('hidden');
    }

    showEndTurnButton(player, expectedReinforcements) {
        this.endTurnBtn.classList.remove('hidden');
        this.endTurnBtn.disabled = false;
        if (this.endTurnText) this.endTurnText.textContent = 'END TURN';
        if (this.endTurnReinforcement) this.endTurnReinforcement.textContent = `(+${expectedReinforcements})`;

        const playerColorHex = '#' + player.color.toString(16).padStart(6, '0');
        this.endTurnBtn.style.borderColor = playerColorHex;
        this.endTurnBtn.style.color = playerColorHex;
    }

    hideEndTurnButton() {
        this.endTurnBtn.classList.add('hidden');
        this.endTurnBtn.disabled = true;
        if (this.endTurnText) this.endTurnText.textContent = 'END TURN';
        if (this.endTurnReinforcement) this.endTurnReinforcement.textContent = '';
    }

    updateEndTurnButton(expectedReinforcements) {
        if (this.endTurnText) this.endTurnText.textContent = 'END TURN';
        if (this.endTurnReinforcement) this.endTurnReinforcement.textContent = `(+${expectedReinforcements})`;
    }

    showAutoWinButton(player, isActive) {
        const playerColorHex = '#' + player.color.toString(16).padStart(6, '0');
        this.autoWinBtn.classList.remove('hidden');
        this.autoWinBtn.style.borderColor = playerColorHex;
        this.autoWinBtn.style.color = playerColorHex;

        if (isActive) {
            this.autoWinBtn.classList.add('active');
        } else {
            this.autoWinBtn.classList.remove('active');
        }
    }

    hideAutoWinButton() {
        this.autoWinBtn.classList.add('hidden');
    }

    hideAll() {
        this.turnIndicator.classList.add('hidden');
        this.endTurnBtn.classList.add('hidden');
        this.autoWinBtn.classList.add('hidden');
    }
}
