import { useEffect, useMemo, useState } from "react";
import { Star, Trash2, Plus } from "lucide-react";
import { useLibraryStore } from "../library/library.store";
import { useViewportStore } from "../stores/viewport.store";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sectionBlock">
      <div className="sectionTitle">{title}</div>
      <div className="sectionBody">{children}</div>
    </div>
  );
}

export default function LeftSidebar() {
  const hydrate = useLibraryStore((s) => s.hydrate);
  const isHydrated = useLibraryStore((s) => s.isHydrated);
  const items = useLibraryStore((s) => s.items);
  const query = useLibraryStore((s) => s.query);
  const onlyFavorites = useLibraryStore((s) => s.onlyFavorites);

  const setQuery = useLibraryStore((s) => s.setQuery);
  const setOnlyFavorites = useLibraryStore((s) => s.setOnlyFavorites);

  const saveDemoAsset = useLibraryStore((s) => s.saveDemoAsset);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const remove = useLibraryStore((s) => s.remove);
  const wipeAll = useLibraryStore((s) => s.wipeAll);

  const dims = useViewportStore((s) => s.dims);

  const [name, setName] = useState("Chair - Nordic");
  const [tags, setTags] = useState("chair, nordic, wood");

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((x) => {
      if (onlyFavorites && !x.favorite) return false;
      if (!q) return true;
      return (
        x.name.toLowerCase().includes(q) ||
        x.tags.some((t) => t.includes(q)) ||
        x.category.toLowerCase().includes(q)
      );
    });
  }, [items, query, onlyFavorites]);

  return (
    <div className="sidebar">
      <Section title="Library (Local)">
        <input placeholder="Search assets..." value={query} onChange={(e) => setQuery(e.target.value)} />

        <label className="check">
          <input type="checkbox" checked={onlyFavorites} onChange={(e) => setOnlyFavorites(e.target.checked)} />
          Favorites only
        </label>

        <div className="hint">{isHydrated ? `${filtered.length} assets` : "Loading..."}</div>
      </Section>

      <Section title="Save (Demo)">
        <label className="fieldLabel" htmlFor="asset-name">
          Asset name
        </label>
        <input
          id="asset-name"
          title="Asset name"
          placeholder="Asset name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="fieldLabel" htmlFor="asset-tags">
          Tags (comma separated)
        </label>
        <input
          id="asset-tags"
          title="Tags"
          placeholder="chair, nordic, wood"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />

        <button className="primary" onClick={() => saveDemoAsset({ name, tagsCsv: tags, dims })}>
          <Plus size={18} /> Save to Library
        </button>

        <div className="hint">Guarda un asset demo + metadata en IndexedDB.</div>
      </Section>

      <Section title="Generated">
        <div className="generatedList">
          {filtered.slice(0, 10).map((a) => (
            <div key={a.id} className="generatedCard">
              <div className="generatedCardHeader">
                <div className="generatedCardTitle">{a.name}</div>

                <button
                  className="btn subtle"
                  data-compact="true"
                  onClick={() => toggleFavorite(a.id)}
                  title="Favorite"
                >
                  <Star size={16} />
                </button>
              </div>

              <div className="generatedMeta">
                {a.dims_cm.w}x{a.dims_cm.d}x{a.dims_cm.h} cm - v{a.version} {a.favorite ? "- *" : ""}
              </div>

              <div className="tagRow">
                {a.tags.slice(0, 4).map((t) => (
                  <span key={t} className="tagPill">
                    {t}
                  </span>
                ))}
              </div>

              <button className="btn subtle" onClick={() => remove(a.id)}>
                <Trash2 size={16} /> Delete
              </button>
            </div>
          ))}
        </div>

        <button className="btn subtle" onClick={wipeAll}>
          Wipe Library (demo)
        </button>
      </Section>
    </div>
  );
}
