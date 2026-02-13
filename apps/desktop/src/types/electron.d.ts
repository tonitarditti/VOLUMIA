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
import type { ServiceStatus, StoredAppSettings, WindowBounds, WindowRuntimeState } from "@/state/settings.types";

export {};

declare global {
  interface Window {
    volumia: {
      analyzeImages: (payload: AnalyzeImagesRequest) => Promise<AnalyzeImagesResponse>;
      generateModel: (payload: GenerationRequest) => Promise<GenerationResult>;
      exportPackage: (payload: ExportRequest) => Promise<ExportResponse>;
      saveExportDialog: (payload: {
        suggestedFileName: string;
        sourceZipPath: string;
      }) => Promise<{ ok: boolean; canceled?: boolean; savedPath?: string }>;
      listStudioPresets: () => Promise<StudioPresetDefinition[]>;
      saveStudioPreset: (payload: {
        presetName: string;
        basePreset: Exclude<ObjectTypeOption, "auto-detect" | `studio:${string}`>;
        structureLocked: boolean;
        materialDefaults: Array<{ materialName: string; roughness: number; normalStrength: number }>;
        exportDefaults: { textureSize: "2k" | "4k"; includeLightweight: boolean };
      }) => Promise<StudioPresetDefinition>;
      getSettings: () => Promise<StoredAppSettings>;
      saveSettings: (payload: Partial<StoredAppSettings>) => Promise<StoredAppSettings>;
      getWindowState: () => Promise<WindowRuntimeState>;
      getWindowBounds: () => Promise<WindowBounds>;
      setWindowBounds: (payload: WindowBounds) => Promise<WindowRuntimeState>;
      applyWindowSizePreset: (preset: "small" | "medium" | "large") => Promise<boolean>;
      setAlwaysOnTop: (value: boolean) => Promise<boolean>;
      setMaximized: (value: boolean) => Promise<boolean>;
      setZoomFactor: (value: number) => Promise<boolean>;
      getGpuInfo: () => Promise<string>;
      openLogsFolder: () => Promise<string>;
      restartPythonService: () => Promise<boolean>;
      getServiceStatus: () => Promise<ServiceStatus>;
      getAppVersion: () => Promise<string>;
    };
  }
}
