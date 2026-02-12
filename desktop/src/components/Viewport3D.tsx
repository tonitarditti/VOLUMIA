import { Heart, LibraryBig, Orbit, ScanSearch } from "lucide-react";
import type { AppRoute } from "../app/routes";

type LibraryItem = {
  id: string;
  name: string;
  category: string;
  updatedAt: string;
  favorite: boolean;
};

type Viewport3DProps = {
  route: AppRoute;
  status: string;
  items: LibraryItem[];
  onToggleFavorite: (id: string) => void;
};

export function Viewport3D({ route, progress, status, items, onToggleFavorite }: Viewport3DProps) {
  if (route === "library") {
    return (
      <section className="stageCard">
        <header className="stageHeader">
          <h2>
            <LibraryBig size={18} /> Library Assets
          </h2>
          <span>{items.length} results</span>
        </header>
        <div className="libraryGrid">
          {items.map((item) => (
            <article key={item.id} className="assetCard">
              <div>
                <h3>{item.name}</h3>
                <p>
                  {item.category} - Updated {item.updatedAt}
                </p>
              </div>
              <button
                className={item.favorite ? "favoriteButton active" : "favoriteButton"}
                onClick={() => onToggleFavorite(item.id)}
                aria-label={`Toggle favorite for ${item.name}`}
              >
                <Heart size={14} />
              </button>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="stageCard">
      <header className="stageHeader">
        <h2>
          <Orbit size={18} /> Viewport 3D (Mock)
        </h2>
        <span>{progress}%</span>
      </header>
      <div className="viewportMock">
        <div className="viewportOverlay">
          <ScanSearch size={20} />
          <p>{status}</p>
          <progress value={progress} max={100} className="progressBar" />
        </div>
      </div>
    </section>
  );
}
