import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-[var(--accent)] bg-[var(--accent)] text-[var(--surface-1)] hover:border-[var(--accent-2)] hover:bg-[var(--accent-2)] active:bg-[var(--accent-2)]/95",
  secondary:
    "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[color:rgba(155,122,89,0.28)] hover:bg-[var(--surface-3)]",
  ghost:
    "border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
  danger:
    "border-[var(--danger)] bg-[var(--danger)] text-[var(--surface-1)] hover:border-[var(--danger)] hover:bg-[var(--danger)]/90",
};

export function Button({ variant = "secondary", className = "", children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-normal tracking-[0.01em] transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-55 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
