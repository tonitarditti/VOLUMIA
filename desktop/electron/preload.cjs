const { contextBridge, ipcRenderer } = require("electron");

const electronAPI = {
  openFile: () => ipcRenderer.invoke("volumia:selectImages"),
  openOutputFolder: (folderPath) => ipcRenderer.invoke("volumia:openFolder", folderPath),
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
