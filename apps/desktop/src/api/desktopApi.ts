import type {
  AnalyzeImagesRequest,
  AnalyzeImagesResponse,
  ExportRequest,
  ExportResponse,
  GenerationRequest,
  GenerationResult,
  ObjectTypeOption,
  StudioPresetDefinition,
} from "@volumia/shared";
import type { ServiceInfo, ServiceStatus, StoredAppSettings, WindowBounds, WindowRuntimeState, WindowSizePreset } from "@/state/settings.types";

function ensureBridge() {
  if (!window.volumia) {
    throw new Error("Desktop bridge is unavailable. Check preload configuration.");
  }
  return window.volumia;
}

function ensureWindowBridge() {
  if (!window.volumiaWindow) {
    throw new Error("Window controls bridge is unavailable. Check preload configuration.");
  }
  return window.volumiaWindow;
}

export const desktopApi = {
  analyzeImages(payload: AnalyzeImagesRequest): Promise<AnalyzeImagesResponse> {
    return ensureBridge().analyzeImages(payload);
  },
  generateModel(payload: GenerationRequest): Promise<GenerationResult> {
    return ensureBridge().generateModel(payload);
  },
  exportPackage(payload: ExportRequest): Promise<ExportResponse> {
    return ensureBridge().exportPackage(payload);
  },
  saveExportDialog(payload: { suggestedFileName: string; sourceZipPath: string }) {
    return ensureBridge().saveExportDialog(payload);
  },
  listStudioPresets(): Promise<StudioPresetDefinition[]> {
    return ensureBridge().listStudioPresets();
  },
  saveStudioPreset(payload: {
    presetName: string;
    basePreset: Exclude<ObjectTypeOption, "auto-detect" | `studio:${string}`>;
    structureLocked: boolean;
    materialDefaults: Array<{ materialName: string; roughness: number; normalStrength: number }>;
    exportDefaults: { textureSize: "2k" | "4k"; includeLightweight: boolean };
  }): Promise<StudioPresetDefinition> {
    return ensureBridge().saveStudioPreset(payload);
  },
  getSettings(): Promise<StoredAppSettings> {
    return ensureBridge().getSettings();
  },
  saveSettings(payload: Partial<StoredAppSettings>): Promise<StoredAppSettings> {
    return ensureBridge().saveSettings(payload);
  },
  getWindowState(): Promise<WindowRuntimeState> {
    return ensureBridge().getWindowState();
  },
  getWindowBounds(): Promise<WindowBounds> {
    return ensureBridge().getWindowBounds();
  },
  setWindowBounds(payload: WindowBounds): Promise<WindowRuntimeState> {
    return ensureBridge().setWindowBounds(payload);
  },
  applyWindowSizePreset(preset: WindowSizePreset): Promise<boolean> {
    return ensureBridge().applyWindowSizePreset(preset);
  },
  setAlwaysOnTop(value: boolean): Promise<boolean> {
    return ensureBridge().setAlwaysOnTop(value);
  },
  setMaximized(value: boolean): Promise<boolean> {
    return ensureBridge().setMaximized(value);
  },
  setZoomFactor(value: number): Promise<boolean> {
    return ensureBridge().setZoomFactor(value);
  },
  getGpuInfo(): Promise<string> {
    return ensureBridge().getGpuInfo();
  },
  openLogsFolder(): Promise<string> {
    return ensureBridge().openLogsFolder();
  },
  openServiceFolder(): Promise<boolean> {
    return ensureBridge().openServiceFolder();
  },
  restartPythonService(): Promise<boolean> {
    return ensureBridge().restartPythonService();
  },
  getServiceStatus(): Promise<ServiceStatus> {
    return ensureBridge().getServiceStatus();
  },
  getServiceInfo(): Promise<ServiceInfo> {
    return ensureBridge().getServiceInfo();
  },
  getAppVersion(): Promise<string> {
    return ensureBridge().getAppVersion();
  },
  windowMinimize(): Promise<boolean> {
    return ensureWindowBridge().minimize();
  },
  windowToggleMaximize(): Promise<boolean> {
    return ensureWindowBridge().toggleMaximize();
  },
  windowClose(): Promise<boolean> {
    return ensureWindowBridge().close();
  },
  windowIsMaximized(): Promise<boolean> {
    return ensureWindowBridge().isMaximized();
  },
};
