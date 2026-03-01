import type { PropsWithChildren } from "react";
import { useSettings } from "@/volumia/settings/context";
import { getSurfaceClass } from "@/ui/surfaceClass";

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
  const { settings } = useSettings();
  const surfaceClass = getSurfaceClass(settings.glassStyle, "panel");

  return (
    <section
      className={`rounded-xl transition-[border-color,background-color] duration-150 ease-out ${surfaceClass} ${hoverElevation ? "hover:border-[color:rgba(155,122,89,0.26)] hover:bg-[var(--surface-2)]" : ""} ${paddingClasses[padding]} ${className}`}
    >
      {children}
    </section>
  );
}
