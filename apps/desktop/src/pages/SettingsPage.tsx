import { useCallback, useEffect, useState } from "react";
import { desktopApi, hasDesktopBridge } from "@/electron/desktopApi";
import type { ClearCacheResult, PythonCandidate, PythonProbeResult } from "@/electron/channels";
import { Button, Card, Select, TextField, Toggle } from "@/ui/primitives";
import { useT } from "@/volumia/i18n/useT";
import { useSettings } from "@/volumia/settings/context";
import type { AppSettings } from "@/volumia/settings/types";

const CACHE_CLEAR_MARKER_FILE = "__clear_cache_on_next_start__.json";
const PYTHON_PATH_STORAGE_KEY = "volumia.python.path";
const PYTHON_SHOW_ADVANCED_STORAGE_KEY = "volumia.python.showAdvanced";
const SHOW_LEGACY_PYTHON_PANEL = false;

function readLocalStorageValue(key: string) {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeLocalStorageValue(key: string, value: string | undefined) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (typeof value === "string" && value.trim().length > 0) {
      window.localStorage.setItem(key, value.trim());
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures.
  }
}

type SettingsPageProps = {
  onImportProjects: () => Promise<void>;
  onExportProjects: () => Promise<void>;
  onExportSettings: () => Promise<void>;
  onImportSettings: () => Promise<void>;
  onResetSettings: () => void;
  onResetAllData: () => Promise<void>;
  onResetWindowLayout: () => Promise<void>;
};

