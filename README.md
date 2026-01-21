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


* change basic settings. dice sides should be minimum 1 and not 2. max dice per territory should be 16 and not 20