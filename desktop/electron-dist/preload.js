"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const electronAPI = {
    selectImages: () => electron_1.ipcRenderer.invoke("volumia:selectImages"),
    openFolder: (folderPath) => electron_1.ipcRenderer.invoke("volumia:openFolder", folderPath),
};
electron_1.contextBridge.exposeInMainWorld("electronAPI", electronAPI);
