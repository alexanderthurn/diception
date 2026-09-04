# Localization

The game ships one JSON file per language in `src/locales/`, keyed identically
to `en.json`. English is bundled; every other locale is a lazy chunk fetched on
demand.

## Adding a language

1. **Translate.** Copy the key set from `en.json` and write `src/locales/<code>.json`.
   Regional variants use the full tag (`pt-br`), which `detectLanguage()` tries
   before the base language.
2. **Register.** Add it to `LANGUAGE_NAMES` and `LOCALES` in `src/core/i18n.js`,
   and to `STEAM_LANG` in `scripts/steam-achievement-loc.py`. Keys are quoted —
   `pt-br` is not a valid bare identifier.
3. **Fonts.** Run `python scripts/build-fonts.py`. Nothing to do for Latin,
   Greek or Cyrillic — those subsets ship whole blocks. CJK and Hangul are cut
   to the characters in use, so those *do* need the rebuild.
4. **Check.** Run `python scripts/check-locales.py`. It must pass before commit.
5. **Steam.** Enable the language on the app in Steamworks, re-export, then run
   the two generators. See `steam/README.md`.

## Scripts

| | |
| --- | --- |
| `scripts/check-locales.py` | Validates every locale against English. Exits non-zero. |
| `scripts/build-fonts.py` | Rebuilds the bundled font subsets. |
| `scripts/steam-achievement-loc.py` | Fills `steam/4429000_loc_all.vdf`. |
| `scripts/steam-storepage-loc.py` | Fills `steam/storepage_1106365_all.json`. |

`check-locales.py` exists because these failures are all silent otherwise: a
missing key falls back to English, a dropped `{placeholder}` renders literal
braces, mismatched `<strong>` corrupts the markup, an uncovered character shows
as a tofu box, and a value left in English just looks like a translation that
happens to match. It also flags English words left *inside* an otherwise
translated string — that slip has happened twice and nothing else catches it.

## Fonts

Rajdhani covers Latin only. Three subsets fill the gaps, each behind a
`unicode-range` so a player only downloads the scripts their language uses:

| file | strategy | covers |
| --- | --- | --- |
| `NotoSans-subset.woff2` | whole blocks | Greek, Cyrillic, Vietnamese, Latin-ext, `№`, the 12 Latin-1 characters Rajdhani lacks (incl. `º ª`) |
| `NotoSansSC-subset.woff2` | characters in use | Chinese + Japanese |
| `NotoSansKR-subset.woff2` | characters in use | Korean |

The source fonts (~17 MB each) download on demand into `scripts/.cache/`, which
is gitignored.

`← → ∞ ▶ ★` are in no bundled font and fall back to a system font in every
language, English included. That predates the localization work.

## Things that are deliberately not translated

- **The byline** "by Alexander Thurn" — branding, so it is a constant in
  `main.js` rather than a key, and there is nothing for a translator to pick up.
- **Key names** — `WASD`, `Space`, `Shift`, `A`/`B`/`X`/`Y`. These are the
  letters printed on the hardware; translating them makes the instruction
  harder to follow. Chinese, Japanese and Korean keyboards are all QWERTY.
- **Option *values*** stay English where they are identifiers; only the visible
  label is translated.

## Numbers

`toLocaleString()` with no argument follows the machine's locale, not the
game's, so every call passes `getLanguage()`. The Steam generator has its own
`THOUSANDS` map for the same reason — "3,000" reads as three in French.
