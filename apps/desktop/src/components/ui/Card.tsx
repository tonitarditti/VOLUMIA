import type { HTMLAttributes } from "react";
import { cx } from "@/components/ui/cx";

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article";
};

export function Card({ as = "section", className, ...props }: CardProps) {
  const Component = as;
  return <Component {...props} className={cx("uiCard", className)} />;
}
