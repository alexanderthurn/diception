/**
 * controller-icons.js
 * Maps gamepad button indices and keyboard codes to sprite CSS class names.
 *
 * Exports:
 *   detectControllerType(gamepad) → 'xbox' | 'ps4' | 'ps5'
 *   buttonIconHTML(controllerType, buttonIndex) → HTML string | null
 *   stickIconHTML(controllerType, side) → HTML string
 *   keyIconHTML(code) → HTML string | null
 */

// ---------------------------------------------------------------------------
// Controller type detection
// ---------------------------------------------------------------------------

/**
 * Identifies the controller family from the Web Gamepad API id string.
 * Falls back to 'xbox' for any unrecognised controller (covers generic XInput,
 * Steam Deck, and other Xbox-layout devices).
 *
 * @param {Gamepad} gamepad
 * @returns {'xbox' | 'ps4' | 'ps5'}
 */
export function detectControllerType(gamepad) {
    const id = gamepad.id.toLowerCase();
    // PS5 DualSense
    if (id.includes('dualsense') || id.includes('ps5') || id.includes('0ce6')) return 'ps5';
    // PS4 / generic PlayStation — '054c' is Sony's USB vendor ID.
    // 'wireless controller' is Sony's generic HID name, but exclude Xbox Wireless Controller.
    if (id.includes('dualshock') || id.includes('playstation') || id.includes('ps4') ||
        id.includes('054c') ||
        (id.includes('wireless controller') && !id.includes('xbox'))) return 'ps4';
    return 'xbox';
}

// ---------------------------------------------------------------------------
// Button index → CSS class maps  (W3C Standard Gamepad layout, buttons 0-15)
// ---------------------------------------------------------------------------

const XBOX_BUTTONS = {
    0:  'xbox-button-color-a',
    1:  'xbox-button-color-b',
    2:  'xbox-button-color-x',
    3:  'xbox-button-color-y',
    4:  'xbox-lb',
    5:  'xbox-rb',
    6:  'xbox-lt',
    7:  'xbox-rt',
    8:  'xbox-button-view',   // View (Xbox Series) / Back (Xbox 360)
    9:  'xbox-button-menu',   // Menu (Xbox Series) / Start (Xbox 360)
    10: 'xbox-ls',
    11: 'xbox-rs',
    12: 'xbox-dpad-up',
    13: 'xbox-dpad-down',
    14: 'xbox-dpad-left',
    15: 'xbox-dpad-right',
};

const PS4_BUTTONS = {
    0:  'playstation-button-color-cross',
    1:  'playstation-button-color-circle',
    2:  'playstation-button-color-square',
    3:  'playstation-button-color-triangle',
    4:  'playstation-trigger-l1',
    5:  'playstation-trigger-r1',
    6:  'playstation-trigger-l2',
    7:  'playstation-trigger-r2',
    8:  'playstation4-button-share',
    9:  'playstation4-button-options',
    10: 'playstation-button-l3',
    11: 'playstation-button-r3',
    12: 'playstation-dpad-up',
    13: 'playstation-dpad-down',
    14: 'playstation-dpad-left',
    15: 'playstation-dpad-right',
};

const PS5_BUTTONS = {
    ...PS4_BUTTONS,
    8: 'playstation5-button-create',
    9: 'playstation5-button-options',
};

const BUTTON_MAP = { xbox: XBOX_BUTTONS, ps4: PS4_BUTTONS, ps5: PS5_BUTTONS };

/**
 * Returns an icon <span> for a gamepad button, or null if unmapped.
 *
 * @param {'xbox'|'ps4'|'ps5'} controllerType
 * @param {number} buttonIndex  W3C standard gamepad button index (0-15)
 * @returns {string|null}
 */
export function buttonIconHTML(controllerType, buttonIndex) {
    const cls = BUTTON_MAP[controllerType]?.[buttonIndex];
    return cls ? `<span class="sprite-icon ${cls}"></span>` : null;
}

/**
 * Returns the Pixi atlas texture name for a gamepad button, for use with Texture.from().
 * Useful in canvas (Pixi) contexts where CSS sprites cannot be rendered.
 *
 * @param {'xbox'|'ps4'|'ps5'} controllerType
 * @param {number} buttonIndex
 * @returns {string|null}
 */
export function buttonTextureName(controllerType, buttonIndex) {
    const cls = BUTTON_MAP[controllerType]?.[buttonIndex];
    if (!cls) return null;
    const filename = cls.replace(/-/g, '_') + '.png';
    if (cls.startsWith('xbox')) return `controls/xbox/Default/${filename}`;
    if (cls.startsWith('playstation')) return `controls/playstation/Default/${filename}`;
    return null;
}

