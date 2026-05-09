import { Badge, type BadgeTone } from "@/ui/primitives";
import type { ProjectJob } from "@/services/generationClient";

type JobStatusProps = {
  job: ProjectJob | null;
};

function statusTone(status?: string): BadgeTone {
  if (status === "complete") return "success";
  if (status === "error") return "danger";
  if (status === "running" || status === "optimizing" || status === "queued") return "warning";
  return "neutral";
}

function StatusIcon({ status }: { status?: string }) {
  if (status === "complete") return <span className="text-[var(--status-success)]" aria-hidden="true">OK</span>;
  if (status === "error") return <span className="text-[var(--status-error)]" aria-hidden="true">!</span>;
  if (status === "running" || status === "optimizing" || status === "queued") {
    return <span className="text-[var(--status-warning)]" aria-hidden="true">...</span>;
  }
  return <span className="text-[var(--text-muted)]" aria-hidden="true">--</span>;
}

export function JobStatus({ job }: JobStatusProps) {
  const status = job?.status ?? "idle";
  const warnings = job?.warnings ?? [];
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StatusIcon status={status} />
          <span className="text-sm font-medium text-[var(--text)]">Job</span>
        </div>
        <Badge tone={statusTone(status)} dot>
          {status}
        </Badge>
      </div>
      <p className="mt-3 text-sm leading-5 text-[var(--text-muted)]">
        {job?.error?.message || job?.message || "Sin jobs activos."}
      </p>
      {warnings.length > 0 ? (
        <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--badge-warning-border)] bg-[var(--badge-warning-bg)] p-3">
          {warnings.map((warning) => (
            <p key={warning} className="text-xs leading-5 text-[var(--badge-warning-text)]">
              {warning}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
