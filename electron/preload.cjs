const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  serverUrl: null, // Will be set via IPC
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),
  printToPdf: (options) => ipcRenderer.invoke('print-to-pdf', options),
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
});
