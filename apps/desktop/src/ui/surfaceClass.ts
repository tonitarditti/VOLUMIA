export type SurfaceClassVariant = "panel" | "soft";

export function getSurfaceClass(_glassStyle: boolean, variant: SurfaceClassVariant = "panel"): string {
  if (variant === "soft") {
    return "border border-[var(--border)] bg-[var(--surface-2)] shadow-none";
  }

  return "border border-[var(--border)] bg-[var(--surface-1)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]";
}
