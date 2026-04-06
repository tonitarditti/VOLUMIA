import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { desktopApi, hasDesktopBridge } from "@/electron/desktopApi";
import { backendClient } from "@/services/backendClient";
import type {
  BackendStatusResponse,
  ComfyStatusResponse,
} from "@/electron/channels";
import { useProjects } from "@/projects/context";
import {
  selectActiveProject,
  selectProjectsSortedByUpdatedAt,
} from "@/projects/selectors";
import {
  Badge,
  Button,
  Card,
  type BadgeTone,
  TextField,
} from "@/ui/primitives";
import { useT } from "@/volumia/i18n/useT";
import { useSettings } from "@/volumia/settings/context";
import { LogoPrimary } from "@/components/branding";

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

function formatProjectType(index: number) {
  const labels = ["Residential", "Commercial", "Cultural", "Urban"];
  return labels[index % labels.length] ?? "Project";
}

function statusTone(comfyStatus: ComfyStatusResponse | null) {
  if (!comfyStatus) {
    return {
      label: "Idle",
      summary: "No engine status yet.",
      detail: "Waiting for engine telemetry.",
      tone: "neutral" as BadgeTone,
    };
  }

  if (comfyStatus.lastError || comfyStatus.state === "ERROR") {
    return {
      label: "Error",
      summary: "AI engine stopped",
      detail: comfyStatus.lastError ?? comfyStatus.message,
      tone: "danger" as BadgeTone,
    };
  }

  if (comfyStatus.state === "STARTING") {
    return {
      label: "Busy",
      summary: "AI engine is starting",
      detail: comfyStatus.message,
      tone: "warning" as BadgeTone,
    };
  }

  if (comfyStatus.running) {
    return {
      label: "Ready",
      summary: "AI engine is available",
      detail: comfyStatus.message,
      tone: "success" as BadgeTone,
    };
  }

  return {
    label: "Idle",
    summary: "AI engine is idle",
    detail: comfyStatus.message,
    tone: "neutral" as BadgeTone,
  };
}

