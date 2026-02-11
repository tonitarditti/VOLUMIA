import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  openOutputFolder: (folderPath: string) =>
    ipcRenderer.invoke('dialog:openOutputFolder', folderPath),
}

// Expose safe APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

declare global {
  interface Window {
    electronAPI: typeof electronAPI
  }
}
