import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppCommands } from "@/app/AppCommandsContext";
import { desktopApi, hasDesktopBridge } from "@/electron/desktopApi";
import { useProjects } from "@/projects/context";
import { selectActiveProject } from "@/projects/selectors";
import { BrandMark } from "./BrandMark";

type ShellTopBarProps = {
  eyebrow: string;
  title: string;
  breadcrumb?: string[];
  centerSlot?: ReactNode;
  statusSlot?: ReactNode;
  rightSlot?: ReactNode;
};

type TopBarMenuActionItem = {
  id: string;
  label: string;
  onSelect: () => void | Promise<void>;
  disabled?: boolean;
  shortcut?: string;
};

type TopBarMenuSeparatorItem = {
  id: string;
  separator: true;
};

type TopBarMenuItem = TopBarMenuActionItem | TopBarMenuSeparatorItem;

type TopBarMenu = {
  id: string;
  label: string;
  items: TopBarMenuItem[];
};

function isSeparatorItem(item: TopBarMenuItem): item is TopBarMenuSeparatorItem {
  return "separator" in item;
}

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
  const location = useLocation();
  const { state } = useProjects();
  const {
    importProjects,
    exportProjects,
    importSettings,
    exportSettings,
    resetWindowLayout,
    resetAllData,
  } = useAppCommands();
  const canUseDesktopBridge = hasDesktopBridge();
  const barHeightClass = "h-11 min-h-[44px]";
  const activeProject = selectActiveProject(state);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRegionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenuId) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        menuRegionRef.current &&
        event.target instanceof Node &&
        !menuRegionRef.current.contains(event.target)
      ) {
        setOpenMenuId(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenuId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenuId]);

  useEffect(() => {
    setOpenMenuId(null);
  }, [location.pathname]);

  const runMenuAction = (action: () => void | Promise<void>) => {
    setOpenMenuId(null);
    void Promise.resolve()
      .then(action)
      .catch(() => undefined);
  };

  const handleResetAllData = () => {
    const shouldContinue =
      typeof window === "undefined" || typeof window.confirm !== "function"
        ? true
        : window.confirm(
            "Reset all local projects, settings, and saved window layout?",
          );

    if (!shouldContinue) {
      return;
    }

    return resetAllData();
  };

  const menus: TopBarMenu[] = [
    {
      id: "file",
      label: "File",
      items: [
        {
          id: "import-projects",
          label: "Import projects...",
          onSelect: importProjects,
        },
        {
          id: "export-projects",
          label: "Export projects...",
          onSelect: exportProjects,
        },
        { id: "sep-projects", separator: true },
        {
          id: "import-settings",
          label: "Import settings...",
          onSelect: importSettings,
        },
        {
          id: "export-settings",
          label: "Export settings...",
          onSelect: exportSettings,
        },
        { id: "sep-storage", separator: true },
        {
          id: "open-user-data-folder",
          label: "Open user data folder",
          onSelect: async () => {
            await desktopApi.openUserDataFolder();
          },
          disabled: !canUseDesktopBridge,
        },
      ],
    },
    {
      id: "edit",
      label: "Edit",
      items: [
        {
          id: "reset-window-layout",
          label: "Reset window layout",
          onSelect: resetWindowLayout,
          disabled: !canUseDesktopBridge,
        },
        {
          id: "reset-all-data",
          label: "Reset all local data",
          onSelect: handleResetAllData,
        },
      ],
    },
    {
      id: "view",
      label: "View",
      items: [
        {
          id: "go-dashboard",
          label: "Projects dashboard",
          onSelect: () => navigate("/dashboard"),
        },
        {
          id: "go-active-workspace",
          label: activeProject ? `Open ${activeProject.name}` : "Open active workspace",
          onSelect: () => {
            if (!activeProject) {
              return;
            }
            navigate(`/workspace/${activeProject.id}`);
          },
          disabled: !activeProject,
        },
        {
          id: "go-settings",
          label: "Settings",
          onSelect: () => navigate("/settings"),
        },
        { id: "sep-window", separator: true },
        {
          id: "toggle-maximize",
          label: "Toggle maximize window",
          onSelect: async () => {
            await desktopApi.toggleMaximizeWindow();
          },
          disabled: !canUseDesktopBridge,
        },
      ],
    },
  ];

  return (
    <header
      className={`drag-region relative z-30 flex shrink-0 items-center justify-between border-b border-[var(--panel-border)] bg-[var(--shell-topbar)] px-2.5 ${barHeightClass}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="no-drag flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 transition-colors hover:bg-[var(--accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <BrandMark size={18} />
          <span className="text-[10px] font-semibold tracking-[0.18em] text-[var(--text)]">
            VOLUMIA
          </span>
        </button>
        <div className="hidden h-4 w-px bg-[var(--panel-border)] min-[1160px]:block" />
        <div
          ref={menuRegionRef}
          className="hidden min-[1160px]:flex min-[1160px]:items-center min-[1160px]:gap-1"
        >
          {menus.map((menu) => {
            const isOpen = openMenuId === menu.id;

            return (
              <div key={menu.id} className="no-drag relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpenMenuId((current) =>
                      current === menu.id ? null : menu.id,
                    )
                  }
                  className={`rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
                    isOpen
                      ? "bg-[var(--panel-elevated)] text-[var(--text)]"
                      : "text-[var(--muted-text)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                  }`}
                >
                  {menu.label}
                </button>
                {isOpen ? (
                  <div
                    role="menu"
                    aria-label={`${menu.label} menu`}
                    className="absolute left-0 top-[calc(100%+0.4rem)] z-50 min-w-[220px] rounded-[16px] border border-[var(--panel-border-strong)] bg-[var(--panel-elevated)] p-1.5 shadow-[0_24px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl"
                  >
                    {menu.items.map((item) =>
                      isSeparatorItem(item) ? (
                        <div
                          key={item.id}
                          role="separator"
                          className="my-1 h-px bg-[var(--panel-border)]"
                        />
                      ) : (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitem"
                          disabled={item.disabled}
                          onClick={() => runMenuAction(item.onSelect)}
                          className="flex w-full items-center justify-between gap-4 rounded-[12px] px-3 py-2 text-left text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent enabled:text-[var(--text)] enabled:hover:bg-[var(--panel-2)]"
                        >
                          <span className="truncate">{item.label}</span>
                          {item.shortcut ? (
                            <span className="shrink-0 text-[10px] text-[var(--text-faint)]">
                              {item.shortcut}
                            </span>
                          ) : null}
                        </button>
                      ),
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="min-w-0 max-[980px]:hidden">
          <p className="truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
            {eyebrow}
          </p>
          <p className="truncate text-[11px] text-[var(--text)]">{title}</p>
        </div>
      </div>

      <div className="hidden min-w-0 flex-1 justify-center px-4 min-[1320px]:flex">
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

      <div className="no-drag flex items-center gap-2">
        {statusSlot ? (
          <div className="hidden min-[1030px]:flex items-center">{statusSlot}</div>
        ) : null}
        {rightSlot ? (
          <div className="hidden min-[1240px]:flex items-center gap-2">
            {rightSlot}
          </div>
        ) : null}
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
