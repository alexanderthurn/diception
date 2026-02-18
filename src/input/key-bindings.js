/**
 * Key Bindings - Configurable input bindings for keyboard and gamepad.
 * Stored in localStorage as 'dicy_key_bindings' (single JSON object).
 *
 * Keys use e.code.toLowerCase() values (e.g. 'keyw', 'arrowup', 'space').
 * Gamepad bindings use button index numbers.
 *
 * Designed to be backend-agnostic: a future SteamInput adapter would skip
 * this system and emit semantic events directly.
 */

const STORAGE_KEY = 'dicy_key_bindings';

/**
 * Configurable game actions.
 * keyboardOnly: true  → shown only in keyboard config (no gamepad binding).
 * gamepadOnly:  true  → shown only in gamepad config  (no keyboard binding).
 */
export const GAME_ACTIONS = [
    { id: 'move_up',           label: 'Attack Up' },
    { id: 'move_down',         label: 'Attack Down' },
    { id: 'move_left',         label: 'Attack Left' },
    { id: 'move_right',        label: 'Attack Right' },
    { id: 'confirm',           label: 'Select' },
    { id: 'cancel',            label: 'Deselect' },
    { id: 'end_turn',          label: 'End Turn' },
    { id: 'zoom_in',           label: 'Zoom In' },
    { id: 'zoom_out',          label: 'Zoom Out' },
    { id: 'pan_up',            label: 'Camera Up',       keyboardOnly: true },
    { id: 'pan_down',          label: 'Camera Down',     keyboardOnly: true },
    { id: 'pan_left',          label: 'Camera Left',     keyboardOnly: true },
    { id: 'pan_right',         label: 'Camera Right',    keyboardOnly: true },
    { id: 'gamepad_drag',      label: 'Hold to Pan Map', gamepadOnly:  true },
    { id: 'cursor_speed_down', label: 'Cursor Speed -',  gamepadOnly:  true },
    { id: 'cursor_speed_up',   label: 'Cursor Speed +',  gamepadOnly:  true },
];

/**
 * Default bindings. Each entry is an array of codes to support alternates.
 * keyboard: e.code.toLowerCase() values
 * gamepad:  button index numbers
 */
export const DEFAULT_BINDINGS = {
    keyboard: {
        move_up:    ['keyw', 'arrowup'],
        move_down:  ['keys', 'arrowdown'],
        move_left:  ['keya', 'arrowleft'],
        move_right: ['keyd', 'arrowright'],
        confirm:    ['keye', 'shiftright'],
        cancel:     ['keyq'],
        end_turn:   ['space', 'enter'],
        menu:       ['escape'],
        zoom_in:    ['equal'],
        zoom_out:   ['minus'],
        pan_up:     ['keyi'],
        pan_down:   ['keyk'],
        pan_left:   ['keyj'],
        pan_right:  ['keyl'],
    },
    gamepad: {
        confirm:          [0],
        cancel:           [2],
        end_turn:         [3],
        menu:             [9],
        move_up:          [12],
        move_down:        [13],
        move_left:        [14],
        move_right:       [15],
        zoom_in:          [7],
        zoom_out:         [6],
        gamepad_drag:     [1],
        cursor_speed_down:[4],
        cursor_speed_up:  [5],
    },
};

/** Human-readable display names for key codes (e.code.toLowerCase()). */
const KEY_DISPLAY_NAMES = {
    'keyw': 'W', 'keya': 'A', 'keys': 'S', 'keyd': 'D',
    'keyi': 'I', 'keyj': 'J', 'keyk': 'K', 'keyl': 'L',
    'keye': 'E', 'keyq': 'Q', 'keyr': 'R', 'keyf': 'F',
    'keyg': 'G', 'keyh': 'H', 'keyt': 'T', 'keyy': 'Y',
    'keyu': 'U', 'keyo': 'O', 'keyp': 'P', 'keyz': 'Z',
    'keyx': 'X', 'keyc': 'C', 'keyv': 'V', 'keyb': 'B',
    'keyn': 'N', 'keym': 'M',
    'arrowup': '↑', 'arrowdown': '↓', 'arrowleft': '←', 'arrowright': '→',
    'space': 'Space', 'enter': 'Enter', 'escape': 'Esc', 'tab': 'Tab',
    'backspace': 'Backspace', 'delete': 'Delete',
    'shiftright': 'R.Shift', 'shiftleft': 'L.Shift',
    'controlleft': 'L.Ctrl', 'controlright': 'R.Ctrl',
    'altleft': 'L.Alt', 'altright': 'R.Alt',
    'equal': '+', 'minus': '-', 'bracketleft': '[', 'bracketright': ']',
    'digit1': '1', 'digit2': '2', 'digit3': '3', 'digit4': '4',
    'digit5': '5', 'digit6': '6', 'digit7': '7', 'digit8': '8',
    'digit9': '9', 'digit0': '0',
    'numpad0': 'Num0', 'numpad1': 'Num1', 'numpad2': 'Num2',
    'numpad3': 'Num3', 'numpad4': 'Num4', 'numpad5': 'Num5',
    'numpad6': 'Num6', 'numpad7': 'Num7', 'numpad8': 'Num8', 'numpad9': 'Num9',
    'f1': 'F1', 'f2': 'F2', 'f3': 'F3', 'f4': 'F4',
    'f5': 'F5', 'f6': 'F6', 'f7': 'F7', 'f8': 'F8',
};

/** Human-readable display names for gamepad buttons (standard mapping). */
const GAMEPAD_BUTTON_NAMES = {
    0: 'A', 1: 'B', 2: 'X', 3: 'Y',
    4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2',
    8: 'Back', 9: 'Start',
    10: 'L3', 11: 'R3',
    12: 'D↑', 13: 'D↓', 14: 'D←', 15: 'D→',
};

/**
 * Load bindings from localStorage, merging with defaults for any missing entries.
 */
export function loadBindings() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return deepClone(DEFAULT_BINDINGS);
    try {
        const parsed = JSON.parse(stored);
        return {
            keyboard: { ...DEFAULT_BINDINGS.keyboard, ...parsed.keyboard },
            gamepad:  { ...DEFAULT_BINDINGS.gamepad,  ...parsed.gamepad  },
        };
    } catch {
        return deepClone(DEFAULT_BINDINGS);
    }
}

/** Save bindings object to localStorage. */
export function saveBindings(bindings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
}

/** Reset to defaults, save, and return the default bindings. */
export function resetBindings() {
    const defaults = deepClone(DEFAULT_BINDINGS);
    saveBindings(defaults);
    return defaults;
}

/** Pretty-print a key code for display (e.g. 'keyw' → 'W'). */
export function getKeyDisplayName(code) {
    if (!code) return '-';
    return KEY_DISPLAY_NAMES[code] || code;
}

/** Pretty-print multiple key codes joined by ' / '. */
export function getKeysDisplayName(codes) {
    if (!codes || codes.length === 0) return '-';
    return codes.map(getKeyDisplayName).join(' / ');
}

/** Pretty-print a gamepad button index (e.g. 0 → 'A'). */
export function getGamepadButtonName(index) {
    return GAMEPAD_BUTTON_NAMES[index] ?? `Btn${index}`;
}

/** Pretty-print multiple gamepad button indices joined by ' / '. */
export function getGamepadButtonsName(indices) {
    if (!indices || indices.length === 0) return '-';
    return indices.map(getGamepadButtonName).join(' / ');
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}
