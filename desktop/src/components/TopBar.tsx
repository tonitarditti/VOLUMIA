import { FolderKanban, Sparkles } from "lucide-react";
import type { AppScreen } from "../App";

type TopBarProps = {
  screen: AppScreen;
  onScreenChange: (screen: AppScreen) => void;
};

export function TopBar({ screen, onScreenChange }: TopBarProps) {
  return (
    <header className="topBar">
      <div className="brandGroup">
        <p className="brandEyebrow">VOLUMIA</p>
        <h1>Creative 3D Assistant</h1>
      </div>

      <nav className="screenTabs" aria-label="Main views">
        <button
          className={screen === "generate" ? "screenTab active" : "screenTab"}
          onClick={() => onScreenChange("generate")}
        >
          <Sparkles size={16} /> Generate
        </button>
        <button
          className={screen === "library" ? "screenTab active" : "screenTab"}
          onClick={() => onScreenChange("library")}
        >
          <FolderKanban size={16} /> Library
        </button>
      </nav>
    </header>
  );
}
