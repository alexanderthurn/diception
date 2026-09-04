"""Rebuild the bundled CJK font subset from the locale files.

Rajdhani has no CJK glyphs, so languages like Chinese fall back to whatever the
system provides — which on a bare Windows or Android install can be nothing.
This subsets Noto Sans SC down to exactly the characters the CJK locales use
and writes a woff2 next to the Rajdhani files.

Run from the repo root after adding or changing CJK text:

    python scripts/build-cjk-font.py

It prints the unicode-range to paste into the @font-face in styles.css if the
character set has grown into a new block.
"""
import json, os, struct, sys, urllib.request, glob

SOURCE_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf'
CACHE = os.path.join(os.path.dirname(__file__), '.cache', 'NotoSansSC-variable.ttf')
OUT = 'public/assets/fonts/NotoSansSC-subset.woff2'
LATIN_FONT = 'public/assets/fonts/Rajdhani-Regular.ttf'

# Locales whose text needs CJK coverage. Add a code here when one ships.
CJK_LOCALES = ['zh']

# Only these blocks go in the subset. Symbols Rajdhani also lacks (arrows, star)
# are deliberately excluded: putting them in the unicode-range would make every
# Latin language download this font too.
BLOCKS = [
    (0x2E80, 0x2EFF),   # CJK radicals
    (0x3000, 0x303F),   # CJK punctuation
    (0x3400, 0x4DBF),   # CJK ext A
    (0x4E00, 0x9FFF),   # CJK unified ideographs
    (0xF900, 0xFAFF),   # compatibility ideographs
    (0xFF00, 0xFFEF),   # fullwidth forms
]

def in_blocks(cp):
    return any(lo <= cp <= hi for lo, hi in BLOCKS)

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
        if e == 0xFFFF:
            continue
        out.update(range(s, e + 1))
    return out

def css_unicode_range():
    """The @font-face range, as whole blocks rather than per character.

    Listing individual codepoints would be marginally leaner but would have to
    be regenerated into styles.css on every text change. Whole blocks keep the
    stylesheet stable: the font still only downloads when CJK text is rendered.
    """
    return ', '.join(f'U+{lo:04X}-{hi:04X}' for lo, hi in BLOCKS)

def main():
    latin = cmap_codepoints(LATIN_FONT)

    used = set()
    for code in CJK_LOCALES:
        path = f'src/locales/{code}.json'
        if not os.path.exists(path):
            sys.exit(f'missing locale: {path}')
        for v in json.load(open(path, encoding='utf-8')).values():
            used |= {ord(c) for c in v}

    needed = sorted(cp for cp in used if in_blocks(cp) and cp not in latin)
    if not needed:
        sys.exit('no CJK characters found in the locale files')

    if not os.path.exists(CACHE):
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        print(f'downloading source font (~17 MB) -> {CACHE}')
        urllib.request.urlretrieve(SOURCE_URL, CACHE)

    from fontTools import subset
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.desubroutinize = False
    opts.layout_features = ['*']          # keep vertical/CJK layout features
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.recalc_bounds = True
    font = subset.load_font(CACHE, opts)
    subsetter = subset.Subsetter(options=opts)
    subsetter.populate(unicodes=needed)
    subsetter.subset(font)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    subset.save_font(font, OUT, opts)

    size = os.path.getsize(OUT)
    src = os.path.getsize(CACHE)
    print(f'{OUT}: {len(needed)} glyphs, {size/1024:.1f} KB '
          f'(from {src/1024/1024:.1f} MB, {100*size/src:.2f}%)')
    print('\nunicode-range in styles.css (blocks, should not need changing):\n  '
          + css_unicode_range())

if __name__ == '__main__':
    main()
