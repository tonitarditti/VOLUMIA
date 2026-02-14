export type SurfaceClassVariant = "panel" | "soft";

export function getSurfaceClass(glassStyle: boolean, variant: SurfaceClassVariant = "panel"): string {
  if (!glassStyle) {
    if (variant === "soft") {
      return "border border-[var(--border)] bg-[var(--surface-2)] shadow-sm";
    }
    return "border border-[var(--border)] bg-[var(--surface-1)] shadow-sm";
  }

  if (variant === "soft") {
    return "border border-white/10 bg-white/[0.03] backdrop-blur-md shadow-md";
  }

  return "border border-white/10 bg-white/[0.05] backdrop-blur-md shadow-lg";
}
