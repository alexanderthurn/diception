/**
 * HighscoreManager - Manages win/loss statistics
 */
const HIGHSCORE_STORAGE_KEY = 'dicy_highscores';

export class HighscoreManager {
    constructor() {
        this.data = this.load();
    }

    load() {
        try {
            return JSON.parse(localStorage.getItem(HIGHSCORE_STORAGE_KEY)) || { wins: {}, totalGames: 0 };
        } catch (e) {
            return { wins: {}, totalGames: 0 };
        }
    }

    save() {
        localStorage.setItem(HIGHSCORE_STORAGE_KEY, JSON.stringify(this.data));
    }

    recordWin(winnerName) {
        this.data.wins[winnerName] = (this.data.wins[winnerName] || 0) + 1;
        this.data.totalGames = (this.data.totalGames || 0) + 1;
        this.save();
        return this.data;
    }

    display(currentWinnerName) {
        const highscoreList = document.getElementById('highscore-list');
        const totalGamesEl = document.getElementById('total-games-played');

        // Sort by wins descending
        const sortedWins = Object.entries(this.data.wins)
            .sort((a, b) => b[1] - a[1]);

        if (sortedWins.length === 0) {
            highscoreList.innerHTML = '<div class="highscore-item"><span class="highscore-player-name">No stats yet</span></div>';
        } else {
            highscoreList.innerHTML = sortedWins.map(([name, wins]) => {
                const isHighlighted = name === currentWinnerName ? 'highlighted' : '';
                return `
                    <div class="highscore-item ${isHighlighted}">
                        <span class="highscore-player-name">${name}</span>
                        <span class="highscore-wins">${wins} 🏆</span>
                    </div>
                `;
            }).join('');
        }

        totalGamesEl.textContent = `Total Games Played: ${this.data.totalGames || 0}`;
    }
}
