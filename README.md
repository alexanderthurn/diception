# DICEPTION

A fast-paced, neon-styled dice strategy game. Inspired by the tactical depth of DiceWars and Kdice, Diception delivers quick turns and intense territory conquest.

**[🎮 LIVE PREVIEW](https://diception.feuerware.com/)**

---

**The code is licensed under GPLv3.** The campaign is also included here so you can learn how the levels are structured. **However:** If you appreciate my work as a solo developer, please consider buying the Steam version. Only there will you get Cloud Saves, Achievements, and directly support further development.

---

## Overview

Take control of the map by rolling dice to attack neighboring territories. The player who conquers all territories wins! If no one conquers all territories within 999 turns, the player with the most total dice wins.

**Features:**
-   **Neon Aesthetic**: Sleek visuals with dynamic effects.
-   **Multiple Start Modes**: Classic and Fair Start.
-   **Map Generation**: Various map styles (Maze, Islands, Swiss Cheese, etc.).
-   **Bots**: Play against up to 8 AI opponents.
-   **Input Support**: Full Keyboard and Gamepad support.

## Typography

The game uses **[Rajdhani](https://fonts.google.com/specimen/Rajdhani)** as its primary typeface to achieve a technical, futuristic look.
-   **Weights**: 300 (Light), 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold).
-   **Local Hosting**: Font files are bundled locally in `src/assets/fonts/` for offline support and zero external dependencies.

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

## Desktop Version

The game is bundled with **Tauri** for native desktop support.

### Development
To run the game in the Tauri container during development:
1. Run the development command:
   ```bash
   npm run tauri:dev
   ```

### Building the Desktop Version
To create a bundled desktop application for your current OS:
```bash
npm run tauri:build
```

### Steam Integration Details
Steam integration is currently being migrated to Tauri plugins. Local development and builds primarily use Tauri v2 features for window management and native performance.

## Documentation

- **[Campaign & Scenario Creation](docs/CAMPAIGNS.md)**: Guide for creating custom campaigns, scenarios, and maps.

## Credits

Created as a Dice Wars inspired strategy game.

**Branding:**
- The Steam logo and branding are property of Valve Corporation and are used in accordance with the [Steam Branding Guidelines](https://partner.steamgames.com/doc/marketing/branding).
- The "Get it on Google Play" . [Google Play Badge Guidelines](https://partnermarketinghub.withgoogle.com/brands/google-play/visual-identity/badge-guidelines/?folder=86642)

**Gamepad/Keyboard Icons**
- Thank you [Kenney.nl](https://kenney.nl/assets/input-prompts)