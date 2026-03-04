export type SurfaceClassVariant = "panel" | "soft";

export function getSurfaceClass(
  glassStyle: boolean,
  variant: SurfaceClassVariant = "panel",
): string {
  if (glassStyle) {
    if (variant === "soft") {
      return "glass glass-soft border-[var(--glass-border)] bg-[var(--glass-bg)]";
    }

    return "glass glass-strong border-[var(--glass-border)] bg-[var(--glass-bg-strong)]";
  }

  if (variant === "soft") {
    return "border border-[var(--panel-border)] bg-[var(--panel-bg-soft)] shadow-none";
  }

  return "border border-[var(--panel-border)] bg-[var(--panel-bg)] shadow-[var(--shadow)]";
}
