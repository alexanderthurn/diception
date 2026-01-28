const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const steamworks = require('steamworks.js');
steamworks.electronEnableSteamOverlay();

let mainWindow;
let steamClient;

// Initialize Steamworks
try {
    // Use 480 (SpaceWar) for testing if no appId is provided
    // Replace 480 with your actual Steam App ID
    steamClient = steamworks.init(480);
    if (steamClient) {
        console.log('Steamworks initialized successfully for App ID: ' + steamClient.localUser.getSteamId().getRawSteamId());
    }
} catch (e) {
    console.error('Steamworks failed to initialize. Is Steam running?', e);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        useContentSize: true, // Ensure the DOM area is exactly 1280x720
        minWidth: 1024,
        minHeight: 720,
        resizable: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'electron-preload.js')
        },
        backgroundColor: '#000000',
        icon: path.join(__dirname, 'public/icon.png')
    });

    // Set dock icon for macOS development
    if (process.platform === 'darwin' && !app.isPackaged) {
        app.dock.setIcon(path.join(__dirname, 'public/icon.png'));
    }

    // In development, load from vite dev server if running
    // In production, load from the built dist folder
    const isDev = !app.isPackaged;
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
    }

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});

// IPC handlers for Steam integration
ipcMain.handle('steam-get-user-name', () => {
    return steamClient ? steamClient.localUser.getName() : 'Offline User';
});

ipcMain.handle('steam-quit', () => {
    app.quit();
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
