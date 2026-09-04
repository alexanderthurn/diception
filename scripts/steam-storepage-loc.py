"""Fill German and Spanish into steam/storepage_1106365_all.json.

Only the prose is replaced; BBCode tags, {STEAM_APP_IMAGE} references and the
&quot;/&amp; entity encoding are carried over from the English source untouched,
so the localized pages keep exactly the same layout as the English one.

The section title images stay on their English names on purpose: they are
uploaded in Steamworks as localized versions of the same asset, so Steam
serves the right language itself and falls back to English where a language
has none.

Run from the repo root, then upload the JSON in Steamworks under
Store Presence -> Localization.
"""
import json, sys

VDF = 'steam/storepage_1106365_all.json'
ABOUT = 'app[content][about]'
SHORT = 'app[content][short_description]'

# Corrections applied to the English about text before anything is translated,
# so every language stays in sync. Upload fixes the English page too.
ENGLISH_FIXES = [
    # unfinished sentence
    ("are waiting for you to.\u00a0", "are waiting for you.\u00a0"),
    # double space
    ("Or try  [b]parallel turns[/b]", "Or try [b]parallel turns[/b]"),
    # stray empty bold paragraph above the campaign blurb
    ("[p][b] [/b] [/p]", ""),
]

# One dict per paragraph of the English about text, keyed by Steam's own
# language name. Adding a language means adding its key to each of these, to
# SHORT_TEXT and to every SYSREQS entry; anything less and it is skipped.
ABOUT_PARTS = [
    {
        'english': '[b]Diception[/b] is a fast, minimalistic conquest game. Inspired by classics like [i]Risk[/i] and [i]DiceWars[/i], it features quick turn-based matches, an extensive campaign, a built-in editor, and local multiplayer for up to 8 players. By replacing the classic isometric view with an optimized [b]2D Grid View[/b], the game offers seamless Mouse, Keyboard, and Gamepad support for a lightning-fast experience.',
        'german': '[b]Diception[/b] ist ein schnelles, minimalistisches Eroberungsspiel. Inspiriert von Klassikern wie [i]Risiko[/i] und [i]DiceWars[/i] bietet es kurze rundenbasierte Partien, eine umfangreiche Kampagne, einen eingebauten Editor und lokalen Mehrspieler für bis zu 8 Spieler. Statt der klassischen isometrischen Ansicht nutzt Diception eine optimierte [b]2D-Rasteransicht[/b], mit durchgängiger Unterstützung für Maus, Tastatur und Gamepad und entsprechend hohem Tempo.',
        'spanish': '[b]Diception[/b] es un juego de conquista rápido y minimalista. Inspirado en clásicos como [i]Risk[/i] y [i]DiceWars[/i], ofrece partidas por turnos ágiles, una campaña extensa, un editor integrado y multijugador local para hasta 8 jugadores. En lugar de la clásica vista isométrica utiliza una [b]vista de rejilla 2D[/b] optimizada, con soporte fluido para ratón, teclado y mando, y la velocidad que eso permite.',
        'schinese': '[b]Diception[/b] 是一款快节奏、极简风格的征服游戏。灵感来自 [i]Risk[/i] 和 [i]DiceWars[/i] 等经典作品，提供简短的回合制对局、丰富的战役、内置编辑器，以及最多 8 人的本地多人游戏。它没有采用传统的等距视角，而是使用经过优化的 [b]2D 网格视图[/b]，全面支持鼠标、键盘和手柄，带来相应的高速体验。',
    },
    {
        'english': '[h2][b]Key Features:[/b][/h2]',
        'german': '[h2][b]Hauptmerkmale:[/b][/h2]',
        'spanish': '[h2][b]Características principales:[/b][/h2]',
        'schinese': '[h2][b]主要特色：[/b][/h2]',
    },
    {
        'english': 'Diception uses a clean 2D matrix with 4-way connections. This enables lightning-fast [b]WASD and D-Pad controls[/b], allowing for rapid-fire gameplay without sacrificing strategic depth.',
        'german': 'Diception nutzt eine klare 2D-Matrix mit Verbindungen in vier Richtungen. Das ermöglicht blitzschnelle Steuerung per [b]WASD und Steuerkreuz[/b]: hohes Tempo, ohne strategische Tiefe zu opfern.',
        'spanish': 'Diception utiliza una matriz 2D limpia con conexiones en cuatro direcciones. Eso permite un control rapidísimo con [b]WASD y cruceta[/b]: partidas veloces sin renunciar a la profundidad estratégica.',
        'schinese': 'Diception 采用清爽的 2D 矩阵，四方向相连。这让 [b]WASD 和方向键操作[/b] 极为迅捷——速度快，却不牺牲策略深度。',
    },
    {
        'english': "Battle up to 8 players in local multiplayer (Gamepads supported). Thanks to [b]Steam Remote Play Together[/b], your friends can join the fun online even if they don't own the game!",
        'german': 'Tritt im lokalen Mehrspieler gegen bis zu 8 Spieler an (Gamepads werden unterstützt). Dank [b]Steam Remote Play Together[/b] können deine Freunde online mitspielen, auch wenn sie das Spiel gar nicht besitzen!',
        'spanish': 'Enfréntate a hasta 8 jugadores en multijugador local (con soporte para mandos). Gracias a [b]Steam Remote Play Together[/b], tus amigos pueden unirse en línea aunque no tengan el juego.',
        'schinese': '在本地多人模式中与最多 8 名玩家对战（支持手柄）。借助 [b]Steam Remote Play Together[/b]，你的好友即使没有本作也能在线加入！',
    },
    {
        'english': 'Choose from 3 different speed modes. Whether you want to analyze every move or &quot;blitz&quot; through territories in milliseconds, the choice is yours.',
        'german': 'Wähle zwischen 3 Geschwindigkeitsmodi. Ob du jeden Zug in Ruhe durchdenken oder in Millisekunden durch die Gebiete &quot;blitzen&quot; willst: du entscheidest.',
        'spanish': 'Elige entre 3 modos de velocidad. Tanto si quieres analizar cada movimiento como hacer un &quot;blitz&quot; por los territorios en milisegundos, tú decides.',
        'schinese': '从 3 种速度模式中选择。无论你想细细推敲每一步，还是在毫秒之间“闪击”各处领地，都由你决定。',
    },
    {
        'english': 'Why settle for six sides? Or try [b]parallel turns[/b] for maximum chaos. Adjust win conditions, start settings and supply rules to create your own unique way to play.\xa0',
        'german': 'Warum bei sechs Seiten aufhören? Oder probiere [b]parallele Züge[/b] für maximales Chaos. Passe Siegbedingungen, Startregeln und Nachschubregeln an und bau dir deine ganz eigene Spielweise.\xa0',
        'spanish': '¿Por qué conformarse con seis caras? O prueba los [b]turnos paralelos[/b] para un caos total. Ajusta las condiciones de victoria, el modo de inicio y las reglas de refuerzos para crear tu propia forma de jugar.\xa0',
        'schinese': '为什么只能是六个面？或者试试 [b]并行回合[/b]，体验极致混乱。调整胜利条件、开局设置和补给规则，打造属于你自己的玩法。\xa0',
    },
    {
        'english': 'Handcrafted levels with various settings are waiting for you.\xa0',
        'german': 'Handgebaute Level mit ganz unterschiedlichen Einstellungen warten auf dich.\xa0',
        'spanish': 'Niveles hechos a mano con ajustes muy variados te están esperando.\xa0',
        'schinese': '手工打造的关卡、各不相同的设置，正等着你。\xa0',
    },
    {
        'english': '[h2][b]Open Source &amp; Community[/b][/h2]',
        'german': '[h2][b]Open Source &amp; Community[/b][/h2]',
        'spanish': '[h2][b]Código abierto y comunidad[/b][/h2]',
        'schinese': '[h2][b]开源与社区[/b][/h2]',
    },
    {
        'english': '[b]Diception is a passion project built on transparency.[/b] We believe that game logic should be open for everyone to study. That’s why the core engine of Diception is [b]Open Source[/b]. You can check out the code, see how the probability engine works, or even contribute.',
        'german': '[b]Diception ist ein Herzensprojekt, das auf Transparenz setzt.[/b] Wir finden, dass Spiellogik für alle nachvollziehbar sein sollte. Deshalb ist die Kern-Engine von Diception [b]Open Source[/b]. Du kannst dir den Code ansehen, nachvollziehen, wie die Wahrscheinlichkeitsberechnung funktioniert, oder selbst etwas beitragen.',
        'spanish': '[b]Diception es un proyecto personal basado en la transparencia.[/b] Creemos que la lógica de un juego debería estar abierta para que cualquiera la estudie. Por eso el motor de Diception es [b]código abierto[/b]. Puedes consultar el código, ver cómo funciona el cálculo de probabilidades o incluso contribuir.',
        'schinese': '[b]Diception 是一个建立在透明之上的热爱之作。[/b] 我们认为游戏逻辑应该对所有人开放。因此 Diception 的核心引擎是 [b]开源[/b] 的。你可以查看代码、了解概率引擎的运作方式，甚至参与贡献。',
    },
    {
        'english': '[h2][b]Full Version vs. Demo[/b][/h2]',
        'german': '[h2][b]Vollversion und Demo[/b][/h2]',
        'spanish': '[h2][b]Versión completa y demo[/b][/h2]',
        'schinese': '[h2][b]完整版与试玩版[/b][/h2]',
    },
    {
        'english': 'The [b]free demo[/b] offers a balanced 1vs2 bot setup on a medium-sized map. This specific configuration is one of the most fun ways to play and will remain free forever!',
        'german': 'Die [b]kostenlose Demo[/b] bietet eine ausgewogene Partie 1 gegen 2 Bots auf einer mittelgroßen Karte. Genau diese Konstellation macht besonders viel Spaß und bleibt für immer kostenlos!',
        'spanish': 'La [b]demo gratuita[/b] ofrece una partida equilibrada de 1 contra 2 bots en un mapa mediano. Esa configuración concreta es una de las más divertidas del juego, y seguirá siendo gratis para siempre.',
        'schinese': '[b]免费试玩版[/b] 提供中等地图上 1 对 2 电脑的均衡配置。这一特定配置是本作最有趣的玩法之一，并将永久免费！',
    },
    {
        'english': '[b]By purchasing the full version, you unlock:[/b]',
        'german': '[b]Mit dem Kauf der Vollversion schaltest du frei:[/b]',
        'spanish': '[b]Al comprar la versión completa desbloqueas:[/b]',
        'schinese': '[b]购买完整版即可解锁：[/b]',
    },
    {
        'english': 'The complete [b]campaign[/b].',
        'german': 'Die komplette [b]Kampagne[/b].',
        'spanish': 'La [b]campaña[/b] completa.',
        'schinese': '完整的[b]战役[/b]。',
    },
    {
        'english': '[b]Bigger Maps[/b] and Bots with higher difficulty.',
        'german': '[b]Größere Karten[/b] und Bots mit höherem Schwierigkeitsgrad.',
        'spanish': '[b]Mapas más grandes[/b] y bots de mayor dificultad.',
        'schinese': '[b]更大的地图[/b]和难度更高的电脑对手。',
    },
    {
        'english': '[b]Local Multiplayer[/b] for up to 8 players (supports Gamepads and Mobile Phones as input).',
        'german': '[b]Lokalen Mehrspieler[/b] für bis zu 8 Spieler (Gamepads und Smartphones als Eingabegeräte werden unterstützt).',
        'spanish': '[b]Multijugador local[/b] para hasta 8 jugadores (admite mandos y teléfonos móviles como mando).',
        'schinese': '最多 8 人的[b]本地多人游戏[/b]（支持手柄和手机作为输入设备）。',
    },
    {
        'english': '[b] Mods:[/b] Parallel turns, special attack/win rules, custom dice sides, and turn limits.',
        'german': '[b] Mods:[/b] Parallele Züge, besondere Angriffs- und Siegregeln, frei wählbare Würfelseiten und Zuglimits.',
        'spanish': '[b] Mods:[/b] Turnos paralelos, reglas especiales de ataque y victoria, caras de dado personalizables y límites de turno.',
        'schinese': '[b] 模组：[/b]并行回合、特殊的进攻／胜利规则、自定义骰子面数和回合上限。',
    },
    {
        'english': '[b]Steam-exclusive features:[/b] Cloud Saves, Achievements, and Remote Play Together.',
        'german': '[b]Steam-exklusive Funktionen:[/b] Cloud-Speicherstände, Erfolge und Remote Play Together.',
        'spanish': '[b]Funciones exclusivas de Steam:[/b] guardado en la nube, logros y Remote Play Together.',
        'schinese': '[b]Steam 独占功能：[/b]云存档、成就和 Remote Play Together。',
    },
]

