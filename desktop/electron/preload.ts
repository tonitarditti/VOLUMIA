import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("volumia", {
  ping: () => "pong",
});

export {};
