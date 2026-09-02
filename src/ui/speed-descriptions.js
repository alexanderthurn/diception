/**
 * Speed level descriptions for the speed-up dialog.
 * Shared between game-events.js and scenario-browser.js.
 */

import { t } from '../core/i18n.js';

const SPEED_DESCRIPTIONS = {
    beginner: ['speed.beginner_1', 'speed.beginner_2', 'speed.beginner_3'],
    normal:   ['speed.normal_1', 'speed.normal_2', 'speed.normal_3'],
    expert:   ['speed.expert_1', 'speed.expert_2', 'speed.expert_3', 'speed.expert_4'],
};

/**
 * Create a <ul> element showing the description for the given speed.
 * @param {string} speed - 'beginner' | 'normal' | 'expert'
 * @returns {HTMLUListElement}
 */
export function createSpeedDescription(speed) {
    const ul = document.createElement('ul');
    ul.className = 'speed-description';
    updateSpeedDescription(ul, speed);
    return ul;
}

/**
 * Update an existing description list to show the given speed's bullets.
 * @param {HTMLUListElement} ul
 * @param {string} speed
 */
export function updateSpeedDescription(ul, speed) {
    const items = SPEED_DESCRIPTIONS[speed] || SPEED_DESCRIPTIONS.beginner;
    ul.innerHTML = '';
    for (const text of items) {
        const li = document.createElement('li');
        li.textContent = t(text);
        ul.appendChild(li);
    }
}
