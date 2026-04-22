import brandIcon from "@/assets/branding/volumia-icon-final.svg";

type BrandLogoTone = "default" | "muted" | "inverse";
type BrandLogoEmphasis = "none" | "soft" | "glow";

export type BrandLogoProps = {
  size?: number;
  showText?: boolean;
  tone?: BrandLogoTone;
  emphasis?: BrandLogoEmphasis;
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  label?: string;
};

const toneColor: Record<BrandLogoTone, string> = {
  default: "var(--text)",
  muted: "var(--text-muted)",
  inverse: "var(--text-inverse)",
};

const emphasisShadow: Record<BrandLogoEmphasis, string | undefined> = {
  none: undefined,
  soft: "drop-shadow(0 8px 20px rgba(10, 132, 255, 0.18))",
  glow:
    "drop-shadow(0 0 24px rgba(10, 132, 255, 0.24)) drop-shadow(0 14px 32px rgba(10, 132, 255, 0.16))",
};

const BRAND_FONT_STACK =
  'Inter, Geist, "SF Pro Display", "SF Pro Text", system-ui, sans-serif';

function joinClassNames(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function BrandLogo({
  size = 16,
  showText = true,
  tone = "default",
  emphasis = "none",
  className = "",
  iconClassName = "",
  textClassName = "",
  label,
}: BrandLogoProps) {
  const iconSize = showText ? Math.round(size * 1.2) : size;
  const gap = showText ? Math.min(12, Math.max(8, Math.round(size * 0.6))) : 0;
  const textColor = toneColor[tone];

  return (
    <span
      className={joinClassNames(
        "inline-flex min-w-0 items-center align-middle",
        className,
      )}
      style={{ gap: `${gap}px` }}
      aria-label={label}
      role={label ? "img" : undefined}
    >
      <span
        aria-hidden="true"
        className={joinClassNames(
          "inline-flex shrink-0 items-center justify-center",
          iconClassName,
        )}
        style={{
          width: `${iconSize}px`,
          height: `${iconSize}px`,
          filter: emphasisShadow[emphasis],
        }}
      >
        <img
          src={brandIcon}
          alt=""
          className="h-full w-full object-contain"
          draggable={false}
        />
      </span>

      {showText ? (
        <span
          className={joinClassNames(
            "truncate uppercase leading-none",
            textClassName,
          )}
          style={{
            color: textColor,
            fontFamily: BRAND_FONT_STACK,
            fontSize: `${size}px`,
            fontWeight: 600,
            letterSpacing: "0.06em",
            lineHeight: 1,
          }}
        >
          VOLUMIA
        </span>
      ) : null}
    </span>
  );
}
