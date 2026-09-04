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
        'brazilian': '[b]Diception[/b] é um jogo de conquista rápido e minimalista. Inspirado em clássicos como [i]Risk[/i] e [i]DiceWars[/i], traz partidas curtas por turnos, uma campanha extensa, um editor integrado e multijogador local para até 8 jogadores. No lugar da clássica visão isométrica, usa uma [b]visão em grade 2D[/b] otimizada, com suporte fluido a mouse, teclado e controle, e a velocidade que isso permite.',
        'french': "[b]Diception[/b] est un jeu de conquête rapide et minimaliste. Inspiré de classiques comme [i]Risk[/i] et [i]DiceWars[/i], il propose des parties au tour par tour rapides, une campagne étoffée, un éditeur intégré et du multijoueur local jusqu'à 8 joueurs. En remplaçant la vue isométrique classique par une [b]vue en grille 2D[/b] optimisée, le jeu offre une prise en main fluide à la souris, au clavier et à la manette, pour une expérience ultra-rapide.",
        'german': '[b]Diception[/b] ist ein schnelles, minimalistisches Eroberungsspiel. Inspiriert von Klassikern wie [i]Risiko[/i] und [i]DiceWars[/i] bietet es kurze rundenbasierte Partien, eine umfangreiche Kampagne, einen eingebauten Editor und lokalen Mehrspieler für bis zu 8 Spieler. Statt der klassischen isometrischen Ansicht nutzt Diception eine optimierte [b]2D-Rasteransicht[/b], mit durchgängiger Unterstützung für Maus, Tastatur und Gamepad und entsprechend hohem Tempo.',
        'italian': "[b]Diception[/b] è un gioco di conquista rapido e minimalista. Ispirato a classici come [i]Risk[/i] e [i]DiceWars[/i], offre partite a turni veloci, una campagna ricca, un editor integrato e multigiocatore locale fino a 8 giocatori. Sostituendo la classica vista isometrica con una [b]vista a griglia 2D[/b] ottimizzata, il gioco garantisce un supporto fluido per mouse, tastiera e controller, per un'esperienza fulminea.",
        'japanese': '[b]Diception[/b] は、テンポの速いミニマルな陣取りゲームです。[i]Risk[/i] や [i]DiceWars[/i] といった古典に着想を得て、短いターン制の対戦、充実したキャンペーン、内蔵エディター、最大8人のローカル対戦を収録。従来のアイソメトリック表示ではなく最適化された [b]2Dグリッド表示[/b] を採用し、マウス・キーボード・ゲームパッドをなめらかにサポートします。',
        'koreana': '[b]Diception[/b]은 빠르고 군더더기 없는 정복 게임입니다. [i]Risk[/i]와 [i]DiceWars[/i] 같은 고전에서 영감을 받아 짧은 턴제 대전, 풍성한 캠페인, 내장 에디터, 최대 8인 로컬 멀티플레이를 담았습니다. 전통적인 아이소메트릭 시점 대신 최적화된 [b]2D 그리드 뷰[/b]를 사용해 마우스와 키보드, 게임패드를 매끄럽게 지원하며 그만큼 빠릅니다.',
        'latam': '[b]Diception[/b] es un juego de conquista rápido y minimalista. Inspirado en clásicos como [i]Risk[/i] y [i]DiceWars[/i], ofrece partidas por turnos ágiles, una campaña extensa, un editor integrado y multijugador local para hasta 8 jugadores. En lugar de la clásica vista isométrica utiliza una [b]vista de cuadrícula 2D[/b] optimizada, con soporte fluido para mouse, teclado y control, y la velocidad que eso permite.',
        'portuguese': '[b]Diception[/b] é um jogo de conquista rápido e minimalista. Inspirado em clássicos como [i]Risk[/i] e [i]DiceWars[/i], traz partidas curtas por turnos, uma campanha extensa, um editor integrado e multijogador local até 8 jogadores. Em vez da clássica vista isométrica, usa uma [b]vista em grelha 2D[/b] otimizada, com suporte fluido a rato, teclado e comando, e a velocidade que isso permite.',
        'russian': '[b]Diception[/b] — быстрая минималистичная игра о завоевании. Вдохновлённая классикой вроде [i]Risk[/i] и [i]DiceWars[/i], она предлагает короткие пошаговые партии, большую кампанию, встроенный редактор и локальную игру до 8 человек. Вместо классического изометрического вида здесь оптимизированный [b]2D-вид сеткой[/b], с полноценной поддержкой мыши, клавиатуры и геймпада — и соответствующей скоростью.',
        'schinese': '[b]Diception[/b] 是一款快节奏、极简风格的征服游戏。灵感来自 [i]Risk[/i] 和 [i]DiceWars[/i] 等经典作品，提供简短的回合制对局、丰富的战役、内置编辑器，以及最多 8 人的本地多人游戏。它没有采用传统的等距视角，而是使用经过优化的 [b]2D 网格视图[/b]，全面支持鼠标、键盘和手柄，带来相应的高速体验。',
        'spanish': '[b]Diception[/b] es un juego de conquista rápido y minimalista. Inspirado en clásicos como [i]Risk[/i] y [i]DiceWars[/i], ofrece partidas por turnos ágiles, una campaña extensa, un editor integrado y multijugador local para hasta 8 jugadores. En lugar de la clásica vista isométrica utiliza una [b]vista de rejilla 2D[/b] optimizada, con soporte fluido para ratón, teclado y mando, y la velocidad que eso permite.',
        'tchinese': '[b]Diception[/b] 是一款節奏明快、極簡風格的征服遊戲。靈感來自 [i]Risk[/i] 和 [i]DiceWars[/i] 等經典作品，提供簡短的回合制對局、豐富的戰役、內建編輯器，以及最多 8 人的本機多人遊戲。它沒有採用傳統的等距視角，而是使用經過最佳化的 [b]2D 網格視圖[/b]，全面支援滑鼠、鍵盤和手把，帶來相應的高速體驗。',
    },
    {
        'english': '[h2][b]Key Features:[/b][/h2]',
        'brazilian': '[h2][b]Destaques:[/b][/h2]',
        'french': '[h2][b]Points forts :[/b][/h2]',
        'german': '[h2][b]Hauptmerkmale:[/b][/h2]',
        'italian': '[h2][b]Caratteristiche principali:[/b][/h2]',
        'japanese': '[h2][b]主な特徴：[/b][/h2]',
        'koreana': '[h2][b]주요 특징:[/b][/h2]',
        'latam': '[h2][b]Características principales:[/b][/h2]',
        'portuguese': '[h2][b]Destaques:[/b][/h2]',
        'russian': '[h2][b]Ключевые особенности:[/b][/h2]',
        'schinese': '[h2][b]主要特色：[/b][/h2]',
        'spanish': '[h2][b]Características principales:[/b][/h2]',
        'tchinese': '[h2][b]主要特色：[/b][/h2]',
    },
    {
        'english': 'Diception uses a clean 2D matrix with 4-way connections. This enables lightning-fast [b]WASD and D-Pad controls[/b], allowing for rapid-fire gameplay without sacrificing strategic depth.',
        'brazilian': 'Diception usa uma matriz 2D limpa com conexões nas quatro direções. Isso deixa os [b]controles WASD e do direcional[/b] rapidíssimos: ritmo alto, sem abrir mão da profundidade estratégica.',
        'french': 'Diception utilise une matrice 2D épurée avec des connexions dans quatre directions. Cela permet des [b]commandes WASD et croix directionnelle[/b] fulgurantes : un rythme soutenu, sans sacrifier la profondeur stratégique.',
        'german': 'Diception nutzt eine klare 2D-Matrix mit Verbindungen in vier Richtungen. Das ermöglicht blitzschnelle Steuerung per [b]WASD und Steuerkreuz[/b]: hohes Tempo, ohne strategische Tiefe zu opfern.',
        'italian': 'Diception usa una matrice 2D pulita con collegamenti nelle quattro direzioni. Questo rende i [b]comandi WASD e con la croce direzionale[/b] rapidissimi: ritmo altissimo, senza rinunciare alla profondità strategica.',
        'japanese': 'Diception は四方向につながるシンプルな2Dマトリクスを使います。そのおかげで [b]WASDと十字キーの操作[/b] が非常に速く、戦略の深さを損なわずにテンポよく遊べます。',
        'koreana': 'Diception은 사방으로 이어지는 깔끔한 2D 격자를 사용합니다. 덕분에 [b]WASD와 방향키 조작[/b]이 매우 빠르며, 전략적 깊이를 포기하지 않고도 경쾌하게 플레이할 수 있습니다.',
        'latam': 'Diception utiliza una matriz 2D limpia con conexiones en cuatro direcciones. Eso permite un control rapidísimo con [b]WASD y la cruceta[/b]: partidas veloces sin renunciar a la profundidad estratégica.',
        'portuguese': 'O Diception usa uma matriz 2D limpa com ligações nas quatro direções. Isso torna os [b]comandos WASD e do direcional[/b] rapidíssimos: ritmo alto, sem abdicar da profundidade estratégica.',
        'russian': 'Diception использует чистую 2D-матрицу со связями в четырёх направлениях. Это даёт молниеносное [b]управление на WASD и крестовине[/b]: высокий темп без потери стратегической глубины.',
        'schinese': 'Diception 采用清爽的 2D 矩阵，四方向相连。这让 [b]WASD 和方向键操作[/b] 极为迅捷——速度快，却不牺牲策略深度。',
        'spanish': 'Diception utiliza una matriz 2D limpia con conexiones en cuatro direcciones. Eso permite un control rapidísimo con [b]WASD y cruceta[/b]: partidas veloces sin renunciar a la profundidad estratégica.',
        'tchinese': 'Diception 採用清爽的 2D 矩陣，四方向相連。這讓 [b]WASD 和方向鍵操作[/b] 極為迅捷——速度快，卻不犧牲策略深度。',
    },
    {
        'english': "Battle up to 8 players in local multiplayer (Gamepads supported). Thanks to [b]Steam Remote Play Together[/b], your friends can join the fun online even if they don't own the game!",
        'brazilian': 'Enfrente até 8 jogadores no multijogador local (com suporte a controles). Graças ao [b]Steam Remote Play Together[/b], seus amigos podem entrar online mesmo sem ter o jogo!',
        'french': "Affrontez jusqu'à 8 joueurs en multijoueur local (manettes prises en charge). Grâce à [b]Steam Remote Play Together[/b], vos amis peuvent vous rejoindre en ligne même s'ils ne possèdent pas le jeu !",
        'german': 'Tritt im lokalen Mehrspieler gegen bis zu 8 Spieler an (Gamepads werden unterstützt). Dank [b]Steam Remote Play Together[/b] können deine Freunde online mitspielen, auch wenn sie das Spiel gar nicht besitzen!',
        'italian': 'Sfida fino a 8 giocatori in multigiocatore locale (controller supportati). Grazie a [b]Steam Remote Play Together[/b] i tuoi amici possono unirsi online anche se non possiedono il gioco!',
        'japanese': 'ローカル対戦で最大8人と戦えます（ゲームパッド対応）。[b]Steam Remote Play Together[/b] を使えば、ゲームを持っていない友達もオンラインで参加できます！',
        'koreana': '로컬 멀티플레이로 최대 8명과 겨뤄 보세요(게임패드 지원). [b]Steam Remote Play Together[/b] 덕분에 게임이 없는 친구도 온라인으로 함께할 수 있습니다!',
        'latam': 'Enfréntate a hasta 8 jugadores en multijugador local (con soporte para controles). Gracias a [b]Steam Remote Play Together[/b], tus amigos pueden unirse en línea aunque no tengan el juego.',
        'portuguese': 'Enfrenta até 8 jogadores em multijogador local (com suporte a comandos). Graças ao [b]Steam Remote Play Together[/b], os teus amigos podem juntar-se online mesmo sem terem o jogo!',
        'russian': 'Сражайтесь с семью соперниками в локальной игре (геймпады поддерживаются). Благодаря [b]Steam Remote Play Together[/b] друзья могут присоединиться онлайн, даже если игры у них нет!',
        'schinese': '在本地多人模式中与最多 8 名玩家对战（支持手柄）。借助 [b]Steam Remote Play Together[/b]，你的好友即使没有本作也能在线加入！',
        'spanish': 'Enfréntate a hasta 8 jugadores en multijugador local (con soporte para mandos). Gracias a [b]Steam Remote Play Together[/b], tus amigos pueden unirse en línea aunque no tengan el juego.',
        'tchinese': '在本機多人模式中與最多 8 名玩家對戰（支援手把）。藉由 [b]Steam Remote Play Together[/b]，你的好友即使沒有本作也能在線上加入！',
    },
    {
        'english': 'Choose from 3 different speed modes. Whether you want to analyze every move or &quot;blitz&quot; through territories in milliseconds, the choice is yours.',
        'brazilian': 'Escolha entre 3 modos de velocidade. Quer analisar cada jogada ou atravessar os territórios num &quot;blitz&quot; de milissegundos? A escolha é sua.',
        'french': "Choisissez parmi 3 modes de vitesse. Que vous vouliez analyser chaque coup ou traverser les territoires en &quot;blitz&quot; en quelques millisecondes, c'est vous qui décidez.",
        'german': 'Wähle zwischen 3 Geschwindigkeitsmodi. Ob du jeden Zug in Ruhe durchdenken oder in Millisekunden durch die Gebiete &quot;blitzen&quot; willst: du entscheidest.',
        'italian': 'Scegli tra 3 modalità di velocità. Che tu voglia analizzare ogni mossa o attraversare i territori in &quot;blitz&quot; nel giro di millisecondi, la scelta è tua.',
        'japanese': '3種類のスピードモードから選べます。一手ずつじっくり考えるのも、ミリ秒単位で領地を &quot;電撃戦&quot; で駆け抜けるのも自由です。',
        'koreana': '3가지 속도 모드 중에서 고르세요. 한 수 한 수 꼼꼼히 따져 보든, 밀리초 단위로 영토를 &quot;전격전&quot;처럼 훑고 지나가든 선택은 당신의 몫입니다.',
        'latam': 'Elige entre 3 modos de velocidad. Ya sea que quieras analizar cada movimiento o hacer un &quot;blitz&quot; por los territorios en milisegundos, tú decides.',
        'portuguese': 'Escolhe entre 3 modos de velocidade. Queres analisar cada jogada ou atravessar os territórios num &quot;blitz&quot; de milissegundos? A escolha é tua.',
        'russian': 'Выберите один из 3 режимов скорости. Хотите обдумывать каждый ход или проноситься по территориям &quot;блицем&quot; за миллисекунды — решать вам.',
        'schinese': '从 3 种速度模式中选择。无论你想细细推敲每一步，还是在毫秒之间“闪击”各处领地，都由你决定。',
        'spanish': 'Elige entre 3 modos de velocidad. Tanto si quieres analizar cada movimiento como hacer un &quot;blitz&quot; por los territorios en milisegundos, tú decides.',
        'tchinese': '從 3 種速度模式中選擇。無論你想細細推敲每一步，還是在毫秒之間「閃擊」各處領地，都由你決定。',
    },
    {
        'english': 'Why settle for six sides? Or try [b]parallel turns[/b] for maximum chaos. Adjust win conditions, start settings and supply rules to create your own unique way to play.\xa0',
        'brazilian': 'Por que parar em seis faces? Ou experimente [b]turnos paralelos[/b] para o caos total. Ajuste condições de vitória, regras de início e de reforço e monte o seu próprio jeito de jogar. ',
        'french': 'Pourquoi se contenter de six faces ? Ou essayez les [b]tours parallèles[/b] pour un chaos maximal. Ajustez les conditions de victoire, les règles de départ et de renfort pour créer votre propre façon de jouer.\xa0',
        'german': 'Warum bei sechs Seiten aufhören? Oder probiere [b]parallele Züge[/b] für maximales Chaos. Passe Siegbedingungen, Startregeln und Nachschubregeln an und bau dir deine ganz eigene Spielweise.\xa0',
        'italian': 'Perché accontentarsi di sei facce? Oppure prova i [b]turni paralleli[/b] per il massimo del caos. Regola condizioni di vittoria, impostazioni iniziali e regole dei rinforzi per creare il tuo modo di giocare.\xa0',
        'japanese': '6面である必要はありません。混沌を求めるなら [b]並行ターン[/b] もどうぞ。勝利条件、開始設定、補給ルールを調整して、自分だけの遊び方を作れます。 ',
        'koreana': '여섯 면에 만족할 이유가 있을까요? 아니면 [b]동시 턴[/b]으로 최대의 혼돈을 즐겨 보세요. 승리 조건과 시작 설정, 보급 규칙을 조정해 나만의 플레이 방식을 만들 수 있습니다. ',
        'latam': '¿Por qué conformarse con seis caras? O prueba los [b]turnos paralelos[/b] para un caos total. Ajusta las condiciones de victoria, las reglas de inicio y de refuerzos para crear tu propia forma de jugar. ',
        'portuguese': 'Porquê ficar pelas seis faces? Ou experimenta [b]turnos paralelos[/b] para o caos total. Ajusta condições de vitória, regras de início e de reforço e monta a tua própria forma de jogar. ',
        'russian': 'Зачем ограничиваться шестью гранями? Или включите [b]параллельные ходы[/b] ради полного хаоса. Настройте условия победы, правила старта и подкреплений и соберите свой собственный способ играть. ',
        'schinese': '为什么只能是六个面？或者试试 [b]并行回合[/b]，体验极致混乱。调整胜利条件、开局设置和补给规则，打造属于你自己的玩法。\xa0',
        'spanish': '¿Por qué conformarse con seis caras? O prueba los [b]turnos paralelos[/b] para un caos total. Ajusta las condiciones de victoria, el modo de inicio y las reglas de refuerzos para crear tu propia forma de jugar.\xa0',
        'tchinese': '為什麼只能是六個面？或者試試 [b]並行回合[/b]，體驗極致混亂。調整勝利條件、開局設定和補給規則，打造屬於你自己的玩法。 ',
    },
    {
        'english': 'Handcrafted levels with various settings are waiting for you.\xa0',
        'brazilian': 'Fases feitas à mão, cada uma com suas configurações, esperam por você. ',
        'french': 'Des niveaux faits main, avec des réglages variés, vous attendent.\xa0',
        'german': 'Handgebaute Level mit ganz unterschiedlichen Einstellungen warten auf dich.\xa0',
        'italian': 'Ti aspettano livelli creati a mano, con impostazioni sempre diverse.\xa0',
        'japanese': '設定の異なる手作りのレベルが待っています。 ',
        'koreana': '설정이 저마다 다른 수작업 레벨이 기다리고 있습니다. ',
        'latam': 'Te esperan niveles hechos a mano, cada uno con sus propios ajustes. ',
        'portuguese': 'Níveis feitos à mão, cada um com as suas definições, estão à tua espera. ',
        'russian': 'Вас ждут уровни, собранные вручную, каждый со своими настройками. ',
        'schinese': '手工打造的关卡、各不相同的设置，正等着你。\xa0',
        'spanish': 'Niveles hechos a mano con ajustes muy variados te están esperando.\xa0',
        'tchinese': '手工打造的關卡、各不相同的設定，正等著你。 ',
    },
    {
        'english': '[h2][b]Open Source &amp; Community[/b][/h2]',
        'brazilian': '[h2][b]Código aberto e comunidade[/b][/h2]',
        'french': '[h2][b]Open source &amp; communauté[/b][/h2]',
        'german': '[h2][b]Open Source &amp; Community[/b][/h2]',
        'italian': '[h2][b]Open source &amp; comunità[/b][/h2]',
        'japanese': '[h2][b]オープンソースとコミュニティ[/b][/h2]',
        'koreana': '[h2][b]오픈 소스와 커뮤니티[/b][/h2]',
        'latam': '[h2][b]Código abierto y comunidad[/b][/h2]',
        'portuguese': '[h2][b]Código aberto e comunidade[/b][/h2]',
        'russian': '[h2][b]Открытый код и сообщество[/b][/h2]',
        'schinese': '[h2][b]开源与社区[/b][/h2]',
        'spanish': '[h2][b]Código abierto y comunidad[/b][/h2]',
        'tchinese': '[h2][b]開放原始碼與社群[/b][/h2]',
    },
    {
        'english': '[b]Diception is a passion project built on transparency.[/b] We believe that game logic should be open for everyone to study. That’s why the core engine of Diception is [b]Open Source[/b]. You can check out the code, see how the probability engine works, or even contribute.',
        'brazilian': '[b]Diception é um projeto de paixão construído sobre transparência.[/b] Acreditamos que a lógica de um jogo deve estar aberta a todos. Por isso o motor do Diception é de [b]código aberto[/b]. Você pode ler o código, ver como funciona o motor de probabilidades ou até contribuir.',
        'french': "[b]Diception est un projet passion bâti sur la transparence.[/b] Nous pensons que la logique d'un jeu devrait être ouverte à tous. C'est pourquoi le moteur de Diception est [b]open source[/b]. Vous pouvez consulter le code, voir comment fonctionne le moteur de probabilités, ou même y contribuer.",
        'german': '[b]Diception ist ein Herzensprojekt, das auf Transparenz setzt.[/b] Wir finden, dass Spiellogik für alle nachvollziehbar sein sollte. Deshalb ist die Kern-Engine von Diception [b]Open Source[/b]. Du kannst dir den Code ansehen, nachvollziehen, wie die Wahrscheinlichkeitsberechnung funktioniert, oder selbst etwas beitragen.',
        'italian': '[b]Diception è un progetto nato dalla passione e costruito sulla trasparenza.[/b] Crediamo che la logica di un gioco debba essere aperta a tutti. Per questo il motore di Diception è [b]open source[/b]. Puoi leggere il codice, vedere come funziona il motore delle probabilità o persino contribuire.',
        'japanese': '[b]Diception は透明性の上に築かれた情熱的なプロジェクトです。[/b] ゲームのロジックは誰もが調べられるべきだと考えています。だから Diception のコアエンジンは [b]オープンソース[/b] です。コードを読み、確率エンジンの仕組みを確かめ、開発に参加することもできます。',
        'koreana': '[b]Diception은 투명성 위에 세운 애정의 결과물입니다.[/b] 게임 로직은 누구나 들여다볼 수 있어야 한다고 믿습니다. 그래서 Diception의 핵심 엔진은 [b]오픈 소스[/b]입니다. 코드를 확인하고 확률 엔진의 작동 방식을 살펴보거나 직접 기여할 수도 있습니다.',
        'latam': '[b]Diception es un proyecto hecho con pasión y basado en la transparencia.[/b] Creemos que la lógica de un juego debería estar abierta a todos. Por eso el motor de Diception es de [b]código abierto[/b]. Puedes revisar el código, ver cómo funciona el motor de probabilidades o incluso contribuir.',
        'portuguese': '[b]O Diception é um projeto de paixão construído sobre transparência.[/b] Acreditamos que a lógica de um jogo deve estar aberta a todos. Por isso o motor do Diception é de [b]código aberto[/b]. Podes ler o código, ver como funciona o motor de probabilidades ou até contribuir.',
        'russian': '[b]Diception сделан с любовью и построен на открытости.[/b] Мы считаем, что игровая логика должна быть доступна каждому. Поэтому движок Diception — [b]открытый код[/b]. Можно изучить его, посмотреть, как устроен расчёт вероятностей, и даже помочь с разработкой.',
        'schinese': '[b]Diception 是一个建立在透明之上的热爱之作。[/b] 我们认为游戏逻辑应该对所有人开放。因此 Diception 的核心引擎是 [b]开源[/b] 的。你可以查看代码、了解概率引擎的运作方式，甚至参与贡献。',
        'spanish': '[b]Diception es un proyecto personal basado en la transparencia.[/b] Creemos que la lógica de un juego debería estar abierta para que cualquiera la estudie. Por eso el motor de Diception es [b]código abierto[/b]. Puedes consultar el código, ver cómo funciona el cálculo de probabilidades o incluso contribuir.',
        'tchinese': '[b]Diception 是一個建立在透明之上的熱愛之作。[/b] 我們認為遊戲邏輯應該對所有人開放。因此 Diception 的核心引擎是 [b]開放原始碼[/b] 的。你可以查看程式碼、了解機率引擎的運作方式，甚至參與貢獻。',
    },
    {
        'english': '[h2][b]Full Version vs. Demo[/b][/h2]',
        'brazilian': '[h2][b]Versão completa e demo[/b][/h2]',
        'french': '[h2][b]Version complète et démo[/b][/h2]',
        'german': '[h2][b]Vollversion und Demo[/b][/h2]',
        'italian': '[h2][b]Versione completa e demo[/b][/h2]',
        'japanese': '[h2][b]製品版とデモ[/b][/h2]',
        'koreana': '[h2][b]정식 버전과 체험판[/b][/h2]',
        'latam': '[h2][b]Versión completa y demo[/b][/h2]',
        'portuguese': '[h2][b]Versão completa e demo[/b][/h2]',
        'russian': '[h2][b]Полная версия и демо[/b][/h2]',
        'schinese': '[h2][b]完整版与试玩版[/b][/h2]',
        'spanish': '[h2][b]Versión completa y demo[/b][/h2]',
        'tchinese': '[h2][b]完整版與試玩版[/b][/h2]',
    },
    {
        'english': 'The [b]free demo[/b] offers a balanced 1vs2 bot setup on a medium-sized map. This specific configuration is one of the most fun ways to play and will remain free forever!',
        'brazilian': 'A [b]demo gratuita[/b] traz uma partida equilibrada de 1 contra 2 bots em um mapa médio. Essa configuração é uma das mais divertidas e vai continuar gratuita para sempre!',
        'french': "La [b]démo gratuite[/b] propose une partie équilibrée à 1 contre 2 bots sur une carte de taille moyenne. Cette configuration est l'une des plus amusantes, et elle restera gratuite pour toujours !",
        'german': 'Die [b]kostenlose Demo[/b] bietet eine ausgewogene Partie 1 gegen 2 Bots auf einer mittelgroßen Karte. Genau diese Konstellation macht besonders viel Spaß und bleibt für immer kostenlos!',
        'italian': 'La [b]demo gratuita[/b] offre una partita equilibrata da 1 contro 2 bot su una mappa di medie dimensioni. È una delle configurazioni più divertenti e resterà gratuita per sempre!',
        'japanese': '[b]無料デモ[/b] では、中サイズのマップで 1 対 2 ボットのバランスの取れた対戦が遊べます。この構成は最も楽しい遊び方のひとつで、これからもずっと無料です！',
        'koreana': '[b]무료 체험판[/b]에서는 중간 크기 맵에서 1대2 봇의 균형 잡힌 대전을 즐길 수 있습니다. 이 구성은 가장 재미있는 플레이 방식 중 하나이며 앞으로도 계속 무료입니다!',
        'latam': 'La [b]demo gratuita[/b] ofrece una partida equilibrada de 1 contra 2 bots en un mapa mediano. Esta configuración es una de las más divertidas y seguirá siendo gratis para siempre.',
        'portuguese': 'A [b]demo gratuita[/b] traz uma partida equilibrada de 1 contra 2 bots num mapa médio. Esta configuração é uma das mais divertidas e vai continuar gratuita para sempre!',
        'russian': '[b]Бесплатное демо[/b] предлагает сбалансированную партию 1 против 2 ботов на карте среднего размера. Это одна из самых интересных конфигураций, и она навсегда останется бесплатной!',
        'schinese': '[b]免费试玩版[/b] 提供中等地图上 1 对 2 电脑的均衡配置。这一特定配置是本作最有趣的玩法之一，并将永久免费！',
        'spanish': 'La [b]demo gratuita[/b] ofrece una partida equilibrada de 1 contra 2 bots en un mapa mediano. Esa configuración concreta es una de las más divertidas del juego, y seguirá siendo gratis para siempre.',
        'tchinese': '[b]免費試玩版[/b] 提供中等地圖上 1 對 2 電腦的均衡配置。這一特定配置是本作最有趣的玩法之一，並將永久免費！',
    },
    {
        'english': '[b]By purchasing the full version, you unlock:[/b]',
        'brazilian': '[b]Ao comprar a versão completa, você desbloqueia:[/b]',
        'french': '[b]En achetant la version complète, vous débloquez :[/b]',
        'german': '[b]Mit dem Kauf der Vollversion schaltest du frei:[/b]',
        'italian': '[b]Acquistando la versione completa sblocchi:[/b]',
        'japanese': '[b]製品版を購入すると解放されるもの：[/b]',
        'koreana': '[b]정식 버전을 구매하면 열리는 것:[/b]',
        'latam': '[b]Al comprar la versión completa desbloqueas:[/b]',
        'portuguese': '[b]Ao comprares a versão completa, desbloqueias:[/b]',
        'russian': '[b]Покупая полную версию, вы открываете:[/b]',
        'schinese': '[b]购买完整版即可解锁：[/b]',
        'spanish': '[b]Al comprar la versión completa desbloqueas:[/b]',
        'tchinese': '[b]購買完整版即可解鎖：[/b]',
    },
    {
        'english': 'The complete [b]campaign[/b].',
        'brazilian': 'A [b]campanha[/b] completa.',
        'french': 'La [b]campagne[/b] complète.',
        'german': 'Die komplette [b]Kampagne[/b].',
        'italian': 'La [b]campagna[/b] completa.',
        'japanese': '完全版の [b]キャンペーン[/b]。',
        'koreana': '전체 [b]캠페인[/b].',
        'latam': 'La [b]campaña[/b] completa.',
        'portuguese': 'A [b]campanha[/b] completa.',
        'russian': 'Полную [b]кампанию[/b].',
        'schinese': '完整的[b]战役[/b]。',
        'spanish': 'La [b]campaña[/b] completa.',
        'tchinese': '完整的[b]戰役[/b]。',
    },
    {
        'english': '[b]Bigger Maps[/b] and Bots with higher difficulty.',
        'brazilian': '[b]Mapas maiores[/b] e bots mais difíceis.',
        'french': 'Des [b]cartes plus grandes[/b] et des bots plus coriaces.',
        'german': '[b]Größere Karten[/b] und Bots mit höherem Schwierigkeitsgrad.',
        'italian': '[b]Mappe più grandi[/b] e bot di difficoltà superiore.',
        'japanese': '[b]より大きなマップ[/b] と、より手強いボット。',
        'koreana': '[b]더 큰 맵[/b]과 난이도가 높은 봇.',
        'latam': '[b]Mapas más grandes[/b] y bots más difíciles.',
        'portuguese': '[b]Mapas maiores[/b] e bots mais difíceis.',
        'russian': '[b]Карты побольше[/b] и ботов посложнее.',
        'schinese': '[b]更大的地图[/b]和难度更高的电脑对手。',
        'spanish': '[b]Mapas más grandes[/b] y bots de mayor dificultad.',
        'tchinese': '[b]更大的地圖[/b]和難度更高的電腦對手。',
    },
    {
        'english': '[b]Local Multiplayer[/b] for up to 8 players (supports Gamepads and Mobile Phones as input).',
        'brazilian': '[b]Multijogador local[/b] para até 8 jogadores (controles e celulares funcionam como controle).',
        'french': "Le [b]multijoueur local[/b] jusqu'à 8 joueurs (manettes et téléphones acceptés comme manettes).",
        'german': '[b]Lokalen Mehrspieler[/b] für bis zu 8 Spieler (Gamepads und Smartphones als Eingabegeräte werden unterstützt).',
        'italian': 'Il [b]multigiocatore locale[/b] fino a 8 giocatori (controller e telefoni utilizzabili come comandi).',
        'japanese': '最大8人の [b]ローカル対戦[/b]（ゲームパッドやスマートフォンをコントローラーとして使えます）。',
        'koreana': '최대 8인 [b]로컬 멀티플레이[/b](게임패드와 휴대폰을 조작 장치로 사용 가능).',
        'latam': '[b]Multijugador local[/b] para hasta 8 jugadores (los controles y los celulares sirven como mando).',
        'portuguese': '[b]Multijogador local[/b] até 8 jogadores (comandos e telemóveis funcionam como comando).',
        'russian': '[b]Локальную игру[/b] до 8 человек (геймпады и телефоны можно использовать как контроллеры).',
        'schinese': '最多 8 人的[b]本地多人游戏[/b]（支持手柄和手机作为输入设备）。',
        'spanish': '[b]Multijugador local[/b] para hasta 8 jugadores (admite mandos y teléfonos móviles como mando).',
        'tchinese': '最多 8 人的[b]本機多人遊戲[/b]（支援手把和手機作為輸入裝置）。',
    },
    {
        'english': '[b] Mods:[/b] Parallel turns, special attack/win rules, custom dice sides, and turn limits.',
        'brazilian': '[b] Mods:[/b] turnos paralelos, regras especiais de ataque e vitória, faces de dado personalizadas e limites de turno.',
        'french': "[b] Mods :[/b] tours parallèles, règles spéciales d'attaque et de victoire, nombre de faces au choix et limites de tour.",
        'german': '[b] Mods:[/b] Parallele Züge, besondere Angriffs- und Siegregeln, frei wählbare Würfelseiten und Zuglimits.',
        'italian': '[b] Mods:[/b] turni paralleli, regole speciali di attacco e vittoria, facce dei dadi personalizzabili e limiti di turno.',
        'japanese': '[b] Mods：[/b]並行ターン、特殊な攻撃・勝利ルール、自由なサイコロの面数、ターン制限。',
        'koreana': '[b] Mods:[/b] 동시 턴, 특수 공격·승리 규칙, 원하는 주사위 면 수, 턴 제한.',
        'latam': '[b] Mods:[/b] turnos paralelos, reglas especiales de ataque y victoria, caras de dado personalizables y límites de turno.',
        'portuguese': '[b] Mods:[/b] turnos paralelos, regras especiais de ataque e vitória, faces de dado personalizadas e limites de turno.',
        'russian': '[b] Моды:[/b] параллельные ходы, особые правила атаки и победы, произвольное число граней и лимиты ходов.',
        'schinese': '[b] 模组：[/b]并行回合、特殊的进攻／胜利规则、自定义骰子面数和回合上限。',
        'spanish': '[b] Mods:[/b] Turnos paralelos, reglas especiales de ataque y victoria, caras de dado personalizables y límites de turno.',
        'tchinese': '[b] 模組：[/b]並行回合、特殊的進攻／勝利規則、自訂骰子面數和回合上限。',
    },
    {
        'english': '[b]Steam-exclusive features:[/b] Cloud Saves, Achievements, and Remote Play Together.',
        'brazilian': '[b]Recursos exclusivos da Steam:[/b] saves na nuvem, conquistas e Remote Play Together.',
        'french': '[b]Fonctionnalités exclusives à Steam :[/b] sauvegardes dans le cloud, succès et Remote Play Together.',
        'german': '[b]Steam-exklusive Funktionen:[/b] Cloud-Speicherstände, Erfolge und Remote Play Together.',
        'italian': '[b]Funzioni esclusive di Steam:[/b] salvataggi nel cloud, obiettivi e Remote Play Together.',
        'japanese': '[b]Steam限定の機能：[/b]クラウドセーブ、実績、Remote Play Together。',
        'koreana': '[b]Steam 전용 기능:[/b] 클라우드 저장, 도전 과제, Remote Play Together.',
        'latam': '[b]Funciones exclusivas de Steam:[/b] guardado en la nube, logros y Remote Play Together.',
        'portuguese': '[b]Funcionalidades exclusivas da Steam:[/b] gravações na nuvem, proezas e Remote Play Together.',
        'russian': '[b]Возможности только в Steam:[/b] облачные сохранения, достижения и Remote Play Together.',
        'schinese': '[b]Steam 独占功能：[/b]云存档、成就和 Remote Play Together。',
        'spanish': '[b]Funciones exclusivas de Steam:[/b] guardado en la nube, logros y Remote Play Together.',
        'tchinese': '[b]Steam 獨佔功能：[/b]雲端存檔、成就和 Remote Play Together。',
    },
]