export function SettingsPage({
  onImportProjects,
  onExportProjects,
  onExportSettings,
  onImportSettings,
  onResetSettings,
  onResetAllData,
  onResetWindowLayout,
}: SettingsPageProps) {
  const { t } = useT();
  const {
    settings,
    resolvedLanguage,
    resolvedTheme,
    systemLocale,
    systemTheme,
    setLanguageMode,
    setLanguage,
    setThemeMode,
    setTheme,
    setTimeTheme,
    setGlassStyle,
    setReduceMotion,
    setWindowMode,
    setRememberWindowBounds,
    setPerformancePreset,
    setFpsLimit,
    setAntialias,
    setPythonPath,
    resetToRecommended,
  } = useSettings();
  const [pythonCandidates, setPythonCandidates] = useState<PythonCandidate[]>([]);
  const [pythonRejectedCandidates, setPythonRejectedCandidates] = useState<PythonCandidate[]>([]);
  const [selectedPythonPath, setSelectedPythonPath] = useState(settings.pythonPath ?? "");
  const [showAdvancedPython, setShowAdvancedPython] = useState<boolean>(() => {
    const storedValue = readLocalStorageValue(PYTHON_SHOW_ADVANCED_STORAGE_KEY).toLowerCase();
    return storedValue === "1" || storedValue === "true";
  });
  const [pythonProbe, setPythonProbe] = useState<PythonProbeResult | null>(null);
  const [pythonLogs, setPythonLogs] = useState<string[]>([]);
  const [pythonMessage, setPythonMessage] = useState("");
  const [isDetectingPython, setIsDetectingPython] = useState(false);
  const [isProbingPython, setIsProbingPython] = useState(false);
  const [isInstallingTorch, setIsInstallingTorch] = useState(false);
  const [userDataPath, setUserDataPath] = useState("");
  const [systemMessage, setSystemMessage] = useState("");
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [clearCacheResult, setClearCacheResult] = useState<ClearCacheResult | null>(null);
  const [clearCacheMessage, setClearCacheMessage] = useState("");
  const [comfyDir, setComfyDir] = useState("");
  const [comfyEnvName, setComfyEnvName] = useState("volumia");
  const [comfyPort, setComfyPort] = useState("8188");
  const [comfyHook, setComfyHook] = useState("");
  const [comfyPythonOverride, setComfyPythonOverride] = useState("");
  const [comfyConfigMessage, setComfyConfigMessage] = useState("");
  const [isSavingComfyConfig, setIsSavingComfyConfig] = useState(false);

  const fpsOptions: AppSettings["fpsLimit"][] = [30, 60, 120];

  const languageLabels: Record<AppSettings["language"], string> = {
    es: t("settings.option.language.es"),
    en: t("settings.option.language.en"),
    pt: t("settings.option.language.pt"),
  };

  const themeLabels: Record<AppSettings["theme"], string> = {
    light: t("settings.option.theme.light"),
    dark: t("settings.option.theme.dark"),
  };

  const handleResetAll = async () => {
    const confirmed = window.confirm(t("settings.resetAllConfirm"));
    if (!confirmed) return;
    await onResetAllData();
  };

  const applyPythonPathSelection = useCallback((pythonPath: string) => {
    const normalizedPath = pythonPath.trim();
    setSelectedPythonPath(normalizedPath);
    setPythonPath(normalizedPath.length > 0 ? normalizedPath : undefined);
    writeLocalStorageValue(PYTHON_PATH_STORAGE_KEY, normalizedPath.length > 0 ? normalizedPath : undefined);
  }, [setPythonPath]);

  const handleDetectPython = useCallback(async () => {
    if (!hasDesktopBridge()) {
      setPythonMessage(t("settings.generator.noBridge"));
      return;
    }

    setIsDetectingPython(true);
    setPythonMessage("");

    try {
      const storedPreferredPath = readLocalStorageValue(PYTHON_PATH_STORAGE_KEY) || settings.pythonPath || "";
      const result = await desktopApi.detectPythonInterpreters(storedPreferredPath);
      setPythonCandidates(result.candidates);
      setPythonRejectedCandidates(result.rejectedCandidates);
      if (result.candidates.length === 0) {
        applyPythonPathSelection("");
        setPythonProbe(null);
        setPythonMessage("No se encontraron interpretes de Python utilizables con CUDA.");
        return;
      }

      const preferredPath =
        result.candidates.find((candidate) => candidate.pythonPath === result.selectedPythonPath)?.pythonPath ??
        result.candidates.find((candidate) => candidate.pythonPath === settings.pythonPath)?.pythonPath ??
        result.candidates[0].pythonPath;

      applyPythonPathSelection(preferredPath);
      setPythonMessage(
        `Detectados ${result.candidates.length} interprete(s) CUDA listos.` +
          (result.rejectedCandidates.length > 0
            ? ` ${result.rejectedCandidates.length} no utilizables en avanzado.`
            : "")
      );
    } catch (error) {
      setPythonMessage(
        error instanceof Error ? error.message : t("settings.generator.checkFailed")
      );
    } finally {
      setIsDetectingPython(false);
    }
  }, [applyPythonPathSelection, settings.pythonPath, t]);

  const handleProbePython = async () => {
    if (!hasDesktopBridge()) {
      setPythonMessage(t("settings.generator.noBridge"));
      return;
    }

    if (!selectedPythonPath) {
      setPythonMessage("Selecciona un interprete de Python primero.");
      return;
    }

    setIsProbingPython(true);
    setPythonMessage("");

    try {
      const result = await desktopApi.probePythonInterpreter(selectedPythonPath);
      setPythonProbe(result);
      if (!result.ok) {
        setPythonMessage(result.error || "La comprobacion fallo.");
        return;
      }

      if (!result.torchInstalled) {
        setPythonMessage("PyTorch no esta instalado en este interprete.");
        return;
      }

      if (!result.cudaAvailable) {
        setPythonMessage("PyTorch instalado, pero CUDA no disponible.");
      } else {
        setPythonMessage(`CUDA disponible en: ${result.deviceName ?? "GPU detectada"}.`);
      }
    } catch (error) {
      setPythonMessage(
        error instanceof Error ? error.message : t("settings.generator.testFailed")
      );
    } finally {
      setIsProbingPython(false);
    }
  };

  const handleInstallTorchCuda = async () => {
    if (!hasDesktopBridge()) {
      setPythonMessage(t("settings.generator.noBridge"));
      return;
    }

    if (!selectedPythonPath) {
      setPythonMessage("Selecciona un interprete de Python primero.");
      return;
    }

    setIsInstallingTorch(true);
    setPythonLogs([]);
    setPythonMessage("");

    try {
      const installResult = await desktopApi.installTorchCuda(selectedPythonPath);
      if (installResult.logs.trim().length > 0) {
        const lines = installResult.logs.split(/\r?\n/).filter((line) => line.trim().length > 0);
        setPythonLogs((previous) => (previous.length >= lines.length ? previous : lines));
      }

      if (!installResult.ok) {
        setPythonMessage(installResult.error || "La instalacion de PyTorch CUDA fallo.");
        return;
      }

      setPythonMessage("Instalacion completada. Ejecutando prueba...");
      const probeResult = await desktopApi.probePythonInterpreter(selectedPythonPath);
      setPythonProbe(probeResult);
    } catch (error) {
      setPythonMessage(error instanceof Error ? error.message : "La instalacion fallo.");
    } finally {
      setIsInstallingTorch(false);
    }
  };

  const handleCopyLogs = async () => {
    if (pythonLogs.length === 0) {
      return;
    }

    try {
      await navigator.clipboard.writeText(pythonLogs.join("\n"));
      setPythonMessage("Logs copiados al portapapeles.");
    } catch {
      setPythonMessage("No se pudieron copiar los logs.");
    }
  };

  const handleOpenUserDataFolder = useCallback(async () => {
    if (!hasDesktopBridge()) {
      setSystemMessage(t("settings.generator.noBridge"));
      return;
    }

    try {
      const path = await desktopApi.openUserDataFolder();
      setUserDataPath(path);
      setSystemMessage("");
    } catch (error) {
      setSystemMessage(error instanceof Error ? error.message : "No se pudo abrir la carpeta de datos.");
    }
  }, [t]);

  const handleClearCache = useCallback(async () => {
    if (!hasDesktopBridge()) {
      setClearCacheMessage(t("settings.generator.noBridge"));
      return;
    }

    setIsClearingCache(true);
    setClearCacheMessage("");

    try {
      const result = await desktopApi.clearCache();
      setClearCacheResult(result);

      const markerCreated = result.errors.some((entry) => entry.name === CACHE_CLEAR_MARKER_FILE);
      if (markerCreated) {
        setClearCacheMessage("Algunos archivos estaban en uso. Se borraran al reiniciar.");
      } else if (result.errors.length > 0) {
        setClearCacheMessage("No se pudo borrar parte de la cache.");
      } else {
        setClearCacheMessage("Cache borrada.");
      }
    } catch (error) {
      setClearCacheMessage(error instanceof Error ? error.message : "No se pudo borrar la cache.");
    } finally {
      setIsClearingCache(false);
    }
  }, [t]);

  const loadComfyConfig = useCallback(async () => {
    if (!hasDesktopBridge()) {
      return;
    }
    try {
      const config = await desktopApi.getComfyConfig();
      setComfyDir(config.comfyDir ?? "");
      setComfyEnvName(config.condaEnvName ?? "volumia");
      setComfyPort(String(config.port ?? 8188));
      setComfyHook(config.condaHook ?? "");
      setComfyPythonOverride(config.pythonExeOverride ?? "");
      setComfyConfigMessage("");
    } catch (error) {
      setComfyConfigMessage(error instanceof Error ? error.message : "No se pudo leer config de ComfyUI.");
    }
  }, []);

  const handleSaveComfyConfig = async () => {
    if (!hasDesktopBridge()) {
      setComfyConfigMessage(t("settings.generator.noBridge"));
      return;
    }

    const parsedPort = Number.parseInt(comfyPort, 10);
    if (!Number.isFinite(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      setComfyConfigMessage("Puerto invalido. Use 1-65535.");
      return;
    }

    setIsSavingComfyConfig(true);
    try {
      const saved = await desktopApi.saveComfyConfig({
        comfyDir: comfyDir.trim(),
        condaEnvName: comfyEnvName.trim(),
        port: parsedPort,
        condaHook: comfyHook.trim(),
        pythonExeOverride: comfyPythonOverride.trim(),
      });
      setComfyDir(saved.comfyDir);
      setComfyEnvName(saved.condaEnvName);
      setComfyPort(String(saved.port));
      setComfyHook(saved.condaHook);
      setComfyPythonOverride(saved.pythonExeOverride);
      setComfyConfigMessage(`Guardado. Base URL: ${saved.baseUrl}`);
    } catch (error) {
      setComfyConfigMessage(error instanceof Error ? error.message : "No se pudo guardar config de ComfyUI.");
    } finally {
      setIsSavingComfyConfig(false);
    }
  };

  useEffect(() => {
    setSelectedPythonPath(settings.pythonPath ?? "");
  }, [settings.pythonPath]);

  useEffect(() => {
    writeLocalStorageValue(PYTHON_SHOW_ADVANCED_STORAGE_KEY, showAdvancedPython ? "1" : "0");
  }, [showAdvancedPython]);

  useEffect(() => {
    if (!hasDesktopBridge()) {
      return;
    }

    return desktopApi.onPythonInstallLog((line) => {
      setPythonLogs((previous) => [...previous.slice(-999), line]);
    });
  }, []);

  useEffect(() => {
    let active = true;

    if (!hasDesktopBridge()) {
      setUserDataPath("Disponible solo en la app de escritorio.");
      return () => {
        active = false;
      };
    }

    void (async () => {
      try {
        const path = await desktopApi.getUserDataPath();
        if (!active) return;
        setUserDataPath(path);
        setSystemMessage("");
      } catch (error) {
        if (!active) return;
        setSystemMessage(error instanceof Error ? error.message : "No se pudo leer la carpeta de datos.");
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasDesktopBridge()) {
      return;
    }
    void loadComfyConfig();
  }, [loadComfyConfig]);

  useEffect(() => {
    if (!SHOW_LEGACY_PYTHON_PANEL || !hasDesktopBridge()) {
      return;
    }

    void handleDetectPython();
  }, [handleDetectPython]);

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-7 px-8 py-10 lg:grid-cols-2">
      <Card padding="md" className="h-full">
        <p className="text-[10px] tracking-[0.12em] text-[var(--text-muted)]">{t("settings.workspace")}</p>
        <h1 className="mt-1 text-xl font-medium tracking-[0.02em] text-[var(--text)]">{t("settings.title")}</h1>
        <h2 className="mt-5 text-sm font-medium tracking-[0.08em] text-[var(--text-muted)]">{t("settings.general")}</h2>

        <div className="mt-3 space-y-4">
          <div className="space-y-2">
            <p className="text-xs tracking-[0.08em] text-[var(--text-muted)]">{t("settings.language")}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                variant={settings.languageMode === "system" ? "primary" : "secondary"}
                onClick={() => setLanguageMode("system")}
              >
                {t("settings.language.mode.system")}
              </Button>
              <Button
                variant={settings.languageMode === "manual" ? "primary" : "secondary"}
                onClick={() => setLanguageMode("manual")}
              >
                {t("settings.language.mode.manual")}
              </Button>
            </div>

            {settings.languageMode === "manual" ? (
              <Select
                value={settings.language}
                onChange={(event) => setLanguage(event.target.value as AppSettings["language"])}
                label={t("settings.language")}
              >
                <option value="es">{t("settings.option.language.es")}</option>
                <option value="en">{t("settings.option.language.en")}</option>
                <option value="pt">{t("settings.option.language.pt")}</option>
              </Select>
            ) : null}

            <p className="text-xs text-[var(--text-muted)]">
              {t("settings.status.detectedLanguage", {
                locale: systemLocale,
                language: languageLabels[resolvedLanguage],
              })}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs tracking-[0.08em] text-[var(--text-muted)]">{t("settings.theme")}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button
                variant={settings.themeMode === "manual" && settings.theme === "light" ? "primary" : "secondary"}
                onClick={() => setTheme("light")}
              >
                {t("settings.option.theme.light")}
              </Button>
              <Button
                variant={settings.themeMode === "manual" && settings.theme === "dark" ? "primary" : "secondary"}
                onClick={() => setTheme("dark")}
              >
                {t("settings.option.theme.dark")}
              </Button>
              <Button
                variant={settings.themeMode === "system" ? "primary" : "secondary"}
                onClick={() => setThemeMode("system")}
              >
                {t("settings.theme.mode.system")}
              </Button>
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
              <p className="text-xs text-[var(--text-muted)]">
                {settings.themeMode === "system"
                  ? t("settings.status.systemTheme", { theme: themeLabels[systemTheme] })
                  : t("settings.status.appliedTheme", { theme: themeLabels[resolvedTheme] })}
              </p>
            </div>

            <p className="text-xs text-[var(--text-muted)]">
              {t("settings.status.systemTheme", { theme: themeLabels[systemTheme] })}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              {t("settings.status.appliedTheme", { theme: themeLabels[resolvedTheme] })}
            </p>
          </div>

          <Button variant="secondary" onClick={resetToRecommended}>
            {t("settings.resetRecommended")}
          </Button>

          <Toggle checked={settings.reduceMotion} onChange={setReduceMotion} label={t("settings.reduceMotion")} />
          <Toggle
            checked={settings.glassStyle}
            onChange={setGlassStyle}
            label={t("settings.glassStyle")}
            helperText={t("settings.glassStyleHint")}
          />
        </div>
      </Card>

      <Card padding="md" className="h-full">
        <h2 className="text-sm font-medium tracking-[0.08em] text-[var(--text-muted)]">{t("settings.window")}</h2>
        <div className="mt-3 space-y-3">
          <Select
            label={t("settings.windowMode")}
            value={settings.windowMode}
            onChange={(event) => setWindowMode(event.target.value as AppSettings["windowMode"])}
          >
            <option value="windowed">{t("settings.option.windowMode.windowed")}</option>
            <option value="maximized">{t("settings.option.windowMode.maximized")}</option>
            <option value="fullscreen">{t("settings.option.windowMode.fullscreen")}</option>
          </Select>

          <Toggle
            checked={settings.rememberWindowBounds}
            onChange={setRememberWindowBounds}
            label={t("settings.rememberBounds")}
          />

          <Button variant="secondary" className="w-full" onClick={() => void onResetWindowLayout()}>
            {t("settings.resetWindowLayout")}
          </Button>
        </div>
      </Card>

      <Card padding="md" className="h-full">
        <h2 className="text-sm font-medium tracking-[0.08em] text-[var(--text-muted)]">Sistema</h2>
        <div className="mt-3 space-y-3">
          <TextField label="Carpeta de datos" value={userDataPath} readOnly />
          <Button variant="secondary" className="w-full" onClick={() => void handleOpenUserDataFolder()}>
            Abrir carpeta
          </Button>
          {systemMessage ? <p className="text-xs text-[var(--text-muted)]">{systemMessage}</p> : null}
        </div>
      </Card>

      <Card padding="md" className="h-full">
        <h2 className="text-sm font-medium tracking-[0.08em] text-[var(--text-muted)]">Mantenimiento</h2>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-[var(--text-muted)]">
            No borra proyectos ni modelos; solo cache de Chromium.
          </p>
          <Button variant="secondary" className="w-full" onClick={() => void handleClearCache()} disabled={isClearingCache}>
            {isClearingCache ? "Borrando..." : "Borrar cache"}
          </Button>
          {clearCacheResult ? (
            <div className="space-y-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs">
              <p className="text-[var(--text)]">
                Deleted: {clearCacheResult.deleted.length > 0 ? clearCacheResult.deleted.join(", ") : "-"}
              </p>
              <p className="text-[var(--text-muted)]">
                Missing: {clearCacheResult.missing.length > 0 ? clearCacheResult.missing.join(", ") : "-"}
              </p>
              {clearCacheResult.errors.length > 0 ? (
                <p className="text-[var(--text-muted)]">
                  Errors: {clearCacheResult.errors.map((entry) => `${entry.name}: ${entry.message}`).join(" | ")}
                </p>
              ) : null}
            </div>
          ) : null}
          {clearCacheMessage ? <p className="text-xs text-[var(--text-muted)]">{clearCacheMessage}</p> : null}
        </div>
      </Card>

      <Card padding="md" className="h-full">
        <h2 className="text-sm font-medium tracking-[0.08em] text-[var(--text-muted)]">{t("settings.performance3d")}</h2>
        <div className="mt-3 space-y-3">
          <Select
            label={t("settings.preset")}
            value={settings.performancePreset}
            onChange={(event) => setPerformancePreset(event.target.value as AppSettings["performancePreset"])}
          >
            <option value="quality">{t("settings.option.preset.quality")}</option>
            <option value="balanced">{t("settings.option.preset.balanced")}</option>
            <option value="performance">{t("settings.option.preset.performance")}</option>
          </Select>

          <div className="space-y-1">
            <span className="text-xs tracking-[0.08em] text-[var(--text-muted)]">{t("settings.fpsLimit")}</span>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1">
              {fpsOptions.map((fps) => (
                <Button
                  key={fps}
                  variant={settings.fpsLimit === fps ? "primary" : "ghost"}
                  className="h-9"
                  onClick={() => setFpsLimit(fps)}
                >
                  {fps}
                </Button>
              ))}
            </div>
          </div>

          <Toggle checked={settings.antialias} onChange={setAntialias} label={t("settings.antialias")} />
        </div>
      </Card>

      <Card padding="md" className="h-full">
        <h2 className="text-sm font-medium tracking-[0.08em] text-[var(--text-muted)]">ComfyUI (Local)</h2>
        <div className="mt-3 space-y-3">
          <TextField
            label="ComfyUI folder"
            value={comfyDir}
            onChange={(event) => setComfyDir(event.target.value)}
            placeholder="C:\\AI\\ComfyUI_VOL"
          />
          <TextField
            label="Conda env"
            value={comfyEnvName}
            onChange={(event) => setComfyEnvName(event.target.value)}
            placeholder="volumia"
          />
          <TextField
            label="Port"
            value={comfyPort}
            onChange={(event) => setComfyPort(event.target.value)}
            placeholder="8188"
          />
          <TextField
            label="Conda hook (optional)"
            value={comfyHook}
            onChange={(event) => setComfyHook(event.target.value)}
            placeholder="C:\\ProgramData\\miniconda3\\Scripts\\activate.bat"
          />
          <TextField
            label="Python override (optional)"
            value={comfyPythonOverride}
            onChange={(event) => setComfyPythonOverride(event.target.value)}
            placeholder="F:\\MINICONDA\\envs\\volumia\\python.exe"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void loadComfyConfig()}>
              Reload
            </Button>
            <Button variant="primary" onClick={() => void handleSaveComfyConfig()} disabled={isSavingComfyConfig}>
              {isSavingComfyConfig ? "Saving..." : "Save"}
            </Button>
          </div>
          {comfyConfigMessage ? <p className="text-xs text-[var(--text-muted)]">{comfyConfigMessage}</p> : null}
        </div>
      </Card>

      {SHOW_LEGACY_PYTHON_PANEL ? (
        <Card padding="md" className="h-full">
          <h2 className="text-sm font-medium tracking-[0.08em] text-[var(--text-muted)]">Generador 3D local (Python)</h2>
          <div className="mt-3 space-y-3">
            <Select
              label="Interprete de Python"
              value={selectedPythonPath}
              onChange={(event) => {
                applyPythonPathSelection(event.target.value);
                setPythonProbe(null);
              }}
              disabled={isInstallingTorch}
            >
              {pythonCandidates.length === 0 ? (
                <option value="">Sin interpretes CUDA listos detectados</option>
              ) : null}
              {pythonCandidates.map((candidate) => (
                <option key={candidate.pythonPath} value={candidate.pythonPath}>
                  {candidate.pythonPath} ({candidate.source})
                  {candidate.pythonPath === selectedPythonPath ? " - CUDA Ready (Recommended)" : ""}
                </option>
              ))}
            </Select>

            <Toggle
              checked={showAdvancedPython}
              onChange={setShowAdvancedPython}
              label="Show advanced (CPU)"
            />

            {showAdvancedPython ? (
              <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs">
                {pythonRejectedCandidates.length > 0 ? (
                  pythonRejectedCandidates.map((candidate) => (
                    <div key={candidate.pythonPath} className="space-y-1">
                      <p className="text-[var(--text)]">
                        {candidate.pythonPath} ({candidate.source})
                      </p>
                      <p className="text-[var(--warning)]">
                        Not usable (no torch/CUDA): {candidate.rejectionReason ?? "unknown"}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-[var(--text-muted)]">No rejected interpreters detected.</p>
                )}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => void handleDetectPython()}
                disabled={isDetectingPython || isInstallingTorch}
              >
                {isDetectingPython ? "Detectando..." : "Detectar"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void handleProbePython()}
                disabled={!selectedPythonPath || isProbingPython || isInstallingTorch}
              >
                {isProbingPython ? "Probando..." : "Probar"}
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleInstallTorchCuda()}
                disabled={!selectedPythonPath || isInstallingTorch}
              >
                {isInstallingTorch ? "Instalando..." : "Instalar / Reparar PyTorch (CUDA)"}
              </Button>
              <Button variant="ghost" onClick={() => void handleCopyLogs()} disabled={pythonLogs.length === 0}>
                Copy logs
              </Button>
            </div>

            <div className="space-y-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
              <p className="text-[var(--text)]">Python: {pythonProbe?.executable ? "OK" : "Not found"}</p>
              <p className="text-[var(--text-muted)]">Pip: {pythonProbe?.pip ?? "-"}</p>
              <p className="text-[var(--text-muted)]">Torch: {pythonProbe?.torchInstalled ? "Installed" : "Not installed"}</p>
              <p className="text-[var(--text-muted)]">CUDA: {pythonProbe?.cudaAvailable ? "Available" : "Not available"}</p>
              <p className="text-[var(--text-muted)]">Device: {pythonProbe?.deviceName ?? "-"}</p>
              {pythonMessage ? <p className="text-[var(--text)]">{pythonMessage}</p> : null}
              {pythonProbe?.torchInstalled && pythonProbe.cudaAvailable === false ? (
                <p className="text-xs text-[var(--warning)]">
                  Torch esta en modo CPU o CUDA no disponible; verifique que instalo wheels cu121/cu124 y drivers NVIDIA.
                </p>
              ) : null}
            </div>

            <div className="max-h-44 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface-3)] p-3">
              {pythonLogs.length > 0 ? (
                <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--text-muted)]">{pythonLogs.join("\n")}</pre>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">{t("settings.generator.noLogs")}</p>
              )}
            </div>
          </div>
        </Card>
      ) : null}

      <Card padding="md" className="h-full">
        <h2 className="text-sm font-medium tracking-[0.08em] text-[var(--text-muted)]">{t("settings.data")}</h2>
        <div className="mt-3 grid grid-cols-1 gap-2">
          <Button variant="secondary" onClick={() => void onExportProjects()}>
            {t("dashboard.exportJson")}
          </Button>
          <Button variant="secondary" onClick={() => void onImportProjects()}>
            {t("dashboard.importJson")}
          </Button>
          <Button variant="secondary" onClick={() => void onExportSettings()}>
            {t("settings.exportSettings")}
          </Button>
          <Button variant="secondary" onClick={() => void onImportSettings()}>
            {t("settings.importSettings")}
          </Button>
          <Button variant="ghost" onClick={onResetSettings}>
            {t("settings.resetSettings")}
          </Button>
          <Button variant="danger" onClick={() => void handleResetAll()}>
            {t("settings.resetAllData")}
          </Button>
        </div>
      </Card>
      </div>
    </div>
  );
}
