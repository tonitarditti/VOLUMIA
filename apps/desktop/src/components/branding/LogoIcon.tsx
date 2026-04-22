import { BrandLogo } from "./BrandLogo";

type LogoIconVariant = "brand" | "mono";
type LogoEmphasis = "none" | "soft" | "glow";

export type LogoIconProps = {
  size?: number | string;
  variant?: LogoIconVariant;
  emphasis?: LogoEmphasis;
  className?: string;
  title?: string;
};

export function LogoIcon({
  size = 28,
  variant = "brand",
  emphasis = "none",
  className = "",
  title,
}: LogoIconProps) {
  return (
    <BrandLogo
      size={typeof size === "number" ? size : 28}
      showText={false}
      emphasis={emphasis}
      className={className}
      label={title}
      tone={variant === "mono" ? "muted" : "default"}
    />
  );
}
