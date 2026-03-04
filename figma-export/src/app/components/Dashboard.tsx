import React, { useState } from 'react';
import {
  FolderOpen, Package, Settings, Plus, Cpu,
  Activity, Clock, ChevronRight, Search,
  LayoutGrid, List, Zap, ArrowRight, Circle
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const VolumiaMark = ({ size = 28, accent = '#A47C45' }: { size?: number; accent?: string }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    <polygon points="18,3.5 32,11 32,25 18,32.5 4,25 4,11" stroke={accent} strokeWidth="1.4" fill="none" />
    <polygon points="18,9 26,13.5 26,22.5 18,27 10,22.5 10,13.5" fill={accent} opacity="0.12" />
    <line x1="18" y1="3.5" x2="18" y2="32.5" stroke={accent} strokeWidth="0.6" opacity="0.4" />
    <line x1="4" y1="11" x2="32" y2="25" stroke={accent} strokeWidth="0.6" opacity="0.4" />
    <line x1="32" y1="11" x2="4" y2="25" stroke={accent} strokeWidth="0.6" opacity="0.4" />
  </svg>
);

// Architectural thumbnail SVGs
const thumbnails = {
  pavilion: (color: string) => (
    <svg viewBox="0 0 200 120" fill="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <line x1="20" y1="85" x2="180" y2="85" stroke={color} strokeWidth="0.6" opacity="0.3" />
      <rect x="35" y="48" width="85" height="37" fill="none" stroke={color} strokeWidth="0.9" opacity="0.55" />
      <line x1="22" y1="48" x2="136" y2="48" stroke={color} strokeWidth="1.3" opacity="0.8" />
      <line x1="22" y1="45" x2="136" y2="45" stroke={color} strokeWidth="0.5" opacity="0.4" />
      <rect x="44" y="57" width="16" height="22" fill={color} opacity="0.10" stroke={color} strokeWidth="0.5" opacity="0.3" />
      <rect x="66" y="57" width="16" height="22" fill={color} opacity="0.10" stroke={color} strokeWidth="0.5" opacity="0.3" />
      <rect x="88" y="57" width="16" height="22" fill={color} opacity="0.10" stroke={color} strokeWidth="0.5" opacity="0.3" />
      <line x1="150" y1="60" x2="170" y2="60" stroke={color} strokeWidth="0.5" opacity="0.2" />
      <line x1="150" y1="65" x2="165" y2="65" stroke={color} strokeWidth="0.5" opacity="0.2" />
      <line x1="150" y1="70" x2="168" y2="70" stroke={color} strokeWidth="0.5" opacity="0.2" />
    </svg>
  ),
  tower: (color: string) => (
    <svg viewBox="0 0 200 120" fill="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <line x1="20" y1="95" x2="180" y2="95" stroke={color} strokeWidth="0.6" opacity="0.3" />
      <rect x="75" y="20" width="50" height="75" fill="none" stroke={color} strokeWidth="0.9" opacity="0.55" />
      {[30, 42, 54, 66, 78].map((y, i) => (
        <React.Fragment key={i}>
          <rect x="81" y={y} width="11" height="8" fill={color} opacity="0.08" stroke={color} strokeWidth="0.4" opacity="0.25" />
          <rect x="97" y={y} width="11" height="8" fill={color} opacity="0.08" stroke={color} strokeWidth="0.4" opacity="0.25" />
          <rect x="113" y={y} width="11" height="8" fill={color} opacity="0.08" stroke={color} strokeWidth="0.4" opacity="0.25" />
        </React.Fragment>
      ))}
      <line x1="75" y1="20" x2="125" y2="20" stroke={color} strokeWidth="1.5" opacity="0.9" />
      <rect x="90" y="10" width="20" height="10" fill="none" stroke={color} strokeWidth="0.7" opacity="0.4" />
    </svg>
  ),
  museum: (color: string) => (
    <svg viewBox="0 0 200 120" fill="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <line x1="15" y1="88" x2="185" y2="88" stroke={color} strokeWidth="0.6" opacity="0.3" />
      <rect x="20" y="52" width="120" height="36" fill="none" stroke={color} strokeWidth="0.9" opacity="0.5" />
      <line x1="14" y1="52" x2="146" y2="52" stroke={color} strokeWidth="1.4" opacity="0.85" />
      <rect x="155" y="62" width="30" height="26" fill="none" stroke={color} strokeWidth="0.8" opacity="0.45" />
      {[0, 1, 2, 3].map((i) => (
        <line key={i} x1={32 + i * 26} y1="52" x2={32 + i * 26} y2="88" stroke={color} strokeWidth="0.5" opacity="0.25" />
      ))}
      <rect x="80" y="60" width="22" height="28" fill={color} opacity="0.08" stroke={color} strokeWidth="0.5" opacity="0.35" />
      <polygon points="83,52 100,30 117,52" fill="none" stroke={color} strokeWidth="0.7" opacity="0.4" />
    </svg>
  ),
  house: (color: string) => (
    <svg viewBox="0 0 200 120" fill="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <line x1="20" y1="90" x2="180" y2="90" stroke={color} strokeWidth="0.6" opacity="0.3" />
      <line x1="40" y1="80" x2="160" y2="80" stroke={color} strokeWidth="0.5" opacity="0.2" />
      <rect x="40" y="52" width="80" height="28" fill="none" stroke={color} strokeWidth="0.9" opacity="0.55" />
      <polygon points="35,52 100,28 165,52" fill="none" stroke={color} strokeWidth="1.0" opacity="0.65" />
      <rect x="55" y="62" width="18" height="18" fill={color} opacity="0.08" stroke={color} strokeWidth="0.5" opacity="0.3" />
      <rect x="87" y="62" width="18" height="18" fill={color} opacity="0.08" stroke={color} strokeWidth="0.5" opacity="0.3" />
      <rect x="110" y="62" width="8" height="18" fill={color} opacity="0.05" />
      <line x1="145" y1="52" x2="165" y2="70" stroke={color} strokeWidth="0.6" opacity="0.3" />
      <line x1="150" y1="55" x2="165" y2="68" stroke={color} strokeWidth="0.4" opacity="0.2" />
    </svg>
  ),
  office: (color: string) => (
    <svg viewBox="0 0 200 120" fill="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <line x1="20" y1="92" x2="180" y2="92" stroke={color} strokeWidth="0.6" opacity="0.3" />
      <rect x="30" y="30" width="65" height="62" fill="none" stroke={color} strokeWidth="0.9" opacity="0.55" />
      <rect x="105" y="48" width="60" height="44" fill="none" stroke={color} strokeWidth="0.8" opacity="0.45" />
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2].map((col) => (
          <rect key={`${row}-${col}`} x={38 + col * 19} y={38 + row * 13} width="13" height="9"
            fill={color} opacity="0.07" stroke={color} strokeWidth="0.3" opacity="0.2" />
        ))
      )}
      {[0, 1, 2].map((row) =>
        [0, 1, 2].map((col) => (
          <rect key={`r${row}-${col}`} x={112 + col * 17} y={56 + row * 12} width="11" height="8"
            fill={color} opacity="0.07" stroke={color} strokeWidth="0.3" opacity="0.2" />
        ))
      )}
      <line x1="30" y1="30" x2="95" y2="30" stroke={color} strokeWidth="1.5" opacity="0.9" />
      <line x1="105" y1="48" x2="165" y2="48" stroke={color} strokeWidth="1.2" opacity="0.7" />
    </svg>
  ),
};

