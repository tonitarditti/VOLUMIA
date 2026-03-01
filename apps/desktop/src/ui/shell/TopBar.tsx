import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { desktopApi, hasDesktopBridge } from "@/electron/desktopApi";
import { BrandMark } from "./BrandMark";

type ShellTopBarProps = {
  eyebrow: string;
  title: string;
  breadcrumb?: string[];
  statusSlot?: ReactNode;
  rightSlot?: ReactNode;
};

function WindowButton({
  label,
  onClick,
  close = false,
}: {
  label: string;
  onClick: () => void;
  close?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid h-7 w-7 place-items-center rounded-md border text-[11px] transition-colors ${
        close
          ? "border-transparent text-[var(--text-faint)] hover:border-[var(--danger)] hover:bg-[var(--danger)] hover:text-white"
          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
      }`}
    >
      {label}
    </button>
  );
}

export function TopBar({ eyebrow, title, breadcrumb, statusSlot, rightSlot }: ShellTopBarProps) {
  const navigate = useNavigate();
  const canUseDesktopBridge = hasDesktopBridge();

  return (
    <header className="drag-region relative z-30 flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--shell-topbar)] px-3">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="no-drag flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-[var(--accent-soft)]"
        >
          <BrandMark size={18} />
          <span className="text-[11px] font-semibold tracking-[0.18em] text-[var(--text)]">VOLUMIA</span>
        </button>
        <div className="hidden h-4 w-px bg-[var(--border)] md:block" />
        <div className="hidden md:flex md:items-center md:gap-1">
          {["File", "Edit", "View"].map((item) => (
            <button
              key={item}
              type="button"
              className="no-drag rounded-md px-2 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            >
              {item}
            </button>
          ))}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">{eyebrow}</p>
          <p className="truncate text-[12px] text-[var(--text)]">{title}</p>
        </div>
      </div>

      <div className="hidden min-w-0 flex-1 justify-center px-6 md:flex">
        {breadcrumb?.length ? (
          <div className="no-drag flex min-w-0 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1">
            {breadcrumb.map((segment, index) => (
              <div key={`${segment}-${index}`} className="flex min-w-0 items-center gap-2">
                {index > 0 ? <span className="text-[10px] text-[var(--text-faint)]">/</span> : null}
                <span
                  className={`truncate text-[10px] ${
                    index === breadcrumb.length - 1 ? "font-medium text-[var(--text)]" : "text-[var(--text-muted)]"
                  }`}
                >
                  {segment}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="no-drag flex items-center gap-2">
        {statusSlot}
        {rightSlot}
        {canUseDesktopBridge ? (
          <div className="ml-1 flex items-center gap-1">
            <WindowButton label="-" onClick={() => void desktopApi.minimizeWindow()} />
            <WindowButton label="[]" onClick={() => void desktopApi.toggleMaximizeWindow()} />
            <WindowButton label="x" onClick={() => void desktopApi.closeWindow()} close />
          </div>
        ) : null}
      </div>
    </header>
  );
}
