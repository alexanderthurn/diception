/**
 * HighscoreManager - Manages win/loss statistics and campaign progress
 */
const HIGHSCORE_STORAGE_KEY = 'dicy_highscores';

export class HighscoreManager {
    constructor() {
        this.data = this.load();
    }

    load() {
        try {
            const data = JSON.parse(localStorage.getItem(HIGHSCORE_STORAGE_KEY));
            // Ensure all required fields exist
            return {
                wins: data?.wins || {},
                totalGames: data?.totalGames || 0,
                humanStats: data?.humanStats || { gamesPlayed: 0, wins: 0 },
                campaigns: data?.campaigns || {}
            };
        } catch (e) {
            return {
                wins: {},
                totalGames: 0,
                humanStats: { gamesPlayed: 0, wins: 0 },
                campaigns: {}
            };
        }
    }

    save() {
        localStorage.setItem(HIGHSCORE_STORAGE_KEY, JSON.stringify(this.data));
    }

    /**
     * Record a game result
     * @param {string} winnerName - Name of the winner
     * @param {boolean} humanPlayed - Whether a human participated in this game
     * @param {boolean} humanWon - Whether a human won (only relevant if humanPlayed)
     */
    recordWin(winnerName, humanPlayed = false, humanWon = false) {
        // Legacy win tracking
        this.data.wins[winnerName] = (this.data.wins[winnerName] || 0) + 1;
        this.data.totalGames = (this.data.totalGames || 0) + 1;

        // Human-specific stats
        if (humanPlayed) {
            this.data.humanStats.gamesPlayed++;
            if (humanWon) {
                this.data.humanStats.wins++;
            }
        }

        this.save();
        return this.data;
    }

    /**
     * Mark a campaign level as completed
     * @param {string} campaignId - ID of the campaign (e.g., "classic")
     * @param {number} levelIndex - Index of the completed level
     */
    markCampaignLevelComplete(campaignId, levelIndex) {
        if (!this.data.campaigns[campaignId]) {
            this.data.campaigns[campaignId] = [];
        }

        // Only add if not already completed
        if (!this.data.campaigns[campaignId].includes(levelIndex)) {
            this.data.campaigns[campaignId].push(levelIndex);
            this.data.campaigns[campaignId].sort((a, b) => a - b);
        }

        this.save();
    }

    /**
     * Check if a campaign level is completed
     */
    isCampaignLevelComplete(campaignId, levelIndex) {
        return this.data.campaigns[campaignId]?.includes(levelIndex) || false;
    }

    /**
     * Get completed level indexes for a campaign
     */
    getCampaignProgress(campaignId) {
        return this.data.campaigns[campaignId] || [];
    }

    /**
     * Get human win rate as a percentage
     */
    getHumanWinRate() {
        const { gamesPlayed, wins } = this.data.humanStats;
        if (gamesPlayed === 0) return 0;
        return Math.round((wins / gamesPlayed) * 100);
    }

    /**
     * Get human stats summary
     */
    getHumanStats() {
        return {
            ...this.data.humanStats,
            winRate: this.getHumanWinRate()
        };
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
