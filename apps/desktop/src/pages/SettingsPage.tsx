import { Button, Card, Select, Toggle } from "@/ui/primitives";
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
    setLanguage,
    setTheme,
    setReduceMotion,
    setWindowMode,
    setRememberWindowBounds,
    setPerformancePreset,
    setFpsLimit,
    setAntialias,
  } = useSettings();

  const fpsOptions: AppSettings["fpsLimit"][] = [30, 60, 120];

  const handleResetAll = async () => {
    const confirmed = window.confirm(t("settings.resetAllConfirm"));
    if (!confirmed) return;
    await onResetAllData();
  };

  return (
    <div className="grid h-full w-full grid-cols-1 gap-5 overflow-y-auto pr-1 xl:grid-cols-2">
      <Card padding="md">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">{t("settings.workspace")}</p>
        <h1 className="mt-1 text-xl font-semibold tracking-[0.03em] text-[var(--text)]">{t("settings.title")}</h1>
        <h2 className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{t("settings.general")}</h2>

        <div className="mt-3 space-y-3">
          <Select
            label={t("settings.language")}
            value={settings.language}
            onChange={(event) => setLanguage(event.target.value as AppSettings["language"])}
          >
            <option value="es">{t("settings.option.language.es")}</option>
            <option value="en">{t("settings.option.language.en")}</option>
            <option value="pt">{t("settings.option.language.pt")}</option>
          </Select>

          <Select
            label={t("settings.theme")}
            value={settings.theme}
            onChange={(event) => setTheme(event.target.value as AppSettings["theme"])}
          >
            <option value="light">Claro</option>
            <option value="dark">Oscuro</option>
          </Select>

          <Toggle
            checked={settings.reduceMotion}
            onChange={setReduceMotion}
            label={t("settings.reduceMotion")}
          />
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
            <option value="remember">{t("settings.option.windowMode.remember")}</option>
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