SHORT_TEXT = {
 'schinese': "别再忍受等距地图和缓慢动画。Diception 是一款在清爽 2D 网格上进行的极速回合制征服游戏。易于上手，难于精通。支持鼠标、键盘和手柄，含模组、8 人本地多人和 Remote Play。Go!",
 'german': "Schluss mit isometrischen Karten und langsamen Animationen. Diception ist ein blitzschnelles rundenbasiertes Eroberungsspiel auf einem klaren 2D-Raster. Leicht zu lernen, schwer zu meistern. Maus, Tastatur und Gamepad, Mods, lokaler Mehrspieler für 8 und Remote Play. Go!",
 'spanish': "Olvídate de los mapas isométricos y las animaciones lentas. Diception es un juego de conquista por turnos ultrarrápido sobre una rejilla 2D limpia. Fácil de aprender, difícil de dominar. Ratón, teclado y mando, mods, multijugador local para 8 y Remote Play. ¡Vamos!",
}

SYSREQS = {
 'app[content][sysreqs][mac][min][osversion]':  {'german': 'macOS 10.13 (High Sierra)', 'spanish': 'macOS 10.13 (High Sierra)', 'schinese': 'macOS 10.13 (High Sierra)'},
 'app[content][sysreqs][mac][min][processor]':  {'german': 'Apple Silicon, Intel',      'spanish': 'Apple Silicon, Intel', 'schinese': 'Apple Silicon, Intel'},
 'app[content][sysreqs][windows][min][osversion]': {'german': 'Windows 10/11',          'spanish': 'Windows 10/11', 'schinese': 'Windows 10/11'},
 'app[content][sysreqs][windows][min][processor]': {'german': 'Dual-Core-CPU',          'spanish': 'CPU de doble núcleo', 'schinese': '双核 CPU'},
 'app[content][sysreqs][windows][min][graphics]':  {'german': 'Hardwarebeschleunigte GPU mit WebGL2- oder WebGPU-Unterstützung',
                                                    'spanish': 'GPU con aceleración por hardware compatible con WebGL2 o WebGPU',
                                                    'schinese': '支持 WebGL2 或 WebGPU 的硬件加速 GPU'},
 'app[content][sysreqs][linux][min][osversion]':   {'german': 'Ubuntu 20.04+',          'spanish': 'Ubuntu 20.04+', 'schinese': 'Ubuntu 20.04+'},
 'app[content][sysreqs][linux][min][processor]':   {'german': 'Dual-Core-CPU',          'spanish': 'CPU de doble núcleo', 'schinese': '双核 CPU'},
 'app[content][sysreqs][linux][min][graphics]':    {'german': 'Hardwarebeschleunigte GPU mit WebGL2- oder WebGPU-Unterstützung',
                                                    'spanish': 'GPU con aceleración por hardware compatible con WebGL2 o WebGPU',
                                                    'schinese': '支持 WebGL2 或 WebGPU 的硬件加速 GPU'},
}

