import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  openFile: () => ipcRenderer.invoke('volumia:selectImages'),
  openOutputFolder: (folderPath: string) =>
    ipcRenderer.invoke('volumia:openFolder', folderPath),
}

// Expose safe APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

declare global {
  interface Window {
    electronAPI: typeof electronAPI
  }
}
