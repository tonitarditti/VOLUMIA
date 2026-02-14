import type { VolumiaDesktopBridge } from "./desktopApi";

export {};

declare global {
  interface Window {
    volumia?: VolumiaDesktopBridge;
  }
}
