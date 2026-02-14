import { useState } from "react";
import { desktopApi, hasDesktopBridge } from "@/electron/desktopApi";
import { Button, Card, Select, TextField, Toggle } from "@/ui/primitives";
import { useT } from "@/volumia/i18n/useT";
import { useSettings } from "@/volumia/settings/context";
import type { AppSettings } from "@/volumia/settings/types";

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
    setReduceMotion,
    setWindowMode,
    setRememberWindowBounds,
    setPerformancePreset,
    setFpsLimit,
    setAntialias,
    resetToRecommended,
  } = useSettings();
  const [isCheckingGenerator, setIsCheckingGenerator] = useState(false);
  const [isTestingGenerator, setIsTestingGenerator] = useState(false);
  const [generatorStatus, setGeneratorStatus] = useState<{
    pythonFound: boolean;
    pythonPath?: string;
    venvPath?: string;
    scriptFound: boolean;
    scriptPath?: string;
  } | null>(null);
  const [generatorLogs, setGeneratorLogs] = useState<string[]>([]);
  const [generatorMessage, setGeneratorMessage] = useState<string>("");
  const [testGlbPath, setTestGlbPath] = useState<string | null>(null);

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

  const handleCheckGenerator = async () => {
    if (!hasDesktopBridge()) {
      setGeneratorMessage(t("settings.generator.noBridge"));
      return;
    }

    setIsCheckingGenerator(true);
    setGeneratorMessage("");

    try {
      const result = await desktopApi.checkLocalGenerator();
      setGeneratorStatus(result);
      setGeneratorLogs(result.logs ?? []);
      setGeneratorMessage(
        result.pythonFound && result.scriptFound
          ? t("settings.generator.ready")
          : t("settings.generator.notReady")
      );
    } catch (error) {
      setGeneratorMessage(
        error instanceof Error ? error.message : t("settings.generator.checkFailed")
      );
    } finally {
      setIsCheckingGenerator(false);
    }
  };

  const handleTestGenerator = async () => {
    if (!hasDesktopBridge()) {
      setGeneratorMessage(t("settings.generator.noBridge"));
      return;
    }

    setIsTestingGenerator(true);
    setGeneratorMessage("");

    try {
      const result = await desktopApi.runLocalGeneratorTest();
      setGeneratorLogs(result.logs ?? []);
      if (result.ok) {
        setTestGlbPath(result.glbPath);
        setGeneratorMessage(t("settings.generator.testOk"));
      } else {
        setTestGlbPath(null);
        setGeneratorMessage(result.error || t("settings.generator.testFailed"));
      }
    } catch (error) {
      setTestGlbPath(null);
      setGeneratorMessage(
        error instanceof Error ? error.message : t("settings.generator.testFailed")
      );
    } finally {
      setIsTestingGenerator(false);
    }
  };

  const handleOpenGeneratorTestOutput = async () => {
    if (!hasDesktopBridge() || !testGlbPath) {
      return;
    }

    await desktopApi.openGenerationOutputFolder(testGlbPath);
  };

  return (
    <div className="grid h-full w-full grid-cols-1 gap-5 overflow-y-auto pr-1 xl:grid-cols-2">
      <Card padding="md">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">{t("settings.workspace")}</p>
        <h1 className="mt-1 text-xl font-semibold tracking-[0.03em] text-[var(--text)]">{t("settings.title")}</h1>
        <h2 className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{t("settings.general")}</h2>

        <div className="mt-3 space-y-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">{t("settings.language")}</p>
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
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">{t("settings.theme")}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button
                variant={settings.themeMode === "system" ? "primary" : "secondary"}
                onClick={() => setThemeMode("system")}
              >
                {t("settings.theme.mode.system")}
              </Button>
              <Button
                variant={settings.themeMode === "time" ? "primary" : "secondary"}
                onClick={() => setThemeMode("time")}
              >
                {t("settings.theme.mode.time")}
              </Button>
              <Button
                variant={settings.themeMode === "manual" ? "primary" : "secondary"}
                onClick={() => setThemeMode("manual")}
              >
                {t("settings.theme.mode.manual")}
              </Button>
            </div>

            {settings.themeMode === "time" ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <TextField
                  type="time"
                  value={settings.timeTheme.lightFrom}
                  onChange={(event) => setTimeTheme({ lightFrom: event.target.value })}
                  label={t("settings.time.lightFrom")}
                />
                <TextField
                  type="time"
                  value={settings.timeTheme.darkFrom}
                  onChange={(event) => setTimeTheme({ darkFrom: event.target.value })}
                  label={t("settings.time.darkFrom")}
                />
              </div>
            ) : null}

            {settings.themeMode === "manual" ? (
              <Select
                value={settings.theme}
                onChange={(event) => setTheme(event.target.value as AppSettings["theme"])}
                label={t("settings.theme")}
              >
                <option value="light">{t("settings.option.theme.light")}</option>
                <option value="dark">{t("settings.option.theme.dark")}</option>
              </Select>
            ) : null}

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
        </div>
      </Card>

      <Card padding="md">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{t("settings.window")}</h2>
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

      <Card padding="md">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{t("settings.performance3d")}</h2>
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
            <span className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">{t("settings.fpsLimit")}</span>
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

      <Card padding="md">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{t("settings.generator.title")}</h2>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void handleCheckGenerator()} disabled={isCheckingGenerator || isTestingGenerator}>
              {isCheckingGenerator ? t("settings.generator.checking") : t("settings.generator.check")}
            </Button>
            <Button variant="primary" onClick={() => void handleTestGenerator()} disabled={isTestingGenerator}>
              {isTestingGenerator ? t("settings.generator.testing") : t("settings.generator.test")}
            </Button>
            <Button variant="ghost" onClick={() => void handleOpenGeneratorTestOutput()} disabled={!testGlbPath}>
              {t("settings.generator.openTestOutput")}
            </Button>
          </div>

          <div className="space-y-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
            <p className="text-[var(--text)]">
              {t("settings.generator.pythonFound")}: {generatorStatus?.pythonFound ? t("common.enabled") : t("common.disabled")}
            </p>
            <p className="text-[var(--text-muted)]">{t("settings.generator.pythonPath")}: {generatorStatus?.pythonPath ?? "-"}</p>
            <p className="text-[var(--text-muted)]">{t("settings.generator.venvPath")}: {generatorStatus?.venvPath ?? "-"}</p>
            <p className="text-[var(--text-muted)]">{t("settings.generator.scriptPath")}: {generatorStatus?.scriptPath ?? "-"}</p>
            {generatorMessage ? <p className="text-[var(--text)]">{generatorMessage}</p> : null}
          </div>

          <div className="max-h-44 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface-3)] p-3">
            {generatorLogs.length > 0 ? (
              <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--text-muted)]">{generatorLogs.join("\n")}</pre>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">{t("settings.generator.noLogs")}</p>
            )}
          </div>
        </div>
      </Card>

      <Card padding="md">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{t("settings.data")}</h2>
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
  );
}
