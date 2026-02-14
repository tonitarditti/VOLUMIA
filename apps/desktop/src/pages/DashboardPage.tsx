import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjects } from "@/projects/context";
import { selectProjectsSortedByUpdatedAt } from "@/projects/selectors";
import { EmptyState } from "@/ui/EmptyState";
import { Button, Card, TextField } from "@/ui/primitives";
import { useT } from "@/volumia/i18n/useT";

type DashboardPageProps = {
  onImport: () => Promise<void>;
  onExport: () => Promise<void>;
};

function toHumanDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function DashboardPage({ onImport, onExport }: DashboardPageProps) {
  const { t, language } = useT();
  const navigate = useNavigate();
  const { state, createProject, duplicateProject, deleteProject, renameProject, setActiveProject } = useProjects();

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const projects = useMemo(() => selectProjectsSortedByUpdatedAt(state.projects), [state.projects]);

  const beginRename = (projectId: string, currentName: string) => {
    setEditingProjectId(projectId);
    setEditingName(currentName);
  };

  const submitRename = () => {
    if (!editingProjectId) return;
    renameProject(editingProjectId, editingName);
    setEditingProjectId(null);
    setEditingName("");
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-5">
      <Card padding="md">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">{t("dashboard.workspace")}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[0.03em] text-[var(--text)]">{t("dashboard.title")}</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
              {t("dashboard.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              className="min-w-28"
              onClick={() => {
                createProject();
              }}
            >
              {t("dashboard.newProject")}
            </Button>
            <Button variant="secondary" className="min-w-28" onClick={() => void onImport()}>
              {t("dashboard.importJson")}
            </Button>
            <Button variant="secondary" className="min-w-28" onClick={() => void onExport()}>
              {t("dashboard.exportJson")}
            </Button>
          </div>
        </div>
      </Card>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1.5">
        {projects.length === 0 ? (
          <EmptyState title={t("dashboard.emptyTitle")} description={t("dashboard.emptyDescription")} />
        ) : (
          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
            {projects.map((project) => {
              const isEditing = editingProjectId === project.id;

              return (
                <Card key={project.id} padding="md" hoverElevation className="hover:bg-[var(--surface-2)]">
                  <div className="flex items-start justify-between gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto items-start justify-start p-0 text-left hover:border-transparent hover:bg-transparent"
                      onClick={() => {
                        setActiveProject(project.id);
                        navigate(`/project/${project.id}`);
                      }}
                    >
                      <div>
                        <h2 className="text-lg font-medium tracking-[0.02em] text-[var(--text)]">{project.name}</h2>
                        <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">
                          {t("dashboard.updated", { date: toHumanDate(project.updatedAt, language) })}
                        </p>
                      </div>
                    </Button>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => beginRename(project.id, project.name)}>
                        {t("dashboard.rename")}
                      </Button>
                      <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => duplicateProject(project.id)}>
                        {t("dashboard.duplicate")}
                      </Button>
                      <Button variant="danger" className="h-8 px-3 text-xs" onClick={() => deleteProject(project.id)}>
                        {t("dashboard.delete")}
                      </Button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="mt-4 flex items-center gap-2">
                      <TextField
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        aria-label={t("dashboard.projectNameLabel")}
                      />
                      <Button variant="primary" className="min-w-20" onClick={submitRename}>
                        {t("common.save")}
                      </Button>
                      <Button
                        variant="ghost"
                        className="min-w-20"
                        onClick={() => {
                          setEditingProjectId(null);
                          setEditingName("");
                        }}
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
