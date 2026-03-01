import React, { useState, useEffect, useRef } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { SplashScreen } from './components/SplashScreen';
import { Dashboard } from './components/Dashboard';
import { TopBar } from './components/TopBar';
import { LeftNav } from './components/LeftNav';
import { Viewport3D } from './components/Viewport3D';
import { RightPanel } from './components/RightPanel';
import { BottomToolbar } from './components/BottomToolbar';

type AppState = 'splash' | 'dashboard' | 'workspace';

function VolumiApp() {
  const { t } = useTheme();

  const [appState, setAppState] = useState<AppState>('splash');
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [activeNavItem, setActiveNavItem] = useState('scene');

  // AI generating state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0);
  const generateInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleStartGenerate = () => {
    setIsGenerating(true);
    setGenerateProgress(0);

    const DURATION = 5000; // 5 second simulation
    const start = Date.now();

    if (generateInterval.current) clearInterval(generateInterval.current);

    generateInterval.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const p = Math.min(100, (elapsed / DURATION) * 100);
      setGenerateProgress(p);

      if (p >= 100) {
        if (generateInterval.current) clearInterval(generateInterval.current);
        setTimeout(() => {
          setIsGenerating(false);
          setGenerateProgress(0);
        }, 600);
      }
    }, 50);
  };

  const handleCancelGenerate = () => {
    if (generateInterval.current) clearInterval(generateInterval.current);
    setIsGenerating(false);
    setGenerateProgress(0);
  };

  useEffect(() => {
    return () => {
      if (generateInterval.current) clearInterval(generateInterval.current);
    };
  }, []);

  // ── SPLASH ─────────────────────────────────────────────────────────────────
  if (appState === 'splash') {
    return (
      <SplashScreen onComplete={() => setAppState('dashboard')} />
    );
  }

  // ── DASHBOARD ──────────────────────────────────────────────────────────────
  if (appState === 'dashboard') {
    return (
      <Dashboard onOpenProject={() => setAppState('workspace')} />
    );
  }

  // ── WORKSPACE ──────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: t.bg,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'background 0.3s',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Top bar — 48px */}
      <TopBar onBackToDashboard={() => setAppState('dashboard')} />

      {/* Main area: left nav + viewport + right panel */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {/* Left nav — 64px fixed structural column */}
        <LeftNav
          activeItem={activeNavItem}
          onItemChange={setActiveNavItem}
        />

        {/* 3D Viewport — fills all remaining horizontal space */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          <Viewport3D />

          {/* AI generating overlay */}
          {isGenerating && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 10,
                border: `1px solid ${t.accent}30`,
                boxShadow: `inset 0 0 40px ${t.accent}08`,
              }}
            />
          )}
        </div>

        {/* Right panel — 360px */}
        <RightPanel
          isCollapsed={rightPanelCollapsed}
          onToggle={() => setRightPanelCollapsed((c) => !c)}
          isGenerating={isGenerating}
          generateProgress={generateProgress}
        />
      </div>

      {/* Bottom toolbar — 64px structural base */}
      <BottomToolbar
        isGenerating={isGenerating}
        generateProgress={generateProgress}
        onStartGenerate={handleStartGenerate}
        onCancelGenerate={handleCancelGenerate}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <VolumiApp />
    </ThemeProvider>
  );
}
