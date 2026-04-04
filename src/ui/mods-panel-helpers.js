/**
 * Shared logic for Custom Game and Editor "Mods" panels (same field set, optional id prefix).
 */

const MAP_STYLE_LABELS    = { full: 'Full Map', balanced: 'Balanced', islands: 'Islands', ring: 'Ring', cross: 'Cross' };
const GAME_MODE_LABELS    = { fair: 'Fair Start', madness: 'Madness', '2of2': '2of2' };
const FULL_BOARD_LABELS   = { most_territories: 'Territories', biggest_territory: 'Largest Region', random_picker: 'Random Tile', raise_max_dice: 'Max Dice +4', autoplay_humans: 'Autoplay' };
const ATTACK_RULE_LABELS  = { easy_attack: 'Easy Attack', all_die: 'Tie Die' };
const SUPPLY_RULE_LABELS  = { no_stack: 'No Stack', no_stack_hard: 'Full', reborn: 'Reborn' };
const PLAY_MODE_LABELS    = { parallel: 'Parallel', 'parallel-s': 'Parallel S' };

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
    attackRule:     'classic',
    supplyRule:     'classic',
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
    attackRule:     SETUP_DEFAULTS.attackRule,
    supplyRule:     SETUP_DEFAULTS.supplyRule,
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
        (el(idPrefix, 'attack-rule')?.value || 'classic') === d.attackRule &&
        (el(idPrefix, 'supply-rule')?.value || 'classic') === d.supplyRule &&
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
        ['setup-attack-rule-group', () => (el(idPrefix, 'attack-rule')?.value || 'classic') !== d.attackRule],
        ['setup-supply-rule-group', () => (el(idPrefix, 'supply-rule')?.value || 'classic') !== d.supplyRule],
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
    setSelect('attack-rule', d.attackRule, 'dicy_attackRule');
    setSelect('supply-rule', d.supplyRule, 'dicy_supplyRule');

    const tg = el(idPrefix, 'tournament-games');
    if (tg) tg.value = d.tournamentGames;
    localStorage.setItem('dicy_tournamentGames', d.tournamentGames);

    localStorage.setItem('dicy_playMode', d.playMode);
    const playModeEl = el(idPrefix, 'play-mode');
    if (playModeEl) playModeEl.value = d.playMode;
}

/**
 * Return a short bullet-separated summary of all non-default mods.
 * Accepts a plain config object (same keys as SETUP_MOD_DEFAULTS).
 * Returns an empty string when everything is at defaults.
 */
export function getActiveModsSummary(config) {
    const d = SETUP_MOD_DEFAULTS;
    const parts = [];

    if (config.mapStyle && config.mapStyle !== d.mapStyle)
        parts.push(MAP_STYLE_LABELS[config.mapStyle] || config.mapStyle);
    if (config.gameMode && config.gameMode !== d.gameMode)
        parts.push(GAME_MODE_LABELS[config.gameMode] || config.gameMode);
    if (config.maxDice != null && String(config.maxDice) !== d.maxDice)
        parts.push(`Max ${config.maxDice}`);
    if (config.diceSides != null && String(config.diceSides) !== d.diceSides)
        parts.push(`D${config.diceSides}`);
    if (config.attacksPerTurn != null && String(config.attacksPerTurn) !== d.attacksPerTurn)
        parts.push(`${config.attacksPerTurn} Atk`);
    if (config.secondsPerTurn != null && String(config.secondsPerTurn) !== d.secondsPerTurn)
        parts.push(`${config.secondsPerTurn}s/Turn`);
    if (config.secondsPerAttack != null && String(config.secondsPerAttack) !== d.secondsPerAttack)
        parts.push(`${config.secondsPerAttack}s/Atk`);
    const fbr = config.fullBoardRule || 'nothing';
    if (fbr !== d.fullBoardRule)
        parts.push(FULL_BOARD_LABELS[fbr] || fbr);
    const ar = config.attackRule || 'classic';
    if (ar !== d.attackRule)
        parts.push(ATTACK_RULE_LABELS[ar] || ar);
    const sr = config.supplyRule || 'classic';
    if (sr !== d.supplyRule)
        parts.push(SUPPLY_RULE_LABELS[sr] || sr);
    if (config.playMode && config.playMode !== d.playMode)
        parts.push(PLAY_MODE_LABELS[config.playMode] || config.playMode);
    if (config.seed != null && Number(config.seed) > 0)
        parts.push('Fixed Luck');

    return parts.join(' · ');
}

/**
 * Read current mod values from the DOM and return their summary string.
 * @param {string} idPrefix  e.g. '' for setup panel, 'editor-mods-' for editor
 * @param {string} [seedInputId]  optional element id for the seed input (e.g. 'game-seed', 'editor-seed-input')
 */
export function getActiveModsSummaryFromDom(idPrefix, seedInputId) {
    const seedEl = seedInputId ? document.getElementById(seedInputId) : null;
    const seedVal = seedEl ? parseInt(seedEl.value, 10) : NaN;
    return getActiveModsSummary({
        mapStyle:       el(idPrefix, 'map-style')?.value,
        gameMode:       el(idPrefix, 'game-mode')?.value,
        maxDice:        el(idPrefix, 'max-dice')?.value,
        diceSides:      el(idPrefix, 'dice-sides')?.value,
        attacksPerTurn: el(idPrefix, 'turn-time-limit')?.value ?? '0',
        secondsPerTurn: el(idPrefix, 'turn-seconds-limit')?.value ?? '0',
        secondsPerAttack: normalizeAttackSecondsUi(el(idPrefix, 'attack-seconds-limit')?.value ?? '0'),
        fullBoardRule:  el(idPrefix, 'full-board-rule')?.value,
        attackRule:     el(idPrefix, 'attack-rule')?.value,
        supplyRule:     el(idPrefix, 'supply-rule')?.value,
        playMode:       el(idPrefix, 'play-mode')?.value ?? localStorage.getItem('dicy_playMode'),
        seed:           Number.isFinite(seedVal) && seedVal > 0 ? seedVal : undefined,
    });
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
