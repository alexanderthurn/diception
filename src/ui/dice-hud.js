/**
 * DiceHUD - Manages the dice result HUD display
 */
export class DiceHUD {
    constructor() {
        this.diceResultHud = document.getElementById('dice-result-hud');
        this.diceResultContent = document.getElementById('dice-result-content');
        this.hideTimeout = null;
        this.diceDataURL = null;
    }

    setDiceDataURL(url) {
        this.diceDataURL = url;
    }

    hide() {
        this.diceResultHud.classList.add('hidden');
        clearTimeout(this.hideTimeout);
    }

    buildDiceDisplay(count, sum, color) {
        let icons = '';
        const diceIconHtml = `<span class="dice-icon-sprite" style="background-color: ${color}; -webkit-mask-image: url(${this.diceDataURL}); mask-image: url(${this.diceDataURL});"></span>`;

        if (count > 6) {
            icons = `<span style="color:${color}; font-weight: bold; font-size: 16px; margin-right: 2px;">${count}x</span>${diceIconHtml}`;
        } else {
            for (let i = 0; i < count; i++) {
                icons += diceIconHtml;
                if (i < count - 1) icons += '<span class="dice-plus">+</span>';
            }
        }
        return `${icons}<span class="dice-sum" style="color:${color}">${sum}</span>`;
    }

    showAttackResult(result, attacker, defender, gameSpeed, autoplayPlayers) {
        const isHumanAttacker = attacker && !attacker.isBot && !autoplayPlayers.has(attacker.id);
        const shouldShowHUD = gameSpeed === 'beginner' || (gameSpeed === 'normal' && isHumanAttacker);

        if (!shouldShowHUD) return;

        const attackerColor = attacker ? '#' + attacker.color.toString(16).padStart(6, '0') : '#ffffff';
        const defenderColor = defender ? '#' + defender.color.toString(16).padStart(6, '0') : '#ffffff';
        const attackSum = result.attackerRolls?.reduce((a, b) => a + b, 0) || '?';
        const defendSum = result.defenderRolls?.reduce((a, b) => a + b, 0) || '?';

        this.diceResultContent.innerHTML = `
            <div class="dice-group">
                ${this.buildDiceDisplay(result.attackerRolls.length, attackSum, attackerColor)}
            </div>
            <span class="vs-indicator ${result.won ? 'win' : 'loss'}">${result.won ? '>' : '≤'}</span>
            <div class="dice-group">
                ${this.buildDiceDisplay(result.defenderRolls.length, defendSum, defenderColor)}
            </div>
        `;

        this.diceResultHud.style.borderColor = attackerColor;
        this.diceResultHud.style.boxShadow = `0 0 15px ${attackerColor}40`;
        this.diceResultHud.classList.remove('hidden');

        clearTimeout(this.hideTimeout);
        this.hideTimeout = setTimeout(() => {
            this.diceResultHud.classList.add('hidden');
        }, 1500);
    }

    showReinforcements(data, gameSpeed, autoplayPlayers) {
        const isHuman = !data.player.isBot && !autoplayPlayers.has(data.player.id);
        const shouldShowHUD = gameSpeed === 'beginner' || (gameSpeed === 'normal' && isHuman);

        if (!shouldShowHUD || (data.placed <= 0 && data.stored <= 0)) return;

        const playerColor = '#' + data.player.color.toString(16).padStart(6, '0');
        const fontSize = isHuman ? 36 : 24;
        const storedSize = isHuman ? 20 : 14;

        let content = `<span style="color:${playerColor}; font-size: ${fontSize}px; font-weight: bold; display: flex; align-items: center; gap: 4px;">+${data.placed} <span class="dice-icon-sprite" style="width: ${fontSize}px; height: ${fontSize}px; background-color: ${playerColor}; -webkit-mask-image: url(${this.diceDataURL}); mask-image: url(${this.diceDataURL});"></span></span>`;
        if (data.stored > 0) {
            content += ` <span style="color:#ffaa00; font-size: ${storedSize}px;">(${data.stored} saved)</span>`;
        }

        this.diceResultContent.innerHTML = content;
        this.diceResultHud.style.borderColor = playerColor;
        this.diceResultHud.style.boxShadow = `0 0 ${isHuman ? 25 : 15}px ${playerColor}60`;
        this.diceResultHud.style.padding = isHuman ? '12px 24px' : '6px 16px';
        this.diceResultHud.classList.remove('hidden');

        if (isHuman) {
            this.diceResultHud.style.animation = 'reinforce-bounce 0.5s ease-out';
            this.diceResultHud.addEventListener('animationend', () => {
                this.diceResultHud.style.animation = '';
            }, { once: true });
        }

        const hideDelay = isHuman ? 3000 : 2000;
        clearTimeout(this.hideTimeout);
        this.hideTimeout = setTimeout(() => {
            this.diceResultHud.classList.add('hidden');
        }, hideDelay);
    }
}
