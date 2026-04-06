import { BrandWordmark } from "./BrandWordmark";
import { LogoIcon } from "./LogoIcon";

type SplashLogoVariant = "dark" | "light" | "mono";

export type SplashLogoProps = {
  size?: number;
  variant?: SplashLogoVariant;
  glow?: boolean;
  showWordmark?: boolean;
  className?: string;
};

export function SplashLogo({
  size = 80,
  variant = "dark",
  glow = true,
  showWordmark = true,
  className = "",
}: SplashLogoProps) {
  const iconVariant = variant === "mono" ? "mono" : "brand";

  return (
    <div className={`flex flex-col items-center gap-5 text-center ${className}`.trim()}>
      <LogoIcon
        size={size}
        variant={iconVariant}
        emphasis={glow ? "glow" : "soft"}
        title="VOLUMIA"
      />
      {showWordmark ? <BrandWordmark size={24} variant={variant} /> : null}
    </div>
  );
}
