const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getHardwareInfo: () => ipcRenderer.invoke('get-hardware-info'),
  launchMinecraft: (args) => ipcRenderer.invoke('launch-minecraft', args),
  onMinecraftStdout: (callback) => ipcRenderer.on('minecraft-stdout', (_e, data) => callback(data)),
  onMinecraftStderr: (callback) => ipcRenderer.on('minecraft-stderr', (_e, data) => callback(data)),
  onMinecraftClosed: (callback) => ipcRenderer.on('minecraft-closed', (_e, data) => callback(data)),
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  getLauncherSettings: () => ipcRenderer.invoke('get-launcher-settings'),
  saveLauncherSettings: (settings) => ipcRenderer.invoke('save-launcher-settings', settings),
  chooseGameFolder: () => ipcRenderer.invoke('choose-game-folder'),
  getEditorStyles: () => ipcRenderer.invoke('get-editor-styles'),
  saveEditorStyles: (styles) => ipcRenderer.invoke('save-editor-styles', styles),
});
