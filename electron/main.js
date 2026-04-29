const { app, BrowserWindow, ipcMain, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// ── Linux: fix library search path before any native modules load ─────────────
// Steam sets LD_LIBRARY_PATH to its own dirs, which contain an older
// libsteam_api.so that may be missing symbols steamworks.js@0.4 requires.
// glibc re-reads LD_LIBRARY_PATH on each dlopen(), so prepending here (before
// require('steamworks.js') below) ensures the bundled version wins.
if (process.platform === 'linux') {
    const swLibDir = path.join(process.resourcesPath, 'app.asar.unpacked',
        'node_modules', 'steamworks.js', 'dist', 'linux64');
    const appDir = path.dirname(process.execPath);
    const existing = process.env.LD_LIBRARY_PATH || '';
    process.env.LD_LIBRARY_PATH = [swLibDir, appDir, existing].filter(Boolean).join(':');

    // Required for Steam Linux runtime: sandbox and zygote process model fail there.
    app.commandLine.appendSwitch('no-sandbox');
    app.commandLine.appendSwitch('disable-gpu-sandbox');
    app.commandLine.appendSwitch('in-process-gpu');
    app.commandLine.appendSwitch('disable-dev-shm-usage'); // use /tmp instead of /dev/shm
    app.commandLine.appendSwitch('no-zygote');             // prevents ESRCH zygote failures
}

// ── Steam ─────────────────────────────────────────────────────────────────────

let steam = null;  // steamworks.js client
let sw    = null;  // steamworks.js module

function initSteam() {
    try {
        sw     = require('steamworks.js');
        sw.electronEnableSteamOverlay();
        steam  = sw.init();
        console.log('[Steam] Initialized:', steam.localplayer.getName());
        // steamworks.js runs callbacks automatically via Node event loop — no setInterval needed
    } catch (e) {
        console.warn('[Steam] Init failed:', e.message);
    }
}

// ── Storage ───────────────────────────────────────────────────────────────────

const SAVE_FILENAME = 'diception_save.sav';
// Match Tauri's app data directory so Steam Cloud syncs the same file.
// Tauri uses the bundle identifier (com.feuerware.diception) as the folder name.
const TAURI_APP_ID = 'com.feuerware.diception';

function getSavePath() {
    const dataDir = path.join(app.getPath('appData'), TAURI_APP_ID);
    fs.mkdirSync(dataDir, { recursive: true });
    return path.join(dataDir, SAVE_FILENAME);
}

// ── Window ────────────────────────────────────────────────────────────────────

let mainWin = null;

function createWindow() {
    mainWin = new BrowserWindow({
        width: 800,
        height: 600,
        center: true,
        frame: true,
        icon: app.isPackaged
            ? path.join(process.resourcesPath, 'icon.png')
            : path.join(__dirname, '../src-tauri/icons/128x128.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWin.loadFile(path.join(__dirname, '../dist/index.html'));

    const safeSend = (ch) => { if (!mainWin?.isDestroyed()) mainWin.webContents.send(ch); };
    mainWin.on('move',   () => safeSend('win:moved'));
    mainWin.on('resize', () => safeSend('win:resized'));
    mainWin.on('closed', () => { mainWin = null; });
}

app.whenReady().then(() => {
    if (process.platform === 'darwin') {
        app.dock.setIcon(path.join(__dirname, '../src-tauri/icons/icon.png'));
    }
    initSteam();
    createWindow();
});
app.on('window-all-closed', () => app.quit());

// ── IPC: Steam ────────────────────────────────────────────────────────────────

ipcMain.handle('steam:getUserName', () =>
    steam?.localplayer.getName() ?? '');

ipcMain.handle('steam:getSteamId', () => {
    const id = steam?.localplayer.getSteamId();
    return id ? String(id.steamId64 ?? id) : '0';
});

ipcMain.handle('steam:getAppId', () =>
    steam?.utils.getAppId() ?? 0);

ipcMain.handle('steam:isDev', () =>
    !app.isPackaged);

ipcMain.handle('steam:quit', () =>
    app.quit());

ipcMain.handle('steam:activateOverlay', (_e, dialog) => {
    if (!steam) return;
    const dlg = steam.overlay.Dialog[dialog] ?? steam.overlay.Dialog.Friends;
    steam.overlay.activateDialog(dlg);
});

ipcMain.handle('steam:openStore', () => {
    if (!steam) return;
    const flag = steam.overlay.StoreFlag?.None ?? 0;
    steam.overlay.activateToStore(steam.utils.getAppId(), flag);
});

ipcMain.handle('steam:unlockAchievement', (_e, id) => {
    if (!steam) return;
    steam.achievement.activate(id);
    steam.stats.store();
});

ipcMain.handle('steam:getUnlockedAchievements', (_e, ids) => {
    if (!steam) return ids.filter(() => false);
    return ids.filter(id => steam.achievement.isActivated(id));
});

ipcMain.handle('steam:getStatI32', (_e, name) =>
    steam?.stats.getInt(name) ?? 0);

ipcMain.handle('steam:setStat', (_e, name, value) => {
    if (!steam) return;
    steam.stats.setInt(name, value);
    steam.stats.store();
});

ipcMain.handle('steam:clearAchievement', (_e, id) => {
    if (!steam) return;
    steam.achievement.clear(id);
    steam.stats.store();
});

// ── IPC: Storage ──────────────────────────────────────────────────────────────

ipcMain.handle('storage:readAll', () => {
    const p = getSavePath();
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '{}';
});

ipcMain.handle('storage:writeAll', (_e, data) =>
    fs.writeFileSync(getSavePath(), data, 'utf8'));

ipcMain.handle('storage:getPath', () =>
    getSavePath());

// ── IPC: Window management ────────────────────────────────────────────────────

ipcMain.handle('win:close',          () => mainWin?.close());
ipcMain.handle('win:setFullscreen',  (_e, flag) => mainWin?.setFullScreen(flag));
ipcMain.handle('win:isFullscreen',   () => mainWin?.isFullScreen() ?? false);
ipcMain.handle('win:setDecorations', () => { /* frame set at creation; no-op */ });
ipcMain.handle('win:unmaximize',     () => mainWin?.unmaximize());
ipcMain.handle('win:setPosition',    (_e, pos) => mainWin?.setPosition(Math.round(pos.x), Math.round(pos.y)));
ipcMain.handle('win:setSize',        (_e, sz)  => mainWin?.setSize(Math.round(sz.width), Math.round(sz.height)));
ipcMain.handle('win:outerPosition',  () => { const [x, y] = mainWin?.getPosition() ?? [0, 0]; return { x, y }; });
ipcMain.handle('win:outerSize',      () => { const [width, height] = mainWin?.getSize() ?? [800, 600]; return { width, height }; });
ipcMain.handle('win:openDevtools',   () => mainWin?.webContents.openDevTools());

ipcMain.handle('win:getMonitors', () =>
    screen.getAllDisplays().map(d => ({
        name: d.label || `Display ${d.id}`,
        position: { x: d.bounds.x, y: d.bounds.y },
        size: { width: d.bounds.width, height: d.bounds.height },
    })));

ipcMain.handle('win:getCurrentMonitor', () => {
    if (!mainWin) return null;
    const d = screen.getDisplayMatching(mainWin.getBounds());
    return {
        name: d.label || `Display ${d.id}`,
        position: { x: d.bounds.x, y: d.bounds.y },
        size: { width: d.bounds.width, height: d.bounds.height },
    };
});

// ── IPC: Open URL ─────────────────────────────────────────────────────────────

ipcMain.handle('openUrl', (_e, url) => shell.openExternal(url));
