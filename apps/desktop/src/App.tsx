import { useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { desktopApi } from "@/electron/desktopApi";
import { AppFrame } from "@/layout/AppFrame";
import { BootScreen } from "@/pages/BootScreen";
import { DashboardPage } from "@/pages/DashboardPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { WorkspacePage } from "@/pages/WorkspacePage";
import { ProjectsProvider, useProjects } from "@/projects/context";
import { parseImportEnvelope } from "@/storage/importSchema";
import { useT } from "@/volumia/i18n/useT";
import { SettingsProvider, useSettings } from "@/volumia/settings/context";
import { createSettingsExportEnvelope, parseSettingsImportEnvelope } from "@/volumia/settings/storage";

function LegacyProjectRedirect() {
  const { projectId = "" } = useParams();
  return <Navigate to={`/workspace/${projectId}`} replace />;
}

function AppContent() {
  const { state, mergeImportedProjects, resetProjects } = useProjects();
  const { settings, applyImportedSettings, resetSettings } = useSettings();
  const { t } = useT();
  const [notice, setNotice] = useState<string | null>(null);

  const exportProjects = async () => {
    try {
      const result = await desktopApi.exportProjectsJson({
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        app: "VOLUMIA",
        projects: state.projects,
      });

      if (result.canceled) {
        setNotice(t("notice.exportCanceled"));
        return;
      }

      setNotice(
        result.filePath ? t("notice.exportCompletedWithPath", { filePath: result.filePath }) : t("notice.exportCompleted")
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : t("notice.exportFailed");
      setNotice(message);
    }
  };

  const importProjects = async () => {
    try {
      const result = await desktopApi.importProjectsJson();
      if (result.canceled || !result.content) {
        setNotice(t("notice.importCanceled"));
        return;
      }

      const payload = parseImportEnvelope(result.content);
      mergeImportedProjects(payload.projects);
      setNotice(
        t("notice.importCompleted", {
          count: payload.projects.length,
          filePath: result.filePath ?? t("notice.selectedFile"),
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : t("notice.importFailed");
      setNotice(message);
    }
  };

  const exportSettings = async () => {
    try {
      const result = await desktopApi.exportSettingsJson(createSettingsExportEnvelope(settings));

      if (result.canceled) {
        setNotice(t("notice.settingsExportCanceled"));
        return;
      }

      setNotice(
        result.filePath
          ? t("notice.settingsExportWithPath", { filePath: result.filePath })
          : t("notice.settingsExportCompleted")
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : t("notice.exportFailed");
      setNotice(message);
    }
  };

  const importSettings = async () => {
    try {
      const result = await desktopApi.importSettingsJson();
      if (result.canceled || !result.content) {
        setNotice(t("notice.settingsImportCanceled"));
        return;
      }

      const payload = parseSettingsImportEnvelope(result.content);
      applyImportedSettings(payload.settings);
      setNotice(t("notice.settingsImportCompleted"));
    } catch {
      setNotice(t("notice.settingsImportFailed"));
    }
  };

  const handleResetSettings = () => {
    resetSettings();
    setNotice(t("notice.settingsResetDone"));
  };

  const handleResetWindowLayout = async () => {
    try {
      await desktopApi.resetWindowLayout();
      setNotice(t("notice.windowLayoutResetDone"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("notice.importFailed");
      setNotice(message);
    }
  };

  const handleResetAllData = async () => {
    resetProjects();
    resetSettings();

    try {
      await desktopApi.resetWindowLayout();
    } catch {
      // best effort
    }

    setNotice(t("notice.resetAllDone"));
  };

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  return (
    <Routes>
      <Route path="/" element={<BootScreen />} />
      <Route
        path="/dashboard"
        element={
          <AppFrame notice={notice} onDismissNotice={() => setNotice(null)}>
            <DashboardPage onImport={importProjects} onExport={exportProjects} />
          </AppFrame>
        }
      />
      <Route path="/workspace/:projectId" element={<WorkspacePage />} />
      <Route path="/project/:projectId" element={<LegacyProjectRedirect />} />
      <Route
        path="/settings"
        element={
          <AppFrame notice={notice} onDismissNotice={() => setNotice(null)}>
            <SettingsPage
              onImportProjects={importProjects}
              onExportProjects={exportProjects}
              onExportSettings={exportSettings}
              onImportSettings={importSettings}
              onResetSettings={handleResetSettings}
              onResetAllData={handleResetAllData}
              onResetWindowLayout={handleResetWindowLayout}
            />
          </AppFrame>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <ProjectsProvider>
        <HashRouter>
          <AppContent />
        </HashRouter>
      </ProjectsProvider>
    </SettingsProvider>
  );
}