SHORT_TEXT = {
    'brazilian': 'Esqueça mapas isométricos e animações lentas. Diception é um jogo de conquista por turnos ultrarrápido em uma grade 2D limpa. Fácil de aprender, difícil de dominar. Mouse, teclado e controle, mods, multijogador local para 8 e Remote Play. Go!',
    'french': 'Oubliez les cartes isométriques et les animations lentes. Diception est un jeu de conquête au tour par tour ultra-rapide sur une grille 2D épurée. Facile à apprendre, difficile à maîtriser. Souris, clavier et manette, mods, multijoueur local à 8 et Remote Play. Go !',
    'german': 'Schluss mit isometrischen Karten und langsamen Animationen. Diception ist ein blitzschnelles rundenbasiertes Eroberungsspiel auf einem klaren 2D-Raster. Leicht zu lernen, schwer zu meistern. Maus, Tastatur und Gamepad, Mods, lokaler Mehrspieler für 8 und Remote Play. Go!',
    'italian': 'Dimentica le mappe isometriche e le animazioni lente. Diception è un gioco di conquista a turni fulmineo su una griglia 2D pulita. Facile da imparare, difficile da padroneggiare. Mouse, tastiera e controller, mods, multigiocatore locale a 8 e Remote Play. Go!',
    'japanese': 'アイソメトリックなマップと遅いアニメーションはもう不要。Diception は、すっきりした2Dグリッドで遊ぶ超高速のターン制陣取りゲームです。覚えるのは簡単、極めるのは大変。マウス・キーボード・ゲームパッド対応、Mods、8人ローカル対戦、Remote Play。Go!',
    'koreana': '아이소메트릭 맵과 느린 애니메이션은 이제 그만. Diception은 깔끔한 2D 격자 위에서 즐기는 초고속 턴제 정복 게임입니다. 배우기는 쉽고 통달하기는 어렵습니다. 마우스·키보드·게임패드 지원, Mods, 8인 로컬 멀티플레이, Remote Play. Go!',
    'latam': 'Olvídate de los mapas isométricos y las animaciones lentas. Diception es un juego de conquista por turnos ultrarrápido sobre una cuadrícula 2D limpia. Fácil de aprender, difícil de dominar. Mouse, teclado y control, mods, multijugador local para 8 y Remote Play. ¡Vamos!',
    'portuguese': 'Esquece os mapas isométricos e as animações lentas. O Diception é um jogo de conquista por turnos ultrarrápido numa grelha 2D limpa. Fácil de aprender, difícil de dominar. Rato, teclado e comando, mods, multijogador local até 8 e Remote Play. Go!',
    'russian': 'Забудьте про изометрические карты и медленные анимации. Diception — молниеносная пошаговая игра о завоевании на чистой 2D-сетке. Легко освоить, трудно освоить до конца. Мышь, клавиатура и геймпад, моды, локальная игра на 8 и Remote Play. Go!',
    'schinese': '别再忍受等距地图和缓慢动画。Diception 是一款在清爽 2D 网格上进行的极速回合制征服游戏。易于上手，难于精通。支持鼠标、键盘和手柄，含模组、8 人本地多人和 Remote Play。Go!',
    'spanish': 'Olvídate de los mapas isométricos y las animaciones lentas. Diception es un juego de conquista por turnos ultrarrápido sobre una rejilla 2D limpia. Fácil de aprender, difícil de dominar. Ratón, teclado y mando, mods, multijugador local para 8 y Remote Play. ¡Vamos!',
    'tchinese': '別再忍受等距地圖和緩慢動畫。Diception 是一款在清爽 2D 網格上進行的極速回合制征服遊戲。易於上手，難於精通。支援滑鼠、鍵盤和手把，含模組、8 人本機多人和 Remote Play。Go!',
}

