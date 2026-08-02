import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { generationClient, type ProjectMetadata, type ProjectPayload } from "@/services/generationClient";
import { Button } from "@/ui/primitives";
import { RecentProjects } from "./RecentProjects";

const categories = [
  ["chair", "Silla"], ["table", "Mesa"], ["sofa", "Sillón"], ["lighting", "Luminaria"],
  ["faucet", "Grifería"], ["surface", "Revestimiento"], ["free_object", "Objeto libre"], ["other", "Otro"],
] as const;

type CreateForm = { name: string; category: string; tags: string };
const defaultForm: CreateForm = { name: "", category: "free_object", tags: "" };

export function HomeDashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(defaultForm);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [cancellingProjectId, setCancellingProjectId] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`${generationClient.backendBaseUrl}/api/projects`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "No se pudieron cargar los proyectos.");
      setProjects(data.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar proyectos.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const visibleProjects = useMemo(() => projects.filter((project) => {
    const metadata = project.metadata;
    const text = `${metadata.name} ${metadata.tags.join(" ")} ${metadata.category}`.toLocaleLowerCase();
    return (!query || text.includes(query.toLocaleLowerCase())) &&
      (category === "all" || metadata.category === category) &&
      (status === "all" || project.job.status === status) &&
      (!favoritesOnly || metadata.favorite) &&
      (showArchived ? metadata.archived : !metadata.archived);
  }), [category, favoritesOnly, projects, query, showArchived, status]);

  const createNewProject = async () => {
    const name = form.name.trim();
    if (!name) { setError("El nombre del activo es obligatorio."); return; }
    setCreating(true); setError(null);
    try {
      const project = await generationClient.createProject({
        name, category: form.category, tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
      setShowCreate(false); setForm(defaultForm); navigate(`/project/${project.id}`);
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear el proyecto."); }
    finally { setCreating(false); }
  };

  const patchProject = async (project: ProjectPayload, patch: Partial<ProjectMetadata>) => {
    const result = await generationClient.updateProject(project.id, patch);
    setProjects((current) => current.map((item) => item.id === project.id ? result.project : item));
  };
  const handleDeleteProject = async (project: ProjectPayload) => {
    if (!window.confirm(`¿Eliminar “${project.metadata.name}”? También se borrarán los archivos generados.`)) return;
    setDeletingProjectId(project.id);
    try { await generationClient.deleteProject(project.id); setProjects((current) => current.filter((item) => item.id !== project.id)); }
    catch (err) { window.alert(err instanceof Error ? err.message : "No se pudo eliminar el proyecto."); }
    finally { setDeletingProjectId(null); }
  };
  const handleRename = async (project: ProjectPayload) => {
    const name = window.prompt("Nombre del activo", project.metadata.name)?.trim();
    if (!name || name === project.metadata.name) return;
    try { await patchProject(project, { name }); } catch (err) { window.alert(err instanceof Error ? err.message : "No se pudo renombrar."); }
  };
  const handleDuplicate = async (project: ProjectPayload) => {
    try { const copy = await generationClient.duplicateProject(project.id); setProjects((current) => [copy, ...current]); }
    catch (err) { window.alert(err instanceof Error ? err.message : "No se pudo duplicar."); }
  };
  const handleCancelProject = async (project: ProjectPayload) => {
    if (!window.confirm(`¿Cancelar la generación de “${project.metadata.name}”?`)) return;
    setCancellingProjectId(project.id);
    try { const result = await generationClient.cancelProjectGeneration(project.id); setProjects((current) => current.map((item) => item.id === project.id ? { ...item, job: result.job } : item)); }
    catch (err) { window.alert(err instanceof Error ? err.message : "No se pudo cancelar."); }
    finally { setCancellingProjectId(null); }
  };

  return <main className="h-full min-h-0 overflow-y-auto bg-[var(--background)]">
    <section className="border-b border-[var(--border)] px-5 py-8 sm:px-8">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--volumia-cyan)]">Asset Library</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">Producción de activos 3D</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">Referencias → configuración → activo 3D → revisión → exportación. Tus datos, versiones y resultados viven con cada proyecto.</p>
        </div>
        <Button variant="primary" className="h-11 px-5" onClick={() => setShowCreate(true)}>Nuevo activo</Button>
      </div>
      <div className="mx-auto mt-6 grid max-w-[1500px] gap-3 md:grid-cols-[minmax(220px,1fr)_180px_160px_auto_auto]">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, etiqueta o categoría" className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)]" />
        <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"><option value="all">Todas las categorías</option>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"><option value="all">Todos los estados</option><option value="idle">Borrador</option><option value="queued">En cola</option><option value="running">Procesando</option><option value="optimizing">Optimizando</option><option value="complete">Listo</option><option value="error">Error</option></select>
        <button type="button" onClick={() => setFavoritesOnly((value) => !value)} aria-pressed={favoritesOnly} className={`h-10 rounded-lg border px-3 text-sm ${favoritesOnly ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]"}`}>Favoritos</button>
        <button type="button" onClick={() => setShowArchived((value) => !value)} aria-pressed={showArchived} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-secondary)]">{showArchived ? "Archivados" : "Activos"}</button>
      </div>
    </section>
    {error ? <p className="mx-auto mt-4 max-w-[1500px] rounded-lg border border-[var(--badge-danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--badge-danger-text)]">{error}</p> : null}
    <RecentProjects projects={visibleProjects} loading={loading} error={null} onOpen={(id) => navigate(`/project/${id}`)} onDelete={handleDeleteProject} onCancel={handleCancelProject} onRename={handleRename} onDuplicate={handleDuplicate} onPatch={patchProject} deletingProjectId={deletingProjectId} cancellingProjectId={cancellingProjectId} />
    {showCreate ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Crear nuevo activo"><form onSubmit={(event) => { event.preventDefault(); void createNewProject(); }} className="w-full max-w-md rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-2xl"><h2 className="text-xl font-semibold text-[var(--text)]">Nuevo activo</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Empezá con un nombre claro para encontrarlo después.</p><label className="mt-5 block text-sm text-[var(--text)]">Nombre *<input autoFocus required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Silla nórdica de roble" className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3" /></label><label className="mt-4 block text-sm text-[var(--text)]">Categoría<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3">{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="mt-4 block text-sm text-[var(--text)]">Etiquetas <span className="text-[var(--text-faint)]">(separadas por coma)</span><input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="madera, comedor, nórdico" className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3" /></label><div className="mt-6 flex justify-end gap-2"><Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>Cancelar</Button><Button variant="primary" type="submit" disabled={creating}>{creating ? "Creando…" : "Crear activo"}</Button></div></form></div> : null}
  </main>;
}
