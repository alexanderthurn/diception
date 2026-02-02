/**
 * Input Hints Utility
 * Detects active input method and provides button hints for UI
 */

// Action constants
export const ACTION_MOVE_UP = 'move_up';
export const ACTION_MOVE_DOWN = 'move_down';
export const ACTION_MOVE_LEFT = 'move_left';
export const ACTION_MOVE_RIGHT = 'move_right';
export const ACTION_END_TURN = 'end_turn';

/**
 * Detect active input type based on connected devices
 * Priority: Gamepad > Keyboard > Touch-only (null)
 * @param {InputManager} inputManager 
 * @returns {'keyboard'|'gamepad'|null} Input type or null if touch-only
 */
export function getActiveInputType(inputManager) {
    // 1. Check gamepad first (highest priority, even on touch devices)
    if (inputManager && inputManager.gamepadStates.size > 0) {
        return 'gamepad';
    }

    // 2. Check if touch-only device (no keyboard/mouse)
    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const isTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isTouchOnly = isTouchScreen && isCoarsePointer;

    if (isTouchOnly) {
        return null; // Don't show hints
    }

    // 3. Default to keyboard (desktop/laptop)
    return 'keyboard';
}

/**
 * Check if input hints should be shown
 * @param {InputManager} inputManager 
 * @returns {boolean} True if hints should be shown
 */
export function shouldShowInputHints(inputManager) {
    return getActiveInputType(inputManager) !== null;
}

/**
 * Get input hint for a specific action
 * @param {string} action - Action constant
 * @param {InputManager} inputManager 
 * @returns {{label: string, type: string, style: string}|null} Hint object or null
 */
export function getInputHint(action, inputManager) {
    const inputType = getActiveInputType(inputManager);

    if (!inputType) {
        return null;
    }

    const hints = {
        keyboard: {
            [ACTION_MOVE_UP]: { label: 'W', type: 'keyboard', style: 'keyboard' },
            [ACTION_MOVE_DOWN]: { label: 'S', type: 'keyboard', style: 'keyboard' },
            [ACTION_MOVE_LEFT]: { label: 'A', type: 'keyboard', style: 'keyboard' },
            [ACTION_MOVE_RIGHT]: { label: 'D', type: 'keyboard', style: 'keyboard' },
            [ACTION_END_TURN]: { label: 'Space', type: 'keyboard', style: 'keyboard' }
        },
        gamepad: {
            // D-pad buttons for Xbox layout
            [ACTION_MOVE_UP]: { label: '▲', type: 'gamepad', style: 'gamepad-dpad' },
            [ACTION_MOVE_DOWN]: { label: '▼', type: 'gamepad', style: 'gamepad-dpad' },
            [ACTION_MOVE_LEFT]: { label: '◄', type: 'gamepad', style: 'gamepad-dpad' },
            [ACTION_MOVE_RIGHT]: { label: '►', type: 'gamepad', style: 'gamepad-dpad' },
            // Y button (yellow) for end turn
            [ACTION_END_TURN]: { label: 'Y', type: 'gamepad', style: 'gamepad-y' }
        }
    };

    return hints[inputType]?.[action] || null;
}
