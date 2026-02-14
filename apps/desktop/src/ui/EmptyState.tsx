type EmptyStateProps = {
  title: string;
  description: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-8 py-10 text-center shadow-[var(--shadow)]">
      <span className="mb-3 inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
        Workspace
      </span>
      <h3 className="text-base font-semibold tracking-[0.02em] text-[var(--text)]">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--text-muted)]">{description}</p>
    </div>
  );
}
