import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useState } from "react";
import { Home } from "@/pages/Home";
import { Project } from "@/pages/Project";
import { Settings } from "@/pages/Settings";
import { Splash } from "@/pages/Splash";
import { desktopApi, hasDesktopBridge } from "@/electron/desktopApi";
import { BrandLogo } from "@/components/branding";

function WindowBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const canUseDesktop = hasDesktopBridge();

  const navClass = (active: boolean) =>
    `rounded-lg px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
      active
        ? "bg-[var(--accent-soft)] text-[var(--volumia-blue)]"
        : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
    }`;

  return (
    <header className="drag-region flex h-16 shrink-0 items-center gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-4 shadow-[var(--shadow-sm)] sm:px-6">
      <button
        type="button"
        className="no-drag flex min-w-0 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        onClick={() => navigate("/")}
        aria-label="Ir a Inicio"
      >
        <BrandLogo
          size={17}
          label="VOLUMIA"
          subtitle="Your Creative 3D Assistant"
          iconClassName="h-9 w-9"
          className="hidden sm:inline-flex"
          subtitleClassName="max-w-[210px]"
        />
        <BrandLogo size={28} showText={false} label="VOLUMIA" className="sm:hidden" />
      </button>

      <nav className="no-drag ml-auto flex items-center gap-1" aria-label="Navegación principal">
        <button className={navClass(location.pathname === "/")} onClick={() => navigate("/")}>
          Inicio
        </button>
        <button className={navClass(location.pathname === "/settings")} onClick={() => navigate("/settings")}>
          Configuración
        </button>
      </nav>

      <div className="no-drag hidden items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--volumia-cyan)_28%,transparent)] bg-[var(--info-soft)] px-3 py-1.5 text-[10px] font-semibold tracking-[0.04em] text-[var(--engine-info-text)] lg:flex">
        <span className="h-2 w-2 rounded-full bg-[var(--volumia-cyan)]" aria-hidden="true" />
        MOTOR LOCAL
      </div>

      <div className="no-drag flex items-center gap-1">
        {canUseDesktop ? (
          <>
            <button
              type="button"
              aria-label="Minimizar ventana"
              className="grid h-8 w-9 place-items-center rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              onClick={() => void desktopApi.minimizeWindow()}
            >
              <span aria-hidden="true">—</span>
            </button>
            <button
              type="button"
              aria-label="Maximizar o restaurar ventana"
              className="grid h-8 w-9 place-items-center rounded-lg text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              onClick={() => void desktopApi.toggleMaximizeWindow()}
            >
              <span aria-hidden="true">□</span>
            </button>
            <button
              type="button"
              aria-label="Cerrar ventana"
              className="grid h-8 w-9 place-items-center rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)]"
              onClick={() => void desktopApi.closeWindow()}
            >
              <span aria-hidden="true">×</span>
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}

function AppContent() {
  const navigate = useNavigate();
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashComplete = useCallback(() => {
    navigate("/", { replace: true });
    setShowSplash(false);
  }, [navigate]);

  if (showSplash) {
    return <Splash onComplete={handleSplashComplete} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)] text-[var(--text-primary)]">
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
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}
