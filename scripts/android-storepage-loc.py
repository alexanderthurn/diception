"""Build the Play Store listing for every language into android/store-<play>.txt.

    python scripts/android-storepage-loc.py

The text is derived from the Steam copy in steam-storepage-loc.py, which is
already translated and reviewed, so both stores say the same thing. Play differs
from Steam in four places, and DELTAS below carries those per language:

  touch  Android lists touch as an input; Steam does not.
  head   "Lite Version vs. Full" where Steam says "Full Version vs. Demo".
  demo   the free tier is the lite version, not a demo.
  ad     the buy line mentions the rewarded video ad, which Steam has no
         equivalent of.

Steam's Remote Play paragraph and its Steam-exclusive bullet are dropped, and
BBCode is stripped since Play takes plain text here.

Files are named by Play Console locale code so they match the language picker.
Every replacement must hit exactly once; a miss is reported, not skipped.
"""

import ast, io, json, os, re

DELTAS = {
 "brazilian": {
  "play": "pt-BR",
  "touch": [
   "a mouse, teclado e controle",
   "a toque, mouse, teclado e controle"
  ],
  "head": "Versão lite e completa",
  "demo": [
   "A demo gratuita",
   "A versão lite gratuita"
  ],
  "ad": [
   "Ao comprar a versão completa,",
   "Ao comprar a versão completa (ou assistindo a um anúncio em vídeo para ganhar 1 hora de acesso gratuito),"
  ]
 },
 "bulgarian": {
  "play": "bg",
  "touch": [
   "на мишка, клавиатура и контролер",
   "на докосване, мишка, клавиатура и контролер"
  ],
  "head": "Lite версия и пълна версия",
  "demo": [
   "Безплатното демо",
   "Безплатната Lite версия"
  ],
  "ad": [
   "С покупката на пълната версия отключваш:",
   "С покупката на пълната версия (или като гледаш видеореклама за 1 час безплатен достъп) отключваш:"
  ]
 },
 "czech": {
  "play": "cs-CZ",
  "touch": [
   "podporou myši, klávesnice a gamepadu",
   "podporou dotyku, myši, klávesnice a gamepadu"
  ],
  "head": "Verze Lite a plná verze",
  "demo": [
   "Demo zdarma",
   "Verze Lite zdarma"
  ],
  "ad": [
   "Koupí plné verze si odemkneš:",
   "Koupí plné verze (nebo zhlédnutím videoreklamy za 1 hodinu přístupu zdarma) si odemkneš:"
  ]
 },
 "danish": {
  "play": "da-DK",
  "touch": [
   "af mus, tastatur og controller",
   "af berøring, mus, tastatur og controller"
  ],
  "head": "Lite-version og fuld version",
  "demo": [
   "Den gratis demo",
   "Den gratis Lite-version"
  ],
  "ad": [
   "Med den fulde version låser du op for:",
   "Med den fulde version (eller ved at se en videoreklame og få 1 times gratis adgang) låser du op for:"
  ]
 },
 "dutch": {
  "play": "nl-NL",
  "touch": [
   "voor muis, toetsenbord en controller",
   "voor touch, muis, toetsenbord en controller"
  ],
  "head": "Lite-versie en volledige versie",
  "demo": [
   "De gratis demo",
   "De gratis Lite-versie"
  ],
  "ad": [
   "Met de volledige versie ontgrendel je:",
   "Met de volledige versie (of door een videoadvertentie te bekijken voor 1 uur gratis toegang) ontgrendel je:"
  ]
 },
 "finnish": {
  "play": "fi-FI",
  "touch": [
   "hiirtä, näppäimistöä ja ohjainta",
   "kosketusta, hiirtä, näppäimistöä ja ohjainta"
  ],
  "head": "Lite-versio ja täysi versio",
  "demo": [
   "Ilmainen kokeiluversio",
   "Ilmainen Lite-versio"
  ],
  "ad": [
   "Ostamalla täyden version avaat:",
   "Ostamalla täyden version (tai katsomalla videomainoksen ja saamalla tunnin ilmaista peliaikaa) avaat:"
  ]
 },
 "french": {
  "play": "fr-FR",
  "touch": [
   "à la souris, au clavier et à la manette",
   "au tactile, à la souris, au clavier et à la manette"
  ],
  "head": "Version Lite et version complète",
  "demo": [
   "La démo gratuite",
   "La version Lite gratuite"
  ],
  "ad": [
   "En achetant la version complète, vous débloquez :",
   "En achetant la version complète (ou en regardant une publicité vidéo pour 1 heure d'accès gratuit), vous débloquez :"
  ]
 },
 "german": {
  "play": "de-DE",
  "touch": [
   "für Maus, Tastatur und Gamepad",
   "für Touch, Maus, Tastatur und Gamepad"
  ],
  "head": "Lite-Version und Vollversion",
  "demo": [
   "Die kostenlose Demo",
   "Die kostenlose Lite-Version"
  ],
  "ad": [
   "Mit dem Kauf der Vollversion schaltest du frei:",
   "Mit dem Kauf der Vollversion (oder indem du ein Video ansiehst und 1 Stunde lang kostenlos spielst) schaltest du frei:"
  ]
 },
 "greek": {
  "play": "el-GR",
  "touch": [
   "ποντικιού, πληκτρολογίου και χειριστηρίου",
   "αφής, ποντικιού, πληκτρολογίου και χειριστηρίου"
  ],
  "head": "Έκδοση Lite και πλήρης έκδοση",
  "demo": [
   "Η δωρεάν δοκιμαστική έκδοση",
   "Η δωρεάν έκδοση Lite"
  ],
  "ad": [
   "Αγοράζοντας την πλήρη έκδοση ξεκλειδώνεις:",
   "Αγοράζοντας την πλήρη έκδοση (ή βλέποντας μια διαφήμιση βίντεο για 1 ώρα δωρεάν πρόσβασης) ξεκλειδώνεις:"
  ]
 },
 "hungarian": {
  "play": "hu-HU",
  "touch": [
   "egérrel, billentyűzettel és kontrollerrel",
   "érintéssel, egérrel, billentyűzettel és kontrollerrel"
  ],
  "head": "Lite változat és teljes változat",
  "demo": [
   "Az ingyenes demó",
   "Az ingyenes Lite változat"
  ],
  "ad": [
   "A teljes változat megvásárlásával feloldod:",
   "A teljes változat megvásárlásával (vagy egy videohirdetés megnézésével 1 óra ingyenes hozzáférésért) feloldod:"
  ]
 },
 "indonesian": {
  "play": "id",
  "touch": [
   "untuk mouse, keyboard, dan gamepad",
   "untuk sentuh, mouse, keyboard, dan gamepad"
  ],
  "head": "Versi lite dan versi lengkap",
  "demo": [
   "Demo gratis",
   "Versi lite gratis"
  ],
  "ad": [
   "Dengan membeli versi lengkap, kamu membuka:",
   "Dengan membeli versi lengkap (atau menonton iklan video untuk akses gratis 1 jam), kamu membuka:"
  ]
 },
 "italian": {
  "play": "it-IT",
  "touch": [
   "per mouse, tastiera e controller",
   "per tocco, mouse, tastiera e controller"
  ],
  "head": "Versione Lite e versione completa",
  "demo": [
   "La demo gratuita",
   "La versione Lite gratuita"
  ],
  "ad": [
   "Acquistando la versione completa sblocchi:",
   "Acquistando la versione completa (o guardando un annuncio video per 1 ora di accesso gratuito) sblocchi:"
  ]
 },
 "japanese": {
  "play": "ja-JP",
  "touch": [
   "マウス・キーボード・ゲームパッドを",
   "タッチ・マウス・キーボード・ゲームパッドを"
  ],
  "head": "Lite版と製品版",
  "demo": [
   "無料デモ",
   "無料のLite版"
  ],
  "ad": [
   "製品版を購入すると解放されるもの：",
   "製品版を購入すると（または動画広告を視聴して1時間無料で遊ぶと）解放されるもの："
  ]
 },
 "koreana": {
  "play": "ko-KR",
  "touch": [
   "마우스와 키보드, 게임패드를",
   "터치와 마우스, 키보드, 게임패드를"
  ],
  "head": "라이트 버전과 정식 버전",
  "demo": [
   "무료 체험판에서는",
   "무료 라이트 버전에서는"
  ],
  "ad": [
   "정식 버전을 구매하면 열리는 것:",
   "정식 버전을 구매하면(또는 동영상 광고를 보고 1시간 무료로 이용하면) 열리는 것:"
  ]
 },
 "latam": {
  "play": "es-419",
  "touch": [
   "para mouse, teclado y control",
   "para toque, mouse, teclado y control"
  ],
  "head": "Versión lite y versión completa",
  "demo": [
   "La demo gratuita",
   "La versión lite gratuita"
  ],
  "ad": [
   "Al comprar la versión completa desbloqueas:",
   "Al comprar la versión completa (o al ver un anuncio en video para obtener 1 hora de acceso gratis) desbloqueas:"
  ]
 },
 "malay": {
  "play": "ms",
  "touch": [
   "untuk tetikus, papan kekunci dan gamepad",
   "untuk sentuhan, tetikus, papan kekunci dan gamepad"
  ],
  "head": "Versi Lite dan versi penuh",
  "demo": [
   "Demo percuma",
   "Versi Lite percuma"
  ],
  "ad": [
   "Dengan membeli versi penuh, anda membuka:",
   "Dengan membeli versi penuh (atau menonton iklan video untuk akses percuma selama 1 jam), anda membuka:"
  ]
 },
 "norwegian": {
  "play": "no-NO",
  "touch": [
   "for mus, tastatur og håndkontroll",
   "for berøring, mus, tastatur og håndkontroll"
  ],
  "head": "Lite-versjon og full versjon",
  "demo": [
   "Den gratis demoen",
   "Den gratis Lite-versjonen"
  ],
  "ad": [
   "Med full versjon låser du opp:",
   "Med full versjon (eller ved å se en videoannonse og få 1 times gratis tilgang) låser du opp:"
  ]
 },
 "polish": {
  "play": "pl-PL",
  "touch": [
   "obsługą myszy, klawiatury i pada",
   "obsługą dotyku, myszy, klawiatury i pada"
  ],
  "head": "Wersja Lite i pełna wersja",
  "demo": [
   "Darmowe demo",
   "Darmowa wersja Lite"
  ],
  "ad": [
   "Kupując pełną wersję, odblokowujesz:",
   "Kupując pełną wersję (albo oglądając reklamę wideo dla 1 godziny darmowego dostępu), odblokowujesz:"
  ]
 },
 "portuguese": {
  "play": "pt-PT",
  "touch": [
   "a rato, teclado e comando",
   "a toque, rato, teclado e comando"
  ],
  "head": "Versão Lite e versão completa",
  "demo": [
   "A demo gratuita",
   "A versão Lite gratuita"
  ],
  "ad": [
   "Ao comprares a versão completa, desbloqueias:",
   "Ao comprares a versão completa (ou ao veres um anúncio em vídeo para 1 hora de acesso gratuito), desbloqueias:"
  ]
 },
 "romanian": {
  "play": "ro",
  "touch": [
   "pentru mouse, tastatură și controler",
   "pentru atingere, mouse, tastatură și controler"
  ],
  "head": "Versiunea Lite și versiunea completă",
  "demo": [
   "Demoul gratuit",
   "Versiunea Lite gratuită"
  ],
  "ad": [
   "Cumpărând versiunea completă deblochezi:",
   "Cumpărând versiunea completă (sau urmărind o reclamă video pentru 1 oră de acces gratuit) deblochezi:"
  ]
 },
 "russian": {
  "play": "ru-RU",
  "touch": [
   "поддержкой мыши, клавиатуры и геймпада",
   "поддержкой сенсорного ввода, мыши, клавиатуры и геймпада"
  ],
  "head": "Версия Lite и полная версия",
  "demo": [
   "Бесплатное демо",
   "Бесплатная версия Lite"
  ],
  "ad": [
   "Покупая полную версию, вы открываете:",
   "Покупая полную версию (или посмотрев видеорекламу и получив 1 час бесплатного доступа), вы открываете:"
  ]
 },
 "schinese": {
  "play": "zh-CN",
  "touch": [
   "全面支持鼠标、键盘和手柄",
   "全面支持触屏、鼠标、键盘和手柄"
  ],
  "head": "精简版与完整版",
  "demo": [
   "免费试玩版",
   "免费精简版"
  ],
  "ad": [
   "购买完整版即可解锁：",
   "购买完整版（或观看视频广告获得 1 小时免费游玩）即可解锁："
  ]
 },
 "spanish": {
  "play": "es-ES",
  "touch": [
   "para ratón, teclado y mando",
   "para toque, ratón, teclado y mando"
  ],
  "head": "Versión lite y versión completa",
  "demo": [
   "La demo gratuita",
   "La versión lite gratuita"
  ],
  "ad": [
   "Al comprar la versión completa desbloqueas:",
   "Al comprar la versión completa (o al ver un anuncio en vídeo para conseguir 1 hora de acceso gratis) desbloqueas:"
  ]
 },
 "swedish": {
  "play": "sv-SE",
  "touch": [
   "för mus, tangentbord och handkontroll",
   "för pekskärm, mus, tangentbord och handkontroll"
  ],
  "head": "Lite-version och fullversion",
  "demo": [
   "Den gratis demon",
   "Den gratis Lite-versionen"
  ],
  "ad": [
   "Med fullversionen låser du upp:",
   "Med fullversionen (eller genom att se en videoannons och få 1 timmes gratis speltid) låser du upp:"
  ]
 },
 "tchinese": {
  "play": "zh-TW",
  "touch": [
   "全面支援滑鼠、鍵盤和手把",
   "全面支援觸控、滑鼠、鍵盤和手把"
  ],
  "head": "精簡版與完整版",
  "demo": [
   "免費試玩版",
   "免費精簡版"
  ],
  "ad": [
   "購買完整版即可解鎖：",
   "購買完整版（或觀看影片廣告獲得 1 小時免費遊玩）即可解鎖："
  ]
 },
 "turkish": {
  "play": "tr-TR",
  "touch": [
   "fare, klavye ve oyun kumandası desteği",
   "dokunmatik, fare, klavye ve oyun kumandası desteği"
  ],
  "head": "Lite sürüm ve tam sürüm",
  "demo": [
   "Ücretsiz demo",
   "Ücretsiz Lite sürüm"
  ],
  "ad": [
   "Tam sürümü satın alarak şunların kilidini açarsın:",
   "Tam sürümü satın alarak (ya da bir video reklam izleyip 1 saat ücretsiz erişim kazanarak) şunların kilidini açarsın:"
  ]
 },
 "ukrainian": {
  "play": "uk",
  "touch": [
   "підтримкою миші, клавіатури й геймпада",
   "підтримкою сенсорного вводу, миші, клавіатури й геймпада"
  ],
  "head": "Версія Lite та повна версія",
  "demo": [
   "Безкоштовне демо",
   "Безкоштовна версія Lite"
  ],
  "ad": [
   "Купуючи повну версію, ти відкриваєш:",
   "Купуючи повну версію (або переглянувши відеорекламу й отримавши 1 годину безкоштовного доступу), ти відкриваєш:"
  ]
 },
 "vietnamese": {
  "play": "vi",
  "touch": [
   "hỗ trợ mượt mà chuột, bàn phím và tay cầm",
   "hỗ trợ mượt mà cảm ứng, chuột, bàn phím và tay cầm"
  ],
  "head": "Bản Lite và bản đầy đủ",
  "demo": [
   "Bản dùng thử miễn phí",
   "Bản Lite miễn phí"
  ],
  "ad": [
   "Khi mua bản đầy đủ, bạn mở khóa:",
   "Khi mua bản đầy đủ (hoặc xem quảng cáo video để chơi miễn phí 1 giờ), bạn mở khóa:"
  ]
 }
}

