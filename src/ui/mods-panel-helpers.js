/**
 * Shared logic for Custom Game and Editor "Mods" panels (same field set, optional id prefix).
 */

/**
 * Single source of truth for all Custom Game defaults.
 * Basic fields (map size, players) and Mods fields live here.
 * mapSize is the slider value (2 = 4x4).
 */
export const SETUP_DEFAULTS = {
    // Basic fields
    mapSize:      '3',
    humanCount:   '1',
    botCount:     '2',
    botAI:        'easy',
    // Mods fields
    mapStyle:       'random',
    gameMode:       'classic',
    maxDice:        '8',
    diceSides:      '6',
    attacksPerTurn: '0',
    secondsPerTurn: '0',
    secondsPerAttack: '0',
    fullBoardRule:  'nothing',
    tournamentGames: '100',
    playMode:       'classic',
};

/** Alias for the mods subset — used by reset/highlight helpers. */
export const SETUP_MOD_DEFAULTS = {
    mapStyle:       SETUP_DEFAULTS.mapStyle,
    gameMode:       SETUP_DEFAULTS.gameMode,
    maxDice:        SETUP_DEFAULTS.maxDice,
    diceSides:      SETUP_DEFAULTS.diceSides,
    attacksPerTurn: SETUP_DEFAULTS.attacksPerTurn,
    secondsPerTurn: SETUP_DEFAULTS.secondsPerTurn,
    secondsPerAttack: SETUP_DEFAULTS.secondsPerAttack,
    fullBoardRule:  SETUP_DEFAULTS.fullBoardRule,
    tournamentGames: SETUP_DEFAULTS.tournamentGames,
    playMode:       SETUP_DEFAULTS.playMode,
};

const ATTACK_SECONDS_UI_ALLOWED = ['0', '5', '10', '15', '30'];

export function normalizeAttackSecondsUi(raw) {
    const s = String(raw ?? '0').trim();
    if (ATTACK_SECONDS_UI_ALLOWED.includes(s)) return s;
    const n = Number.parseInt(s, 10);
    if (n === 60) return '30';
    if (n === 5 || n === 10 || n === 15 || n === 30) return String(n);
    return '0';
}

function el(prefix, suffix) {
    return document.getElementById(prefix + suffix);
}

/**
 * @param {string} idPrefix e.g. '' or 'editor-mods-'
 */
export function areModsAtDefaultsForPrefix(idPrefix) {
    const d = SETUP_MOD_DEFAULTS;
    const ap = el(idPrefix, 'turn-time-limit')?.value ?? '0';
    const sec = el(idPrefix, 'turn-seconds-limit')?.value ?? '0';
    const secAtk = normalizeAttackSecondsUi(el(idPrefix, 'attack-seconds-limit')?.value ?? '0');
    const pm = el(idPrefix, 'play-mode')?.value ?? localStorage.getItem('dicy_playMode') ?? d.playMode;
    return (
        el(idPrefix, 'map-style')?.value === d.mapStyle &&
        el(idPrefix, 'game-mode')?.value === d.gameMode &&
        String(el(idPrefix, 'max-dice')?.value) === d.maxDice &&
        String(el(idPrefix, 'dice-sides')?.value) === d.diceSides &&
        String(ap) === d.attacksPerTurn &&
        String(sec) === d.secondsPerTurn &&
        String(secAtk) === d.secondsPerAttack &&
        (el(idPrefix, 'full-board-rule')?.value || 'nothing') === d.fullBoardRule &&
        String(el(idPrefix, 'tournament-games')?.value) === d.tournamentGames &&
        pm === d.playMode
    );
}

/**
 * @param {string} idPrefix
 */
