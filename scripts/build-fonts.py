"""Rebuild the bundled font subsets from the locale files.

Rajdhani covers Latin and little else, so every non-Latin script needs a
fallback bundled with the game — a system font cannot be relied on, least of
all on Android and Windows.

Two different strategies, because the scripts differ in size:

  blocks  Alphabetic scripts are small enough to ship whole (Greek is ~130
          glyphs, Cyrillic ~256). Shipping the whole block means this never
          has to be rebuilt when the text changes.

  usage   CJK and Hangul are thousands of glyphs, so those are cut down to the
          characters the locale files actually use. Re-run after changing that
          text or the new characters render as tofu.

Run from the repo root:

    python scripts/build-fonts.py

Each @font-face in styles.css carries a unicode-range so a player only
downloads the scripts their language needs.
"""
import json, os, struct, sys, urllib.request

FONT_DIR = 'public/assets/fonts'
CACHE_DIR = os.path.join(os.path.dirname(__file__), '.cache')
LATIN_FONT = f'{FONT_DIR}/Rajdhani-Regular.ttf'
GF = 'https://raw.githubusercontent.com/google/fonts/main/ofl'

SUBSETS = [
    {
        'out': 'NotoSans-subset.woff2',
        'source': f'{GF}/notosans/NotoSans%5Bwdth,wght%5D.ttf',
        'cache': 'NotoSans-variable.ttf',
        'mode': 'blocks',
        'blocks': [
            (0x00A0, 0x00FF),   # Latin-1 Supplement — Rajdhani lacks 12 of these,
                                # incl. the ordinal indicators Portuguese uses (º ª)
            (0x0100, 0x017F),   # Latin Extended-A   — Polish, Czech, Hungarian…
            (0x0180, 0x024F),   # Latin Extended-B   — Romanian ș ț
            (0x0370, 0x03FF),   # Greek
            (0x0400, 0x04FF),   # Cyrillic           — Russian, Bulgarian, Ukrainian
            (0x0500, 0x052F),   # Cyrillic Supplement
            (0x1E00, 0x1EFF),   # Latin Extended Additional — Vietnamese
            (0x2010, 0x2027),   # dashes and quotes used by these languages
            (0x2116, 0x2116),   # № — the numero sign Russian/Ukrainian/Bulgarian use
        ],
    },
    {
        'out': 'NotoSansSC-subset.woff2',
        'source': f'{GF}/notosanssc/NotoSansSC%5Bwght%5D.ttf',
        'cache': 'NotoSansSC-variable.ttf',
        'mode': 'usage',
        'locales': ['zh', 'ja'],
        'blocks': [
            (0x2E80, 0x2EFF),   # CJK radicals
            (0x3000, 0x303F),   # CJK punctuation
            (0x3040, 0x309F),   # Hiragana
            (0x30A0, 0x30FF),   # Katakana
            (0x3400, 0x4DBF),   # CJK ext A
            (0x4E00, 0x9FFF),   # CJK unified ideographs
            (0xF900, 0xFAFF),   # compatibility ideographs
            (0xFF00, 0xFFEF),   # fullwidth forms
        ],
    },
    {
        'out': 'NotoSansKR-subset.woff2',
        'source': f'{GF}/notosanskr/NotoSansKR%5Bwght%5D.ttf',
        'cache': 'NotoSansKR-variable.ttf',
        'mode': 'usage',
        'locales': ['ko'],
        'blocks': [
            (0x1100, 0x11FF),   # Hangul Jamo
            (0x3130, 0x318F),   # Hangul compatibility Jamo
            (0xA960, 0xA97F),   # Hangul Jamo Extended-A
            (0xAC00, 0xD7A3),   # Hangul syllables
        ],
    },
]

def cmap_codepoints(path):
    """Codepoints a TrueType font maps, read straight from its cmap."""
    d = open(path, 'rb').read()
    num = struct.unpack('>H', d[4:6])[0]
    off = None
    for i in range(num):
        rec = 12 + 16 * i
        if d[rec:rec + 4] == b'cmap':
            off = struct.unpack('>I', d[rec + 8:rec + 12])[0]
            break
    n = struct.unpack('>H', d[off + 2:off + 4])[0]
    best = None
    for i in range(n):
        p = off + 4 + 8 * i
        pid, eid, sub = struct.unpack('>HHI', d[p:p + 8])
        if (pid, eid) in ((3, 1), (3, 10), (0, 3), (0, 4)):
            best = off + sub
    seg_x2 = struct.unpack('>H', d[best + 6:best + 8])[0]
    seg = seg_x2 // 2
    ends = struct.unpack('>%dH' % seg, d[best + 14:best + 14 + seg_x2])
    starts = struct.unpack('>%dH' % seg, d[best + 16 + seg_x2:best + 16 + 2 * seg_x2])
    out = set()
    for s, e in zip(starts, ends):
        if e != 0xFFFF:
            out.update(range(s, e + 1))
    return out

def fetch(url, cache):
    path = os.path.join(CACHE_DIR, cache)
    if not os.path.exists(path):
        os.makedirs(CACHE_DIR, exist_ok=True)
        print(f'  downloading {cache} …')
        urllib.request.urlretrieve(url, path)
    return path

def build(spec, latin):
    in_blocks = lambda cp: any(lo <= cp <= hi for lo, hi in spec['blocks'])

    if spec['mode'] == 'blocks':
        source = fetch(spec['source'], spec['cache'])
        available = cmap_codepoints(source)
        # Skip anything Rajdhani already draws. It sits first in every stack, so
        # it wins for those glyphs regardless — carrying them twice is dead weight.
        wanted = sorted(cp for cp in available if in_blocks(cp) and cp not in latin)
    else:
        used = set()
        for code in spec['locales']:
            path = f'src/locales/{code}.json'
            if not os.path.exists(path):
                continue
            for v in json.load(open(path, encoding='utf-8')).values():
                used |= {ord(c) for c in v}
        wanted = sorted(cp for cp in used if in_blocks(cp) and cp not in latin)
        if not wanted:
            print(f'{spec["out"]}: no text for {spec["locales"]} yet, skipped')
            return
        source = fetch(spec['source'], spec['cache'])

    from fontTools import subset
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.desubroutinize = False
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    font = subset.load_font(source, opts)
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=wanted)
    sub.subset(font)
    out = os.path.join(FONT_DIR, spec['out'])
    subset.save_font(font, out, opts)
    print(f'{spec["out"]}: {len(wanted)} glyphs, {os.path.getsize(out)/1024:.1f} KB '
          f'({spec["mode"]})')
    print('   unicode-range: ' + ', '.join(f'U+{lo:04X}-{hi:04X}' for lo, hi in spec['blocks']))

def main():
    latin = cmap_codepoints(LATIN_FONT)
    for spec in SUBSETS:
        build(spec, latin)

if __name__ == '__main__':
    main()
