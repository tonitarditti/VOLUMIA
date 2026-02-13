import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ExportOptions, GenerationRequest, ObjectTypeOption, StudioPresetDefinition } from "@volumia/shared";
import { resolveLanguage } from "@/i18n";
import { desktopApi } from "@/api/desktopApi";
import { ExportModal } from "@/components/ExportModal";
import { TitleBar } from "@/components/layout/TitleBar";
import { NewCaptureScreen } from "@/components/screens/NewCaptureScreen";
import { ProcessingScreen } from "@/components/screens/ProcessingScreen";
import { ReviewExportScreen } from "@/components/screens/ReviewExportScreen";
import { SettingsScreen } from "@/components/screens/SettingsScreen";
import { UiKitScreen } from "@/components/screens/UiKitScreen";
import { Button } from "@/components/ui";
import { useCaptureStore } from "@/state/capture.store";
import { usePresetsStore } from "@/state/presets.store";
import { useProcessingStore } from "@/state/processing.store";
import { useReviewStore } from "@/state/review.store";
import { useSettingsStore } from "@/state/settings.store";
import { useUiStore } from "@/state/ui.store";

type BuiltinPresetId = Exclude<ObjectTypeOption, "auto-detect" | `studio:${string}`>;

const MOBILE_BREAKPOINT = 980;

function toBuiltinPreset(objectType: ObjectTypeOption, studioPresets: StudioPresetDefinition[]) {
  if (!objectType.startsWith("studio:")) {
    return objectType === "auto-detect" ? null : (objectType as BuiltinPresetId);
  }

  const studioId = objectType.replace("studio:", "");
  const preset = studioPresets.find((item) => item.id === studioId);
  return preset?.basePreset ?? "decor";
}

function sanitizeObjectName(raw: string | undefined) {
  if (!raw) return "Object_Capture";
  const withoutExtension = raw.replace(/\.[^/.]+$/, "");
  const normalized = withoutExtension.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized.length > 0 ? normalized : "Object_Capture";
}

function normalizeUiErrorMessage(error: unknown, fallback: string, t: (key: string) => string) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (!raw) return fallback;
  if (raw.includes("[SERVICE_UNAVAILABLE]")) return t("app.error.serviceUnavailable");
  if (raw.includes("[SERVICE_TIMEOUT]")) return t("app.error.timeout");
  if (raw.includes("[VALIDATION_ERROR]")) return t("app.error.validation");
  if (raw.includes("[SERVICE_ERROR]")) {
    return raw.replace("[SERVICE_ERROR]", "").trim() || fallback;
  }
  return raw;
}

