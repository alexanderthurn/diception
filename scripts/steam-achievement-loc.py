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

loc = {c: json.load(open(f'src/locales/{c}.json', encoding='utf-8')) for c in ('en', 'de', 'es')}
game = set(re.findall(r"id:\s*'([A-Z0-9_]+)'", open('src/core/achievements.js', encoding='utf-8').read()))
game |= {f'ACH_STREAK_{c}' for c in (3, 4, 5, 6, 7)}
game |= {f'ACH_STREAK_{c}_{t}' for c, t in ((3, 3000), (4, 1500), (5, 500), (6, 200), (7, 100))}

def de_num(n): return f'{n:,}'.replace(',', '.')
def es_num(n): return f'{n:,}'.replace(',', '.')

# Descriptions in Steam's register (full sentences, trailing period), not the
# terser in-game phrasing. Terminology matches the shipped locale files.
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
PLUS = {'ACH_STREAK_3_3000','ACH_STREAK_4_1500','ACH_STREAK_5_500',
        'ACH_STREAK_6_200','ACH_STREAK_7_100'}

def desc(lang, aid):
    if aid == 'ACH_TUTORIAL':
        return {'en':'Complete the Tutorial chapter.','de':'Schließe das Tutorial ab.',
                'es':'Completa el tutorial.'}[lang]
    if aid in CH:
        n = CH[aid]
        return {'en':f'Complete Chapter {n}.','de':f'Schließe Kapitel {n} ab.',
                'es':f'Completa el capítulo {n}.'}[lang]
    if aid in GAMES:
        n = GAMES[aid]
        return {'en':f'Play {n:,} games.','de':f'Spiele {de_num(n)} Partien.',
                'es':f'Juega {es_num(n)} partidas.'}[lang]
    if aid == 'ACH_FIRST_WIN':
        return {'en':'Win 100 games.','de':'Gewinne 100 Partien.',
                'es':'Gana 100 partidas.'}[lang]
    if aid in UNDER:
        n = UNDER[aid]
        return {'en':f'Win {n} attacks at less than 33% odds.',
                'de':f'Gewinne {n} Angriffe mit weniger als 33% Gewinnchance.',
                'es':f'Gana {n} ataques con menos del 33% de probabilidad.'}[lang]
    if aid == 'ACH_DAVID':
        return {'en':'Win an attack with 4 dice against 6 dice.',
                'de':'Gewinne einen Angriff mit 4 Würfeln gegen 6 Würfel.',
                'es':'Gana un ataque con 4 dados contra 6 dados.'}[lang]
    if aid == 'ACH_PURE_BOTS':
        return {'en':'Let a bots-only game run to completion.',
                'de':'Lass ein reines Bot-Spiel bis zum Ende laufen.',
                'es':'Deja que una partida solo de bots llegue al final.'}[lang]
    if aid == 'ACH_PURE_HUMANS':
        return {'en':'Play a game with 2 or more humans and no bots.',
                'de':'Spiele eine Partie mit 2 oder mehr Menschen und ohne Bots.',
                'es':'Juega una partida con 2 o más humanos y sin bots.'}[lang]
    if aid == 'ACH_SURVIVOR':
        return {'en':'Win a game against 7 opponents.',
                'de':'Gewinne eine Partie gegen 7 Gegner.',
                'es':'Gana una partida contra 7 rivales.'}[lang]
    if aid in STREAK:
        chain, count = STREAK[aid]
        if count == 1:
            return {'en':f'Chain {chain} consecutive attacks from the same tile.',
                    'de':f'Verkette {chain} aufeinanderfolgende Angriffe vom selben Feld.',
                    'es':f'Encadena {chain} ataques consecutivos desde la misma casilla.'}[lang]
        if aid in PLUS:
            return {'en':f'Chain {chain}+ attacks from the same tile {count:,} times.',
                    'de':f'Verkette {chain} oder mehr Angriffe vom selben Feld, insgesamt {de_num(count)} Mal.',
                    'es':f'Encadena {chain} o más ataques desde la misma casilla {es_num(count)} veces.'}[lang]
        return {'en':f'Chain {chain} consecutive attacks from the same tile {count:,} times.',
                'de':f'Verkette {chain} aufeinanderfolgende Angriffe vom selben Feld, insgesamt {count} Mal.',
                'es':f'Encadena {chain} ataques consecutivos desde la misma casilla {count} veces.'}[lang]
    raise KeyError(aid)

# Chapters 5-8 exist in Steam but not in the game yet.
FUTURE = {
    'Chapter 5 Complete': 5, 'Chapter 6 Complete': 6,
    'Chapter 7 Complete': 7, 'Chapter 8 Complete': 8,
}
def future(lang, n):
    return ({'en':f'Chapter {n} Complete','de':f'Kapitel {n} geschafft','es':f'Capítulo {n} completado'}[lang],
            {'en':f'Complete Chapter {n}.','de':f'Schließe Kapitel {n} ab.','es':f'Completa el capítulo {n}.'}[lang])

VDF = 'steam/4429000_loc_all.vdf'
src = open(VDF, encoding='utf-8').read()
BLOCK = re.compile(r'^\t"(\w+)"\n\t\{\n\t\t"Tokens"\n\t\t\{\n(.*?)^\t\t\}\n\t\}$', re.S | re.M)
blocks = {m.group(1): m for m in BLOCK.finditer(src)}
missing = {'english', 'german', 'spanish'} - set(blocks)
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

STEAM_LANG = {'en': 'english', 'de': 'german', 'es': 'spanish'}

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
print(f'{VDF}: {n} achievements x 3 languages, {len(out)} bytes')