SYSREQS = {
    'app[content][sysreqs][mac][min][osversion]': {
        'brazilian': 'macOS 10.13 (High Sierra)',
        'french': 'macOS 10.13 (High Sierra)',
        'german': 'macOS 10.13 (High Sierra)',
        'italian': 'macOS 10.13 (High Sierra)',
        'japanese': 'macOS 10.13 (High Sierra)',
        'koreana': 'macOS 10.13 (High Sierra)',
        'latam': 'macOS 10.13 (High Sierra)',
        'portuguese': 'macOS 10.13 (High Sierra)',
        'russian': 'macOS 10.13 (High Sierra)',
        'schinese': 'macOS 10.13 (High Sierra)',
        'spanish': 'macOS 10.13 (High Sierra)',
        'tchinese': 'macOS 10.13 (High Sierra)',
    },
    'app[content][sysreqs][mac][min][processor]': {
        'brazilian': 'Apple Silicon, Intel',
        'french': 'Apple Silicon, Intel',
        'german': 'Apple Silicon, Intel',
        'italian': 'Apple Silicon, Intel',
        'japanese': 'Apple Silicon、Intel',
        'koreana': 'Apple Silicon, Intel',
        'latam': 'Apple Silicon, Intel',
        'portuguese': 'Apple Silicon, Intel',
        'russian': 'Apple Silicon, Intel',
        'schinese': 'Apple Silicon, Intel',
        'spanish': 'Apple Silicon, Intel',
        'tchinese': 'Apple Silicon、Intel',
    },
    'app[content][sysreqs][windows][min][osversion]': {
        'brazilian': 'Windows 10/11',
        'french': 'Windows 10/11',
        'german': 'Windows 10/11',
        'italian': 'Windows 10/11',
        'japanese': 'Windows 10/11',
        'koreana': 'Windows 10/11',
        'latam': 'Windows 10/11',
        'portuguese': 'Windows 10/11',
        'russian': 'Windows 10/11',
        'schinese': 'Windows 10/11',
        'spanish': 'Windows 10/11',
        'tchinese': 'Windows 10/11',
    },
    'app[content][sysreqs][windows][min][processor]': {
        'brazilian': 'CPU dual core',
        'french': 'Processeur double cœur',
        'german': 'Dual-Core-CPU',
        'italian': 'CPU dual core',
        'japanese': 'デュアルコアCPU',
        'koreana': '듀얼 코어 CPU',
        'latam': 'CPU de doble núcleo',
        'portuguese': 'CPU dual core',
        'russian': 'Двухъядерный процессор',
        'schinese': '双核 CPU',
        'spanish': 'CPU de doble núcleo',
        'tchinese': '雙核心 CPU',
    },
    'app[content][sysreqs][windows][min][graphics]': {
        'brazilian': 'GPU com aceleração de hardware e suporte a WebGL2 ou WebGPU',
        'french': 'GPU à accélération matérielle compatible WebGL2 ou WebGPU',
        'german': 'Hardwarebeschleunigte GPU mit WebGL2- oder WebGPU-Unterstützung',
        'italian': 'GPU con accelerazione hardware compatibile con WebGL2 o WebGPU',
        'japanese': 'WebGL2 または WebGPU に対応したハードウェアアクセラレーション対応GPU',
        'koreana': 'WebGL2 또는 WebGPU를 지원하는 하드웨어 가속 GPU',
        'latam': 'GPU con aceleración por hardware compatible con WebGL2 o WebGPU',
        'portuguese': 'GPU com aceleração por hardware e suporte a WebGL2 ou WebGPU',
        'russian': 'Видеокарта с аппаратным ускорением и поддержкой WebGL2 или WebGPU',
        'schinese': '支持 WebGL2 或 WebGPU 的硬件加速 GPU',
        'spanish': 'GPU con aceleración por hardware compatible con WebGL2 o WebGPU',
        'tchinese': '支援 WebGL2 或 WebGPU 的硬體加速 GPU',
    },
    'app[content][sysreqs][linux][min][osversion]': {
        'brazilian': 'Ubuntu 20.04+',
        'french': 'Ubuntu 20.04+',
        'german': 'Ubuntu 20.04+',
        'italian': 'Ubuntu 20.04+',
        'japanese': 'Ubuntu 20.04+',
        'koreana': 'Ubuntu 20.04+',
        'latam': 'Ubuntu 20.04+',
        'portuguese': 'Ubuntu 20.04+',
        'russian': 'Ubuntu 20.04+',
        'schinese': 'Ubuntu 20.04+',
        'spanish': 'Ubuntu 20.04+',
        'tchinese': 'Ubuntu 20.04+',
    },
    'app[content][sysreqs][linux][min][processor]': {
        'brazilian': 'CPU dual core',
        'french': 'Processeur double cœur',
        'german': 'Dual-Core-CPU',
        'italian': 'CPU dual core',
        'japanese': 'デュアルコアCPU',
        'koreana': '듀얼 코어 CPU',
        'latam': 'CPU de doble núcleo',
        'portuguese': 'CPU dual core',
        'russian': 'Двухъядерный процессор',
        'schinese': '双核 CPU',
        'spanish': 'CPU de doble núcleo',
        'tchinese': '雙核心 CPU',
    },
    'app[content][sysreqs][linux][min][graphics]': {
        'brazilian': 'GPU com aceleração de hardware e suporte a WebGL2 ou WebGPU',
        'french': 'GPU à accélération matérielle compatible WebGL2 ou WebGPU',
        'german': 'Hardwarebeschleunigte GPU mit WebGL2- oder WebGPU-Unterstützung',
        'italian': 'GPU con accelerazione hardware compatibile con WebGL2 o WebGPU',
        'japanese': 'WebGL2 または WebGPU に対応したハードウェアアクセラレーション対応GPU',
        'koreana': 'WebGL2 또는 WebGPU를 지원하는 하드웨어 가속 GPU',
        'latam': 'GPU con aceleración por hardware compatible con WebGL2 o WebGPU',
        'portuguese': 'GPU com aceleração por hardware e suporte a WebGL2 ou WebGPU',
        'russian': 'Видеокарта с аппаратным ускорением и поддержкой WebGL2 или WebGPU',
        'schinese': '支持 WebGL2 或 WebGPU 的硬件加速 GPU',
        'spanish': 'GPU con aceleración por hardware compatible con WebGL2 o WebGPU',
        'tchinese': '支援 WebGL2 或 WebGPU 的硬體加速 GPU',
    },
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
