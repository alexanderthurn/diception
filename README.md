# DICEPTION

A neon-styled, turn-based dice strategy game inspired by Dice Wars / Risk.

**[🎮 LIVE PREVIEW](https://diception.feuerware.com/)**

## Overview

Take control of the map by rolling dice to attack neighboring territories. The player who conquers all territories wins!

**Features:**
-   **Neon Aesthetic**: Sleek visuals with dynamic effects.
-   **Multiple Start Modes**: Classic and Fair Start.
-   **Map Generation**: Various map styles (Maze, Islands, Swiss Cheese, etc.).
-   **Bots**: Play against up to 8 AI opponents.
-   **Input Support**: Full Keyboard and Gamepad support.

## How to Play

A detailed **How to Play** guide is available directly inside the game.
Click the **"?"** / **How to Play** button in the main setup menu to view:
-   **Basics**: Short tutorial on game mechanics.
-   **Controls**: Full list of Keyboard and Gamepad inputs.
-   **Settings**: Explanations for all game configuration options.

## Getting Started

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Start development server:**
    ```bash
    npm run dev
    ```

3.  **Build for production:**
    ```bash
    npm run build
    ```

## Steam & Desktop Version

The game is bundled with **Electron** and **steamworks.js** for native desktop support and Steam integration.

### Development
To run the game in the Electron container during development:
1. Ensure Steam is running on your machine.
2. Run the development command:
   ```bash
   npm run electron:dev
   ```

### Building the Steam Version
To create a bundled desktop application for your current OS (output to `dist-steam/`):
```bash
npm run steam:build
```

To cross-compile for **Windows** from your Mac:
```bash
npm run steam:build:win
```

### Steam Integration Details
- **AppID**: Currently defaults to `480` (SpaceWar test app).
- **Configuration**: To use your own AppID, update:
  - `steam_appid.txt` in the root directory.
  - The AppID in `electron-main.cjs` (line 12).
- **Features**: The desktop version supports native features like Steam user identification and achievements (via `window.steam` in the frontend).

## Credits

Created as a Dice Wars inspired strategy game.


TODO:

* Scenarios / Maps / Replays (like play this exact setup again froum round 1,2,3,4)
* Highscores, how many wins does the human have? 
* Reset config and highscore button
* Saving stuff with php (like ai + maps + highscores)
* BattleLog for Bots should be seen immediately when a bot is playing, this is important for beginners to see what is going on.

* No reload when changing visual effects
* if it is a bots turn, do not show the border of the active player as white, keep the color of the player. only if a human is active, make it like now (white)


* HARD AI:

Revised Hard AI Strategy
Priority System (same as medium):
Priority 1: Dice advantage ≥ 2
Priority 2: Dice advantage == 1
Priority 3: Same dice only if no attacks made yet
Smart Scoring Within Each Priority:
Target STRONGER players (+points) ✅
Count territories per opponent
Prefer attacking players with MORE territories
They're the real threat and need to be weakened
Attack from WEAKER positions (+points) ✅
Prefer attacking from tiles with FEWER dice
Preserve your strongest stacks for critical battles
Use expendable weak stacks first
Break connected enemy regions (+points) ✅
Count how many same-owner neighbors the target has
Prefer targets with MORE friendly neighbors (part of big regions)
Breaking these reduces their bonus dice next turn
Disrupts their economy
Value consolidation (+points) ✅
Prefer attacks that would connect your own territories
Building contiguous regions strengthens your position
Target high-value territories (+points) ✅
Prefer targets with more dice (more valuable when captured)
