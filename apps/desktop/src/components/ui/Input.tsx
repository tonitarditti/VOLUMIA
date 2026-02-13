import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cx } from "@/components/ui/cx";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...props }, ref) {
  const controlClassName = props.type === "range" ? className : cx("uiInput", className);
  return <input ref={ref} {...props} className={controlClassName} />;
});