def _short_text():
    """Steam's short descriptions supply the "Forget isometric maps…" sentence."""
    src = io.open('scripts/steam-storepage-loc.py', encoding='utf-8').read()
    return next(ast.literal_eval(n.value) for n in ast.parse(src).body
                if isinstance(n, ast.Assign) and getattr(n.targets[0], 'id', '') == 'SHORT_TEXT')

D = DELTAS
D_SHORT = _short_text()
src = io.open('scripts/steam-storepage-loc.py', encoding='utf-8').read()
parts = next(ast.literal_eval(n.value) for n in ast.parse(src).body
             if isinstance(n, ast.Assign) and getattr(n.targets[0], 'id', '') == 'ABOUT_PARTS')

html = io.open('scripts/steam_assets.html', encoding='utf-8').read()
body = html[html.index('const TITLE_SECTIONS'):html.index('\n        ];', html.index('const TITLE_SECTIONS'))]
SEC = {}
for m in re.finditer(r"section: '(\w+)'", body):
    nxt = body.find("section: '", m.end())
    SEC[m.group(1)] = dict(re.findall(r"(\w+):\s*'([^']*)'", body[m.end(): nxt if nxt > 0 else len(body)]))

def strip(s):
    s = re.sub(r'\[/?[^\]]+\]', '', s)
    s = s.replace('&quot;', '"').replace('&amp;', '&').replace(' ', ' ')
    # stripping [/b] can leave a space after a CJK full stop, where none belongs.
    # Keyed on the CJK terminators, so Korean (which uses '.' and real spaces) is untouched.
    return re.sub(r'([。！？])\s+', r'\1', s).strip()

