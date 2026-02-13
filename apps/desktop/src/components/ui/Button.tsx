import type { ButtonHTMLAttributes } from "react";
import { cx } from "@/components/ui/cx";

type ButtonVariant = "primary" | "secondary" | "ghost" | "nav";
type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
};

export function Button({ className, variant = "secondary", size = "md", active = false, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        "uiButton",
        `uiButton--${variant}`,
        `uiButton--${size}`,
        active && "is-active",
        className
      )}
    />
  );
}
