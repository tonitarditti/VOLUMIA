import { HashRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Home } from "@/pages/Home";
import { Project } from "@/pages/Project";
import { Settings } from "@/pages/Settings";
import { desktopApi, hasDesktopBridge } from "@/electron/desktopApi";

function WindowBar() {
  const navigate = useNavigate();
  const canUseDesktop = hasDesktopBridge();

  return (
    <header className="drag-region flex h-11 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-1)] px-3">
      <button
        type="button"
        className="no-drag text-sm font-medium tracking-normal text-[var(--text)]"
        onClick={() => navigate("/")}
      >
        VOLUMIA
      </button>
      <nav className="no-drag flex items-center gap-2">
        <button className="rounded-[var(--radius-sm)] px-3 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)]" onClick={() => navigate("/")}>
          Home
        </button>
        <button className="rounded-[var(--radius-sm)] px-3 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)]" onClick={() => navigate("/settings")}>
          Settings
        </button>
        {canUseDesktop ? (
          <div className="ml-2 flex items-center gap-1">
            <button className="h-7 w-8 rounded-[var(--radius-sm)] text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)]" onClick={() => void desktopApi.minimizeWindow()}>
              _
            </button>
            <button className="h-7 w-8 rounded-[var(--radius-sm)] text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)]" onClick={() => void desktopApi.toggleMaximizeWindow()}>
              []
            </button>
            <button className="h-7 w-8 rounded-[var(--radius-sm)] text-xs text-[var(--text-muted)] hover:bg-[var(--status-error)] hover:text-white" onClick={() => void desktopApi.closeWindow()}>
              x
            </button>
          </div>
        ) : null}
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <HashRouter>
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--text)]">
        <WindowBar />
        <div className="min-h-0 flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/project/:projectId" element={<Project />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  );
}
