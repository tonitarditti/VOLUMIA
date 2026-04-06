import logoDark from "@/assets/branding/volumia-logo-horizontal-dark.svg";
import logoLight from "@/assets/branding/volumia-logo-horizontal-light.svg";
import logoMono from "@/assets/branding/volumia-logo-monochrome.svg";

type LogoPrimaryVariant = "dark" | "light" | "mono";
type LogoPrimaryEmphasis = "none" | "soft" | "glow";

export type LogoPrimaryProps = {
  size?: number | string;
  variant?: LogoPrimaryVariant;
  emphasis?: LogoPrimaryEmphasis;
  className?: string;
  title?: string;
};

const logoByVariant: Record<LogoPrimaryVariant, string> = {
  dark: logoDark,
  light: logoLight,
  mono: logoMono,
};

const emphasisShadow: Record<LogoPrimaryEmphasis, string | undefined> = {
  none: undefined,
  soft: "drop-shadow(0 8px 24px rgba(10, 132, 255, 0.2))",
  glow: "drop-shadow(0 0 24px rgba(0, 212, 255, 0.36)) drop-shadow(0 10px 30px rgba(108, 77, 255, 0.28))",
};

export function LogoPrimary({
  size = 26,
  variant = "dark",
  emphasis = "none",
  className = "",
  title = "VOLUMIA",
}: LogoPrimaryProps) {
  const resolvedHeight = typeof size === "number" ? `${size}px` : size;

  return (
    <img
      src={logoByVariant[variant]}
      alt={title}
      className={className}
      style={{
        height: resolvedHeight,
        width: "auto",
        filter: emphasisShadow[emphasis],
      }}
      draggable={false}
    />
  );
}
