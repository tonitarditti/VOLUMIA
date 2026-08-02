import { BrandLogo } from "./BrandLogo";

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
  showWordmark = false,
  className = "",
}: SplashLogoProps) {
  return (
    <div className={`flex flex-col items-center gap-5 text-center ${className}`.trim()}>
      <BrandLogo
        size={showWordmark ? Math.max(24, Math.round(size * 0.26)) : size}
        showText={showWordmark}
        tone={variant === "mono" ? "inverse" : "default"}
        emphasis={glow ? "glow" : "soft"}
        label="VOLUMIA"
      />
    </div>
  );
}
