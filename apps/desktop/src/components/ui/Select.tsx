import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";
import { cx } from "@/components/ui/cx";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, ...props }, ref) {
  return <select ref={ref} {...props} className={cx("uiSelect", className)} />;
});
