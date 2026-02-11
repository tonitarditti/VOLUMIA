import { BookOpen, Sparkles } from "lucide-react";
import type { AppRoute } from "../app/routes";

type TopBarProps = {
  route: AppRoute;
  onRouteChange: (route: AppRoute) => void;
};

export function TopBar({ route, onRouteChange }: TopBarProps) {
  return (
    <header className="topBar bg-panel border-appBorder">
      <div className="brandGroup">
        <p className="brandEyebrow">VOLUMIA</p>
        <h1>Creative 3D Assistant</h1>
      </div>

      <nav className="navTabs" aria-label="Main views">
        <button className={route === "generate" ? "navTab active" : "navTab"} onClick={() => onRouteChange("generate")}>
          <Sparkles size={16} /> Generate
        </button>
        <button className={route === "library" ? "navTab active" : "navTab"} onClick={() => onRouteChange("library")}>
          <BookOpen size={16} /> Library
        </button>
      </nav>
    </header>
  );
}
