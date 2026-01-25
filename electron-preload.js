const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('steam', {
    getUserName: () => ipcRenderer.invoke('steam-get-user-name'),
    activateAchievement: (id) => ipcRenderer.invoke('steam-activate-achievement', id),
    quit: () => ipcRenderer.invoke('steam-quit'),
    isSteamVersion: true
});
