import { BrandLogo } from "./BrandLogo";

type LogoPrimaryVariant = "dark" | "light" | "mono";
type LogoPrimaryEmphasis = "none" | "soft" | "glow";

export type LogoPrimaryProps = {
  size?: number | string;
  variant?: LogoPrimaryVariant;
  emphasis?: LogoPrimaryEmphasis;
  className?: string;
  title?: string;
};

export function LogoPrimary({
  size = 26,
  variant = "dark",
  emphasis = "none",
  className = "",
  title = "VOLUMIA",
}: LogoPrimaryProps) {
  return (
    <BrandLogo
      size={typeof size === "number" ? Math.max(14, Math.round(size * 0.72)) : 18}
      tone={variant === "mono" ? "inverse" : "default"}
      emphasis={emphasis}
      className={className}
      label={title}
    />
  );
}