def first_sentence(s):
    m = re.search(r'^(.*?)([。！？])', s, re.S)
    if m: return (m.group(1) + m.group(2)).strip()
    m = re.search(r'^(.*?[.!?])(\s|$)', s, re.S)
    return (m.group(1) if m else s).strip()

def rest(s):
    fs = first_sentence(s)
    return s[len(fs):].strip()

problems, written = [], []
for lang, d in sorted(D.items()):
    P = lambda i: strip(parts[i][lang])
    def sub(text, pair, what):
        old, new = pair
        if text.count(old) != 1:
            problems.append(f'{lang}: {what}: {text.count(old)} matches for {old!r}')
            return text
        return text.replace(old, new, 1)

    short   = first_sentence(P(0))
    opening = sub(rest(P(0)), d['touch'], 'touch')
    lead    = first_sentence(D_SHORT[lang])
    joiner  = '' if lead[-1] in '。！？' else ' '
    grid    = lead + joiner + P(2)
    localmp = first_sentence(P(3))
    lite    = sub(P(10), d['demo'], 'demo')
    buy     = sub(P(11), d['ad'], 'ad')
    if len(short) > 80: problems.append(f'{lang}: short description {len(short)} chars')

    out = [
        'App Name: Diception',
        f'Short description: {short}',
        f'Full description: {opening}', '',
        P(1), '',
        SEC['grid_control'][lang], grid, '',
        SEC['local_multiplayer'][lang], localmp, '',
        SEC['speed'][lang], P(4), '',
        SEC['mods'][lang], P(5), '',
        P(6), '', ' ', '',
        P(7), '', P(8), '',
        d['head'], '', lite, '', buy, '',
        f'- {P(12)}', f'- {P(13)}', f'- {P(14)}', f'- {P(15)}',
    ]
    text = '\n'.join(out) + '\n'
    full = text.split('Full description: ', 1)[1]
    if len(full) > 4000: problems.append(f'{lang}: full description {len(full)} chars')
    path = f"android/store-{d['play']}.txt"
    io.open(path, 'w', encoding='utf-8').write(text)
    written.append((d['play'], len(short), len(full)))

print(f'wrote {len(written)} files')
if problems:
    print('\nPROBLEMS:')
    for p in problems: print('  ' + p)
else:
    print(f'short: {min(w[1] for w in written)}-{max(w[1] for w in written)} chars (limit 80)')
    print(f'full : {min(w[2] for w in written)}-{max(w[2] for w in written)} chars (limit 4000)')
