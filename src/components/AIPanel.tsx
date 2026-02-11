import { useMemo } from "react";
import { useSettingsStore } from "../stores/settings.store";
import { useJobStore } from "../stores/job.store";
import { useViewportStore } from "../stores/viewport.store";

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="sectionTitle" style={{ marginTop: 14 }}>
      {children}
    </div>
  );
}

export default function AIPanel() {
  const mode = useSettingsStore((s) => s.mode);
  const detail = useSettingsStore((s) => s.detail);
  const precision = useSettingsStore((s) => s.precision);
  const materials = useSettingsStore((s) => s.materials);
  const clayPreview = useSettingsStore((s) => s.clayPreview);
  const keepProportions = useSettingsStore((s) => s.keepProportions);

  const setMode = useSettingsStore((s) => s.setMode);
  const setDetail = useSettingsStore((s) => s.setDetail);
  const setPrecision = useSettingsStore((s) => s.setPrecision);
  const setMaterials = useSettingsStore((s) => s.setMaterials);
  const setClayPreview = useSettingsStore((s) => s.setClayPreview);
  const setKeepProportions = useSettingsStore((s) => s.setKeepProportions);

  const startFakeJob = useJobStore((s) => s.startFakeJob);
  const status = useJobStore((s) => s.status);
  const progress = useJobStore((s) => s.progress);
  const lastOutputName = useJobStore((s) => s.lastOutputName);

  const dims = useViewportStore((s) => s.dims);
  const setDim = useViewportStore((s) => s.setDim);
  const setMaintain = useViewportStore((s) => s.setMaintainProportions);

  const summary = useMemo(() => `${mode} - ${detail} - ${precision}`, [mode, detail, precision]);

  return (
    <div className="aiPanel">
      <div className="aiHeader">
        <div className="aiTitle">AI Assistant</div>
        <div className="aiMeta">{summary}</div>
      </div>

      <SectionTitle>Generation Mode</SectionTitle>
      <div className="row2">
        <button className={mode === "concept" ? "pill on" : "pill"} onClick={() => setMode("concept")}>
          Concept
        </button>
        <button className={mode === "production" ? "pill on" : "pill"} onClick={() => setMode("production")}>
          Production
        </button>
      </div>
      <button className={mode === "editable_clean" ? "pill on" : "pill"} onClick={() => setMode("editable_clean")}>
        Editable Clean (SKP)
      </button>

      <SectionTitle>Quality</SectionTitle>
      <div className="row2">
        <select value={detail} onChange={(e) => setDetail(e.target.value as any)}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        <select value={precision} onChange={(e) => setPrecision(e.target.value as any)}>
          <option value="loose">Loose</option>
          <option value="accurate">Accurate</option>
        </select>
      </div>

      <SectionTitle>Materials</SectionTitle>
      <label className="check">
        <input type="checkbox" checked={materials} onChange={(e) => setMaterials(e.target.checked)} />
        Auto detect materials
      </label>
      <label className="check">
        <input type="checkbox" checked={clayPreview} onChange={(e) => setClayPreview(e.target.checked)} />
        Neutral clay preview
      </label>

      <SectionTitle>Dimensions (Parametric V1)</SectionTitle>
      <label className="check">
        <input
          type="checkbox"
          checked={keepProportions}
          onChange={(e) => {
            setKeepProportions(e.target.checked);
            setMaintain(e.target.checked);
          }}
        />
        Maintain proportions
      </label>

      <div className="dimGrid">
        <div className="dimItem">
          <div className="dimLabel">Width (cm)</div>
          <input type="number" value={dims.w} onChange={(e) => setDim("w", Number(e.target.value))} />
        </div>
        <div className="dimItem">
          <div className="dimLabel">Depth (cm)</div>
          <input type="number" value={dims.d} onChange={(e) => setDim("d", Number(e.target.value))} />
        </div>
        <div className="dimItem">
          <div className="dimLabel">Height (cm)</div>
          <input type="number" value={dims.h} onChange={(e) => setDim("h", Number(e.target.value))} />
        </div>
      </div>

      <SectionTitle>Actions</SectionTitle>
      <button className="primary" disabled={status !== "idle" && status !== "done"} onClick={startFakeJob}>
        {status === "idle" || status === "done" ? "Generate Editable Model" : "Generating..."}
      </button>

      <div className="mutedSmall">
        {status !== "idle" && status !== "done"
          ? `Progress: ${progress}%`
          : lastOutputName
          ? `Last output: ${lastOutputName}`
          : "Tip: Production + Medium + Accurate = best for editable SKP."}
      </div>

      <div style={{ marginTop: "auto" }}>
        <SectionTitle>Export (mock)</SectionTitle>
        <div className="row2">
          <button className="btn subtle" disabled={status !== "done"}>
            Download OBJ
          </button>
          <button className="btn subtle" disabled={status !== "done"}>
            Download GLB
          </button>
        </div>
      </div>
    </div>
  );
}
