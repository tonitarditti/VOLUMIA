import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, Chip, Input, Select } from "@/components/ui";
import { useSettingsStore } from "@/state/settings.store";
import type { AppLanguage, AppTheme, UiScale, WindowSizePreset } from "@/state/settings.types";

export function SettingsScreen() {
  const { t } = useTranslation();
  const settings = useSettingsStore((state) => state.settings);
  const saving = useSettingsStore((state) => state.saving);
  const error = useSettingsStore((state) => state.error);
  const appVersion = useSettingsStore((state) => state.appVersion);
  const gpuInfo = useSettingsStore((state) => state.gpuInfo);
  const serviceStatus = useSettingsStore((state) => state.serviceStatus);

  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setWindowSizePreset = useSettingsStore((state) => state.setWindowSizePreset);
  const setRememberLastWindowBounds = useSettingsStore((state) => state.setRememberLastWindowBounds);
  const setAlwaysOnTop = useSettingsStore((state) => state.setAlwaysOnTop);
  const setUiScale = useSettingsStore((state) => state.setUiScale);
  const setStartMaximized = useSettingsStore((state) => state.setStartMaximized);
  const setExportDefaults = useSettingsStore((state) => state.setExportDefaults);
  const setPerformanceDefaults = useSettingsStore((state) => state.setPerformanceDefaults);
  const openLogsFolder = useSettingsStore((state) => state.openLogsFolder);
  const restartService = useSettingsStore((state) => state.restartService);
  const refreshServiceStatus = useSettingsStore((state) => state.refreshServiceStatus);

  const [restartFeedback, setRestartFeedback] = useState<string | null>(null);

  return (
    <div className="screenWrap settingsScreen">
      <Card className="screenHeader">
        <div>
          <h1>{t("settings.title")}</h1>
          <p>{t("settings.subtitle")}</p>
        </div>
        {saving ? <Chip>{t("common.save")}...</Chip> : null}
      </Card>

      {error ? (
        <div className="errorBanner">
          <span>{error}</span>
        </div>
      ) : null}

      <div className="settingsGrid">
        <Card className="settingsSection">
          <h3>{t("settings.sections.appearance")}</h3>

          <label className="field">
            <span>{t("settings.language")}</span>
            <Select value={settings.language} onChange={(event) => void setLanguage(event.target.value as AppLanguage)}>
              <option value="system">{t("settings.languageOptions.system")}</option>
              <option value="en">{t("settings.languageOptions.en")}</option>
              <option value="es">{t("settings.languageOptions.es")}</option>
            </Select>
          </label>

          <label className="field">
            <span>{t("settings.theme")}</span>
            <Select value={settings.theme} onChange={(event) => void setTheme(event.target.value as AppTheme)}>
              <option value="system">{t("settings.themeOptions.system")}</option>
              <option value="light">{t("settings.themeOptions.light")}</option>
              <option value="dark">{t("settings.themeOptions.dark")}</option>
            </Select>
          </label>
        </Card>

        <Card className="settingsSection">
          <h3>{t("settings.sections.workspace")}</h3>

          <label className="field">
            <span>{t("settings.windowSizePreset")}</span>
            <Select value={settings.workspace.windowSizePreset} onChange={(event) => void setWindowSizePreset(event.target.value as WindowSizePreset)}>
              <option value="small">{t("settings.windowSize.small")}</option>
              <option value="medium">{t("settings.windowSize.medium")}</option>
              <option value="large">{t("settings.windowSize.large")}</option>
            </Select>
          </label>

          <label className="field switchRow">
            <span>{t("settings.rememberBounds")}</span>
            <input
              type="checkbox"
              checked={settings.workspace.rememberLastWindowBounds}
              onChange={(event) => void setRememberLastWindowBounds(event.target.checked)}
            />
          </label>

          <label className="field switchRow">
            <span>{t("settings.alwaysOnTop")}</span>
            <input type="checkbox" checked={settings.workspace.alwaysOnTop} onChange={(event) => void setAlwaysOnTop(event.target.checked)} />
          </label>

          <label className="field">
            <span>{t("settings.uiScale")}</span>
            <Select value={settings.workspace.uiScale} onChange={(event) => void setUiScale(Number(event.target.value) as UiScale)}>
              <option value={90}>90%</option>
              <option value={100}>100%</option>
              <option value={110}>110%</option>
              <option value={125}>125%</option>
            </Select>
          </label>

          <label className="field switchRow">
            <span>{t("settings.startMaximized")}</span>
            <input type="checkbox" checked={settings.workspace.startMaximized} onChange={(event) => void setStartMaximized(event.target.checked)} />
          </label>
        </Card>

        <Card className="settingsSection">
          <h3>{t("settings.sections.exportDefaults")}</h3>

          <label className="field">
            <span>{t("settings.exportUnits")}</span>
            <Select value={settings.exportDefaults.units} onChange={(event) => void setExportDefaults({ units: event.target.value as "cm" | "m" })}>
              <option value="cm">cm</option>
              <option value="m">m</option>
            </Select>
          </label>

          <label className="field">
            <span>{t("settings.textureResolution")}</span>
            <Select
              value={settings.exportDefaults.textureResolution}
              onChange={(event) => void setExportDefaults({ textureResolution: event.target.value as "2k" | "4k" })}
            >
              <option value="2k">2K</option>
              <option value="4k">4K</option>
            </Select>
          </label>

          <label className="field switchRow">
            <span>{t("settings.includeLow")}</span>
            <input type="checkbox" checked={settings.exportDefaults.includeLow} onChange={(event) => void setExportDefaults({ includeLow: event.target.checked })} />
          </label>

          <label className="field">
            <span>{t("settings.lowTextureDownscale")}</span>
            <Select
              value={settings.exportDefaults.lowTextureDownscale}
              onChange={(event) =>
                void setExportDefaults({
                  lowTextureDownscale: Number(event.target.value) as 25 | 50 | 75,
                })
              }
            >
              <option value={25}>25%</option>
              <option value={50}>50%</option>
              <option value={75}>75%</option>
            </Select>
          </label>
        </Card>

        <Card className="settingsSection">
          <h3>{t("settings.sections.performance")}</h3>

          <label className="field">
            <span>{t("settings.maxFacesHigh")}</span>
            <Input
              type="number"
              min={1000}
              step={1000}
              value={settings.performanceDefaults.maxFacesHigh}
              onChange={(event) =>
                void setPerformanceDefaults({
                  maxFacesHigh: Math.max(1000, Number(event.target.value) || 1000),
                })
              }
            />
          </label>

          <label className="field">
            <span>{t("settings.maxFacesLow")}</span>
            <Input
              type="number"
              min={500}
              step={500}
              value={settings.performanceDefaults.maxFacesLow}
              onChange={(event) =>
                void setPerformanceDefaults({
                  maxFacesLow: Math.max(500, Number(event.target.value) || 500),
                })
              }
            />
          </label>
        </Card>

        <Card className="settingsSection">
          <h3>{t("settings.sections.diagnostics")}</h3>

          <div className="field">
            <span>{t("settings.appVersion")}</span>
            <strong>{appVersion}</strong>
          </div>

          <div className="field">
            <span>{t("settings.serviceStatus")}</span>
            <div className="diagnosticStatusRow">
              <Chip active={serviceStatus.ok}>{serviceStatus.ok ? t("settings.serviceOnline") : t("settings.serviceOffline")}</Chip>
              <small>{serviceStatus.url}</small>
            </div>
            <small>{serviceStatus.detail}</small>
          </div>

          <div className="field">
            <span>{t("settings.gpuInfo")}</span>
            <code className="diagnosticCode">{gpuInfo}</code>
          </div>

          <div className="diagnosticActions">
            <Button type="button" variant="secondary" onClick={() => void refreshServiceStatus()}>
              {t("settings.refreshServiceStatus")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void openLogsFolder()}>
              {t("settings.openLogs")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                const ok = await restartService();
                setRestartFeedback(ok ? t("settings.restartSuccess") : t("settings.restartFailed"));
              }}
            >
              {t("settings.restartService")}
            </Button>
          </div>

          {restartFeedback ? <p className="modalMessage">{restartFeedback}</p> : null}
        </Card>
      </div>
    </div>
  );
}
