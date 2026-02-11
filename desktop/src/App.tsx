import { useMemo, useState } from "react";
import { LeftSidebar } from "./components/LeftSidebar";
import { MainStage } from "./components/MainStage";
import { StatusBar } from "./components/StatusBar";
import { TopBar } from "./components/TopBar";
import "./styles/app.css";

export type AppScreen = "generate" | "library";

export type LibraryAsset = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  updatedAt: string;
  favorite: boolean;
};

const initialAssets: LibraryAsset[] = [
  {
    id: "asset-001",
    name: "Nordic Chair Concept",
    category: "Furniture",
    tags: ["chair", "wood", "clean"],
    updatedAt: "2026-02-11 10:42",
    favorite: true,
  },
  {
    id: "asset-002",
    name: "Marble Vanity Blockout",
    category: "Interior",
    tags: ["bathroom", "vanity"],
    updatedAt: "2026-02-11 09:08",
    favorite: false,
  },
  {
    id: "asset-003",
    name: "Townhouse Facade Study",
    category: "Architecture",
    tags: ["facade", "exterior"],
    updatedAt: "2026-02-10 18:16",
    favorite: false,
  },
];

function App() {
  const [screen, setScreen] = useState<AppScreen>("generate");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [preset, setPreset] = useState("interior");
  const [quality, setQuality] = useState("balanced");
  const [status, setStatus] = useState("Ready");
  const [progress, setProgress] = useState(0);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [assets, setAssets] = useState<LibraryAsset[]>(initialAssets);

  const filteredAssets = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    if (!query) return assets;
    return assets.filter(
      (asset) =>
        asset.name.toLowerCase().includes(query) ||
        asset.category.toLowerCase().includes(query) ||
        asset.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }, [assets, libraryQuery]);

  const handlePickImages = async () => {
    const files = await window.electronAPI.selectImages();
    setSelectedImages(files);
    setStatus(files.length > 0 ? `${files.length} image(s) loaded` : "Ready");
  };

  const handleGenerate = async () => {
    if (selectedImages.length === 0) {
      setStatus("Select at least one reference image");
      return;
    }

    setStatus("Running generation pipeline");
    setProgress(12);
    await new Promise((resolve) => setTimeout(resolve, 350));
    setProgress(44);
    await new Promise((resolve) => setTimeout(resolve, 350));
    setProgress(78);
    await new Promise((resolve) => setTimeout(resolve, 350));
    setProgress(100);
    setStatus("Model generated successfully");

    const nameBase = selectedImages[0].split(/[\\/]/).pop() || "Untitled";
    setAssets((prev) => [
      {
        id: `asset-${Date.now()}`,
        name: `${nameBase.replace(/\.[^/.]+$/, "")} - Generated`,
        category: preset[0].toUpperCase() + preset.slice(1),
        tags: [quality, "generated"],
        updatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
        favorite: false,
      },
      ...prev,
    ]);
  };

  const toggleFavorite = (id: string) => {
    setAssets((prev) => prev.map((asset) => (asset.id === id ? { ...asset, favorite: !asset.favorite } : asset)));
  };

  return (
    <div className="appRoot">
      <TopBar screen={screen} onScreenChange={setScreen} />

      <div className="workspace">
        <LeftSidebar
          screen={screen}
          selectedImages={selectedImages}
          preset={preset}
          quality={quality}
          libraryQuery={libraryQuery}
          onPresetChange={setPreset}
          onQualityChange={setQuality}
          onLibraryQueryChange={setLibraryQuery}
          onPickImages={handlePickImages}
          onGenerate={handleGenerate}
        />

        <MainStage screen={screen} assets={filteredAssets} progress={progress} status={status} onToggleFavorite={toggleFavorite} />
      </div>

      <StatusBar status={status} progress={progress} assetCount={filteredAssets.length} />
    </div>
  );
}

export default App;
