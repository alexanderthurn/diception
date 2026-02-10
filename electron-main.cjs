const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const steamworks = require('steamworks.js');

// --- 1. PERFORMANCE & DISPLAY SETTINGS ---
// Diese Flags müssen VOR dem ready-Event gesetzt werden
//app.commandLine.appendSwitch('high-dpi-support', '1');
//app.commandLine.appendSwitch('force-device-scale-factor', '1');
//app.commandLine.appendSwitch('limit-fps', '60');
//app.commandLine.appendSwitch('disable-frame-rate-limit');

// Steam Overlay aktivieren
steamworks.electronEnableSteamOverlay();

let mainWindow;
let steamClient;

// --- 2. STEAM INITIALIZATION ---
try {
    // 480 ist die App ID für SpaceWar (Test-ID). 
    // Ersetze sie später durch deine echte App ID.
    steamClient = steamworks.init(480);
    if (steamClient) {
        console.log('Steamworks initialized: ' + steamClient.localUser.getSteamId().getRawSteamId());
    }
} catch (e) {
    console.error('Steamworks failed to initialize. Is Steam running?', e);
}

// --- 3. WINDOW MANAGEMENT ---
function createWindow() {
    // Ermittelt die Auflösung des aktuellen Monitors
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    mainWindow = new BrowserWindow({
        width: width,   // Nutzt die native Breite
        height: height, // Nutzt die native Höhe
        fullscreen: true,
        autoHideMenuBar: true,
        backgroundColor: '#000000',
        icon: path.join(__dirname, 'public/icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'electron-preload.js'),
            // Verbessert das Rendering bei ungeraden Skalierungen
           // enablePreferredSizeMode: true ,
            //backgroundThrottling: false, 
           zoomFactor: 1.0
        }
    });

    // --- 4. ANTI-BLUR & AUTO-ZOOM ---
    mainWindow.webContents.on('did-finish-load', () => {
        // Logik: Je höher die Auflösung, desto höher der Zoom,
        // damit Elemente auf dem TV lesbar bleiben, aber scharf gerendert werden.
        if (width >= 3840) {
            // 4K TV: Alles auf 200% skalieren
            mainWindow.webContents.setZoomFactor(2.0);
        } else if (width >= 2560) {
            // 1440p Monitor: 150%
            mainWindow.webContents.setZoomFactor(1.5);
        } else if (width >= 1920) {
            // 1080p Monitor: 125% (optional, für bessere TV-Lesbarkeit)
            mainWindow.webContents.setZoomFactor(1.25);
        }
    });

    // Development vs. Production Load
    const isDev = !app.isPackaged;
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
    }

    // MacOS Dock Icon
    if (process.platform === 'darwin' && !app.isPackaged) {
        app.dock.setIcon(path.join(__dirname, 'public/icon.png'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// --- 5. APP EVENTS ---
app.on('ready', createWindow);

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

app.on('will-quit', () => {
    // Erzwingt das Ende des Prozesses, egal was noch offen ist
    process.exit(0);
});

app.on('window-all-closed', () => {
    // 1. Steamworks herunterfahren (falls vorhanden)
    if (steamClient) {
        // Manche Wrapper brauchen ein explizites Shutdown, 
        // steamworks.js macht das oft automatisch, aber sicher ist sicher:
        steamClient = null; 
    }
    app.quit();
    
});

// --- 6. IPC HANDLERS (Steam Integration) ---
ipcMain.handle('steam-get-user-name', () => {
    return steamClient ? steamClient.localUser.getName() : 'Offline User';
});

ipcMain.handle('steam-get-id', () => {
    if (steamClient) {
        try {
            return steamClient.localUser.getSteamId().getRawSteamId();
        } catch (e) {
            console.error('Failed to get Steam ID', e);
        }
    }
    return null;
});

ipcMain.handle('steam-quit', () => {
console.log("Shutting down...");
    app.quit();
    // Falls app.quit() nicht reicht (weil noch Events hängen):
    setTimeout(() => {
        process.exit(0);
    }, 500); // Gibt ihm 500ms Zeit zum Aufräumen, dann Kill
});

ipcMain.handle('steam-is-dev', () => {
    return !app.isPackaged;
});

ipcMain.handle('steam-activate-achievement', (event, achievementId) => {
    if (steamClient) {
        try {
            steamClient.achievements.activate(achievementId);
            return true;
        } catch (e) {
            console.error('Failed to activate achievement:', achievementId, e);
        }
    }
    return false;
});