export default function App() {
  const { t, i18n } = useTranslation();

  const screen = useUiStore((state) => state.screen);
  const exportModalOpen = useUiStore((state) => state.exportModalOpen);
  const errorMessage = useUiStore((state) => state.errorMessage);
  const setScreen = useUiStore((state) => state.setScreen);
  const openExportModal = useUiStore((state) => state.openExportModal);
  const closeExportModal = useUiStore((state) => state.closeExportModal);
  const setErrorMessage = useUiStore((state) => state.setErrorMessage);

  const slots = useCaptureStore((state) => state.slots);
  const objectType = useCaptureStore((state) => state.objectType);
  const reconstructionMode = useCaptureStore((state) => state.reconstructionMode);
  const complexity = useCaptureStore((state) => state.complexity);
  const includeLightweight = useCaptureStore((state) => state.includeLightweight);
  const detectMultipleObjects = useCaptureStore((state) => state.detectMultipleObjects);
  const generationMode = useCaptureStore((state) => state.generationMode);
  const scaleDimension = useCaptureStore((state) => state.scaleDimension);
  const scaleValueCm = useCaptureStore((state) => state.scaleValueCm);
  const toCaptureImageInputs = useCaptureStore((state) => state.toCaptureImageInputs);
  const setSlotStatus = useCaptureStore((state) => state.setSlotStatus);

  const processingProgress = useProcessingStore((state) => state.progress);
  const processingFailed = useProcessingStore((state) => state.failed);
  const startProcessing = useProcessingStore((state) => state.start);
  const advanceProcessing = useProcessingStore((state) => state.advance);
  const completeProcessing = useProcessingStore((state) => state.complete);
  const failProcessing = useProcessingStore((state) => state.fail);
  const resetProcessing = useProcessingStore((state) => state.reset);

  const generationResult = useReviewStore((state) => state.generationResult);
  const selectedObjectId = useReviewStore((state) => state.selectedObjectId);
  const setGenerationResult = useReviewStore((state) => state.setGenerationResult);

  const studioPresets = usePresetsStore((state) => state.studioPresets);
  const loadStudioPresets = usePresetsStore((state) => state.loadStudioPresets);

  const settings = useSettingsStore((state) => state.settings);
  const appVersion = useSettingsStore((state) => state.appVersion);
  const serviceStatus = useSettingsStore((state) => state.serviceStatus);
  const loadSettings = useSettingsStore((state) => state.load);
  const restartService = useSettingsStore((state) => state.restartService);
  const refreshServiceStatus = useSettingsStore((state) => state.refreshServiceStatus);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [serviceActionBusy, setServiceActionBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const hasImages = useMemo(() => slots.some((slot) => slot.image), [slots]);

  const initialExportOptions = useMemo<ExportOptions>(
    () => ({
      units: settings.exportDefaults.units,
      pivot: "floor-center",
      smoothing: true,
      fixBackfaces: true,
      keepMaterialsSeparated: true,
      keepComponentsSeparated: true,
      includePbrMaps: true,
      textureSize: settings.exportDefaults.textureResolution,
      includeLightweight: settings.exportDefaults.includeLow,
    }),
    [settings.exportDefaults]
  );

  useEffect(() => {
    void Promise.all([loadStudioPresets(), loadSettings()]);
  }, [loadStudioPresets, loadSettings]);

  useEffect(() => {
    void refreshServiceStatus();
    const timer = window.setInterval(() => {
      void refreshServiceStatus();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [refreshServiceStatus]);

  useEffect(() => {
    void i18n.changeLanguage(resolveLanguage(settings.language));
  }, [i18n, settings.language]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const resolved =
        settings.theme === "system" ? (media.matches ? "dark" : "light") : settings.theme;
      document.documentElement.setAttribute("data-theme", resolved);
    };

    applyTheme();

    if (settings.theme !== "system") {
      return;
    }

    const onChange = () => applyTheme();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [settings.theme]);

  useEffect(() => {
    const updateMobile = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) {
        setSidebarOpen(false);
      }
    };

    updateMobile();
    window.addEventListener("resize", updateMobile);
    return () => window.removeEventListener("resize", updateMobile);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [screen]);

  const handleGenerate = async () => {
    const images = toCaptureImageInputs();
    if (images.length === 0) {
      setErrorMessage(t("app.error.needOneImage"));
      return;
    }

    setErrorMessage(null);
    setExportMessage(null);
    resetProcessing();
    startProcessing();
    setScreen("processing");

    const progressTimer = window.setInterval(() => {
      advanceProcessing(4);
    }, 320);

    try {
      const basePreset = toBuiltinPreset(objectType, studioPresets);
      const analyzeObjectType = (basePreset ?? "auto-detect") as ObjectTypeOption;

      const analyzeResponse = await desktopApi.analyzeImages({
        objectType: analyzeObjectType,
        reconstructionMode,
        detectMultipleObjects,
        images,
      });

      analyzeResponse.slotResults.forEach((slotResult) => {
        setSlotStatus(slotResult.slotId, slotResult.status, slotResult.note);
      });

      advanceProcessing(15);

      const sourceName =
        slots.find((slot) => slot.id === "front")?.image?.fileName ??
        slots.find((slot) => slot.image)?.image?.fileName ??
        "Object_Capture";

      const payload: GenerationRequest = {
        objectName: sanitizeObjectName(sourceName),
        objectType,
        studioBasePreset: basePreset ?? undefined,
        reconstructionMode,
        generationMode,
        detectMultipleObjects,
        complexity,
        includeLightweight,
        scaleDimension,
        scaleValueCm,
        pivotMode: "floor-center",
        images,
      };

      const generated = await desktopApi.generateModel(payload);
      setGenerationResult(generated);
      completeProcessing();
      setScreen("reviewExport");
    } catch (error) {
      const message = normalizeUiErrorMessage(error, t("app.error.generationFailed"), t);
      failProcessing(message);
      setErrorMessage(message);
      setScreen("newCapture");
    } finally {
      window.clearInterval(progressTimer);
    }
  };

  const handleExport = async (options: ExportOptions) => {
    if (!generationResult) {
      setExportMessage(t("exportModal.validationMissingGeneration"));
      return;
    }

    const activeObject =
      generationResult.detectedObjects?.find((item) => item.id === selectedObjectId) ??
      generationResult.detectedObjects?.[0] ??
      generationResult;

    if (!activeObject.generationId || !activeObject.objectName) {
      setExportMessage(t("exportModal.validationMissingGeneration"));
      return;
    }

    if (!activeObject.artifacts.highGlb || !activeObject.artifacts.lowGlb) {
      setExportMessage(t("exportModal.validationMissingArtifacts"));
      return;
    }

    setExportBusy(true);
    setExportMessage(null);

    try {
      const result = await desktopApi.exportPackage({
        generationId: activeObject.generationId,
        objectName: activeObject.objectName,
        options,
      });

      const saveResult = await desktopApi.saveExportDialog({
        suggestedFileName: result.fileName,
        sourceZipPath: result.zipPath,
      });

      if (saveResult.canceled) {
        setExportMessage(t("exportModal.exportCanceled"));
        return;
      }

      setExportMessage(saveResult.savedPath ? t("app.savedPath", { path: saveResult.savedPath }) : result.message);
    } catch (error) {
      const baseMessage = normalizeUiErrorMessage(error, t("exportModal.exportFailed"), t);
      setExportMessage(`${baseMessage} ${t("exportModal.recoverHint")}`.trim());
    } finally {
      setExportBusy(false);
    }
  };

  const handleExportAll = async () => {
    if (!generationResult?.detectedObjects || generationResult.detectedObjects.length <= 1) {
      return;
    }
    setExportBusy(true);
    setExportMessage(null);
    try {
      let success = 0;
      for (const item of generationResult.detectedObjects) {
        await desktopApi.exportPackage({
          generationId: item.generationId,
          objectName: item.objectName,
          options: initialExportOptions,
        });
        success += 1;
      }
      setExportMessage(t("review.exportAllSuccess", { value: success }));
    } catch (error) {
      const message = normalizeUiErrorMessage(error, t("exportModal.exportFailed"), t);
      setExportMessage(message);
    } finally {
      setExportBusy(false);
    }
  };

  const showBackdrop = sidebarOpen && isMobile;
  const canOpenReview = Boolean(generationResult);
  const canOpenProcessing = processingProgress > 0 && !processingFailed;
  const isUiKitRoute =
    window.location.pathname.toLowerCase() === "/ui-kit" ||
    window.location.hash.toLowerCase() === "#/ui-kit" ||
    window.location.hash.toLowerCase() === "#ui-kit";

  if (isUiKitRoute) {
    return (
      <div className="appRoot">
        <TitleBar
          appTitle={t("app.title")}
          projectLabel={t("app.projectUntitled")}
          envLabel={import.meta.env.DEV ? t("app.env.dev") : t("app.env.prod")}
          serviceLabel={serviceStatus.ok ? t("settings.serviceOnline") : t("settings.serviceOffline")}
          serviceOnline={serviceStatus.ok}
        />
        <main className="appContent">
          <div className="screenHost">
            <UiKitScreen />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="appRoot">
      <TitleBar
        appTitle={t("app.title")}
        projectLabel={t("app.projectUntitled")}
        envLabel={import.meta.env.DEV ? t("app.env.dev") : t("app.env.prod")}
        serviceLabel={serviceStatus.ok ? t("settings.serviceOnline") : t("settings.serviceOffline")}
        serviceOnline={serviceStatus.ok}
      />

      <header className="appHeader">
        <div className="headerLeft">
          <button
            type="button"
            className="menuButton"
            onClick={() => setSidebarOpen((value) => !value)}
            aria-label={t("app.menuAria")}
          >
            <span />
            <span />
            <span />
          </button>
          <span className="tagline">{t("app.tagline")}</span>
        </div>
      </header>

      <div className="appLayout">
        <aside className={showBackdrop ? "appSidebar open" : "appSidebar"}>
          <div className="sidebarSection">
            <h2>{t("app.sidebar.workspace")}</h2>
            <Button type="button" variant="nav" active={screen === "newCapture"} className={screen === "newCapture" ? "navItem active" : "navItem"} onClick={() => setScreen("newCapture")}>
              {t("nav.newCapture")}
            </Button>
            <Button
              type="button"
              variant="nav"
              active={screen === "processing"}
              className={screen === "processing" ? "navItem active" : "navItem"}
              onClick={() => canOpenProcessing && setScreen("processing")}
              disabled={!canOpenProcessing}
            >
              {t("nav.processing")}
            </Button>
            <Button
              type="button"
              variant="nav"
              active={screen === "reviewExport"}
              className={screen === "reviewExport" ? "navItem active" : "navItem"}
              onClick={() => canOpenReview && setScreen("reviewExport")}
              disabled={!canOpenReview}
            >
              {t("nav.reviewExport")}
            </Button>
            <Button
              type="button"
              variant="nav"
              active={screen === "settings"}
              className={screen === "settings" ? "navItem active" : "navItem"}
              onClick={() => setScreen("settings")}
            >
              {t("nav.settings")}
            </Button>
          </div>

          <div className="sidebarSection sidebarStatus">
            <h2>{t("app.sidebar.status")}</h2>
            <p>{hasImages ? t("app.status.imagesLoaded") : t("app.status.addCaptures")}</p>
            <p>{generationResult ? t("app.status.preset", { value: generationResult.resolvedPreset }) : t("app.status.noGeneratedModel")}</p>
            <p>{t("app.version", { value: appVersion })}</p>
          </div>
        </aside>

        {showBackdrop ? <button type="button" className="sidebarBackdrop" onClick={() => setSidebarOpen(false)} /> : null}

        <main className="appContent">
          {!serviceStatus.ok ? (
            <div className="serviceBanner">
              <span>{t("app.serviceOfflineBanner")}</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={serviceActionBusy}
                onClick={async () => {
                  setServiceActionBusy(true);
                  try {
                    await restartService();
                  } finally {
                    setServiceActionBusy(false);
                  }
                }}
              >
                {serviceActionBusy ? t("app.restartingService") : t("app.restartService")}
              </Button>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="errorBanner">
              <span>{errorMessage}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setErrorMessage(null)}>
                {t("common.dismiss")}
              </Button>
            </div>
          ) : null}

          <div className="screenHost">
            {screen === "newCapture" ? <NewCaptureScreen onGenerate={handleGenerate} generating={false} /> : null}
            {screen === "processing" ? <ProcessingScreen /> : null}
            {screen === "reviewExport" ? <ReviewExportScreen onOpenExport={openExportModal} onExportAll={handleExportAll} /> : null}
            {screen === "settings" ? <SettingsScreen /> : null}
          </div>
        </main>
      </div>

      <ExportModal
        open={exportModalOpen}
        busy={exportBusy}
        message={exportMessage}
        initialOptions={initialExportOptions}
        onClose={closeExportModal}
        onExport={handleExport}
      />
    </div>
  );
}
