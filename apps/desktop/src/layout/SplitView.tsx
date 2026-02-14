import type { PropsWithChildren, ReactNode } from "react";

type SplitViewProps = {
  left: ReactNode;
  right: ReactNode;
} & PropsWithChildren;

export function SplitView({ left, right }: SplitViewProps) {
  return (
    <div className="grid h-full min-h-0 w-full grid-cols-1 gap-5 xl:grid-cols-[1.35fr_1fr]">
      <section className="flex min-h-0 flex-col gap-5">{left}</section>
      <section className="flex min-h-0 flex-col gap-5">{right}</section>
    </div>
  );
}
