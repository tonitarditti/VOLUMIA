import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement>
> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-[image:var(--brand-gradient)] text-white shadow-none hover:-translate-y-px hover:brightness-105 hover:shadow-[var(--shadow-brand)] active:translate-y-0 active:brightness-100 active:shadow-[var(--shadow-sm)]",
  secondary:
    "border-[var(--button-secondary-border)] bg-[var(--surface)] text-[var(--button-secondary-text)] hover:border-[var(--volumia-blue)] hover:bg-[var(--surface-hover)] hover:text-[var(--volumia-blue)] dark:bg-[var(--surface-secondary)] dark:hover:text-[var(--volumia-cyan)]",
  ghost:
    "border-transparent bg-transparent text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]",
  danger:
    "border-[var(--danger-border)] bg-transparent text-[var(--danger)] hover:border-[var(--danger)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] focus-visible:ring-[var(--danger)]",
};

export function Button({
  variant = "secondary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] border px-[var(--space-16)] text-sm font-medium tracking-[0.01em] transition-[background-color,border-color,color,box-shadow,filter,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50 disabled:transform-none disabled:shadow-none ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