export function syncModsFieldHighlightsForPrefix(idPrefix) {
    const d = SETUP_MOD_DEFAULTS;
    const pm =
        el(idPrefix, 'play-mode')?.value ?? localStorage.getItem('dicy_playMode') ?? d.playMode;

    /** @type {Array<[string, () => boolean]>} */
    const rows = [
        ['map-style-group', () => el(idPrefix, 'map-style')?.value !== d.mapStyle],
        ['setup-game-mode-group', () => el(idPrefix, 'game-mode')?.value !== d.gameMode],
        ['setup-tournament-games-group', () => String(el(idPrefix, 'tournament-games')?.value) !== d.tournamentGames],
        ['setup-max-dice-group', () => String(el(idPrefix, 'max-dice')?.value) !== d.maxDice],
        ['setup-dice-sides-group', () => String(el(idPrefix, 'dice-sides')?.value) !== d.diceSides],
        ['setup-attacks-limit-group', () => String(el(idPrefix, 'turn-time-limit')?.value ?? '0') !== d.attacksPerTurn],
        ['setup-turn-seconds-group', () => String(el(idPrefix, 'turn-seconds-limit')?.value ?? '0') !== d.secondsPerTurn],
        ['setup-attack-seconds-group', () =>
            normalizeAttackSecondsUi(el(idPrefix, 'attack-seconds-limit')?.value ?? '0') !== d.secondsPerAttack],
        ['setup-full-board-rule-group', () => (el(idPrefix, 'full-board-rule')?.value || 'nothing') !== d.fullBoardRule],
        ['setup-play-mode-group', () => pm !== d.playMode],
    ];
    for (const [groupSuffix, differs] of rows) {
        const node = el(idPrefix, groupSuffix);
        if (node) node.classList.toggle('setup-mod-nondefault', differs());
    }
}

/**
 * @param {string} idPrefix
 */
export function applyModsDefaultsForPrefix(idPrefix) {
    const d = SETUP_MOD_DEFAULTS;
    const setSelect = (suffix, value, storageKey) => {
        const node = el(idPrefix, suffix);
        if (node) node.value = value;
        if (storageKey) localStorage.setItem(storageKey, value);
    };

    setSelect('map-style', d.mapStyle, 'dicy_mapStyle');
    setSelect('game-mode', d.gameMode, 'dicy_gameMode');

    const maxDiceEl = el(idPrefix, 'max-dice');
    const maxDiceVal = el(idPrefix, 'max-dice-val');
    if (maxDiceEl) maxDiceEl.value = d.maxDice;
    if (maxDiceVal) maxDiceVal.textContent = d.maxDice;
    localStorage.setItem('dicy_maxDice', d.maxDice);

    const diceSidesEl = el(idPrefix, 'dice-sides');
    const diceSidesVal = el(idPrefix, 'dice-sides-val');
    if (diceSidesEl) diceSidesEl.value = d.diceSides;
    if (diceSidesVal) diceSidesVal.textContent = d.diceSides;
    localStorage.setItem('dicy_diceSides', d.diceSides);

    setSelect('turn-time-limit', d.attacksPerTurn, 'dicy_attacksPerTurn');
    setSelect('turn-seconds-limit', d.secondsPerTurn, 'dicy_secondsPerTurn');
    setSelect('attack-seconds-limit', d.secondsPerAttack, 'dicy_secondsPerAttack');
    setSelect('full-board-rule', d.fullBoardRule, 'dicy_fullBoardRule');

    const tg = el(idPrefix, 'tournament-games');
    if (tg) tg.value = d.tournamentGames;
    localStorage.setItem('dicy_tournamentGames', d.tournamentGames);

    localStorage.setItem('dicy_playMode', d.playMode);
    const playModeEl = el(idPrefix, 'play-mode');
    if (playModeEl) playModeEl.value = d.playMode;
}

/**
 * @param {boolean} open
 * @param {string} panelId
 * @param {string} toggleId
 */
export function setModsPanelUiOpen(open, panelId, toggleId) {
    const panel = document.getElementById(panelId);
    const toggle = document.getElementById(toggleId);
    if (!panel || !toggle) return;
    panel.classList.toggle('hidden', !open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.classList.toggle('setup-mods-toggle--open', open);
}

/**
 * @param {boolean} nonDefault
 * @param {string} resetBtnId
 * @param {string} toggleId
 */
export function applyModsToolbarLayout(nonDefault, resetBtnId, toggleId) {
    const resetBtn = document.getElementById(resetBtnId);
    const toggle = document.getElementById(toggleId);
    if (resetBtn) resetBtn.classList.toggle('hidden', !nonDefault);
    if (toggle) toggle.classList.toggle('hidden', nonDefault);
}
