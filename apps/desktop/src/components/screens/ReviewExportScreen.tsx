import { useTranslation } from "react-i18next";
import { ReviewViewport } from "@/components/viewport/ReviewViewport";
import { Button, Card, Input, Tabs } from "@/components/ui";
import { useReviewStore } from "@/state/review.store";

type ReviewExportScreenProps = {
  onOpenExport: () => void;
  onExportAll: () => void;
};

export function ReviewExportScreen({ onOpenExport, onExportAll }: ReviewExportScreenProps) {
  const { t } = useTranslation();
  const generationResult = useReviewStore((state) => state.generationResult);
  const selectedObjectId = useReviewStore((state) => state.selectedObjectId);
  const setSelectedObjectId = useReviewStore((state) => state.setSelectedObjectId);
  const previewQuality = useReviewStore((state) => state.previewQuality);
  const setPreviewQuality = useReviewStore((state) => state.setPreviewQuality);
  const materialControls = useReviewStore((state) => state.materialControls);
  const updateMaterialControl = useReviewStore((state) => state.updateMaterialControl);

  if (!generationResult) {
    return (
      <Card className="screenWrap reviewScreen centered">
        <h2>{t("review.emptyTitle")}</h2>
        <p>{t("review.emptyDescription")}</p>
      </Card>
    );
  }

  const detectedObjects = generationResult.detectedObjects ?? [];
  const hasMultipleObjects = detectedObjects.length > 1;
  const activeObjectId = hasMultipleObjects ? selectedObjectId ?? detectedObjects[0]?.id ?? null : generationResult.objectId ?? null;
  const activeObject = hasMultipleObjects
    ? detectedObjects.find((item) => item.id === activeObjectId) ?? detectedObjects[0]
    : generationResult;

  const qualityStats = activeObject.stats[previewQuality];
  const modelUrl = previewQuality === "high" ? activeObject.artifacts.highGlb : activeObject.artifacts.lowGlb;
  const activeWarnings = activeObject.warnings ?? generationResult.warnings ?? [];

  return (
    <div className="screenWrap reviewScreen">
      <header className="reviewHeader cardSurface">
        <div>
          <h2>{t("review.title")}</h2>
          {activeWarnings.length > 0 ? (
            <div className="reviewWarnings" role="status" aria-live="polite">
              <small>{t("review.warningsTitle")}</small>
              <ul>
                {activeWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="reviewHeaderActions">
          <Tabs
            className="qualityToggle"
            ariaLabel={t("review.title")}
            value={previewQuality}
            onChange={setPreviewQuality}
            options={[
              { value: "high", label: t("review.high") },
              { value: "low", label: t("review.low") },
            ]}
          />
          <Button type="button" variant="primary" onClick={onOpenExport}>
            {t("review.exportForSketchup")}
          </Button>
          {hasMultipleObjects ? (
            <Button type="button" variant="secondary" onClick={onExportAll}>
              {t("review.exportAllPackages")}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="reviewGrid">
        <Card className="structurePanel">
          {hasMultipleObjects ? (
            <div className="detectedObjectsList">
              <h4>{t("review.detectedObjects")}</h4>
              <ul>
                {detectedObjects.map((item, index) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={item.id === activeObjectId ? "detectedObjectBtn active" : "detectedObjectBtn"}
                      onClick={() => setSelectedObjectId(item.id)}
                    >
                      <img src={item.artifacts.previewLow} alt={item.objectName} />
                      <span>{t("review.objectLabel", { index: index + 1 })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <h3>{t("review.structure")}</h3>
          <ul className="structureTree">
            {activeObject.components.map((component) => (
              <li key={component.name}>
                <span>{component.name}</span>
                <small>{component.present ? t("common.present") : t("common.optional")}</small>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="viewportPanel">
          <div className="viewportMeta">
            <span>{activeObject.objectName}</span>
            <span className="orbitBadge">{t("review.orbitOn")}</span>
          </div>
          <ReviewViewport modelUrl={modelUrl} />
          <div className="statsRow">
            <span>{t("review.faces", { value: qualityStats.faces })}</span>
            <span>{t("review.materials", { value: qualityStats.materials })}</span>
            <span>{t("review.components", { value: qualityStats.components })}</span>
          </div>
        </Card>

        <Card className="materialsPanel">
          <h3>{t("review.materialsTitle")}</h3>
          <div className="materialsList">
            {activeObject.materials.map((material) => {
              const control = materialControls[material.name];
              const previewMap = previewQuality === "high" ? material.mapsHigh.baseColor : material.mapsLow.baseColor;
              return (
                <article key={material.name} className="materialCard">
                  <h4>{material.name}</h4>
                  <img className="materialPreview" src={previewMap} alt={`${material.name} preview`} />

                  <label>
                    {t("review.tiling")}
                    <Input
                      type="number"
                      step={0.1}
                      value={control?.tiling ?? 1}
                      onChange={(event) => updateMaterialControl(material.name, { tiling: Number(event.target.value) || 1 })}
                    />
                  </label>

                  <label>
                    {t("review.rotation")}
                    <Input
                      type="number"
                      step={1}
                      value={control?.rotation ?? 0}
                      onChange={(event) => updateMaterialControl(material.name, { rotation: Number(event.target.value) || 0 })}
                    />
                  </label>

                  <label>
                    {t("review.roughness")}
                    <Input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={control?.roughness ?? material.roughnessDefault}
                      onChange={(event) => updateMaterialControl(material.name, { roughness: Number(event.target.value) })}
                    />
                  </label>

                  <label>
                    {t("review.normalStrength")}
                    <Input
                      type="range"
                      min={0}
                      max={2}
                      step={0.01}
                      value={control?.normalStrength ?? material.normalStrengthDefault}
                      onChange={(event) => updateMaterialControl(material.name, { normalStrength: Number(event.target.value) })}
                    />
                  </label>

                  <div className="materialActions">
                    <Button type="button" variant="secondary" size="sm">
                      {t("review.replaceBaseColor")}
                    </Button>
                    <Button type="button" variant="secondary" size="sm">
                      {t("review.replacePbr")}
                    </Button>
                    <Button type="button" variant="ghost" size="sm">
                      {t("review.makeSeamless")}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
