import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-volume-accent text-[#20160d] hover:bg-volume-accent2 active:bg-volume-accent2/90 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
  secondary:
    "border border-volume-stroke bg-volume-panelAlt text-volume-text hover:border-volume-accent/40 hover:bg-volume-control focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
  ghost:
    "border-transparent bg-transparent text-volume-muted hover:bg-volume-panelAlt/70 hover:text-volume-text focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
  danger:
    "border border-volume-danger/60 bg-volume-danger/10 text-volume-danger hover:bg-volume-danger/20 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
};

export function Button({ variant = "secondary", className = "", children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium tracking-[0.01em] transition duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
