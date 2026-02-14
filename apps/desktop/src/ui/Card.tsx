import type { PropsWithChildren } from "react";

type CardProps = PropsWithChildren<{
  className?: string;
}>;

export function Card({ className = "", children }: CardProps) {
  return (
    <section
      className={`rounded-2xl border border-volume-stroke/90 bg-volume-panel/95 shadow-panel backdrop-blur-[1px] ${className}`}
    >
      {children}
    </section>
  );
}
