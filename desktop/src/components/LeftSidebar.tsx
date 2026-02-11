import type { AppScreen } from "../App";

type LeftSidebarProps = {
  screen: AppScreen;
  selectedImages: string[];
  preset: string;
  quality: string;
  libraryQuery: string;
  onPresetChange: (value: string) => void;
  onQualityChange: (value: string) => void;
  onLibraryQueryChange: (value: string) => void;
  onPickImages: () => void;
  onGenerate: () => void;
};

export function LeftSidebar({
  screen,
  selectedImages,
  preset,
  quality,
  libraryQuery,
  onPresetChange,
  onQualityChange,
  onLibraryQueryChange,
  onPickImages,
  onGenerate,
}: LeftSidebarProps) {
  return (
    <aside className="sidebar">
      {screen === "generate" ? (
        <>
          <section className="sidebarCard">
            <h2>References</h2>
            <p>Pick one or more images for reconstruction.</p>
            <button className="btnBronze" onClick={onPickImages}>
              Select Images
            </button>
            <ul className="fileList">
              {selectedImages.length === 0 ? <li>No files selected</li> : selectedImages.map((file) => <li key={file}>{file}</li>)}
            </ul>
          </section>

          <section className="sidebarCard">
            <h2>Generation Profile</h2>
            <label htmlFor="preset-select">Preset</label>
            <select id="preset-select" value={preset} onChange={(event) => onPresetChange(event.target.value)}>
              <option value="interior">Interior</option>
              <option value="furniture">Furniture</option>
              <option value="architecture">Architecture</option>
            </select>

            <label htmlFor="quality-select">Quality</label>
            <select id="quality-select" value={quality} onChange={(event) => onQualityChange(event.target.value)}>
              <option value="draft">Draft</option>
              <option value="balanced">Balanced</option>
              <option value="high">High fidelity</option>
            </select>
          </section>

          <section className="sidebarCard">
            <h2>Run</h2>
            <p>Generate an editable model package (OBJ/GLB ready).</p>
            <button className="btnPrimary" onClick={onGenerate}>
              Generate Editable Model
            </button>
          </section>
        </>
      ) : (
        <section className="sidebarCard">
          <h2>Library Filters</h2>
          <label htmlFor="library-query">Search</label>
          <input
            id="library-query"
            placeholder="Type name, category or tag"
            value={libraryQuery}
            onChange={(event) => onLibraryQueryChange(event.target.value)}
          />
          <p>Use Generate to add new assets into this library.</p>
        </section>
      )}
    </aside>
  );
}
