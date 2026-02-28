import { useEffect, useMemo } from "react";
import { Navigate, NavLink, useParams } from "react-router-dom";
import { useProjects } from "@/projects/context";
import { selectProjectById } from "@/projects/selectors";
import { ProjectViewport } from "@/three/ProjectViewport";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function filenameFromPath(value: string) {
  const parts = value.split(/[/\\]/);
  return parts[parts.length - 1] ?? value;
}

function railLinkClass(isActive: boolean) {
  return `flex h-10 w-10 items-center justify-center rounded-xl border text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${
    isActive
      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
      : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
  }`;
}

function panelClass() {
  return "border-[var(--border)] bg-[var(--surface-1)]";
}

export function WorkspacePage() {
  const { projectId = "" } = useParams();
  const { state, hydrated, setActiveProject } = useProjects();
  const project = useMemo(() => selectProjectById(state, projectId), [projectId, state]);

  useEffect(() => {
    if (!project || state.activeProjectId === project.id) {
      return;
    }
    setActiveProject(project.id);
  }, [project, setActiveProject, state.activeProjectId]);

  if (!hydrated) {
    return null;
  }

  if (!project) {
    return <Navigate to="/dashboard" replace />;
  }

  const sourceImages = project.model?.sourceImages ?? [];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--surface-2)] text-[var(--text)]">
      <aside className={`flex w-16 shrink-0 flex-col items-center justify-between border-r py-3 ${panelClass()}`}>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold tracking-[0.2em] text-[var(--accent)]">
          V
        </div>
        <nav className="flex flex-col items-center gap-3">
          <NavLink to="/dashboard" className={({ isActive }) => railLinkClass(isActive)}>
            P
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => railLinkClass(isActive)}>
            S
          </NavLink>
        </nav>
        <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">AI</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 min-w-0 flex-1">
          <main className="min-h-0 min-w-0 flex-1">
            <div className="h-full w-full min-h-0 min-w-0">
              <ProjectViewport
                glbPath={project.model?.glbPath}
                glbVersion={project.model?.generatedAt}
                isGenerating={false}
                generationStage="idle"
                showUtilityButtons={false}
                showChrome={false}
              />
            </div>
          </main>

          <aside className={`flex w-[360px] shrink-0 flex-col border-l ${panelClass()}`}>
            <div className="border-b border-[var(--border)] px-5 py-5">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Workspace</p>
              <h1 className="mt-2 text-xl font-semibold tracking-[0.02em]">{project.name}</h1>
              <p className="mt-2 text-sm text-[var(--text-muted)]">Updated {formatTimestamp(project.updatedAt)}</p>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
              <section>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Model</p>
                <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm">
                  <p className="text-[var(--text)]">
                    {project.model?.glbPath ? filenameFromPath(project.model.glbPath) : "No generated model yet."}
                  </p>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    Preset: {project.model?.preset ?? "balanced"} | Mode: {project.model?.mode ?? "auto"}
                  </p>
                </div>
              </section>

              <section>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Source Images</p>
                <div className="mt-3 space-y-2">
                  {sourceImages.length > 0 ? (
                    sourceImages.map((imagePath) => (
                      <div
                        key={imagePath}
                        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-muted)]"
                      >
                        {filenameFromPath(imagePath)}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-5 text-sm text-[var(--text-muted)]">
                      No source images selected.
                    </div>
                  )}
                </div>
              </section>

              <section>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Notes</p>
                <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 text-sm text-[var(--text-muted)]">
                  {project.notes.trim() || "No project notes yet."}
                </div>
              </section>
            </div>
          </aside>
        </div>

        <footer className={`flex h-16 shrink-0 items-center justify-between gap-4 border-t px-5 ${panelClass()}`}>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{project.name}</p>
            <p className="truncate text-xs text-[var(--text-muted)]">
              {project.model?.glbPath ? project.model.glbPath : "Viewport mounted with the current project context."}
            </p>
          </div>
          <p className="shrink-0 text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
            Images {sourceImages.length} | Chat {project.chatHistory.length}
          </p>
        </footer>
      </div>
    </div>
  );
}
