export type SurfaceClassVariant = "panel" | "soft";

export function getSurfaceClass(_glassStyle: boolean, variant: SurfaceClassVariant = "panel"): string {
  if (variant === "soft") {
    return "border border-[var(--border)] bg-[var(--surface-2)] shadow-sm";
  }

  return "border border-[var(--border)] bg-[var(--surface-1)] shadow-sm";
}
