import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { desktopApi, hasDesktopBridge } from "@/electron/desktopApi";
import { BrandMark } from "./BrandMark";

type ShellTopBarProps = {
  eyebrow: string;
  title: string;
  breadcrumb?: string[];
  centerSlot?: ReactNode;
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
      className={`grid h-7 w-7 place-items-center rounded-md border text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
        close
          ? "border-transparent text-[var(--text-faint)] hover:border-[var(--danger)] hover:bg-[var(--danger)] hover:text-[var(--accent-contrast)]"
          : "border-[var(--panel-border)] bg-[var(--panel-2)] text-[var(--muted-text)] hover:border-[var(--panel-border-strong)] hover:bg-[var(--panel-elevated)] hover:text-[var(--text)]"
      }`}
    >
      {label}
    </button>
  );
}

export function TopBar({
  eyebrow,
  title,
  breadcrumb,
  centerSlot,
  statusSlot,
  rightSlot,
}: ShellTopBarProps) {
  const navigate = useNavigate();
  const canUseDesktopBridge = hasDesktopBridge();
  const barHeightClass = centerSlot ? "h-14" : "h-12";

  return (
    <header
      className={`drag-region relative z-30 flex shrink-0 items-center justify-between border-b border-[var(--panel-border)] bg-[var(--shell-topbar)] px-4 ${barHeightClass}`}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="no-drag flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 transition-colors hover:bg-[var(--accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <BrandMark size={18} />
          <span className="text-[11px] font-semibold tracking-[0.18em] text-[var(--text)]">
            VOLUMIA
          </span>
        </button>
        <div className="hidden h-4 w-px bg-[var(--panel-border)] md:block" />
        <div className="hidden md:flex md:items-center md:gap-1">
          {["File", "Edit", "View"].map((item) => (
            <button
              key={item}
              type="button"
              className="no-drag rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[11px] text-[var(--muted-text)] transition-colors hover:bg-[var(--panel-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {item}
            </button>
          ))}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
            {eyebrow}
          </p>
          <p className="truncate text-[12px] text-[var(--text)]">{title}</p>
        </div>
      </div>

      <div className="hidden min-w-0 flex-1 justify-center px-6 md:flex">
        {centerSlot ? (
          centerSlot
        ) : breadcrumb?.length ? (
          <div className="no-drag flex min-w-0 items-center gap-2 rounded-full border border-[var(--panel-border)] bg-[var(--panel-2)] px-3 py-1">
            {breadcrumb.map((segment, index) => (
              <div
                key={`${segment}-${index}`}
                className="flex min-w-0 items-center gap-2"
              >
                {index > 0 ? (
                  <span className="text-[10px] text-[var(--text-faint)]">
                    /
                  </span>
                ) : null}
                <span
                  className={`truncate text-[10px] ${
                    index === breadcrumb.length - 1
                      ? "font-medium text-[var(--text)]"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  {segment}
                </span>
              </div>
            ))}
          </div>
      ) : null}
      </div>

      <div className="no-drag flex items-center gap-2.5">
        {statusSlot}
        {rightSlot}
        {canUseDesktopBridge ? (
          <div className="ml-1 flex items-center gap-1">
            <WindowButton
              label="-"
              onClick={() => void desktopApi.minimizeWindow()}
            />
            <WindowButton
              label="[]"
              onClick={() => void desktopApi.toggleMaximizeWindow()}
            />
            <WindowButton
              label="x"
              onClick={() => void desktopApi.closeWindow()}
              close
            />
          </div>
        ) : null}
      </div>
    </header>
  );
}
