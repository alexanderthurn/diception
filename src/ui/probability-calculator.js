/**
 * ProbabilityCalculator - Handles the interactive probability table in How-To modal
 */
import { getProbabilityTable, getProbabilityColor } from '../core/probability.js';
import { GAME } from '../core/constants.js';

export class ProbabilityCalculator {
    constructor() {
        this.diceSidesSelect = document.getElementById('prob-dice-sides');
        this.attackRuleSelect = document.getElementById('prob-attack-rule');
        this.tableBody = document.getElementById('probability-table-body');
        this.tableHead = document.querySelector('#probability-table thead tr');
        this.maxDice = GAME.MAX_DICE_PER_TERRITORY;

        if (this.diceSidesSelect && this.tableBody) {
            this.init();
        }
    }

    init() {
        // Generate dice sides options dynamically
        this.generateDiceSidesOptions();

        // Generate table header dynamically
        this.generateTableHeader();

        // Generate initial table
        this.updateTable();

        // Listen for changes
        this.diceSidesSelect.addEventListener('change', () => this.updateTable());
        this.attackRuleSelect?.addEventListener('change', () => this.updateTable());
    }

    generateDiceSidesOptions() {
        // Clear existing options
        this.diceSidesSelect.innerHTML = '';

        // Generate options for 1 to MAX_DICE_SIDES
        for (let i = 1; i <= GAME.MAX_DICE_SIDES; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `${i}-sided`;
            if (i === 6) option.selected = true; // Default to D6
            this.diceSidesSelect.appendChild(option);
        }
    }

    generateTableHeader() {
        if (!this.tableHead) return;

        this.tableHead.innerHTML = '';

        // Corner: rows = attacker, cols = defender
        const cornerTh = document.createElement('th');
        cornerTh.className = 'sticky-col';
        cornerTh.innerHTML = '<span class="sprite-icon icon-attack"></span> \\ <span class="sprite-icon icon-defend"></span>';
        this.tableHead.appendChild(cornerTh);

        // Column headers = defender dice counts (1..maxDice)
        for (let i = 1; i <= this.maxDice; i++) {
            const th = document.createElement('th');
            th.textContent = i;
            this.tableHead.appendChild(th);
        }
    }

    updateTable() {
        const diceSides = parseInt(this.diceSidesSelect.value, 10);
        const attackRule = this.attackRuleSelect?.value || 'classic';
        const probTable = getProbabilityTable(diceSides, attackRule);

        this.tableBody.innerHTML = '';

        if (!probTable || probTable.length === 0) {
            console.warn(`No probability table for ${diceSides}-sided dice`);
            return;
        }

        // Rows = attacker dice counts (2..maxDice)
        for (let attacker = 2; attacker <= this.maxDice; attacker++) {
            const row = document.createElement('tr');

            const attackerCell = document.createElement('td');
            attackerCell.className = 'sticky-col';
            attackerCell.textContent = attacker;
            row.appendChild(attackerCell);

            // Columns = defender dice counts (1..maxDice)
            for (let defender = 1; defender <= this.maxDice; defender++) {
                const cell = document.createElement('td');
                const probability = probTable[attacker - 1][defender - 1];
                const percentValue = probability * 100;
                const percentStr = percentValue < 1
                    ? percentValue.toFixed(2).replace(/^0/, '')
                    : Math.round(percentValue).toString();

                cell.textContent = `${percentStr}%`;
                cell.className = getProbabilityColor(probability);

                row.appendChild(cell);
            }

            this.tableBody.appendChild(row);
        }
    }
}
