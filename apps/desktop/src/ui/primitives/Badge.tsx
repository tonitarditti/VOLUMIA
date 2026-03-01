import type { HTMLAttributes, PropsWithChildren } from "react";

export type BadgeTone = "neutral" | "success" | "warning" | "danger";

type BadgeProps = PropsWithChildren<
  HTMLAttributes<HTMLSpanElement> & {
    tone?: BadgeTone;
    dot?: boolean;
  }
>;

const toneClasses: Record<BadgeTone, string> = {
  neutral:
    "border-[var(--badge-neutral-border)] bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-text)]",
  success:
    "border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] text-[var(--badge-success-text)]",
  warning:
    "border-[var(--badge-warning-border)] bg-[var(--badge-warning-bg)] text-[var(--badge-warning-text)]",
  danger:
    "border-[var(--badge-danger-border)] bg-[var(--badge-danger-bg)] text-[var(--badge-danger-text)]",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className = "",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[10px] font-semibold uppercase tracking-[0.08em] ${toneClasses[tone]} ${className}`}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-current opacity-75"
        />
      ) : null}
      <span>{children}</span>
    </span>
  );
}
