import { useMemo, useState } from "react";
import { AIPanel } from "../components/AIPanel";
import { LeftSidebar } from "../components/LeftSidebar";
import { StatusBar } from "../components/StatusBar";
import { TopBar } from "../components/TopBar";
import { Viewport3D } from "../components/Viewport3D";
import type { AppRoute } from "./routes";

type LibraryItem = {
  id: string;
  name: string;
  category: string;
  updatedAt: string;
  favorite: boolean;
};

const mockItems: LibraryItem[] = [
  { id: "lib-1", name: "Nordic Chair v3", category: "Furniture", updatedAt: "2026-02-11", favorite: true },
  { id: "lib-2", name: "Kitchen Island", category: "Interior", updatedAt: "2026-02-10", favorite: false },
  { id: "lib-3", name: "Facade Module", category: "Architecture", updatedAt: "2026-02-09", favorite: false },
];

export function AppShell() {
  const [route, setRoute] = useState<AppRoute>("generate");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(mockItems);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(normalized) || item.category.toLowerCase().includes(normalized)
    );
  }, [items, query]);

  const runMockGenerate = async () => {
    if (route !== "generate") return;
    setStatus("Preparing references...");
    setProgress(15);
    await new Promise((resolve) => setTimeout(resolve, 350));
    setStatus("Reconstructing geometry...");
    setProgress(47);
    await new Promise((resolve) => setTimeout(resolve, 350));
    setStatus("Packaging editable outputs...");
    setProgress(85);
    await new Promise((resolve) => setTimeout(resolve, 300));
    setProgress(100);
    setStatus("Mock model ready");
  };

  const toggleFavorite = (id: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, favorite: !item.favorite } : item)));
  };

  return (
    <div className="appRoot bg-app text-appText">
      <TopBar route={route} onRouteChange={setRoute} />

      <div className="shellBody">
        <LeftSidebar
          route={route}
          query={query}
          onQueryChange={setQuery}
          onRunGenerate={runMockGenerate}
          itemCount={filteredItems.length}
        />
        <main className="stageWrap">
          <section className="centerPane">
            <Viewport3D
              route={route}
              progress={progress}
              status={status}
              items={filteredItems}
              onToggleFavorite={toggleFavorite}
            />
          </section>
          <aside className="rightPane">
            <AIPanel route={route} />
          </aside>
        </main>
      </div>

      <StatusBar route={route} status={status} progress={progress} itemCount={filteredItems.length} />
    </div>
  );
}
