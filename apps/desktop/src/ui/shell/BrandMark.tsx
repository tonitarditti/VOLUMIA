import { LogoIcon } from "@/components/branding";

type BrandMarkProps = {
  size?: number;
  accentClassName?: string;
};

export function BrandMark({
  size = 28,
  accentClassName = "",
}: BrandMarkProps) {
  return (
    <LogoIcon
      size={size}
      variant="brand"
      className={accentClassName}
      emphasis="none"
    />
  );
}
