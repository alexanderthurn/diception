/**
 * ProbabilityCalculator - Handles the interactive probability table in How-To modal
 */
import { generateProbabilityTable, getProbabilityColor, clearProbabilityCache } from '../core/probability.js';

export class ProbabilityCalculator {
    constructor() {
        this.diceSidesSelect = document.getElementById('prob-dice-sides');
        this.tableBody = document.getElementById('probability-table-body');
        this.maxDice = 9;

        if (this.diceSidesSelect && this.tableBody) {
            this.init();
        }
    }

    init() {
        // Generate initial table
        this.updateTable();

        // Listen for dice sides changes
        this.diceSidesSelect.addEventListener('change', () => {
            clearProbabilityCache();
            this.updateTable();
        });
    }

    updateTable() {
        const diceSides = parseInt(this.diceSidesSelect.value, 10);
        const probTable = generateProbabilityTable(this.maxDice, diceSides);

        // Clear existing rows
        this.tableBody.innerHTML = '';

        // Generate rows
        for (let attacker = 1; attacker <= this.maxDice; attacker++) {
            const row = document.createElement('tr');

            // Attacker dice count (sticky column)
            const attackerCell = document.createElement('td');
            attackerCell.className = 'sticky-col';
            attackerCell.textContent = attacker;
            row.appendChild(attackerCell);

            // Probability cells for each defender count
            for (let defender = 1; defender <= this.maxDice; defender++) {
                const cell = document.createElement('td');
                const probability = probTable[attacker - 1][defender - 1];
                const percent = Math.round(probability * 100);

                cell.textContent = `${percent}%`;
                cell.className = getProbabilityColor(probability);

                row.appendChild(cell);
            }

            this.tableBody.appendChild(row);
        }
    }
}
