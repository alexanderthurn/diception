"""Fill German and Spanish into steam/storepage_1106365_all.json.

Only the prose is replaced; BBCode tags, {STEAM_APP_IMAGE} references and the
&quot;/&amp; entity encoding are carried over from the English source untouched,
so the localized pages keep exactly the same layout as the English one.

Run from the repo root, then upload the JSON in Steamworks under
Store Presence -> Localization.
"""
import json, sys

VDF = 'steam/storepage_1106365_all.json'
ABOUT = 'app[content][about]'
SHORT = 'app[content][short_description]'

# Corrections applied to the English about text before anything is translated,
# so all three languages stay in sync. Upload fixes the English page too.
ENGLISH_FIXES = [
    # unfinished sentence
    ("are waiting for you to.\u00a0", "are waiting for you.\u00a0"),
    # double space
    ("Or try  [b]parallel turns[/b]", "Or try [b]parallel turns[/b]"),
    # stray empty bold paragraph above the campaign blurb
    ("[p][b] [/b] [/p]", ""),
]

# (english fragment, german, spanish) — applied to the English about text in order.
ABOUT_PARTS = [
 ("[b]Diception[/b] is a fast, minimalistic conquest game. Inspired by classics like [i]Risk[/i] and [i]DiceWars[/i], it features quick turn-based matches, an extensive campaign, a built-in editor, and local multiplayer for up to 8 players. By replacing the classic isometric view with an optimized [b]2D Grid View[/b], the game offers seamless Mouse, Keyboard, and Gamepad support for a lightning-fast experience.",
  "[b]Diception[/b] ist ein schnelles, minimalistisches Eroberungsspiel. Inspiriert von Klassikern wie [i]Risiko[/i] und [i]DiceWars[/i] bietet es kurze rundenbasierte Partien, eine umfangreiche Kampagne, einen eingebauten Editor und lokalen Mehrspieler für bis zu 8 Spieler. Statt der klassischen isometrischen Ansicht nutzt Diception eine optimierte [b]2D-Rasteransicht[/b] — mit durchgängiger Unterstützung für Maus, Tastatur und Gamepad und einem entsprechend hohen Tempo.",
  "[b]Diception[/b] es un juego de conquista rápido y minimalista. Inspirado en clásicos como [i]Risk[/i] y [i]DiceWars[/i], ofrece partidas por turnos ágiles, una campaña extensa, un editor integrado y multijugador local para hasta 8 jugadores. En lugar de la clásica vista isométrica utiliza una [b]vista de rejilla 2D[/b] optimizada, con soporte fluido para ratón, teclado y mando, y la velocidad que eso permite."),

 ("[h2][b]Key Features:[/b][/h2]",
  "[h2][b]Hauptmerkmale:[/b][/h2]",
  "[h2][b]Características principales:[/b][/h2]"),

 ("Diception uses a clean 2D matrix with 4-way connections. This enables lightning-fast [b]WASD and D-Pad controls[/b], allowing for rapid-fire gameplay without sacrificing strategic depth.",
  "Diception nutzt eine klare 2D-Matrix mit Verbindungen in vier Richtungen. Das ermöglicht blitzschnelle Steuerung per [b]WASD und Steuerkreuz[/b] — hohes Tempo, ohne strategische Tiefe zu opfern.",
  "Diception utiliza una matriz 2D limpia con conexiones en cuatro direcciones. Eso permite un control rapidísimo con [b]WASD y cruceta[/b]: partidas veloces sin renunciar a la profundidad estratégica."),

 ("Battle up to 8 players in local multiplayer (Gamepads supported). Thanks to [b]Steam Remote Play Together[/b], your friends can join the fun online even if they don't own the game!",
  "Tritt im lokalen Mehrspieler gegen bis zu 8 Spieler an (Gamepads werden unterstützt). Dank [b]Steam Remote Play Together[/b] können deine Freunde online mitspielen, auch wenn sie das Spiel gar nicht besitzen!",
  "Enfréntate a hasta 8 jugadores en multijugador local (con soporte para mandos). Gracias a [b]Steam Remote Play Together[/b], tus amigos pueden unirse en línea aunque no tengan el juego."),

 ("Choose from 3 different speed modes. Whether you want to analyze every move or &quot;blitz&quot; through territories in milliseconds, the choice is yours.",
  "Wähle zwischen 3 Geschwindigkeitsmodi. Ob du jeden Zug in Ruhe durchdenken oder in Millisekunden durch die Gebiete &quot;blitzen&quot; willst — du entscheidest.",
  "Elige entre 3 modos de velocidad. Tanto si quieres analizar cada movimiento como hacer un &quot;blitz&quot; por los territorios en milisegundos, tú decides."),

 ("Why settle for six sides? Or try [b]parallel turns[/b] for maximum chaos. Adjust win conditions, start settings and supply rules to create your own unique way to play.\u00a0",
  "Warum bei sechs Seiten aufhören? Oder probiere [b]parallele Züge[/b] für maximales Chaos. Passe Siegbedingungen, Startregeln und Nachschubregeln an und bau dir deine ganz eigene Spielweise.\u00a0",
  "¿Por qué conformarse con seis caras? O prueba los [b]turnos paralelos[/b] para un caos total. Ajusta las condiciones de victoria, el modo de inicio y las reglas de refuerzos para crear tu propia forma de jugar.\u00a0"),

 ("Handcrafted levels with various settings are waiting for you.\u00a0",
  "Handgebaute Level mit ganz unterschiedlichen Einstellungen warten auf dich.\u00a0",
  "Niveles hechos a mano con ajustes muy variados te están esperando.\u00a0"),

 ("[h2][b]Open Source &amp; Community[/b][/h2]",
  "[h2][b]Open Source &amp; Community[/b][/h2]",
  "[h2][b]Código abierto y comunidad[/b][/h2]"),

 ("[b]Diception is a passion project built on transparency.[/b] We believe that game logic should be open for everyone to study. That’s why the core engine of Diception is [b]Open Source[/b]. You can check out the code, see how the probability engine works, or even contribute.",
  "[b]Diception ist ein Herzensprojekt, das auf Transparenz setzt.[/b] Wir finden, dass Spiellogik für alle nachvollziehbar sein sollte. Deshalb ist die Kern-Engine von Diception [b]Open Source[/b]. Du kannst dir den Code ansehen, nachvollziehen, wie die Wahrscheinlichkeitsberechnung funktioniert, oder selbst etwas beitragen.",
  "[b]Diception es un proyecto personal basado en la transparencia.[/b] Creemos que la lógica de un juego debería estar abierta para que cualquiera la estudie. Por eso el motor de Diception es [b]código abierto[/b]. Puedes consultar el código, ver cómo funciona el cálculo de probabilidades o incluso contribuir."),

 ("[h2][b]Full Version vs. Demo[/b][/h2]",
  "[h2][b]Vollversion und Demo[/b][/h2]",
  "[h2][b]Versión completa y demo[/b][/h2]"),

 ("The [b]free demo[/b] offers a balanced 1vs2 bot setup on a medium-sized map. This specific configuration is one of the most fun ways to play and will remain free forever!",
  "Die [b]kostenlose Demo[/b] bietet eine ausgewogene Partie 1 gegen 2 Bots auf einer mittelgroßen Karte. Genau diese Konstellation macht besonders viel Spaß — und bleibt für immer kostenlos!",
  "La [b]demo gratuita[/b] ofrece una partida equilibrada de 1 contra 2 bots en un mapa mediano. Esa configuración concreta es una de las más divertidas del juego, y seguirá siendo gratis para siempre."),

 ("[b]By purchasing the full version, you unlock:[/b]",
  "[b]Mit dem Kauf der Vollversion schaltest du frei:[/b]",
  "[b]Al comprar la versión completa desbloqueas:[/b]"),

 ("The complete [b]campaign[/b].",
  "Die komplette [b]Kampagne[/b].",
  "La [b]campaña[/b] completa."),

 ("[b]Bigger Maps[/b] and Bots with higher difficulty.",
  "[b]Größere Karten[/b] und Bots mit höherem Schwierigkeitsgrad.",
  "[b]Mapas más grandes[/b] y bots de mayor dificultad."),

 ("[b]Local Multiplayer[/b] for up to 8 players (supports Gamepads and Mobile Phones as input).",
  "[b]Lokalen Mehrspieler[/b] für bis zu 8 Spieler (Gamepads und Smartphones als Eingabegeräte werden unterstützt).",
  "[b]Multijugador local[/b] para hasta 8 jugadores (admite mandos y teléfonos móviles como mando)."),

 ("[b] Mods:[/b] Parallel turns, special attack/win rules, custom dice sides, and turn limits.",
  "[b] Mods:[/b] Parallele Züge, besondere Angriffs- und Siegregeln, frei wählbare Würfelseiten und Zuglimits.",
  "[b] Mods:[/b] Turnos paralelos, reglas especiales de ataque y victoria, caras de dado personalizables y límites de turno."),

 ("[b]Steam-exclusive features:[/b] Cloud Saves, Achievements, and Remote Play Together.",
  "[b]Steam-exklusive Funktionen:[/b] Cloud-Speicherstände, Erfolge und Remote Play Together.",
  "[b]Funciones exclusivas de Steam:[/b] guardado en la nube, logros y Remote Play Together."),
]

