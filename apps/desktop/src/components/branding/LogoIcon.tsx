import iconBrand from "@/assets/branding/volumia-icon-final.svg";
import iconMono from "@/assets/branding/volumia-icon-mono.svg";

type LogoIconVariant = "brand" | "mono";
type LogoEmphasis = "none" | "soft" | "glow";

export type LogoIconProps = {
  size?: number | string;
  variant?: LogoIconVariant;
  emphasis?: LogoEmphasis;
  className?: string;
  title?: string;
};

const iconByVariant: Record<LogoIconVariant, string> = {
  brand: iconBrand,
  mono: iconMono,
};

const emphasisShadow: Record<LogoEmphasis, string | undefined> = {
  none: undefined,
  soft: "drop-shadow(0 6px 18px rgba(10, 132, 255, 0.18))",
  glow: "drop-shadow(0 0 22px rgba(0, 212, 255, 0.34)) drop-shadow(0 10px 30px rgba(108, 77, 255, 0.28))",
};

export function LogoIcon({
  size = 28,
  variant = "brand",
  emphasis = "none",
  className = "",
  title,
}: LogoIconProps) {
  const resolvedSize = typeof size === "number" ? `${size}px` : size;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`.trim()}
      style={{
        width: resolvedSize,
        height: resolvedSize,
        filter: emphasisShadow[emphasis],
      }}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      <img
        src={iconByVariant[variant]}
        alt={title ?? ""}
        className="h-full w-full object-contain"
        draggable={false}
      />
    </span>
  );
}
