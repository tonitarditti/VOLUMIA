type BrandMarkProps = {
  size?: number;
  accentClassName?: string;
};

export function BrandMark({ size = 28, accentClassName = "text-[var(--accent)]" }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      className={accentClassName}
    >
      <polygon points="18,3.5 32,11 32,25 18,32.5 4,25 4,11" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <polygon points="18,9 26,13.5 26,22.5 18,27 10,22.5 10,13.5" fill="currentColor" opacity="0.12" />
      <line x1="18" y1="3.5" x2="18" y2="32.5" stroke="currentColor" strokeWidth="0.6" opacity="0.4" />
      <line x1="4" y1="11" x2="32" y2="25" stroke="currentColor" strokeWidth="0.6" opacity="0.4" />
      <line x1="32" y1="11" x2="4" y2="25" stroke="currentColor" strokeWidth="0.6" opacity="0.4" />
    </svg>
  );
}
