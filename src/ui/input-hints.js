/**
 * Input Hints Utility
 * Detects active input method and provides button hints for UI
 */
import { loadBindings, getKeyDisplayName, getGamepadButtonName } from '../input/key-bindings.js';
import { detectControllerType, buttonIconHTML, buttonTextureName } from '../input/controller-icons.js';

// Action constants
export const ACTION_MOVE_UP = 'move_up';
export const ACTION_MOVE_DOWN = 'move_down';
export const ACTION_MOVE_LEFT = 'move_left';
export const ACTION_MOVE_RIGHT = 'move_right';
export const ACTION_END_TURN = 'end_turn';
export const ACTION_MENU = 'menu';
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
    [ACTION_MENU]:       'menu',
    [ACTION_ATTACK]:     'confirm',
    // ACTION_ASSIGN and ACTION_DICE are not in the binding system
};

/** Map gamepad button index to CSS style class (fallback when no sprite available). */
function getGamepadButtonStyle(buttonIndex) {
    const faceStyles = { 0: 'gamepad-a', 1: 'gamepad-b', 2: 'gamepad-x', 3: 'gamepad-y' };
    if (buttonIndex >= 12 && buttonIndex <= 15) return 'gamepad-dpad';
    return faceStyles[buttonIndex] ?? 'gamepad-btn';
}

/** Controller-type-aware button text label (used in Pixi canvas where CSS sprites can't render). */
const PS_BUTTON_LABELS = {
    0: '✕', 1: '○', 2: '□', 3: '△',
    4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2',
    8: 'Share', 9: 'Options',
    10: 'L3', 11: 'R3',
    12: 'D↑', 13: 'D↓', 14: 'D←', 15: 'D→',
};
function getButtonLabel(controllerType, btnIndex) {
    if (controllerType === 'ps4' || controllerType === 'ps5') {
        return PS_BUTTON_LABELS[btnIndex] ?? getGamepadButtonName(btnIndex);
    }
    return getGamepadButtonName(btnIndex);
}

/**
 * Return the best connected Gamepad object.
 * If preferHumanIndex is given, prefer the gamepad mapped to that human player.
 */
function getActiveGamepad(inputManager, preferHumanIndex) {
    const gamepads = navigator.getGamepads();

    // Prefer the gamepad belonging to the specified human player
    if (preferHumanIndex !== undefined && inputManager?.gamepadToHumanMap) {
        for (const [gpIndex, humanIndex] of inputManager.gamepadToHumanMap) {
            if (humanIndex === preferHumanIndex && gamepads[gpIndex]) {
                return gamepads[gpIndex];
            }
        }
    }

    // Fall back to first gamepad tracked by input manager
    if (inputManager?.gamepadStates) {
        for (const [index] of inputManager.gamepadStates) {
            if (gamepads[index]) return gamepads[index];
        }
    }

    // Final fallback: any raw gamepad (catches freshly connected pads before first poll)
    for (const gp of gamepads) {
        if (gp) return gp;
    }
    return null;
}

/**
 * Detect active input type based on connected devices
 * Priority: Gamepad > Keyboard > Touch-only (null)
 * @param {InputManager} inputManager
 * @returns {'keyboard'|'gamepad'|null} Input type or null if touch-only
 */
export function getActiveInputType(inputManager) {
    // 1. Check gamepad first (highest priority, even on touch devices).
    //    Check both gamepadStates (populated after first poll) and raw navigator API
    //    (catches gamepads connected before the first polling cycle runs).
    if (inputManager?.gamepadStates?.size > 0) return 'gamepad';
    const rawGamepads = navigator.getGamepads();
    if (rawGamepads && Array.from(rawGamepads).some(gp => gp !== null)) return 'gamepad';

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
 * Get input hint for a specific action.
 * @param {string} action - Action constant
 * @param {InputManager} inputManager
 * @param {number} [preferHumanIndex] - Human player index to prefer when multiple gamepads connected
 * @returns {{label: string, html?: string, type: string, style: string}|null}
 */
export function getInputHint(action, inputManager, preferHumanIndex) {
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
                const gp = getActiveGamepad(inputManager, preferHumanIndex);
                const controllerType = gp ? detectControllerType(gp) : 'xbox';
                const label = getButtonLabel(controllerType, btnIndex);
                const html = buttonIconHTML(controllerType, btnIndex);
                const textureName = buttonTextureName(controllerType, btnIndex);
                if (html) return { html, label, textureName, type: 'gamepad', style: 'gamepad-sprite' };
                // Fallback to text if no sprite exists for this button
                return { label, type: 'gamepad', style: getGamepadButtonStyle(btnIndex) };
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
