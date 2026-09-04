"""Fill steam/4429000_loc_all.vdf from the game's locale files.

Steam keys achievement text by NEW_ACHIEVEMENT_<n>_<i>, not by API name, so
entries are matched to the game through the English display name already in
the file's english block. Run from the repo root after changing an achievement
title, then upload the file in Steamworks under Achievement Localization.

English values are rewritten too, which trims the stray whitespace Steam's own
export carries. Descriptions are written here rather than reused from
ach.desc.* because Steam uses full sentences with a trailing period, where the
in-game panel does not.
"""
import re, json, io


# Game locale code -> Steam's name for it in THIS file. Steam is not consistent
# across its own exports: the achievement importer says "korean" where the store
# page localization says "koreana".
STEAM_LANG = {
    'en': 'english',
    'de': 'german',
    'es': 'spanish',
    'zh': 'schinese',
    'fr': 'french',
    'ru': 'russian',
    'pt-br': 'brazilian',
    'ja': 'japanese',
    'it': 'italian',
    'pl': 'polish',
    'tr': 'turkish',
    'ko': 'korean',
    'nl': 'dutch',
}

loc = {c: json.load(open(f'src/locales/{c}.json', encoding='utf-8')) for c in STEAM_LANG}
game = set(re.findall(r"id:\s*'([A-Z0-9_]+)'", open('src/core/achievements.js', encoding='utf-8').read()))
game |= {f'ACH_STREAK_{c}' for c in (3, 4, 5, 6, 7)}
game |= {f'ACH_STREAK_{c}_{t}' for c, t in ((3, 3000), (4, 1500), (5, 500), (6, 200), (7, 100))}

# Steam shows fuller sentences than the in-game panel: same wording, closed with
# a full stop. Deriving them from the locale files rather than keeping a table
# here means a new language costs one line in STEAM_LANG and nothing else.
SENTENCE_END = {'schinese': '。', 'tchinese': '。', 'japanese': '。'}

# Thousands separator per language. Getting this wrong is quiet but wrong:
# "3,000" reads as three in French and as a decimal in German.
THOUSANDS = {
    'german': '.', 'spanish': '.', 'italian': '.', 'portuguese': '.', 'brazilian': '.',
    'danish': '.', 'dutch': '.', 'romanian': '.', 'turkish': '.', 'greek': '.',
    'indonesian': '.', 'vietnamese': '.',
    'french': '\u202f', 'russian': '\u202f', 'polish': '\u202f', 'czech': '\u202f',
    'swedish': '\u202f', 'norwegian': '\u202f', 'finnish': '\u202f', 'hungarian': '\u202f',
    'bulgarian': '\u202f', 'ukrainian': '\u202f', 'latam': ',',
}

def num(lang, n):
    return f'{n:,}'.replace(',', THOUSANDS.get(STEAM_LANG[lang], ','))

def t(lang, key, **vars):
    v = loc[lang][key]
    for name, val in vars.items():
        v = v.replace('{' + name + '}', str(val))
    return v

def sentence(lang, text):
    """Close the sentence the way the language does, without doubling it."""
    end = SENTENCE_END.get(STEAM_LANG[lang], '.')
    return text if text.endswith(('.', '。', '！', '!')) else text + end

CH = {'ACH_CHAPTER1': 1, 'ACH_CHAPTER2': 2, 'ACH_CHAPTER3': 3, 'ACH_CHAPTER4': 4}
GAMES = {'ACH_GAMES_10':10,'ACH_GAMES_50':50,'ACH_GAMES_100':100,'ACH_GAMES_150':150,
         'ACH_GAMES_200':200,'ACH_GAMES_300':300,'ACH_GAMES_400':400,'ACH_GAMES_500':500,
         'ACH_GAMES_1000':1000,'ACH_GAMES_10000':10000}
UNDER = {'ACH_UNDERDOG_5':5,'ACH_UNDERDOG_10':10,'ACH_UNDERDOG_50':50,
         'ACH_UNDERDOG_100':100,'ACH_UNDERDOG_500':500}
