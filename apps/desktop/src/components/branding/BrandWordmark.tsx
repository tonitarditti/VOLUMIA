type BrandWordmarkVariant = "dark" | "light" | "mono";

export type BrandWordmarkProps = {
  size?: number;
  variant?: BrandWordmarkVariant;
  className?: string;
  subtitle?: string;
};

const toneByVariant: Record<BrandWordmarkVariant, { title: string; subtitle: string }> = {
  dark: { title: "#EAF2FF", subtitle: "#8A9199" },
  light: { title: "#0B0D12", subtitle: "#5B6472" },
  mono: { title: "#FFFFFF", subtitle: "rgba(255,255,255,0.72)" },
};

export function BrandWordmark({
  size = 14,
  variant = "dark",
  className = "",
  subtitle = "SPATIAL INTELLIGENCE",
}: BrandWordmarkProps) {
  const palette = toneByVariant[variant];

  return (
    <span className={`inline-flex min-w-0 flex-col ${className}`.trim()}>
      <span
        style={{
          color: palette.title,
          fontSize: `${size}px`,
          letterSpacing: "0.22em",
          lineHeight: 1,
        }}
        className="font-semibold"
      >
        VOLUMIA
      </span>
      <span
        style={{
          color: palette.subtitle,
          fontSize: `${Math.max(10, Math.round(size * 0.56))}px`,
          letterSpacing: "0.2em",
          lineHeight: 1.25,
        }}
        className="mt-1 font-semibold"
      >
        {subtitle}
      </span>
    </span>
  );
}
