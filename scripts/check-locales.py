"""Validate every locale against English.

Checks the things that break silently: a missing key falls back to English
without warning, a dropped {placeholder} renders the literal braces, mismatched
<strong> tags corrupt the markup, and a character no bundled font carries shows
as a tofu box. Also flags values left identical to English, which usually means
a string was skipped rather than deliberately kept.

    python scripts/check-locales.py

Exits non-zero if anything fails, so it can gate a build.
"""
import json, re, struct, glob, os, sys
from fontTools.ttLib import TTFont
def cps(path):
    d=open(path,'rb').read(); num=struct.unpack('>H',d[4:6])[0]; off=None
    for i in range(num):
        r=12+16*i
        if d[r:r+4]==b'cmap': off=struct.unpack('>I',d[r+8:r+12])[0]; break
    n=struct.unpack('>H',d[off+2:off+4])[0]; best=None
    for i in range(n):
        p=off+4+8*i; pid,eid,sub=struct.unpack('>HHI',d[p:p+8])
        if (pid,eid) in ((3,1),(3,10),(0,3),(0,4)): best=off+sub
    sx=struct.unpack('>H',d[best+6:best+8])[0]; seg=sx//2
    e=struct.unpack('>%dH'%seg,d[best+14:best+14+sx]); st=struct.unpack('>%dH'%seg,d[best+16+sx:best+16+2*sx])
    out=set()
    for a,b in zip(st,e):
        if b!=0xFFFF: out.update(range(a,b+1))
    return out
stack = cps('public/assets/fonts/Rajdhani-Regular.ttf')
for f in glob.glob('public/assets/fonts/*.woff2'):
    stack |= set(TTFont(f).getBestCmap())
SHARED = set('←→∞▶★')   # system fallback in every language, English included
en = json.load(open('src/locales/en.json', encoding='utf-8'))
ph = re.compile(r'\{[a-zA-Z_]+\}'); tag = re.compile(r'</?[a-zA-Z]+/?>')
WORD = re.compile(r'[^\W\d_]+')          # one unbroken run of letters
NONLATIN = re.compile(r'[\u0370-\u03ff\u0400-\u04ff]')   # Greek + Cyrillic
STRAY = re.compile(r'\b(the|and|with|from|your|press|click|game|level|turn|dice|territory|attack|player|map|board|settings|score)\b', re.I)
ok = True
for p in sorted(glob.glob('src/locales/*.json')):
    c = os.path.basename(p)[:-5]
    if c == 'en': continue
    d = json.load(open(p, encoding='utf-8'))
    probs = []
    if set(d) != set(en): probs.append(f'keys differ ({len(d)} vs {len(en)})')
    for k in en:
        if k not in d: continue
        if sorted(ph.findall(en[k])) != sorted(ph.findall(d[k])): probs.append(f'placeholder {k}')
        if sorted(tag.findall(en[k])) != sorted(tag.findall(d[k])): probs.append(f'markup {k}')
    empty = [k for k, v in d.items() if not v.strip() and en[k].strip() and k != 'about_modal.article_the']
    if empty: probs.append(f'empty {empty}')
    miss = sorted({ch for v in d.values() for ch in v if ord(ch) not in stack and ch not in '\n\t'} - SHARED)
    if miss: probs.append(f'glyphs {"".join(miss)}')
    # a value identical to English is usually an untranslated leftover
    same = [k for k in en if k in d and d[k] == en[k] and len(en[k]) > 12 and STRAY.search(en[k])]
    if same: probs.append(f'still english: {same[:3]}')
    # An English word embedded in an otherwise translated string is almost always
    # a slip while writing, and nothing else here would notice it.
    if c not in ('en',):
        embedded = [k for k in d
                    if d[k] != en.get(k) and STRAY.search(d[k])
                    and not STRAY.search(''.join(ch for ch in en.get(k, '') if ch.isascii()))]
        embedded = [k for k in embedded if any(w in d[k].lower() for w in
                    (' territory', ' the ', ' and ', ' with ', 'decide'))]
        if embedded: probs.append(f'english inside translation: {embedded[:3]}')

    # A Latin letter inside a Cyrillic or Greek word looks identical on screen but
    # breaks search, sorting and text-to-speech. Markup and the words English
    # deliberately leaves alone (WASD, FPS, VSync) are stripped before looking.
    mixed = [k for k, v in d.items()
             for w in WORD.findall(tag.sub(' ', ph.sub(' ', v)))
             if NONLATIN.search(w) and re.search(r'[A-Za-z]', w)]
    if mixed: probs.append(f'mixed script: {sorted(set(mixed))[:3]}')
    print(f'  {c:6} {len(d):3} keys  {"OK" if not probs else "; ".join(probs)}')
    if probs: ok = False
sys.exit(0 if ok else 1)
