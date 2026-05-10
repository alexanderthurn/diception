/**
 * Speed level descriptions for the speed-up dialog.
 * Shared between game-events.js and scenario-browser.js.
 */

const SPEED_DESCRIPTIONS = {
    beginner: [
        'Full animations & dice rolls',
        'Win chances & input hints shown',
        'Slow bot turns',
    ],
    normal: [
        'Faster animations',
        'Win chances shown',
        'Fast bot turns',
    ],
    expert: [
        'No animations',
        'No win chances',
        'One-click attack shortcut',
        'Instant bot turns',
    ],
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
        li.textContent = text;
        ul.appendChild(li);
    }
}
