/**
 * Input Hints Utility
 * Detects active input method and provides button hints for UI
 */
import { loadBindings, getKeyDisplayName, getGamepadButtonName } from '../input/key-bindings.js';

// Action constants
export const ACTION_MOVE_UP = 'move_up';
export const ACTION_MOVE_DOWN = 'move_down';
export const ACTION_MOVE_LEFT = 'move_left';
export const ACTION_MOVE_RIGHT = 'move_right';
export const ACTION_END_TURN = 'end_turn';
export const ACTION_ASSIGN = 'assign';
export const ACTION_DICE = 'dice';
export const ACTION_ATTACK = 'attack';

// Map hint action constants to binding system action IDs
const HINT_TO_BINDING_ID = {
    [ACTION_MOVE_UP]:    'move_up',
    [ACTION_MOVE_DOWN]:  'move_down',
    [ACTION_MOVE_LEFT]:  'move_left',
    [ACTION_MOVE_RIGHT]: 'move_right',
    [ACTION_END_TURN]:   'end_turn',
    [ACTION_ATTACK]:     'confirm',
    // ACTION_ASSIGN and ACTION_DICE are not in the binding system
};

/** Map gamepad button index to CSS style class. */
function getGamepadButtonStyle(buttonIndex) {
    const faceStyles = { 0: 'gamepad-a', 1: 'gamepad-b', 2: 'gamepad-x', 3: 'gamepad-y' };
    if (buttonIndex >= 12 && buttonIndex <= 15) return 'gamepad-dpad';
    return faceStyles[buttonIndex] ?? 'gamepad-btn';
}

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
    if (!inputType) return null;

    const bindingId = HINT_TO_BINDING_ID[action];
    if (bindingId) {
        const bindings = loadBindings();
        if (inputType === 'keyboard') {
            const codes = bindings.keyboard[bindingId];
            const label = codes && codes.length > 0 ? getKeyDisplayName(codes[0]) : '-';
            return { label, type: 'keyboard', style: 'keyboard' };
        } else {
            const buttons = bindings.gamepad[bindingId];
            if (buttons && buttons.length > 0) {
                const btnIndex = buttons[0];
                return { label: getGamepadButtonName(btnIndex), type: 'gamepad', style: getGamepadButtonStyle(btnIndex) };
            }
            return null;
        }
    }

    // Hardcoded for non-configurable actions (not in the binding system)
    const staticHints = {
        keyboard: {
            [ACTION_ASSIGN]: { label: 'R', type: 'keyboard', style: 'keyboard' },
            [ACTION_DICE]:   { label: 'F', type: 'keyboard', style: 'keyboard' },
        },
        gamepad: {
            [ACTION_ASSIGN]: { label: '◄', type: 'gamepad', style: 'gamepad-dpad' },
            [ACTION_DICE]:   { label: '►', type: 'gamepad', style: 'gamepad-dpad' },
        }
    };
    return staticHints[inputType]?.[action] ?? null;
}
