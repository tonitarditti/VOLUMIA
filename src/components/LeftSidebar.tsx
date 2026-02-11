import { useEffect, useMemo, useState } from "react";
import { Star, Trash2, Plus } from "lucide-react";
import { useLibraryStore } from "../library/library.store";
import { useViewportStore } from "../stores/viewport.store";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="sectionTitle">{title}</div>
      <div style={{ display: "grid", gap: 10 }}>{children}</div>
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
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <input value={tags} onChange={(e) => setTags(e.target.value)} />

        <button className="primary" onClick={() => saveDemoAsset({ name, tagsCsv: tags, dims })}>
          <Plus size={18} /> Save to Library
        </button>

        <div className="hint">Guarda un asset demo + metadata en IndexedDB.</div>
      </Section>

      <Section title="Generated">
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.slice(0, 10).map((a) => (
            <div
              key={a.id}
              style={{
                border: "1px solid rgba(46,42,38,.10)",
                background: "rgba(255,255,255,.55)",
                borderRadius: 12,
                padding: 10,
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.1 }}>{a.name}</div>

                <button
                  className="btn subtle"
                  style={{ width: "auto", padding: "6px 10px" }}
                  onClick={() => toggleFavorite(a.id)}
                  title="Favorite"
                >
                  <Star size={16} />
                </button>
              </div>

              <div style={{ fontSize: 12, color: "rgba(46,42,38,.55)" }}>
                {a.dims_cm.w}x{a.dims_cm.d}x{a.dims_cm.h} cm - v{a.version} {a.favorite ? "- *" : ""}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {a.tags.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    style={{
                      fontSize: 11,
                      padding: "3px 8px",
                      borderRadius: 99,
                      border: "1px solid rgba(46,42,38,.10)",
                      background: "rgba(255,255,255,.35)",
                      color: "rgba(46,42,38,.75)",
                    }}
                  >
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
