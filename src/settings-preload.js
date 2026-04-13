const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  getSettings: () => ipcRenderer.invoke('get-pomodoro-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-pomodoro-settings', settings),
  closeWindow: () => ipcRenderer.send('close-settings-window'),
});
