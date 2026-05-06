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

Run the dev server on the matching OS (no cross-compilation):
```bash
npm run tauri:dev:mac      # on macOS
npm run tauri:dev:win      # on Windows
npm run tauri:dev:linux    # on Linux
npm run tauri:dev:android  # on any OS with Android SDK
```

### Steam SDK Setup (required for distribution builds)

The Steamworks SDK runtime libraries are not committed to the repo. Before building
for Steam, fetch them once with:

```bash
export STEAM_SDK_ZIP_URL=https://feuerware.com/redistributable_bin.zip
npm run fetch-steam-sdk
```

This downloads the zip from `STEAM_SDK_ZIP_URL` and places the following files in
`src-tauri/resources/`. The script finds them by matching `<dir>/<file>` regardless
of any extra nesting in the zip (e.g. `redistributable_bin/` wrapper is handled
automatically):

| Destination | Located in zip under |
|---|---|
| `src-tauri/resources/libsteam_api.dylib` | `osx/libsteam_api.dylib` |
| `src-tauri/resources/steam_api64.dll` | `win64/steam_api64.dll` |
| `src-tauri/resources/libsteam_api.so` | `linux64/libsteam_api.so` |

Re-run only when Valve releases a new SDK version. The files are gitignored.

### Building for Steam

Run each build command on its target OS (or let CI do it — see below).
Output lands in `dist-tauri/<platform>/`, ready for Steam upload.

```bash
npm run tauri:build:mac      # → dist-tauri/mac/DICEPTION.app
npm run tauri:build:win      # → dist-tauri/win/DICEPTION.exe + steam_api64.dll
npm run tauri:build:linux    # → dist-tauri/linux/diception + libsteam_api.so
```

---

## Android

The Android build uses Tauri and a native Kotlin store plugin for Google Play Billing and AdMob rewarded ads.

### Environment

Android Studio installs the SDK to `~/Library/Android/sdk` on macOS. Set these before running any Android command:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$HOME/Library/Android/sdk/ndk/$(ls $HOME/Library/Android/sdk/ndk | tail -1)"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
```

### First-time setup

`src-tauri/gen/android/` is gitignored. Run this once (and again after any Tauri upgrade) to regenerate it with all customisations applied:

```bash
npm run android:init
```

This deletes any existing `gen/android/`, runs `tauri android init`, applies the app icon, copies `scripts/StorePlugin.kt` into the project, and applies `scripts/android-main-activity.patch` (fullscreen mode, billing/ads dependencies, AdMob meta-data).

### Development

```bash
npm run tauri:dev:android    # live-reload dev build on connected device
```

### Debug APK (sideload for testing)

Builds a signed debug APK for `arm64` only — small enough to sideload without Play Store:

```bash
npm run android:build:debug  # → dist-tauri/android/DICEPTION-debug.apk
adb install dist-tauri/android/DICEPTION-debug.apk
```

### Release APK / AAB (CI)

```bash
npm run tauri:build:android  # → dist-tauri/android/DICEPTION.apk (unsigned universal)
```

The CI workflow (`.github/workflows/android.yml`) signs both the APK and AAB automatically using the `ANDROID_KEYSTORE` (base64) and `ANDROID_STORE_PASSWORD` repository secrets.

### Before publishing to Google Play

Two placeholders in the codebase must be replaced with real values:

| File | Placeholder | Where to get it |
|---|---|---|
| `scripts/android-main-activity.patch` | `ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX` | AdMob console → App → App ID |
| `scripts/StorePlugin.kt` | `YOUR_ADMOB_REWARDED_AD_UNIT_ID` | AdMob console → Ad units → Rewarded |

Also create an in-app product with ID `full_version` in the Google Play Console under your app's **Monetize → In-app products**.

> IAP and real ads only work when the app is installed from the Play Store (internal testing track works). They will not function on sideloaded APKs.

### Simulating Android in the browser

Append `?android=true` to the dev server URL to enable Android mode (persists via `localStorage`). This shows the Lite Version UI, unlock dialog with mock store, and countdown timer. Clear with `?android=false`.

### Store abstraction

The native store is implemented in `scripts/StorePlugin.kt` (Kotlin Tauri plugin, `@TauriPlugin(name = "store")`). The JS side in `src/native/android-store.js` selects the provider via `window.android.storeProvider`:

| `storeProvider` | JS class | Kotlin backend |
|---|---|---|
| `google_play` | `GooglePlayStore` | `StorePlugin.kt` via `plugin:store\|*` |
| `amazon` | `AmazonStore` | *(future)* |
| `mock` | `MockStore` | *(browser simulation)* |

### CI Builds (GitHub Actions)

All four platforms are built automatically on every `v*` tag push or via manual
workflow dispatch. Artifacts are available for download from the Actions run.

The `STEAM_SDK_ZIP_URL` repository secret must be set in GitHub →
Settings → Secrets → Actions for the Steam API libraries to be included.

### Uploading to Steam

Requires `steamcmd` on PATH and `STEAM_USER` set:
```bash
HOME=$(pwd) ./steamcmd
export STEAM_USER=your_steam_username
steamcmd +login $STEAM_USER +run_app_build $(pwd)/steam/app_build_mac.vdf +quit
```




## Documentation

- **[Campaign & Scenario Creation](docs/CAMPAIGNS.md)**: Guide for creating custom campaigns, scenarios, and maps.

## Credits

Created as a Dice Wars inspired strategy game.

**Branding:**
- The Steam logo and branding are property of Valve Corporation and are used in accordance with the [Steam Branding Guidelines](https://partner.steamgames.com/doc/marketing/branding).
- The "Get it on Google Play" . [Google Play Badge Guidelines](https://partnermarketinghub.withgoogle.com/brands/google-play/visual-identity/badge-guidelines/?folder=86642)

**Gamepad/Keyboard Icons**
- Thank you [Kenney.nl](https://kenney.nl/assets/input-prompts)


**SFX**
- Thank you  [SFXR](https://pro.sfxr.me/)

- ffmpeg -i coin.wav -c:a libopus -b:a 64k coin.ogg