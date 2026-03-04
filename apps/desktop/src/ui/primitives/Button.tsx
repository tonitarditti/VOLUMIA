import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement>
> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-contrast)] hover:border-[var(--accent-primary-hover)] hover:bg-[var(--accent-primary-hover)] active:border-[var(--accent-primary-hover)] active:bg-[var(--accent-primary-hover)]",
  secondary:
    "border-[var(--border)] bg-[var(--button-secondary-bg)] text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover-bg)]",
  ghost:
    "border-transparent bg-transparent text-[var(--muted-text)] hover:border-[var(--border)] hover:bg-[var(--button-ghost-hover-bg)] hover:text-[var(--text)]",
  danger:
    "border-[var(--status-error)] bg-[var(--status-error)] text-[var(--accent-contrast)] hover:border-[var(--status-error)] hover:bg-[var(--status-error)]/90",
};

export function Button({
  variant = "secondary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] border px-[var(--space-16)] text-sm font-normal tracking-[0.01em] transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-55 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
