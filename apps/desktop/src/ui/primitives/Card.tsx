import type { PropsWithChildren } from "react";

type CardPadding = "none" | "sm" | "md" | "lg";

type CardProps = PropsWithChildren<{
  className?: string;
  padding?: CardPadding;
  hoverElevation?: boolean;
}>;

const paddingClasses: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

export function Card({ className = "", children, padding = "none", hoverElevation = false }: CardProps) {
  return (
    <section
      className={`rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-[var(--shadow)] transition-[transform,border-color] duration-150 ease-out ${hoverElevation ? "hover:-translate-y-px hover:border-[var(--accent)]" : ""} ${paddingClasses[padding]} ${className}`}
    >
      {children}
    </section>
  );
}

