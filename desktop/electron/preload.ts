import { contextBridge, ipcRenderer } from "electron";

const electronAPI = {
  selectImages: () => ipcRenderer.invoke("volumia:selectImages") as Promise<string[]>,
  openFolder: (folderPath: string) => ipcRenderer.invoke("volumia:openFolder", folderPath) as Promise<boolean>,
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
