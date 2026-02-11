import { FolderSearch, PlayCircle, WandSparkles } from "lucide-react";
import type { AppRoute } from "../app/routes";

type LeftSidebarProps = {
  route: AppRoute;
  query: string;
  onQueryChange: (value: string) => void;
  onRunGenerate: () => void;
  itemCount: number;
};

export function LeftSidebar({ route, query, onQueryChange, onRunGenerate, itemCount }: LeftSidebarProps) {
  return (
    <aside className="leftSidebar bg-panel border-appBorder">
      {route === "generate" ? (
        <>
          <section className="panelCard">
            <h2>
              <WandSparkles size={16} /> Generate
            </h2>
            <p>UI/IA in mock mode. This flow only simulates the pipeline and progress.</p>
            <button className="primaryAction" onClick={onRunGenerate}>
              <PlayCircle size={16} /> Run Mock Generation
            </button>
          </section>
          <section className="panelCard">
            <h2>Preset</h2>
            <label htmlFor="preset">Profile</label>
            <select id="preset" defaultValue="interior">
              <option value="interior">Interior</option>
              <option value="furniture">Furniture</option>
              <option value="architecture">Architecture</option>
            </select>
            <label htmlFor="quality">Quality</label>
            <select id="quality" defaultValue="balanced">
              <option value="draft">Draft</option>
              <option value="balanced">Balanced</option>
              <option value="high">High</option>
            </select>
          </section>
        </>
      ) : (
        <section className="panelCard">
          <h2>
            <FolderSearch size={16} /> Library
          </h2>
          <p>{itemCount} assets available in local cache.</p>
          <label htmlFor="library-query">Search</label>
          <input
            id="library-query"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Name or category"
          />
        </section>
      )}
    </aside>
  );
}