SHORT_TEXT = {
 'german': "Schluss mit isometrischen Karten und langsamen Animationen. Diception ist ein blitzschnelles rundenbasiertes Eroberungsspiel auf einem klaren 2D-Raster. Leicht zu lernen, schwer zu meistern. Maus, Tastatur und Gamepad, Mods, lokaler Mehrspieler für 8 und Remote Play. Los!",
 'spanish': "Olvídate de los mapas isométricos y las animaciones lentas. Diception es un juego de conquista por turnos ultrarrápido sobre una rejilla 2D limpia. Fácil de aprender, difícil de dominar. Ratón, teclado y mando, mods, multijugador local para 8 y Remote Play. ¡Vamos!",
}

SYSREQS = {
 'app[content][sysreqs][mac][min][osversion]':  {'german': 'macOS 10.13 (High Sierra)', 'spanish': 'macOS 10.13 (High Sierra)'},
 'app[content][sysreqs][mac][min][processor]':  {'german': 'Apple Silicon, Intel',      'spanish': 'Apple Silicon, Intel'},
 'app[content][sysreqs][windows][min][osversion]': {'german': 'Windows 10/11',          'spanish': 'Windows 10/11'},
 'app[content][sysreqs][windows][min][processor]': {'german': 'Dual-Core-CPU',          'spanish': 'CPU de doble núcleo'},
 'app[content][sysreqs][windows][min][graphics]':  {'german': 'Hardwarebeschleunigte GPU mit WebGL2- oder WebGPU-Unterstützung',
                                                    'spanish': 'GPU con aceleración por hardware compatible con WebGL2 o WebGPU'},
 'app[content][sysreqs][linux][min][osversion]':   {'german': 'Ubuntu 20.04+',          'spanish': 'Ubuntu 20.04+'},
 'app[content][sysreqs][linux][min][processor]':   {'german': 'Dual-Core-CPU',          'spanish': 'CPU de doble núcleo'},
 'app[content][sysreqs][linux][min][graphics]':    {'german': 'Hardwarebeschleunigte GPU mit WebGL2- oder WebGPU-Unterstützung',
                                                    'spanish': 'GPU con aceleración por hardware compatible con WebGL2 o WebGPU'},
}

SHORT_MAX = 300

data = json.load(open(VDF, encoding='utf-8'))
en = data['languages']['english']

for src, dst in ENGLISH_FIXES:
    if src in en[ABOUT]:
        en[ABOUT] = en[ABOUT].replace(src, dst)
idx = {'german': 1, 'spanish': 2}

for lang, i in idx.items():
    about = en[ABOUT]
    for parts in ABOUT_PARTS:
        src = parts[0]
        if src not in about:
            sys.exit(f'fragment not found in english about ({lang}): {src[:60]!r}')
        about = about.replace(src, parts[i], 1)
    block = data['languages'][lang]
    block[ABOUT] = about
    block[SHORT] = SHORT_TEXT[lang]
    for key, vals in SYSREQS.items():
        block[key] = vals[lang]
    if len(block[SHORT]) > SHORT_MAX:
        sys.exit(f'{lang} short_description is {len(block[SHORT])} chars, over {SHORT_MAX}')

json.dump(data, open(VDF, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
for lang in ('english',) + tuple(idx):
    b = data['languages'][lang]
    print(f'{lang:8} about {len(b[ABOUT]):5} chars | short {len(b[SHORT]):3}/{SHORT_MAX}')
