import { LoadingDots } from "./LoadingDots";
import { BrandLogo } from "./BrandLogo";

export function StartupSplash() {
  return (
    <div className="flex flex-col items-center justify-center">
      <BrandLogo size={132} showText={false} label="VOLUMIA" />
      <div className="mt-6"><LoadingDots /></div>
    </div>
  );
}