SHORT_MAX = 300

data = json.load(open(VDF, encoding='utf-8'))
en = data['languages']['english']

for src, dst in ENGLISH_FIXES:
    if src in en[ABOUT]:
        en[ABOUT] = en[ABOUT].replace(src, dst)
# Every language that has a full set of translated fragments gets written.
# A language is complete only when it appears in every fragment, in SHORT_TEXT
# and in every SYSREQS key, so a half-finished one is skipped rather than
# uploaded with English paragraphs in the middle of it.
def complete_languages():
    have = set(ABOUT_PARTS[0]) - {'english'}
    for frag in ABOUT_PARTS:
        have &= set(frag)
    have &= set(SHORT_TEXT)
    for vals in SYSREQS.values():
        have &= set(vals)
    return sorted(have)

TARGETS = complete_languages()
partial = (set(SHORT_TEXT) | {k for f in ABOUT_PARTS for k in f}) - set(TARGETS) - {'english'}
if partial:
    print(f'incomplete, left untouched: {", ".join(sorted(partial))}')

for lang in TARGETS:
    about = en[ABOUT]
    for frag in ABOUT_PARTS:
        src = frag['english']
        if src not in about:
            sys.exit(f'fragment not found in english about ({lang}): {src[:60]!r}')
        about = about.replace(src, frag[lang], 1)
    block = data['languages'][lang]
    block[ABOUT] = about
    block[SHORT] = SHORT_TEXT[lang]
    for key, vals in SYSREQS.items():
        block[key] = vals[lang]
    if len(block[SHORT]) > SHORT_MAX:
        sys.exit(f'{lang} short_description is {len(block[SHORT])} chars, over {SHORT_MAX}')

# Match Steam's own export format so a re-download diffs cleanly: compact
# separators, raw UTF-8, and forward slashes escaped the way PHP's json_encode
# writes them. Both forms parse identically; this just keeps the round trip flat.
text = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('/', '\\/')
open(VDF, 'w', encoding='utf-8').write(text)
for lang in ['english'] + TARGETS:
    b = data['languages'][lang]
    print(f'{lang:8} about {len(b[ABOUT]):5} chars | short {len(b[SHORT]):3}/{SHORT_MAX}')
