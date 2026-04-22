import { BrandLogo } from "@/components/branding";

type BrandMarkProps = {
  size?: number;
  accentClassName?: string;
};

export function BrandMark({
  size = 28,
  accentClassName = "",
}: BrandMarkProps) {
  return (
    <BrandLogo
      size={size}
      showText={false}
      className={accentClassName}
      emphasis="none"
    />
  );
}