export function DashboardPage({ onImport, onExport }: DashboardPageProps) {
  const { t, language } = useT();
  const { resolvedTheme } = useSettings();
  const navigate = useNavigate();
  const {
    state,
    createProject,
    duplicateProject,
    deleteProject,
    renameProject,
    setActiveProject,
  } = useProjects();

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [backendStatus, setBackendStatus] =
    useState<BackendStatusResponse | null>(null);
  const [comfyStatus, setComfyStatus] = useState<ComfyStatusResponse | null>(
    null,
  );
  const [backendMessage, setBackendMessage] = useState("Backend idle.");
  const [logsOpen, setLogsOpen] = useState(false);
  const [engineOpen, setEngineOpen] = useState(false);
  const [runningWorkflowTest, setRunningWorkflowTest] = useState(false);
  const [importingWorkflow, setImportingWorkflow] = useState(false);
  const [startingComfy, setStartingComfy] = useState(false);
  const [stoppingComfy, setStoppingComfy] = useState(false);
  const [workflowImagePath, setWorkflowImagePath] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const projects = useMemo(
    () => selectProjectsSortedByUpdatedAt(state.projects),
    [state.projects],
  );
  const filteredProjects = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    if (!normalized) {
      return projects;
    }

    return projects.filter((project) =>
      project.name.toLowerCase().includes(normalized),
    );
  }, [projects, searchQuery]);
  const activeProject = useMemo(() => selectActiveProject(state), [state]);
  const engineTone = useMemo(() => statusTone(comfyStatus), [comfyStatus]);
  const recentLogs = comfyStatus?.lastLogs?.slice(-12) ?? [];
  const engineCrashed =
    Boolean(comfyStatus?.lastError) ||
    comfyStatus?.state === "ERROR" ||
    /process exited/i.test(comfyStatus?.message ?? "") ||
    /process exited/i.test(backendMessage);

  const openProject = (projectId: string) => {
    setActiveProject(projectId);
    navigate(`/workspace/${projectId}`);
  };

  const beginRename = (projectId: string, currentName: string) => {
    setEditingProjectId(projectId);
    setEditingName(currentName);
  };

  const submitRename = () => {
    if (!editingProjectId) {
      return;
    }

    renameProject(editingProjectId, editingName);
    setEditingProjectId(null);
    setEditingName("");
  };

  const refreshStatus = async () => {
    if (!hasDesktopBridge()) {
      setBackendMessage("Desktop bridge unavailable.");
      return;
    }

    try {
      const [status, comfy] = await Promise.all([
        backendClient.startBackend(),
        backendClient.getComfyStatus(),
      ]);
      setBackendStatus(status);
      setComfyStatus(comfy);
      setBackendMessage(
        comfy.running
          ? `Engine ready at ${comfy.url}`
          : (comfy.lastError ?? comfy.message),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not read engine status.";
      setBackendMessage(message);
    }
  };

  useEffect(() => {
    if (!hasDesktopBridge()) {
      setBackendMessage("Desktop bridge unavailable.");
      return;
    }

    let active = true;

    const run = async () => {
      try {
        const [status, comfy] = await Promise.all([
          backendClient.startBackend(),
          backendClient.getComfyStatus(),
        ]);
        if (!active) {
          return;
        }
        setBackendStatus(status);
        setComfyStatus(comfy);
        setBackendMessage(
          comfy.running
            ? `Engine ready at ${comfy.url}`
            : (comfy.lastError ?? comfy.message),
        );
      } catch (error) {
        if (!active) {
          return;
        }
        setBackendMessage(
          error instanceof Error
            ? error.message
            : "Could not read engine status.",
        );
      }
    };

    void run();
    const timer = window.setInterval(() => void run(), 4000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const runWorkflowTest = async () => {
    if (!hasDesktopBridge()) {
      setBackendMessage("Desktop bridge unavailable.");
      return;
    }

    setRunningWorkflowTest(true);
    try {
      const result = await backendClient.runComfyWorkflow({
        imagePath: workflowImagePath.trim() || undefined,
      });
      setComfyStatus(result.comfy);
      setBackendMessage(
        result.ok ? result.message : (result.error ?? result.message),
      );
    } catch (error) {
      setBackendMessage(
        error instanceof Error ? error.message : "Could not run workflow test.",
      );
    } finally {
      setRunningWorkflowTest(false);
    }
  };

  const importWorkflowJson = async () => {
    if (!hasDesktopBridge()) {
      setBackendMessage("Desktop bridge unavailable.");
      return;
    }

    setImportingWorkflow(true);
    try {
      const result = await desktopApi.importBackendWorkflow();
      setBackendStatus(result.status);
      setBackendMessage(
        result.ok ? result.message : (result.error ?? result.message),
      );
    } catch (error) {
      setBackendMessage(
        error instanceof Error ? error.message : "Could not import workflow.",
      );
    } finally {
      setImportingWorkflow(false);
    }
  };

  const startComfy = async () => {
    if (!hasDesktopBridge()) {
      setBackendMessage("Desktop bridge unavailable.");
      return;
    }

    setStartingComfy(true);
    try {
      const comfy = await backendClient.startComfy();
      setComfyStatus(comfy);
      setBackendMessage(
        comfy.running
          ? `Engine ready at ${comfy.url}`
          : (comfy.lastError ?? comfy.message),
      );
    } catch (error) {
      setBackendMessage(
        error instanceof Error ? error.message : "Could not start engine.",
      );
    } finally {
      setStartingComfy(false);
    }
  };

  const stopComfy = async () => {
    if (!hasDesktopBridge()) {
      setBackendMessage("Desktop bridge unavailable.");
      return;
    }

    setStoppingComfy(true);
    try {
      const comfy = await backendClient.stopComfy();
      setComfyStatus(comfy);
      setBackendMessage(
        comfy.running
          ? `Engine ready at ${comfy.url}`
          : (comfy.lastError ?? comfy.message),
      );
    } catch (error) {
      setBackendMessage(
        error instanceof Error ? error.message : "Could not stop engine.",
      );
    } finally {
      setStoppingComfy(false);
    }
  };

  const restartComfy = async () => {
    if (!hasDesktopBridge()) {
      setBackendMessage("Desktop bridge unavailable.");
      return;
    }

    setStartingComfy(true);
    setStoppingComfy(true);
    try {
      if (comfyStatus?.running) {
        await backendClient.stopComfy();
      }
      const comfy = await backendClient.startComfy();
      setComfyStatus(comfy);
      setBackendMessage(
        comfy.running
          ? `Engine restarted at ${comfy.url}`
          : (comfy.lastError ?? comfy.message),
      );
    } catch (error) {
      setBackendMessage(
        error instanceof Error ? error.message : "Could not restart engine.",
      );
    } finally {
      setStartingComfy(false);
      setStoppingComfy(false);
    }
  };

  return (
    <div className="grid h-full min-h-0 w-full grid-cols-[minmax(0,1fr)_260px] gap-0 overflow-hidden">
      <div className="min-h-0 overflow-y-auto px-8 py-7">
        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--surface-2)] p-6 shadow-[var(--shadow-panel)]">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-3xl">
              <LogoPrimary
                size={24}
                variant={resolvedTheme === "dark" ? "dark" : "light"}
                className="mb-4"
              />
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
                {t("dashboard.workspace")}
              </p>
              <h1 className="mt-2 text-3xl font-medium tracking-[-0.02em] text-[var(--text)]">
                {t("dashboard.title")}
              </h1>
              <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
                {t("dashboard.subtitle")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={() => activeProject && openProject(activeProject.id)}
                disabled={!activeProject}
              >
                Open Project
              </Button>
              <Button variant="secondary" onClick={() => createProject()}>
                {t("dashboard.newProject")}
              </Button>
              <Button variant="secondary" onClick={() => void onImport()}>
                {t("dashboard.importJson")}
              </Button>
              <Button variant="secondary" onClick={() => void onExport()}>
                {t("dashboard.exportJson")}
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface-1)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                    Projects
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {filteredProjects.length} visible of {projects.length} total
                  </p>
                </div>
                <div className="w-full max-w-xs">
                  <TextField
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search projects"
                    aria-label="Search projects"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface-1)] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                Engine status
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Badge tone={engineTone.tone} dot>
                  {engineTone.label}
                </Badge>
                <span className="text-xs text-[var(--text-muted)]">
                  {comfyStatus?.url ?? "127.0.0.1:8188"}
                </span>
              </div>
              <p className="mt-3 text-sm font-medium text-[var(--text)]">
                {engineTone.summary}
              </p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {engineTone.detail}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {engineCrashed ? (
                  <Button
                    variant="danger"
                    className="h-8 px-3 text-xs"
                    onClick={() => void restartComfy()}
                  >
                    Restart Engine
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  className="h-8 px-3 text-xs"
                  onClick={() => setEngineOpen((value) => !value)}
                >
                  {engineOpen ? "Hide Advanced" : "Advanced / Engine"}
                </Button>
                <Button
                  variant="ghost"
                  className="h-8 px-3 text-xs"
                  onClick={() => setLogsOpen((value) => !value)}
                >
                  {logsOpen ? "Hide Logs" : "Show Logs"}
                </Button>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-h-0">
            {filteredProjects.length === 0 ? (
              <Card padding="lg" className="rounded-[24px] border-dashed">
                <div className="flex min-h-72 flex-col items-center justify-center gap-4 text-center">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[var(--border)] bg-[var(--accent-soft)] text-xl text-[var(--accent)]">
                    +
                  </div>
                  <div>
                    <p className="text-lg font-medium text-[var(--text)]">
                      {t("dashboard.emptyTitle")}
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">
                      {t("dashboard.emptyDescription")}
                    </p>
                  </div>
                  <Button variant="primary" onClick={() => createProject()}>
                    {t("dashboard.newProject")}
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
                <button
                  type="button"
                  onClick={() => createProject()}
                  className="flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-[24px] border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-center transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
                >
                  <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[var(--accent)] bg-[var(--accent-soft)] text-2xl text-[var(--accent)]">
                    +
                  </div>
                  <div>
                    <p className="text-lg font-medium text-[var(--text)]">
                      New Project
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">
                      Create a new design container with the real project state
                      and actions.
                    </p>
                  </div>
                </button>

                {filteredProjects.map((project, index) => {
                  const isEditing = editingProjectId === project.id;

                  return (
                    <Card
                      key={project.id}
                      padding="none"
                      className="overflow-hidden rounded-[24px]"
                    >
                      <div
                        className="relative h-36"
                        style={{
                          backgroundImage: "var(--project-preview-gradient)",
                        }}
                      >
                        <div
                          className="absolute inset-0"
                          style={{
                            backgroundImage: "var(--project-preview-overlay)",
                          }}
                        />
                        <div className="absolute right-4 top-4 rounded-full border border-[var(--project-preview-chip-border)] bg-[var(--project-preview-chip-bg)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--project-preview-chip-text)]">
                          {formatProjectType(index)}
                        </div>
                        <button
                          type="button"
                          className="absolute inset-0"
                          aria-label={`Open ${project.name}`}
                          onClick={() => openProject(project.id)}
                        />
                      </div>

                      <div className="space-y-4 p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h2 className="text-xl font-medium text-[var(--text)]">
                              {project.name}
                            </h2>
                            <p className="mt-1 text-xs uppercase tracking-[0.08em] text-[var(--text-faint)]">
                              Updated {toHumanDate(project.updatedAt, language)}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                            onClick={() => openProject(project.id)}
                          >
                            Open
                          </button>
                        </div>

                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <TextField
                              value={editingName}
                              onChange={(event) =>
                                setEditingName(event.target.value)
                              }
                              aria-label={t("dashboard.projectNameLabel")}
                            />
                            <Button
                              variant="primary"
                              className="h-10 px-4"
                              onClick={submitRename}
                            >
                              {t("common.save")}
                            </Button>
                            <Button
                              variant="ghost"
                              className="h-10 px-4"
                              onClick={() => {
                                setEditingProjectId(null);
                                setEditingName("");
                              }}
                            >
                              {t("common.cancel")}
                            </Button>
                          </div>
                        ) : null}

                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="ghost"
                            className="h-8 px-3 text-xs"
                            onClick={() =>
                              beginRename(project.id, project.name)
                            }
                          >
                            {t("dashboard.rename")}
                          </Button>
                          <Button
                            variant="ghost"
                            className="h-8 px-3 text-xs"
                            onClick={() => duplicateProject(project.id)}
                          >
                            {t("dashboard.duplicate")}
                          </Button>
                          <Button
                            variant="danger"
                            className="h-8 px-3 text-xs"
                            onClick={() => deleteProject(project.id)}
                          >
                            {t("dashboard.delete")}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="min-h-0 overflow-y-auto">
            <div className="space-y-5">
              <Card padding="md" className="rounded-[24px]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                  System
                </p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                    <span className="text-sm text-[var(--text-muted)]">
                      Workflow
                    </span>
                    <span className="text-sm font-medium text-[var(--text)]">
                      {backendStatus?.workflows.activeName ?? "Not loaded"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                    <span className="text-sm text-[var(--text-muted)]">
                      ComfyUI
                    </span>
                    <span className="text-sm font-medium text-[var(--text)]">
                      {comfyStatus?.state ?? "Unknown"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                    <span className="text-sm text-[var(--text-muted)]">
                      Processes
                    </span>
                    <span className="text-sm font-medium text-[var(--text)]">
                      {backendStatus?.activeProcesses.length ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--text-muted)]">
                      Project focus
                    </span>
                    <span className="text-sm font-medium text-[var(--text)]">
                      {activeProject?.name ?? "None selected"}
                    </span>
                  </div>
                </div>
              </Card>

              {engineOpen ? (
                <Card padding="md" className="rounded-[24px]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                    Advanced / Engine
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
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
                      variant="secondary"
                      className="h-8 px-3 text-xs"
                      onClick={() => void restartComfy()}
                    >
                      Restart Engine
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-8 px-3 text-xs"
                      onClick={() => void refreshStatus()}
                    >
                      Refresh Status
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-8 px-3 text-xs"
                      disabled={importingWorkflow}
                      onClick={() => void importWorkflowJson()}
                    >
                      {importingWorkflow
                        ? "Importing..."
                        : "Import workflow JSON"}
                    </Button>
                  </div>

                  <div className="mt-4">
                    <TextField
                      value={workflowImagePath}
                      onChange={(event) =>
                        setWorkflowImagePath(event.target.value)
                      }
                      placeholder="Optional image path for workflow test"
                      aria-label="Workflow image path"
                    />
                  </div>

                  <div className="mt-3">
                    <Button
                      variant="primary"
                      className="h-9 px-4 text-xs"
                      disabled={runningWorkflowTest}
                      onClick={() => void runWorkflowTest()}
                    >
                      {runningWorkflowTest ? "Running..." : "Run workflow test"}
                    </Button>
                  </div>
                </Card>
              ) : null}

              {logsOpen ? (
                <Card padding="md" className="rounded-[24px]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                    Engine logs
                  </p>
                  <div className="mt-4 max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-3">
                    {recentLogs.length > 0 ? (
                      recentLogs.map((line, index) => (
                        <p
                          key={`${index}-${line}`}
                          className="font-mono text-[11px] leading-relaxed text-[var(--text-muted)]"
                        >
                          {line}
                        </p>
                      ))
                    ) : (
                      <p className="text-xs text-[var(--text-muted)]">
                        No logs available.
                      </p>
                    )}
                  </div>
                </Card>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
