import type { HTMLAttributes } from "react";
import { cx } from "@/components/ui/cx";

type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  active?: boolean;
  disabled?: boolean;
};

export function Chip({ className, active = false, disabled = false, ...props }: ChipProps) {
  return (
    <span
      {...props}
      aria-disabled={disabled}
      className={cx("uiChip", active && "is-active", disabled && "is-disabled", className)}
    />
  );
}
