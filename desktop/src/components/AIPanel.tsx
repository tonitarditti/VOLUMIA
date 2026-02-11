import { BrainCircuit, Layers3, SlidersHorizontal } from "lucide-react";
import type { AppRoute } from "../app/routes";

type AIPanelProps = {
  route: AppRoute;
};

export function AIPanel({ route }: AIPanelProps) {
  if (route === "library") {
    return (
      <div className="aiPanel">
        <h2>
          <Layers3 size={16} /> Library Insights
        </h2>
        <ul>
          <li>Most generated category: Furniture</li>
          <li>Recent activity: 3 assets this week</li>
          <li>Favorites ratio: 34%</li>
        </ul>
      </div>
    );
  }

  return (
    <div className="aiPanel">
      <h2>
        <BrainCircuit size={16} /> Generation Controls
      </h2>
      <ul>
        <li>Reconstruction mode: Balanced</li>
        <li>Topology target: Editable quads</li>
        <li>Output profile: SketchUp-ready</li>
      </ul>
      <button className="secondaryAction">
        <SlidersHorizontal size={14} /> Advanced Options (mock)
      </button>
    </div>
  );
}