const projects = [
  {
    id: 1,
    name: 'Pavilion_01',
    type: 'Residential',
    date: 'Feb 24, 2026',
    status: 'In Progress',
    statusColor: '#A47C45',
    gradientA: '#1C1610',
    gradientB: '#28200E',
    lineColor: '#C8A870',
    thumb: 'pavilion' as const,
    fileSize: '48.2 MB',
  },
  {
    id: 2,
    name: 'Urban_Tower_03',
    type: 'Commercial',
    date: 'Feb 18, 2026',
    status: 'Completed',
    statusColor: '#4CAF7D',
    gradientA: '#0E1420',
    gradientB: '#121C2E',
    lineColor: '#7090C0',
    thumb: 'tower' as const,
    fileSize: '124.7 MB',
  },
  {
    id: 3,
    name: 'Museum_Extension',
    type: 'Cultural',
    date: 'Feb 10, 2026',
    status: 'Draft',
    statusColor: '#525050',
    gradientA: '#141418',
    gradientB: '#1C1C22',
    lineColor: '#9090B0',
    thumb: 'museum' as const,
    fileSize: '31.5 MB',
  },
  {
    id: 4,
    name: 'Beach_House_V2',
    type: 'Residential',
    date: 'Jan 30, 2026',
    status: 'Review',
    statusColor: '#D4924A',
    gradientA: '#0C1618',
    gradientB: '#10202A',
    lineColor: '#70A8C0',
    thumb: 'house' as const,
    fileSize: '67.3 MB',
  },
  {
    id: 5,
    name: 'Office_Complex_A',
    type: 'Commercial',
    date: 'Jan 22, 2026',
    status: 'In Progress',
    statusColor: '#A47C45',
    gradientA: '#181210',
    gradientB: '#201A14',
    lineColor: '#B09070',
    thumb: 'office' as const,
    fileSize: '89.1 MB',
  },
];

