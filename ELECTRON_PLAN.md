# Electron Dual Backend Plan

Goal: Tauri for Mac/Windows/Android (unchanged), Electron for Linux (Steam Deck).
Electron also buildable on Mac for local testing.

## Steps

- [x] 1. Install Electron dependencies (electron, electron-builder, steamworks.js)
- [x] 2. Create src/native/win.js — abstraction over Tauri/Electron window API
- [x] 3. Update src/main.js — replace all @tauri-apps/api imports with win.js
- [x] 4. Create electron/preload.js — contextBridge injecting window.steam, window.openUrl, window.electronWin, window.electronEvents, window.electronStorage
- [x] 5. Create electron/main.js — ipcMain handlers for Steam, storage, window management
- [x] 6. Add electron-builder config to package.json
- [x] 7. Add npm scripts: electron:dev, electron:build:mac, electron:build:win, electron:build:linux
- [ ] 8. Test on Mac (Steam, overlay, fullscreen, monitor, save file)
- [ ] 9. (Later) Wire build-linux-electron job into release.yml

## Key decisions

- Frontend never changes except replacing @tauri-apps/api imports with win.js
- win.js detects Tauri (window.__TAURI_INTERNALS__) vs Electron (window.electronWin) at runtime
- Electron output goes to dist-tauri/electron-{mac|win|linux}/ mirroring Tauri structure
- steamworks.js replaces the Rust steamworks crate for the Electron backend
- Steam callbacks loop: setInterval(SteamAPI.runCallbacks, 100) in electron/main.js
- Shift+Tab overlay workaround: same as Tauri, manual call in preload.js keydown handler
- Save file location: same app data dir convention, resolved via app.getPath('userData')
