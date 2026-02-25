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
Run the dev server for your current OS:
```bash
npm run tauri:dev:mac
npm run tauri:dev:win
npm run tauri:dev:linux
npm run tauri:dev:android
```

### Steam SDK Setup (required for distribution builds)

The Steamworks SDK runtime libraries are not committed to the repo. Before building
for Steam you need to place them in `src-tauri/resources/`:

| Platform | File | Source in Steamworks SDK |
|---|---|---|
| macOS | `libsteam_api.dylib` | `redistributable_bin/osx/libsteam_api.dylib` |
| Windows | `steam_api64.dll` | `redistributable_bin/win64/steam_api64.dll` |
| Linux | `libsteam_api.so` | `redistributable_bin/linux64/libsteam_api.so` |

**One-time setup** — set the path to your Steamworks SDK, then run the copy script:
```bash
export STEAMWORKS_SDK_PATH=/path/to/steamworks_sdk
npm run copy-steam-sdk:mac    # or :win / :linux
```

If `STEAMWORKS_SDK_PATH` is not set the script is skipped silently, so local dev
builds (without Steam) still work.

### Building for Steam

Outputs go into `dist-tauri/<platform>/`, ready for `./steam/upload_steam.sh`.

```bash
npm run tauri:build:mac
npm run tauri:build:win
npm run tauri:build:linux
npm run tauri:build:android
```

CI (GitHub Actions) builds all platforms automatically on every `v*` tag push
or via manual workflow dispatch. Artifacts are available for download from the
Actions run. The Steam SDK libraries are fetched in CI from a private zip — see
the `STEAM_SDK_ZIP_URL` repository secret.

### Uploading to Steam
```bash
./steam/upload_steam.sh mac     # upload only mac depot
./steam/upload_steam.sh win     # upload only win depot
./steam/upload_steam.sh linux   # upload only linux depot
./steam/upload_steam.sh         # upload all depots
```
Requires `steamcmd` on PATH and `STEAM_USER` env var set.

## Documentation

- **[Campaign & Scenario Creation](docs/CAMPAIGNS.md)**: Guide for creating custom campaigns, scenarios, and maps.

## Credits

Created as a Dice Wars inspired strategy game.

**Branding:**
- The Steam logo and branding are property of Valve Corporation and are used in accordance with the [Steam Branding Guidelines](https://partner.steamgames.com/doc/marketing/branding).
- The "Get it on Google Play" . [Google Play Badge Guidelines](https://partnermarketinghub.withgoogle.com/brands/google-play/visual-identity/badge-guidelines/?folder=86642)

**Gamepad/Keyboard Icons**
- Thank you [Kenney.nl](https://kenney.nl/assets/input-prompts)