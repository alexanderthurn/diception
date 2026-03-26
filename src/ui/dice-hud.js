/**
 * DiceHUD - Manages the dice result HUD display
 */
export class DiceHUD {
    constructor() {
        this.diceResultHud = document.getElementById('dice-result-hud');
        this.diceResultContent = document.getElementById('dice-result-content');
        this.hideTimeout = null;
        this.diceDataURL = null;
        // Set to true when the user manually dismisses the small HUD in beginner mode.
        // Skips the dramatic overlay for the rest of the game session.
        this.skipDramatic = false;

        // Allow clicking to dismiss
        if (this.diceResultHud) {
            this.diceResultHud.style.pointerEvents = 'auto';
            this.diceResultHud.style.cursor = 'pointer';
            this.diceResultHud.addEventListener('click', () => {
                this.skipDramatic = true;
                this.hide();
            });
        }
    }

    resetSession() {
        this.skipDramatic = false;
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
        if (gameSpeed !== 'beginner') {
            this.hideTimeout = setTimeout(() => {
                this.diceResultHud.classList.add('hidden');
            }, 1500);
        }
    }

    showDramaticAttackResult(result, attacker, defender, sfx, getPlayerName, onComplete) {
        const overlay = document.getElementById('attack-overlay');
        const panel   = document.getElementById('attack-panel');
        if (!overlay) { onComplete?.(); return; }

        const attackerColor = attacker ? '#' + attacker.color.toString(16).padStart(6, '0') : '#fff';
        const defenderColor = defender ? '#' + defender.color.toString(16).padStart(6, '0') : '#fff';

        // Reset all elements
        const roleRowA = document.getElementById('attack-attacker-role');
        const roleRowD = document.getElementById('attack-defender-role');
        const diceRowA = document.getElementById('attack-attacker-dice');
        const diceRowD = document.getElementById('attack-defender-dice');
        const sumA     = document.getElementById('attack-attacker-sum');
        const sumD     = document.getElementById('attack-defender-sum');
        const cmpSign  = document.getElementById('attack-compare-sign');
        const banner   = document.getElementById('attack-result-banner');

        if (roleRowA) roleRowA.style.borderBottomColor = attackerColor;
        if (roleRowD) roleRowD.style.borderBottomColor = defenderColor;
        diceRowA.innerHTML = '';
        diceRowD.innerHTML = '';
        sumA.textContent = '';
        sumA.className = 'attack-side-sum';
        sumD.textContent = '';
        sumD.className = 'attack-side-sum';
        cmpSign.textContent = '';
        cmpSign.className = 'attack-compare-sign';
        banner.textContent = '';
        banner.className = 'attack-result-banner';

        panel.style.borderColor = attackerColor;
        panel.style.boxShadow   = `0 0 60px rgba(0,0,0,0.9), 0 0 24px ${attackerColor}44`;

        let dismissed = false;
        let autoTimer = null;

        const dismiss = (manual = false) => {
            if (dismissed) return;
            dismissed = true;
            clearTimeout(autoTimer);
            if (manual) this.skipDramatic = true;
            overlay.classList.add('hidden');
            onComplete?.();
        };
        overlay.addEventListener('click', () => dismiss(true), { once: true });
        overlay.classList.remove('hidden');

        const wait = ms => new Promise(r => setTimeout(r, ms));

        const rollDice = async (container, rolls, color) => {
            const els = rolls.map(() => {
                const die = document.createElement('span');
                die.className = 'attack-die rolling';
                die.style.borderColor = color;
                die.style.color = color;
                die.textContent = '?';
                container.appendChild(die);
                return die;
            });
            await wait(280);
            const perDie = Math.max(35, Math.min(70, 350 / rolls.length));
            for (let i = 0; i < rolls.length; i++) {
                if (dismissed) return;
                els[i].textContent = rolls[i];
                els[i].classList.remove('rolling');
                els[i].classList.add('revealed');
                sfx?.coin();
                if (i < rolls.length - 1) await wait(perDie);
            }
        };

        (async () => {
            await rollDice(diceRowA, result.attackerRolls, attackerColor);
            if (dismissed) return;
            sumA.textContent = `= ${result.attackerSum}`;
            sumA.classList.add('visible');

            await wait(160);
            if (dismissed) return;

            await rollDice(diceRowD, result.defenderRolls, defenderColor);
            if (dismissed) return;
            sumD.textContent = `= ${result.defenderSum}`;
            sumD.classList.add('visible');

            await wait(220);
            if (dismissed) return;

            cmpSign.textContent = result.won ? '>' : '≤';
            cmpSign.classList.add(result.won ? 'win' : 'loss', 'visible');

            sumA.style.color = attackerColor;
            sumD.style.color = defenderColor;
            if (result.won) {
                sumA.classList.add('winner');
                sumD.classList.add('loser');
            } else {
                sumD.classList.add('winner');
                sumA.classList.add('loser');
            }

            await wait(280);
            if (dismissed) return;

            banner.innerHTML = result.won
                ? '<span class="sprite-icon icon-check"></span>  VICTORY'
                : '<span class="sprite-icon icon-cross"></span>  DEFEAT';
            banner.classList.add(result.won ? 'win' : 'defeat', 'visible');

            autoTimer = setTimeout(dismiss, 1800);
        })();
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

        clearTimeout(this.hideTimeout);
        if (gameSpeed !== 'beginner') {
            const hideDelay = isHuman ? 3000 : 2000;
            this.hideTimeout = setTimeout(() => {
                this.diceResultHud.classList.add('hidden');
            }, hideDelay);
        }
    }
}
