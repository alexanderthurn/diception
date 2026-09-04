# Translation brief (temporary file — delete when done)

Working dir: /Users/alexanderthurn/Documents/projects/diception/dev
Source of truth: `src/locales/en.json` (696 keys, flat, sorted).

## Your job
Produce `src/locales/<CODE>.json` with **exactly the same 696 keys**, every value
translated into your target language. Nothing else. Do not touch any other file.

## Hard rules
1. **Key set must match `en.json` exactly** — same keys, no extras, no omissions.
2. **Preserve every `{placeholder}` verbatim**: `{n}`, `{count}`, `{name}`, `{s}`,
   `{v}`, `{h}`, `{m}`, `{ai}`, `{bots}`, `{max}`, `{sides}`, `{index}`, `{time}`,
   `{price}`, `{duration}`. Same set in the translation as in the English.
3. **Preserve HTML markup verbatim** where present: `<strong>…</strong>`, `<br>`,
   `&amp;`, `·`, `←`, `→`, `▶`, `★`, `∞`. Translate the text inside the tags, not
   the tags.
4. **Leave these untranslated** (brand/technical): Diception, DICEPTION, PixiJS,
   Suno, Kenney.nl, GNU GPL v3, Steam, Google Play, Google Play Services, JSON,
   JavaScript, JS, FPS, VSync, WASD, D-pad, Seed, Mods, Remote Play Together,
   "Parallel S", DDG, MStV, the A/B/X/Y button letters, the FPS numbers.
5. **`about_modal.country`** is `Germany` — use your language's name for Germany.
   The `§ 5 DDG` / `§ 18 Abs. 2 MStV` statute references stay as-is; translate only
   the surrounding words.
6. **`about_modal.article_the`** is the English article "The". Most languages have
   no equivalent here — use an empty string `""` unless your language genuinely
   needs a leading word there.
7. **No em dashes (—) anywhere.** Use a comma, a colon, or a full stop instead.
   The `…` ellipsis character is fine and should be kept where English has it.
8. **No English words left inside a translated string.** A checker greps for this.
9. Keep UI labels short — these are buttons and menu entries. ALL-CAPS English
   labels should be ALL-CAPS in your language too where that reads naturally.
10. Terminology must be **internally consistent**: pick one word for tile/territory,
    one for dice, one for turn, one for bot, one for streak/chain, and reuse it.
    `mods.*` and `opt.*` values name the same features described in `howto_modal.*`
    — the names must match across those groups.

## Output format
UTF-8 JSON, keys sorted alphabetically, 2-space indent, `ensure_ascii=False`,
trailing newline. Write it with a Python heredoc or the Write tool.

## Verify before you finish
Run these two and make sure both pass:

```
python -c "
import json
en=json.load(open('src/locales/en.json')); t=json.load(open('src/locales/<CODE>.json'))
assert set(en)==set(t), (set(en)-set(t), set(t)-set(en))
import re
for k in en:
    a=set(re.findall(r'{[a-z]+}',en[k])); b=set(re.findall(r'{[a-z]+}',t[k]))
    assert a==b, (k,a,b)
    assert en[k].count('<strong>')==t[k].count('<strong>'), k
    assert t[k].strip(), k
    assert '—' not in t[k], k
print('OK', len(t))
"
python scripts/check-locales.py
```

`check-locales.py` checks every locale, so ignore failures for locales other than
yours, but **your** locale must come back `OK`. If it flags a glyph that no bundled
font covers, replace that character with a plain ASCII equivalent.

## Do NOT
- Do not edit `src/core/i18n.js`, `scripts/*`, or any other locale file.
- Do not run `git add`, `git commit`, `git push`, or `npx vite build`.
- Do not create extra files.
