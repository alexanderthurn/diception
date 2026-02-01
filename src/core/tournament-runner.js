import { Game } from './game.js';
import { createAI } from './ai/index.js';
import { Dialog } from '../ui/dialog.js';

/**
 * TournamentRunner - Handles bot-only tournament simulations
 */
export class TournamentRunner {
    constructor(configManager) {
        this.configManager = configManager;

        // DOM elements
        this.tournamentResultsModal = document.getElementById('tournament-results-modal');
        this.tournamentResults = document.getElementById('tournament-results');
        this.tournamentCloseBtn = document.getElementById('tournament-close-btn');
        this.tournamentAgainBtn = document.getElementById('tournament-again-btn');
        this.tournamentDoneBtn = document.getElementById('tournament-done-btn');
        this.runTournamentBtn = document.getElementById('run-tournament-btn');
        this.setupModal = document.getElementById('setup-modal');

        this.setupEventListeners();
    }

    setupEventListeners() {
        if (this.runTournamentBtn) {
            this.runTournamentBtn.addEventListener('click', () => this.runTournament());
        }
        if (this.tournamentAgainBtn) {
            this.tournamentAgainBtn.addEventListener('click', () => this.runTournament());
        }
        if (this.tournamentCloseBtn) {
            this.tournamentCloseBtn.addEventListener('click', () => this.closeResults());
        }
        if (this.tournamentDoneBtn) {
            this.tournamentDoneBtn.addEventListener('click', () => this.closeResults());
        }
    }

    closeResults() {
        this.tournamentResultsModal.classList.add('hidden');
        this.setupModal.classList.remove('hidden');
    }

    async runTournament() {
        const config = this.configManager.getGameConfig();
        const gameCount = parseInt(this.configManager.elements.tournamentGamesInput.value);
        const botCount = config.botCount;

        if (botCount < 2) {
            Dialog.alert('Need at least 2 bots for a tournament');
            return;
        }

        const configSummary = `<div class="tournament-summary">${config.mapWidth}x${config.mapHeight} sides:${config.diceSides} max:${config.maxDice}</div>`;

        // Show progress
        this.tournamentResults.innerHTML = `
            ${configSummary}
            <div class="tournament-progress">
                <div>Running tournament: <span id="tournament-progress-text">0/${gameCount}</span></div>
                <div class="tournament-progress-bar">
                    <div class="tournament-progress-fill" id="tournament-progress-fill" style="width: 0%"></div>
                </div>
            </div>
        `;
        this.setupModal.classList.add('hidden');
        this.tournamentResultsModal.classList.remove('hidden');

        const results = {};

        for (let i = 0; i < gameCount; i++) {
            // Create a headless game
            const tourneyGame = new Game();
            tourneyGame.startGame({
                humanCount: 0,
                botCount,
                mapWidth: config.mapWidth,
                mapHeight: config.mapHeight,
                maxDice: config.maxDice,
                diceSides: config.diceSides,
                mapStyle: config.mapStyle,
                gameMode: config.gameMode
            });

            // Assign names and create AI instances for each player
            const aiInstances = new Map();
            tourneyGame.players.forEach(p => {
                const aiId = config.botAI || 'easy';
                const ai = createAI(aiId, tourneyGame, p.id);
                aiInstances.set(p.id, ai);
                p.name = `${ai.name} ${p.id}`;
                p.aiId = aiId;
            });

            // Run game to completion (fast mode - no delays)
            let turns = 0;
            const maxTurns = 2000;

            while (!tourneyGame.gameOver && turns < maxTurns) {
                const currentPlayer = tourneyGame.currentPlayer;
                const ai = aiInstances.get(currentPlayer.id);

                if (ai) {
                    try {
                        await ai.takeTurn('fast');
                    } catch (e) {
                        console.warn(`Tournament AI Turn Error:`, e);
                    }
                }
                tourneyGame.endTurn();
                turns++;
            }

            // Record result
            if (tourneyGame.winner) {
                const winnerId = tourneyGame.winner.id;
                const ai = aiInstances.get(winnerId);
                const key = `${ai?.name || 'Bot'} ${winnerId}`;
                results[key] = (results[key] || 0) + 1;
            }

            // Update progress
            const progress = ((i + 1) / gameCount * 100).toFixed(1);
            document.getElementById('tournament-progress-text').textContent = `${i + 1}/${gameCount}`;
            document.getElementById('tournament-progress-fill').style.width = progress + '%';

            // Yield to UI
            if (i % 10 === 0) {
                await new Promise(r => setTimeout(r, 0));
            }
        }

        // Show results
        const sortedResults = Object.entries(results)
            .sort((a, b) => b[1] - a[1]);

        this.tournamentResults.innerHTML = configSummary + sortedResults.map(([name, wins], index) => {
            const percent = (wins / gameCount * 100).toFixed(1);
            return `
                <div class="tournament-result-row ${index === 0 ? 'winner' : ''}">
                    <span class="tournament-rank">${index === 0 ? '🏆' : index + 1}</span>
                    <span class="tournament-ai-name">${name}</span>
                    <span class="tournament-wins">${wins} wins</span>
                    <span class="tournament-percent">${percent}%</span>
                </div>
            `;
        }).join('');
    }
}
