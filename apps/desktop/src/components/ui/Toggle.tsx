import type { ButtonHTMLAttributes } from "react";
import { cx } from "@/components/ui/cx";

type ToggleProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export function Toggle({ className, active = false, ...props }: ToggleProps) {
  return <button {...props} className={cx("uiToggle", active && "is-active", className)} />;
}