// ---------------------------------------------------------------------------
// Analog stick icons (not button indices — used for hints and the how-to table)
// ---------------------------------------------------------------------------

const STICK_SPRITES = {
    xbox: { l: 'xbox-stick-l',        r: 'xbox-stick-r' },
    ps4:  { l: 'playstation-stick-l', r: 'playstation-stick-r' },
    ps5:  { l: 'playstation-stick-l', r: 'playstation-stick-r' },
};

/**
 * Returns an icon <span> for a controller's analog stick.
 *
 * @param {'xbox'|'ps4'|'ps5'} controllerType
 * @param {'l'|'r'} side
 * @returns {string}
 */
export function stickIconHTML(controllerType, side) {
    const cls = (STICK_SPRITES[controllerType] ?? STICK_SPRITES.xbox)[side];
    return `<span class="sprite-icon ${cls}"></span>`;
}

// ---------------------------------------------------------------------------
// Keyboard code → CSS class map
// Codes are stored lowercase by key-binding-dialog.js (e.code.toLowerCase())
// ---------------------------------------------------------------------------

const KEYBOARD_MAP = {
    // Letters
    'keya': 'keyboard-a', 'keyb': 'keyboard-b', 'keyc': 'keyboard-c',
    'keyd': 'keyboard-d', 'keye': 'keyboard-e', 'keyf': 'keyboard-f',
    'keyg': 'keyboard-g', 'keyh': 'keyboard-h', 'keyi': 'keyboard-i',
    'keyj': 'keyboard-j', 'keyk': 'keyboard-k', 'keyl': 'keyboard-l',
    'keym': 'keyboard-m', 'keyn': 'keyboard-n', 'keyo': 'keyboard-o',
    'keyp': 'keyboard-p', 'keyq': 'keyboard-q', 'keyr': 'keyboard-r',
    'keys': 'keyboard-s', 'keyt': 'keyboard-t', 'keyu': 'keyboard-u',
    'keyv': 'keyboard-v', 'keyw': 'keyboard-w', 'keyx': 'keyboard-x',
    'keyy': 'keyboard-y', 'keyz': 'keyboard-z',

    // Digits
    'digit0': 'keyboard-0', 'digit1': 'keyboard-1', 'digit2': 'keyboard-2',
    'digit3': 'keyboard-3', 'digit4': 'keyboard-4', 'digit5': 'keyboard-5',
    'digit6': 'keyboard-6', 'digit7': 'keyboard-7', 'digit8': 'keyboard-8',
    'digit9': 'keyboard-9',

    // Function keys
    'f1':  'keyboard-f1',  'f2':  'keyboard-f2',  'f3':  'keyboard-f3',
    'f4':  'keyboard-f4',  'f5':  'keyboard-f5',  'f6':  'keyboard-f6',
    'f7':  'keyboard-f7',  'f8':  'keyboard-f8',  'f9':  'keyboard-f9',
    'f10': 'keyboard-f10', 'f11': 'keyboard-f11', 'f12': 'keyboard-f12',

    // Arrow keys
    'arrowup':    'keyboard-arrow-up',
    'arrowdown':  'keyboard-arrow-down',
    'arrowleft':  'keyboard-arrow-left',
    'arrowright': 'keyboard-arrow-right',

    // Special keys
    'escape':       'keyboard-escape',
    'enter':        'keyboard-return',
    'numpadenter':  'keyboard-return',
    'space':        'keyboard-space-icon',
    'shiftleft':    'keyboard-shift-icon',
    'shiftright':   'keyboard-shift-icon',
    'controlleft':  'keyboard-ctrl',
    'controlright': 'keyboard-ctrl',
    'altleft':      'keyboard-alt',
    'altright':     'keyboard-alt',
    'tab':          'keyboard-tab',
    'backspace':    'keyboard-backspace-icon',
    'home':         'keyboard-home',
    'end':          'keyboard-end',
    'pageup':       'keyboard-page-up',
    'pagedown':     'keyboard-page-down',
};

/**
 * Returns an icon <span> for a keyboard key, or null if no sprite exists.
 * Accepts KeyboardEvent.code values (case-insensitive).
 *
 * @param {string} code  e.g. 'keya', 'arrowup', 'escape' (already lowercased is fine)
 * @returns {string|null}
 */
export function keyIconHTML(code) {
    const cls = KEYBOARD_MAP[code.toLowerCase()];
    return cls ? `<span class="sprite-icon ${cls}"></span>` : null;
}
