import type { PropsWithChildren, ReactNode } from "react";

type SplitViewProps = {
  left: ReactNode;
  right: ReactNode;
} & PropsWithChildren;

export function SplitView({ left, right }: SplitViewProps) {
  return (
    <div className="grid h-full min-h-0 w-full min-w-0 grid-cols-1 grid-rows-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <section className="flex min-h-0 min-w-0 flex-col gap-5">{left}</section>
      <section className="flex min-h-0 min-w-0 flex-col gap-5">{right}</section>
    </div>
  );
}