const navItems = [
  { icon: FolderOpen, label: 'Projects', active: true },
  { icon: Package, label: 'Assets', active: false },
];

interface DashboardProps {
  onOpenProject: () => void;
}

export function Dashboard({ onOpenProject }: DashboardProps) {
  const { t, isDark } = useTheme();
  const [hoveredProject, setHoveredProject] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const bg = isDark ? '#1A1A1C' : '#F0EDE6';
  const sidebarBg = isDark ? '#1E1E20' : '#F5F2EB';
  const cardBg = isDark ? '#232326' : '#FAF8F4';
  const cardBorder = isDark ? 'rgba(58,58,61,0.6)' : 'rgba(183,172,150,0.28)';
  const statusBg = isDark ? '#1E1E20' : '#F5F2EB';

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: bg,
        display: 'flex',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Left sidebar — 72px */}
      <div
        style={{
          width: 72,
          flexShrink: 0,
          background: sidebarBg,
          borderRight: `1px solid ${t.divider}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 20,
          gap: 0,
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: 28 }}>
          <VolumiaMark size={32} accent={t.accent} />
        </div>

        {/* Nav items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', padding: '0 8px' }}>
          {navItems.map(({ icon: Icon, label, active }) => (
            <button
              key={label}
              title={label}
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '10px 0',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                background: active ? t.accentBg : 'transparent',
                color: active ? t.accent : t.textMuted,
                transition: 'all 0.15s',
              }}
            >
              <Icon size={16} />
              <span style={{ fontSize: 8, letterSpacing: '0.04em', fontWeight: active ? 600 : 400 }}>
                {label.toUpperCase()}
              </span>
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Settings */}
        <div style={{ padding: '0 8px 20px', width: '100%' }}>
          <button
            title="Settings"
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '10px 0',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              background: 'transparent',
              color: t.textMuted,
            }}
          >
            <Settings size={14} />
            <span style={{ fontSize: 8, letterSpacing: '0.04em' }}>SETTINGS</span>
          </button>
        </div>
      </div>

      {/* Main center content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Header */}
        <div
          style={{
            height: 64,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            padding: '0 28px',
            gap: 16,
            borderBottom: `1px solid ${t.divider}`,
          }}
        >
          <div style={{ flex: 1 }}>
            <span style={{ color: t.textPrimary, fontSize: 15, fontWeight: 300, letterSpacing: '-0.01em' }}>
              Projects
            </span>
            <span style={{ color: t.textMuted, fontSize: 11, marginLeft: 8 }}>
              {projects.length} files
            </span>
          </div>

          {/* Search */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: t.btnBg,
              border: `1px solid ${t.panelBorder}`,
              borderRadius: 7,
              padding: '5px 11px',
              width: 220,
            }}
          >
            <Search size={11} style={{ color: t.textMuted, flexShrink: 0 }} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: t.textPrimary,
                fontSize: 11,
                width: '100%',
              }}
            />
          </div>

          {/* View toggle */}
          <div
            style={{
              display: 'flex',
              background: t.btnBg,
              border: `1px solid ${t.panelBorder}`,
              borderRadius: 7,
              padding: 3,
              gap: 2,
            }}
          >
            {([{ id: 'grid', Icon: LayoutGrid }, { id: 'list', Icon: List }] as const).map(({ id, Icon }) => (
              <button
                key={id}
                onClick={() => setViewMode(id)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 5,
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === id ? t.panelBg : 'transparent',
                  color: viewMode === id ? t.textPrimary : t.textMuted,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={12} />
              </button>
            ))}
          </div>

          {/* New Project */}
          <button
            onClick={onOpenProject}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '7px 16px',
              background: `linear-gradient(135deg, ${t.accent} 0%, ${t.accentLight} 100%)`,
              border: `1px solid ${t.accent}`,
              borderRadius: 8,
              cursor: 'pointer',
              color: '#FFFFFF',
              boxShadow: `0 2px 12px ${t.accent}40`,
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
          >
            <Plus size={13} />
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '-0.01em' }}>New Project</span>
          </button>
        </div>

        {/* Projects grid */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 28px',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(240px, 1fr))' : '1fr',
              gap: viewMode === 'grid' ? 16 : 8,
            }}
          >
            {/* New Project card */}
            {viewMode === 'grid' && (
              <button
                onClick={onOpenProject}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = t.accent;
                  (e.currentTarget as HTMLButtonElement).style.background = t.accentBg;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = cardBorder;
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
                style={{
                  background: 'transparent',
                  border: `1.5px dashed ${cardBorder}`,
                  borderRadius: 10,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  minHeight: 200,
                  transition: 'all 0.2s',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: t.accentBg,
                    border: `1px solid ${t.accent}40`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: t.accent,
                  }}
                >
                  <Plus size={18} />
                </div>
                <span style={{ color: t.textMuted, fontSize: 11, fontWeight: 500 }}>New Project</span>
              </button>
            )}

            {/* Project cards */}
            {projects
              .filter((p) => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .map((project) => (
                <div
                  key={project.id}
                  onMouseEnter={() => setHoveredProject(project.id)}
                  onMouseLeave={() => setHoveredProject(null)}
                  style={{
                    background: cardBg,
                    border: `1px solid ${hoveredProject === project.id ? t.accent + '50' : cardBorder}`,
                    borderRadius: 10,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: hoveredProject === project.id ? `0 4px 20px rgba(0,0,0,0.15)` : 'none',
                    transform: hoveredProject === project.id ? 'translateY(-1px)' : 'none',
                  }}
                  onClick={onOpenProject}
                >
                  {viewMode === 'grid' ? (
                    <>
                      {/* Thumbnail */}
                      <div
                        style={{
                          height: 130,
                          background: `linear-gradient(135deg, ${project.gradientA}, ${project.gradientB})`,
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      >
                        {thumbnails[project.thumb](project.lineColor)}

                        {/* Status badge */}
                        <div
                          style={{
                            position: 'absolute',
                            top: 10,
                            right: 10,
                            background: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)',
                            backdropFilter: 'blur(8px)',
                            borderRadius: 4,
                            padding: '2px 7px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <div
                            style={{
                              width: 4,
                              height: 4,
                              borderRadius: '50%',
                              background: project.statusColor,
                            }}
                          />
                          <span style={{ color: project.statusColor, fontSize: 8, fontWeight: 600, letterSpacing: '0.04em' }}>
                            {project.status.toUpperCase()}
                          </span>
                        </div>

                        {/* Open button on hover */}
                        {hoveredProject === project.id && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              background: 'rgba(0,0,0,0.25)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <div
                              style={{
                                background: `linear-gradient(135deg, ${t.accent}, ${t.accentLight})`,
                                borderRadius: 7,
                                padding: '6px 14px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                color: '#fff',
                              }}
                            >
                              <span style={{ fontSize: 11, fontWeight: 600 }}>Open</span>
                              <ArrowRight size={12} />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <span style={{ color: t.textPrimary, fontSize: 12, fontWeight: 500 }}>
                            {project.name}
                          </span>
                          <span style={{ color: t.textMuted, fontSize: 9 }}>{project.fileSize}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span
                            style={{
                              background: t.tagBg,
                              color: t.textMuted,
                              fontSize: 8,
                              padding: '1px 5px',
                              borderRadius: 3,
                              fontWeight: 500,
                              letterSpacing: '0.04em',
                            }}
                          >
                            {project.type.toUpperCase()}
                          </span>
                          <span style={{ color: t.textMuted, fontSize: 9 }}>{project.date}</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* List view */
                    <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 14 }}>
                      <div
                        style={{
                          width: 44,
                          height: 36,
                          borderRadius: 6,
                          background: `linear-gradient(135deg, ${project.gradientA}, ${project.gradientB})`,
                          flexShrink: 0,
                          overflow: 'hidden',
                          position: 'relative',
                        }}
                      >
                        {thumbnails[project.thumb](project.lineColor)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ color: t.textPrimary, fontSize: 12, fontWeight: 500 }}>{project.name}</span>
                        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                          <span style={{ color: t.textMuted, fontSize: 9 }}>{project.type}</span>
                          <span style={{ color: t.textMuted, fontSize: 9 }}>·</span>
                          <span style={{ color: t.textMuted, fontSize: 9 }}>{project.date}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: project.statusColor }} />
                        <span style={{ color: project.statusColor, fontSize: 9, fontWeight: 600 }}>{project.status}</span>
                      </div>
                      <span style={{ color: t.textMuted, fontSize: 9 }}>{project.fileSize}</span>
                      <ChevronRight size={12} style={{ color: t.textMuted }} />
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Right status panel */}
      <div
        style={{
          width: 220,
          flexShrink: 0,
          background: statusBg,
          borderLeft: `1px solid ${t.divider}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            padding: '0 18px',
            borderBottom: `1px solid ${t.divider}`,
            flexShrink: 0,
          }}
        >
          <span style={{ color: t.textSecondary, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em' }}>
            SYSTEM
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
          {/* Engine status */}
          <div style={{ padding: '0 18px', marginBottom: 20 }}>
            <div style={{ color: t.textMuted, fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', marginBottom: 10 }}>
              ENGINE STATUS
            </div>
            {[
              { label: 'AI Engine', value: 'Connected', color: t.success },
              { label: 'ComfyUI', value: 'Online', color: t.success },
              { label: 'RTX 4090', value: 'Active', color: t.accent },
              { label: 'VRAM', value: '12.4 / 24 GB', color: t.textSecondary },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '5px 0',
                  borderBottom: `1px solid ${t.divider}`,
                }}
              >
                <span style={{ color: t.textMuted, fontSize: 10 }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {(color === t.success || color === t.accent) && (
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: color, boxShadow: `0 0 4px ${color}80` }} />
                  )}
                  <span style={{ color, fontSize: 10, fontWeight: 500 }}>{value}</span>
                </div>
              </div>
            ))}
          </div>

          {/* GPU usage */}
          <div style={{ padding: '0 18px', marginBottom: 20 }}>
            <div style={{ color: t.textMuted, fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', marginBottom: 10 }}>
              GPU ACTIVITY
            </div>
            {[
              { label: 'Compute', pct: 18 },
              { label: 'Memory', pct: 52 },
              { label: 'Encoder', pct: 5 },
            ].map(({ label, pct }) => (
              <div key={label} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: t.textMuted, fontSize: 9 }}>{label}</span>
                  <span style={{ color: t.textSecondary, fontSize: 9, fontWeight: 500 }}>{pct}%</span>
                </div>
                <div style={{ height: 3, background: t.divider, borderRadius: 2 }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, ${t.accent}90, ${t.accentLight})`,
                      borderRadius: 2,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Recent activity */}
          <div style={{ padding: '0 18px' }}>
            <div style={{ color: t.textMuted, fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', marginBottom: 10 }}>
              RECENT ACTIVITY
            </div>
            {[
              { action: 'Exported Pavilion_01.glb', time: '2m ago' },
              { action: 'AI Generate — Pavilion roof', time: '14m ago' },
              { action: 'Applied texture: Concrete_03', time: '28m ago' },
              { action: 'Opened Beach_House_V2', time: '1h ago' },
            ].map(({ action, time }, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  padding: '7px 0',
                  borderBottom: `1px solid ${t.divider}`,
                }}
              >
                <span style={{ color: t.textSecondary, fontSize: 10 }}>{action}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={8} style={{ color: t.textMuted }} />
                  <span style={{ color: t.textMuted, fontSize: 9 }}>{time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Open Workspace CTA */}
        <div style={{ padding: '14px 16px', borderTop: `1px solid ${t.divider}`, flexShrink: 0 }}>
          <button
            onClick={onOpenProject}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              padding: '8px 0',
              background: t.btnBg,
              border: `1px solid ${t.panelBorder}`,
              borderRadius: 8,
              cursor: 'pointer',
              color: t.textSecondary,
              fontSize: 11,
              fontWeight: 500,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = t.btnBgHover;
              (e.currentTarget as HTMLButtonElement).style.color = t.textPrimary;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = t.btnBg;
              (e.currentTarget as HTMLButtonElement).style.color = t.textSecondary;
            }}
          >
            <Zap size={12} style={{ color: t.accent }} />
            Open Workspace
          </button>
        </div>
      </div>
    </div>
  );
}
