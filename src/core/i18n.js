/**
 * Minimal i18n layer.
 *
 * Strings live in `src/locales/<lang>.json`. English is bundled as the fallback so a
 * missing key or a failed locale fetch degrades to English rather than to blank UI.
 *
 * Markup is annotated in index.html:
 *   <span data-i18n="menu.custom_game">Custom Game</span>
 *   <li data-i18n-html="howto.combat"><strong>COMBAT:</strong> …</li>
 *   <input data-i18n-placeholder="setup.name_hint">
 *   <button data-i18n-aria-label="common.back">
 */

import en from '../locales/en.json';

const LANGUAGE_KEY = 'language';

/** Shown in the language picker — always in the language itself. */
export const LANGUAGE_NAMES = {
    en: 'English',
    de: 'Deutsch',
    es: 'Español',
    zh: '中文',
    fr: 'Français',
    ru: 'Русский',
    'pt-br': 'Português (BR)',
    'ja': '日本語',
    'it': 'Italiano',
    'pl': 'Polski',
    'tr': 'Türkçe',
    'ko': '한국어',
    'nl': 'Nederlands',
    'cs': 'Čeština',
    'sv': 'Svenska',
    'da': 'Dansk',
    'nb': 'Norsk bokmål',
    'fi': 'Suomi',
    'hu': 'Magyar',
    'el': 'Ελληνικά',
    'uk': 'Українська',
    'bg': 'Български',
    'ro': 'Română',
    'id': 'Bahasa Indonesia',
    'ms': 'Bahasa Melayu',
    'vi': 'Tiếng Việt',
    'zh-tw': '繁體中文',
    'es-419': 'Español (LatAm)',
    'pt': 'Português (PT)',
};
const FALLBACK = 'en';

/** Locales shipped with the game. Add the file, add it here. */
const LOCALES = {
    en: () => Promise.resolve(en),
    de: () => import('../locales/de.json').then(m => m.default),
    es: () => import('../locales/es.json').then(m => m.default),
    zh: () => import('../locales/zh.json').then(m => m.default),
    fr: () => import('../locales/fr.json').then(m => m.default),
    ru: () => import('../locales/ru.json').then(m => m.default),
    'pt-br': () => import('../locales/pt-br.json').then(m => m.default),
    'ja': () => import('../locales/ja.json').then(m => m.default),
    'it': () => import('../locales/it.json').then(m => m.default),
    'pl': () => import('../locales/pl.json').then(m => m.default),
    'tr': () => import('../locales/tr.json').then(m => m.default),
    'ko': () => import('../locales/ko.json').then(m => m.default),
    'nl': () => import('../locales/nl.json').then(m => m.default),
    'cs': () => import('../locales/cs.json').then(m => m.default),
    'sv': () => import('../locales/sv.json').then(m => m.default),
    'da': () => import('../locales/da.json').then(m => m.default),
    'nb': () => import('../locales/nb.json').then(m => m.default),
    'fi': () => import('../locales/fi.json').then(m => m.default),
    'hu': () => import('../locales/hu.json').then(m => m.default),
    'el': () => import('../locales/el.json').then(m => m.default),
    'uk': () => import('../locales/uk.json').then(m => m.default),
    'bg': () => import('../locales/bg.json').then(m => m.default),
    'ro': () => import('../locales/ro.json').then(m => m.default),
    'id': () => import('../locales/id.json').then(m => m.default),
    'ms': () => import('../locales/ms.json').then(m => m.default),
    'vi': () => import('../locales/vi.json').then(m => m.default),
    'zh-tw': () => import('../locales/zh-tw.json').then(m => m.default),
    'es-419': () => import('../locales/es-419.json').then(m => m.default),
    'pt': () => import('../locales/pt.json').then(m => m.default),
};

let _strings = en;
let _language = FALLBACK;

/** Language actually in use (after detection and any user override). */
export function getLanguage() {
    return _language;
}

export function getAvailableLanguages() {
    return Object.keys(LOCALES);
}

/**
 * Resolve the language: an explicit user choice wins, otherwise the device
 * language, otherwise English. The full tag is tried first ('pt-BR' -> pt-br),
 * then the region rules below, then the primary subtag ('de-AT' -> 'de').
 */
// Latin America is dozens of region tags (es-MX, es-AR, es-CO…) and none of
// them match a locale file, so the base language would hand them Spain's
// Spanish. Map every Spanish region except Spain itself to es-419.
const REGIONAL = { es: (region) => (region && region !== 'es' ? 'es-419' : 'es') };

function detectLanguage() {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (stored && LOCALES[stored]) return stored;
    // Try the full tag before the base language, so a Brazilian gets pt-br
    // rather than European Portuguese, and Taiwan gets zh-tw rather than
    // Simplified. Falls back to the base language when we ship only one.
    const tag = (navigator.language || FALLBACK).toLowerCase();
    if (LOCALES[tag]) return tag;
    const [base, region] = tag.split('-');
    const regional = REGIONAL[base] && REGIONAL[base](region);
    if (regional && LOCALES[regional]) return regional;
    return LOCALES[base] ? base : FALLBACK;
}

async function applyLanguage(language) {
    const loader = LOCALES[language] || LOCALES[FALLBACK];
    try {
        _strings = await loader();
        _language = LOCALES[language] ? language : FALLBACK;
    } catch (e) {
        console.warn(`[i18n] could not load "${language}", staying on ${FALLBACK}:`, e);
        _strings = en;
        _language = FALLBACK;
    }
    document.documentElement.lang = _language;
    applyTranslations();
}

/**
 * Load a language and apply it to the document. Awaited once during startup.
 * Detection is deliberately not persisted, so the game keeps following the
 * device language until the player picks one in Settings.
 */
export async function initI18n(language = detectLanguage()) {
    await applyLanguage(language);
}

/**
 * Parts of the UI are built in JS and hold text that applyTranslations() cannot
 * reach — a summary line, a cached label, a list rendered once. They register
 * here and re-render when the player picks a different language.
 */
const _listeners = new Set();

export function onLanguageChange(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
}

/** Switch language on an explicit player choice — this one sticks. */
export async function setLanguage(language) {
    await applyLanguage(language);
    localStorage.setItem(LANGUAGE_KEY, _language);
    for (const fn of _listeners) {
        try { fn(_language); }
        catch (e) { console.warn('[i18n] language-change listener failed:', e); }
    }
}

/**
 * Look up a key. `vars` fills {placeholders}.
 * Unknown keys fall back to English, then to the key itself so gaps are visible
 * in-game rather than silently blank.
 */
export function t(key, vars) {
    let value = _strings[key] ?? en[key] ?? key;
    if (vars) {
        for (const [name, replacement] of Object.entries(vars)) {
            value = value.replaceAll(`{${name}}`, replacement);
        }
    }
    return value;
}

const ATTRIBUTE_BINDINGS = [
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-title', 'title'],
    ['data-i18n-aria-label', 'aria-label'],
];

/** Apply translations to annotated markup. Call again after injecting new DOM. */
export function applyTranslations(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.getAttribute('data-i18n'));
    });
    // Sentences that carry inline markup, e.g. "<strong>COMBAT:</strong> Dice attack dice."
    // The values come from our own locale files, never from user input.
    root.querySelectorAll('[data-i18n-html]').forEach(el => {
        el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    for (const [dataAttr, target] of ATTRIBUTE_BINDINGS) {
        root.querySelectorAll(`[${dataAttr}]`).forEach(el => {
            el.setAttribute(target, t(el.getAttribute(dataAttr)));
        });
    }
}