STREAK = {'ACH_STREAK_3':(3,30),'ACH_STREAK_4':(4,15),'ACH_STREAK_5':(5,5),
          'ACH_STREAK_6':(6,2),'ACH_STREAK_7':(7,1),
          'ACH_STREAK_3_3000':(3,3000),'ACH_STREAK_4_1500':(4,1500),
          'ACH_STREAK_5_500':(5,500),'ACH_STREAK_6_200':(6,200),'ACH_STREAK_7_100':(7,100)}

def desc(lang, aid):
    if aid == 'ACH_TUTORIAL':
        return sentence(lang, t(lang, 'ach.desc.campaign', name=t(lang, 'campaign.name_tutorial')))
    if aid in CH:
        name = t(lang, f'campaign.name_chapter{CH[aid]}')
        return sentence(lang, t(lang, 'ach.desc.campaign', name=name))
    if aid in GAMES:
        return sentence(lang, t(lang, 'ach.desc.games_played', count=num(lang, GAMES[aid])))
    if aid == 'ACH_FIRST_WIN':
        return sentence(lang, t(lang, 'ach.desc.games_won', count='100'))
    if aid in UNDER:
        return sentence(lang, t(lang, 'ach.desc.underdog', count=UNDER[aid]))
    if aid == 'ACH_DAVID':
        return sentence(lang, t(lang, 'ach.desc.won4vs6'))
    if aid == 'ACH_PURE_BOTS':
        return sentence(lang, t(lang, 'ach.desc.pure_bots'))
    if aid == 'ACH_PURE_HUMANS':
        return sentence(lang, t(lang, 'ach.desc.pure_humans'))
    if aid == 'ACH_SURVIVOR':
        return sentence(lang, t(lang, 'ach.desc.won8player'))
    if aid in STREAK:
        chain, count = STREAK[aid]
        return sentence(lang, t(lang, 'ach.desc.streak', n=chain, count=num(lang, count)))
    raise KeyError(aid)

# Steam carries Chapter 5-8 placeholders the game does not define yet.
FUTURE = {f'Chapter {n} Complete': n for n in (5, 6, 7, 8)}

def future(lang, n):
    name = t(lang, 'campaign.name_chapter_n', n=n)
    title = t(lang, 'ach.ACH_CHAPTER1.title').replace(t(lang, 'campaign.name_chapter1'), name)
    return title, sentence(lang, t(lang, 'ach.desc.campaign', name=name))

VDF = 'steam/4429000_loc_all.vdf'
src = open(VDF, encoding='utf-8').read()
BLOCK = re.compile(r'^\t"(\w+)"\n\t\{\n\t\t"Tokens"\n\t\t\{\n(.*?)^\t\t\}\n\t\}$', re.S | re.M)
blocks = {m.group(1): m for m in BLOCK.finditer(src)}
missing = set(STEAM_LANG.values()) - set(blocks)
if missing:
    raise SystemExit(f'{VDF} has no block for: {sorted(missing)}')
order = re.findall(r'"NEW_ACHIEVEMENT_(\d+_\d+)_NAME"\t+"([^"]*)"', blocks['english'].group(2))
byname = {loc['en'][f'ach.{a}.title']: a for a in game}

resolved = []
for tok, raw in order:
    v = raw.strip()
    if v in game:            aid = v                # placeholder holding the API name
    elif v in byname:        aid = byname[v]
    elif v in FUTURE:        aid = None
    else: raise SystemExit(f'unmapped: {tok} {v!r}')
    resolved.append((tok, aid, FUTURE.get(v)))

def tokens(lang):
    out = []
    for tok, aid, fut in resolved:
        if aid is None:
            name, d = future(lang, fut)
        else:
            name, d = loc[lang][f'ach.{aid}.title'], desc(lang, aid)
        for suffix, val in (('NAME', name), ('DESC', d)):
            out.append(f'\t\t\t"NEW_ACHIEVEMENT_{tok}_{suffix}"\t"{val}"')
    return '\n'.join(out) + '\n'

# Build every block before writing: the file is also this script's input.
out = src
for lang, steam in STEAM_LANG.items():
    m = blocks[steam]
    out = out[:m.start(2)] + tokens(lang) + out[m.end(2):]
    blocks = {b.group(1): b for b in BLOCK.finditer(out)}   # offsets shift

open(VDF, 'w', encoding='utf-8').write(out)
n = len(resolved)
print(f"{VDF}: {n} achievements x {len(STEAM_LANG)} languages, {len(out)} bytes")
