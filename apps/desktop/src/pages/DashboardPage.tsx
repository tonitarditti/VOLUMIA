import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { desktopApi, hasDesktopBridge } from "@/electron/desktopApi";
import type { BackendStatusResponse, ComfyStatusResponse } from "@/electron/channels";
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
  const [backendStatus, setBackendStatus] = useState<BackendStatusResponse | null>(null);
  const [comfyStatus, setComfyStatus] = useState<ComfyStatusResponse | null>(null);
  const [backendMessage, setBackendMessage] = useState("Backend idle.");
  const [runningWorkflowTest, setRunningWorkflowTest] = useState(false);
  const [importingWorkflow, setImportingWorkflow] = useState(false);
  const [startingComfy, setStartingComfy] = useState(false);
  const [stoppingComfy, setStoppingComfy] = useState(false);
  const [workflowImagePath, setWorkflowImagePath] = useState("");

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

  useEffect(() => {
    if (!hasDesktopBridge()) {
      setBackendMessage("Desktop bridge no disponible.");
      return;
    }

    let active = true;
    const refreshStatus = async () => {
      try {
        const [status, comfy] = await Promise.all([
          desktopApi.getBackendStatus(),
          desktopApi.getComfyStatus(),
        ]);
        if (!active) {
          return;
        }
        setBackendStatus(status);
        setComfyStatus(comfy);
        setBackendMessage(
          comfy.running
            ? `Backend OK (${comfy.url})`
            : comfy.lastError ?? comfy.message
        );
      } catch (error) {
        if (!active) {
          return;
        }
        const message = error instanceof Error ? error.message : "No se pudo consultar backend.";
        setBackendMessage(message);
      }
    };

    void refreshStatus();
    const timer = window.setInterval(() => {
      void refreshStatus();
    }, 4000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const runWorkflowTest = async () => {
    if (!hasDesktopBridge()) {
      setBackendMessage("Desktop bridge no disponible.");
      return;
    }
    setRunningWorkflowTest(true);
    try {
      const result = await desktopApi.runComfyWorkflow({
        imagePath: workflowImagePath.trim() || undefined,
      });
      setComfyStatus(result.comfy);
      if (result.ok) {
        setBackendMessage(
          result.outputGlbPath
            ? `Workflow OK. promptId=${result.promptId ?? "n/a"} GLB=${result.outputGlbPath}`
            : `Workflow encolado. promptId=${result.promptId ?? "n/a"}`
        );
      } else {
        setBackendMessage(result.error ?? result.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo ejecutar workflow de prueba.";
      setBackendMessage(message);
    } finally {
      setRunningWorkflowTest(false);
    }
  };

  const importWorkflowJson = async () => {
    if (!hasDesktopBridge()) {
      setBackendMessage("Desktop bridge no disponible.");
      return;
    }
    setImportingWorkflow(true);
    try {
      const result = await desktopApi.importBackendWorkflow();
      setBackendStatus(result.status);
      if (result.ok) {
        setBackendMessage(result.message);
      } else if (result.canceled) {
        setBackendMessage("Import canceled.");
      } else {
        setBackendMessage(result.error ?? result.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo importar workflow.";
      setBackendMessage(message);
    } finally {
      setImportingWorkflow(false);
    }
  };

  const refreshComfyStatus = async () => {
    if (!hasDesktopBridge()) {
      setBackendMessage("Desktop bridge no disponible.");
      return;
    }
    try {
      const [status, comfy] = await Promise.all([
        desktopApi.getBackendStatus(),
        desktopApi.getComfyStatus(),
      ]);
      setBackendStatus(status);
      setComfyStatus(comfy);
      setBackendMessage(comfy.running ? `Backend OK (${comfy.url})` : comfy.lastError ?? comfy.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo consultar backend.";
      setBackendMessage(message);
    }
  };

  const startComfy = async () => {
    if (!hasDesktopBridge()) {
      setBackendMessage("Desktop bridge no disponible.");
      return;
    }
    setStartingComfy(true);
    try {
      const comfy = await desktopApi.startComfy();
      setComfyStatus(comfy);
      setBackendMessage(comfy.running ? `Backend OK (${comfy.url})` : comfy.lastError ?? comfy.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo iniciar ComfyUI.";
      setBackendMessage(message);
    } finally {
      setStartingComfy(false);
    }
  };

  const stopComfy = async () => {
    if (!hasDesktopBridge()) {
      setBackendMessage("Desktop bridge no disponible.");
      return;
    }
    setStoppingComfy(true);
    try {
      const comfy = await desktopApi.stopComfy();
      setComfyStatus(comfy);
      setBackendMessage(comfy.running ? `Backend OK (${comfy.url})` : comfy.lastError ?? comfy.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo detener ComfyUI.";
      setBackendMessage(message);
    } finally {
      setStoppingComfy(false);
    }
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
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-[var(--text)]">
              ComfyUI: {comfyStatus?.state ?? "UNKNOWN"} ({comfyStatus?.url ?? "http://127.0.0.1:8188"})
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Workflow activo: {backendStatus?.workflows.activeName ?? "n/a"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                className="h-8 px-3 text-xs"
                disabled={startingComfy}
                onClick={() => void startComfy()}
              >
                {startingComfy ? "Starting..." : "Start"}
              </Button>
              <Button
                variant="secondary"
                className="h-8 px-3 text-xs"
                disabled={stoppingComfy}
                onClick={() => void stopComfy()}
              >
                {stoppingComfy ? "Stopping..." : "Stop"}
              </Button>
              <Button
                variant="primary"
                className="h-8 px-3 text-xs"
                disabled={runningWorkflowTest}
                onClick={() => void runWorkflowTest()}
              >
                Run workflow (test)
              </Button>
              <Button
                variant="secondary"
                className="h-8 px-3 text-xs"
                disabled={importingWorkflow}
                onClick={() => void importWorkflowJson()}
              >
                Import workflow JSON
              </Button>
              <Button
                variant="secondary"
                className="h-8 px-3 text-xs"
                onClick={() => void refreshComfyStatus()}
              >
                Refresh status
              </Button>
            </div>
          </div>
          <div className="mt-2 max-w-xl">
            <TextField
              value={workflowImagePath}
              onChange={(event) => setWorkflowImagePath(event.target.value)}
              placeholder="Image path for LoadImage (optional)"
              aria-label="Workflow image path"
            />
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">{backendMessage}</p>
          <div className="mt-2 max-h-28 overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface-3)] p-2">
            {(comfyStatus?.lastLogs ?? []).slice(-8).map((line, index) => (
              <p key={`${index}-${line}`} className="font-mono text-[10px] leading-relaxed text-[var(--text-muted)]">
                {line}
              </p>
            ))}
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
