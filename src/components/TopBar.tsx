import { useSettingsStore } from "../stores/settings.store";

export default function TopBar() {
  const units = useSettingsStore((s) => s.units);
  const setUnits = useSettingsStore((s) => s.setUnits);

  return (
    <div className="topbar">
      <div className="brand">
        <div className="brandName">VOLUMIA</div>
        <div className="brandTag">Your Creative 3D Assistant</div>
      </div>

      <div className="topbarRight">
        <div className="seg">
          <button className={units === "cm" ? "segOn" : ""} onClick={() => setUnits("cm")}>
            cm
          </button>
          <button className={units === "m" ? "segOn" : ""} onClick={() => setUnits("m")}>
            m
          </button>
        </div>
        <span className="kbd">Export: SKP (soon)</span>
        <span className="kbd">Library: Local</span>
      </div>
    </div>
  );
}
