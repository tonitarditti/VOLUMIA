import { Heart, Sparkles } from "lucide-react";
import type { AppScreen, LibraryAsset } from "../App";

type MainStageProps = {
  screen: AppScreen;
  assets: LibraryAsset[];
  progress: number;
  status: string;
  onToggleFavorite: (id: string) => void;
};

export function MainStage({ screen, assets, progress, status, onToggleFavorite }: MainStageProps) {
  if (screen === "generate") {
    return (
      <main className="mainPanel">
        <div className="heroCard">
          <p className="heroKicker">Generate</p>
          <h2>Photoreference to editable 3D base</h2>
          <p className="heroCopy">
            Keep topology clean for downstream SketchUp edits. Use balanced quality for early exploration and high
            fidelity for final geometry.
          </p>

          <div className="pipelineStatus">
            <Sparkles size={16} />
            <span>{status}</span>
          </div>

          <progress className="progressNative" max={100} value={progress} aria-label="Generation progress" />
        </div>
      </main>
    );
  }

  return (
    <main className="mainPanel">
      <div className="libraryHeader">
        <p className="heroKicker">Library</p>
        <h2>Reusable generated assets</h2>
      </div>

      <div className="assetGrid">
        {assets.map((asset) => (
          <article key={asset.id} className="assetCard">
            <div className="assetHead">
              <h3>{asset.name}</h3>
              <button
                className={asset.favorite ? "favoriteBtn active" : "favoriteBtn"}
                onClick={() => onToggleFavorite(asset.id)}
                aria-label={`Toggle favorite for ${asset.name}`}
              >
                <Heart size={15} />
              </button>
            </div>
            <p className="assetMeta">
              {asset.category} · Updated {asset.updatedAt}
            </p>
            <div className="tagWrap">
              {asset.tags.map((tag) => (
                <span key={`${asset.id}-${tag}`}>{tag}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
