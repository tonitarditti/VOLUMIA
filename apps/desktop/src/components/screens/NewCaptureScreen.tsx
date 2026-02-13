import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { useTranslation } from "react-i18next";
import type { CaptureSlotId, ObjectTypeOption } from "@volumia/shared";
import { GuidedAnnotationCanvas } from "@/components/guided/GuidedAnnotationCanvas";
import { Button, Card, Input, Select } from "@/components/ui";
import { useCaptureStore } from "@/state/capture.store";
import { builtinPresetOptions, usePresetsStore } from "@/state/presets.store";

type NewCaptureScreenProps = {
  onGenerate: () => void;
  generating: boolean;
};

const MIN_SCALE = 1;

export function NewCaptureScreen({ onGenerate, generating }: NewCaptureScreenProps) {
  const { t } = useTranslation();
  const slots = useCaptureStore((state) => state.slots);
  const objectType = useCaptureStore((state) => state.objectType);
  const reconstructionMode = useCaptureStore((state) => state.reconstructionMode);
  const complexity = useCaptureStore((state) => state.complexity);
  const includeLightweight = useCaptureStore((state) => state.includeLightweight);
  const detectMultipleObjects = useCaptureStore((state) => state.detectMultipleObjects);
  const generationMode = useCaptureStore((state) => state.generationMode);
  const scaleDimension = useCaptureStore((state) => state.scaleDimension);
  const scaleValueCm = useCaptureStore((state) => state.scaleValueCm);
  const guidedOpen = useCaptureStore((state) => state.guidedOpen);
  const guidedAnnotations = useCaptureStore((state) => state.guidedAnnotations);

  const setObjectType = useCaptureStore((state) => state.setObjectType);
  const setReconstructionMode = useCaptureStore((state) => state.setReconstructionMode);
  const setComplexity = useCaptureStore((state) => state.setComplexity);
  const setIncludeLightweight = useCaptureStore((state) => state.setIncludeLightweight);
  const setDetectMultipleObjects = useCaptureStore((state) => state.setDetectMultipleObjects);
  const setGenerationMode = useCaptureStore((state) => state.setGenerationMode);
  const setScaleDimension = useCaptureStore((state) => state.setScaleDimension);
  const setScaleValueCm = useCaptureStore((state) => state.setScaleValueCm);
  const setGuidedOpen = useCaptureStore((state) => state.setGuidedOpen);
  const setGuidedSourceSlot = useCaptureStore((state) => state.setGuidedSourceSlot);
  const setGuidedDimensions = useCaptureStore((state) => state.setGuidedDimensions);
  const setGuidedRectangles = useCaptureStore((state) => state.setGuidedRectangles);
  const clearGuidedAnnotations = useCaptureStore((state) => state.clearGuidedAnnotations);
  const setSlotFile = useCaptureStore((state) => state.setSlotFile);
  const removeSlotFile = useCaptureStore((state) => state.removeSlotFile);
  const assignFilesToNextSlots = useCaptureStore((state) => state.assignFilesToNextSlots);

  const studioPresets = usePresetsStore((state) => state.studioPresets);
  const saveStudioPreset = usePresetsStore((state) => state.saveStudioPreset);

  const [activeSlotId, setActiveSlotId] = useState<CaptureSlotId | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [studioPresetName, setStudioPresetName] = useState("");
  const [guidedTool, setGuidedTool] = useState<"width" | "height" | "rectangle">("width");
  const singleInputRef = useRef<HTMLInputElement | null>(null);
  const batchInputRef = useRef<HTMLInputElement | null>(null);

  const assignedCount = useMemo(() => slots.filter((slot) => slot.image).length, [slots]);

  const availableGuidedSlots = useMemo(() => slots.filter((slot) => slot.image), [slots]);

  const guidedSourceSlotId = useMemo(() => {
    if (guidedAnnotations.sourceSlotId) {
      const matching = availableGuidedSlots.find((slot) => slot.id === guidedAnnotations.sourceSlotId);
      if (matching) return matching.id;
    }
    return availableGuidedSlots[0]?.id ?? null;
  }, [availableGuidedSlots, guidedAnnotations.sourceSlotId]);

  useEffect(() => {
    if (guidedSourceSlotId !== guidedAnnotations.sourceSlotId) {
      setGuidedSourceSlot(guidedSourceSlotId);
    }
  }, [guidedAnnotations.sourceSlotId, guidedSourceSlotId, setGuidedSourceSlot]);

  const guidedSourcePreview = useMemo(() => {
    if (!guidedSourceSlotId) return null;
    return slots.find((slot) => slot.id === guidedSourceSlotId)?.image?.previewUrl ?? null;
  }, [guidedSourceSlotId, slots]);

  const handleBatchAssign = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    assignFilesToNextSlots(Array.from(files));
  };

  const handleSingleAssign = (event: ChangeEvent<HTMLInputElement>) => {
    if (!activeSlotId) return;
    const file = event.target.files?.[0];
    if (!file) return;
    setSlotFile(activeSlotId, file);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    handleBatchAssign(event.dataTransfer.files);
  };

  const handleSaveStudioPreset = async () => {
    const name = studioPresetName.trim();
    if (!name) return;

    const basePreset: Exclude<ObjectTypeOption, "auto-detect" | `studio:${string}`> =
      objectType.startsWith("studio:")
        ? studioPresets.find((preset) => `studio:${preset.id}` === objectType)?.basePreset ?? "decor"
        : objectType === "auto-detect"
          ? "decor"
          : (objectType as Exclude<ObjectTypeOption, "auto-detect" | `studio:${string}`>);

    await saveStudioPreset({
      presetName: name,
      basePreset,
      structureLocked: true,
      materialDefaults: [],
      exportDefaults: {
        textureSize: "2k",
        includeLightweight,
      },
    });

    setStudioPresetName("");
  };

  const statusClassByLabel: Record<string, string> = {
    Ready: "badge ready",
    "Low detail": "badge warn",
    Reflections: "badge warn",
    "Too dark": "badge warn",
  };

  return (
    <div className="screenWrap newCaptureScreen">
      <header className="screenHeader">
        <div className="screenHeaderTitle">
          <img src="/assets/logo.svg" alt="VOLUMIA" className="logoMark" />
          <div>
            <h1>VOLUMIA</h1>
            <p>{t("newCapture.title")}</p>
          </div>
        </div>
      </header>

      <div className="newCaptureBody">
        <Card className="capturePanel">
          <div
            className={isDragOver ? "dropzone active" : "dropzone"}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
          >
            <h3>{t("newCapture.dropTitle")}</h3>
            <p>{t("newCapture.dropDescription")}</p>
            <Button type="button" variant="secondary" onClick={() => batchInputRef.current?.click()}>
              {t("common.selectImages")}
            </Button>
            <input
              ref={batchInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                handleBatchAssign(event.target.files);
                event.target.value = "";
              }}
            />
          </div>

          <div className="slotGrid">
            {slots.map((slot) => (
              <article key={slot.id} className="slotCard">
                <header>
                  <h4>{t(`newCapture.slotLabels.${slot.id}`)}</h4>
                  <span className={slot.image ? statusClassByLabel[slot.image.status] ?? "badge" : slot.recommended ? "badge warn" : "badge"}>
                    {slot.image
                      ? t(`slotStatus.${slot.image.status}`)
                      : slot.recommended
                        ? t("newCapture.slotRecommended")
                        : slot.optional
                          ? t("common.optional")
                          : t("common.pending")}
                  </span>
                </header>

                <div className="slotPreview">
                  {slot.image ? (
                    <img src={slot.image.previewUrl} alt={slot.image.fileName} />
                  ) : (
                    <span>{t("newCapture.emptySlot")}</span>
                  )}
                </div>

                <footer>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setActiveSlotId(slot.id);
                      singleInputRef.current?.click();
                    }}
                  >
                    {slot.image ? t("common.replace") : t("common.add")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeSlotFile(slot.id)} disabled={!slot.image}>
                    {t("common.remove")}
                  </Button>
                </footer>
                {slot.image ? <p className="slotNote">{slot.image.note}</p> : null}
              </article>
            ))}
          </div>

          <input ref={singleInputRef} type="file" accept="image/*" hidden onChange={handleSingleAssign} />
        </Card>

        <Card className="setupPanel">
          <h3>{t("newCapture.setup")}</h3>

          <label className="field">
            <span>{t("newCapture.objectType")}</span>
            <Select value={objectType} onChange={(event) => setObjectType(event.target.value as ObjectTypeOption)}>
              <option value="auto-detect">{t("newCapture.autoDetect")}</option>
              {builtinPresetOptions.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {t(`preset.${preset.id}`)}
                </option>
              ))}
              <optgroup label={t("newCapture.studioPresetsGroup")}>
                {studioPresets.length === 0 ? <option disabled>{t("newCapture.noStudioPresets")}</option> : null}
                {studioPresets.map((preset) => (
                  <option key={preset.id} value={`studio:${preset.id}`}>
                    {preset.presetName}
                  </option>
                ))}
              </optgroup>
            </Select>
          </label>

          <div className="field">
            <span>{t("newCapture.saveStudioPreset")}</span>
            <div className="studioPresetRow">
              <Input
                type="text"
                placeholder={t("newCapture.presetNamePlaceholder")}
                value={studioPresetName}
                onChange={(event) => setStudioPresetName(event.target.value)}
              />
              <Button type="button" variant="secondary" size="sm" onClick={handleSaveStudioPreset} disabled={!studioPresetName.trim()}>
                {t("common.save")}
              </Button>
            </div>
          </div>

          <label className="field">
            <span>{t("newCapture.reconstructionMode")}</span>
            <Select value={reconstructionMode} onChange={(event) => setReconstructionMode(event.target.value as never)}>
              <option value="auto">{t("newCapture.modeAuto")}</option>
              <option value="rigid">{t("newCapture.modeRigid")}</option>
              <option value="organic">{t("newCapture.modeOrganic")}</option>
            </Select>
          </label>

          <label className="field switchRow">
            <span>{t("newCapture.detectMultipleObjects")}</span>
            <input type="checkbox" checked={detectMultipleObjects} onChange={(event) => setDetectMultipleObjects(event.target.checked)} />
          </label>

          <div className="field">
            <span>{t("newCapture.generationMode")}</span>
            <div className="modeToggleRow">
              <Button
                type="button"
                variant="secondary"
                active={generationMode === "conservative"}
                onClick={() => setGenerationMode("conservative")}
              >
                {t("newCapture.modeConservative")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                active={generationMode === "aggressive"}
                onClick={() => setGenerationMode("aggressive")}
              >
                {t("newCapture.modeAggressive")}
              </Button>
            </div>
          </div>

          <div className="field switchRow">
            <span>{t("newCapture.targetSketchup")}</span>
            <input type="checkbox" checked disabled />
          </div>

          <label className="field switchRow">
            <span>{t("newCapture.includeLow")}</span>
            <input type="checkbox" checked={includeLightweight} onChange={(event) => setIncludeLightweight(event.target.checked)} />
          </label>

          <label className="field">
            <span>{t("newCapture.complexity")}</span>
            <Select value={complexity} onChange={(event) => setComplexity(event.target.value as never)}>
              <option value="low">{t("newCapture.complexityLow")}</option>
              <option value="medium">{t("newCapture.complexityMedium")}</option>
              <option value="high">{t("newCapture.complexityHigh")}</option>
            </Select>
          </label>

          <div className="field scaleField">
            <span>{t("newCapture.scaleRequired")}</span>
            <div className="scaleInputs">
              <Select value={scaleDimension} onChange={(event) => setScaleDimension(event.target.value as never)}>
                <option value="width">{t("newCapture.width")}</option>
                <option value="height">{t("newCapture.height")}</option>
                <option value="depth">{t("newCapture.depth")}</option>
              </Select>
              <Input
                type="number"
                min={MIN_SCALE}
                value={scaleValueCm}
                onChange={(event) => setScaleValueCm(Math.max(MIN_SCALE, Number(event.target.value) || MIN_SCALE))}
              />
              <span className="suffix">cm</span>
            </div>
          </div>

          <Button type="button" variant="primary" onClick={onGenerate} disabled={generating || assignedCount === 0}>
            {generating ? t("newCapture.generating") : t("newCapture.generate")}
          </Button>

          <Button type="button" variant="secondary" onClick={() => setGuidedOpen(true)}>
            {t("newCapture.improveAccuracy")}
          </Button>
        </Card>
      </div>

      {guidedOpen ? (
        <div className="modalOverlay">
          <div className="guidedModal floatingPanel">
            <h3>{t("newCapture.guidedTitle")}</h3>
            <ol>
              <li>{t("newCapture.guidedStep1")}</li>
              <li>{t("newCapture.guidedStep2")}</li>
            </ol>

            <div className="field">
              <span>Source image</span>
              <Select
                value={guidedSourceSlotId ?? ""}
                onChange={(event) => setGuidedSourceSlot((event.target.value || null) as CaptureSlotId | null)}
              >
                {availableGuidedSlots.length === 0 ? <option value="">No images loaded</option> : null}
                {availableGuidedSlots.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {t(`newCapture.slotLabels.${slot.id}`)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="guidedToolRow">
              <Button type="button" variant="secondary" active={guidedTool === "width"} onClick={() => setGuidedTool("width")}>Width mark</Button>
              <Button type="button" variant="secondary" active={guidedTool === "height"} onClick={() => setGuidedTool("height")}>Height mark</Button>
              <Button type="button" variant="secondary" active={guidedTool === "rectangle"} onClick={() => setGuidedTool("rectangle")}>Rectangle tool</Button>
              <Button type="button" variant="ghost" onClick={() => clearGuidedAnnotations()}>Clear</Button>
            </div>

            <GuidedAnnotationCanvas
              imageUrl={guidedSourcePreview}
              tool={guidedTool}
              dimensions={guidedAnnotations.dimensions}
              rectangles={guidedAnnotations.rectangles}
              onDimensionsChange={setGuidedDimensions}
              onRectanglesChange={setGuidedRectangles}
            />

            <div className="guidedStats">
              <small>Dimensions: {guidedAnnotations.dimensions.length} / 2</small>
              <small>Rectangles: {guidedAnnotations.rectangles.length}</small>
            </div>

            <div className="modalActions">
              <Button type="button" variant="secondary" onClick={() => setGuidedOpen(false)}>
                {t("common.close")}
              </Button>
              <Button type="button" variant="primary" onClick={() => setGuidedOpen(false)}>
                {t("newCapture.guidedApply")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
