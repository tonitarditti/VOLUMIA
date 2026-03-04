import React, { useState } from 'react';
import { Sun, Moon, Save, Undo2, Redo2, Cpu } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const menuItems = ['File', 'Edit', 'View', 'Render', 'Help'];

interface TopBarProps {
  onBackToDashboard?: () => void;
}

export function TopBar({ onBackToDashboard }: TopBarProps) {
  const { isDark, toggleTheme, t } = useTheme();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div
      style={{
        background: t.topbarBg,
        borderBottom: `1px solid ${t.divider}`,
        zIndex: 100,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        height: 48,
        padding: '0 14px',
        gap: 0,
        userSelect: 'none',
      }}
    >
      {/* Left: Logo + Menu */}
      <div className="flex items-center gap-1 mr-4">
        {/* VOLUMIA Logo mark */}
        <button
          onClick={onBackToDashboard}
          title="Back to Dashboard"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginRight: 6,
            background: 'transparent',
            border: 'none',
            cursor: onBackToDashboard ? 'pointer' : 'default',
            padding: '3px 5px',
            borderRadius: 5,
          }}
          onMouseEnter={(e) => {
            if (onBackToDashboard) (e.currentTarget as HTMLButtonElement).style.background = t.btnBg;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <polygon
              points="9,1.8 16.2,5.85 16.2,12.15 9,16.2 1.8,12.15 1.8,5.85"
              stroke={t.accent}
              strokeWidth="1.3"
              fill="none"
            />
            <polygon
              points="9,5 12.5,7 12.5,11 9,13 5.5,11 5.5,7"
              fill={t.accent}
              opacity="0.18"
            />
            <line x1="9" y1="1.8" x2="9" y2="16.2" stroke={t.accent} strokeWidth="0.6" opacity="0.45" />
            <line x1="1.8" y1="5.85" x2="16.2" y2="12.15" stroke={t.accent} strokeWidth="0.6" opacity="0.45" />
            <line x1="16.2" y1="5.85" x2="1.8" y2="12.15" stroke={t.accent} strokeWidth="0.6" opacity="0.45" />
          </svg>
          <span
            style={{ color: t.textPrimary, letterSpacing: '0.16em', fontSize: 11, fontWeight: 600 }}
          >
            VOLUMIA
          </span>
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 14, background: t.divider, margin: '0 4px' }} />

        {/* Menu items */}
        {menuItems.map((item) => (
          <button
            key={item}
            onClick={() => setActiveMenu(activeMenu === item ? null : item)}
            style={{
              color: activeMenu === item ? t.textPrimary : t.textSecondary,
              background: activeMenu === item ? t.btnBg : 'transparent',
              borderRadius: 5,
              padding: '3px 8px',
              fontSize: 11,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = t.btnBg;
              (e.currentTarget as HTMLButtonElement).style.color = t.textPrimary;
            }}
            onMouseLeave={(e) => {
              if (activeMenu !== item) {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = t.textSecondary;
              }
            }}
          >
            {item}
          </button>
        ))}
      </div>

      {/* Center: Project breadcrumb + edit tools */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={onBackToDashboard}
            style={{
              color: t.textMuted,
              fontSize: 10,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '1px 2px',
            }}
            onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.color = t.textSecondary}
            onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.color = t.textMuted}
          >
            Projects
          </button>
          <span style={{ color: t.textMuted, fontSize: 10 }}>/</span>
          <span style={{ color: t.textSecondary, fontSize: 10 }}>Residential</span>
          <span style={{ color: t.textMuted, fontSize: 10 }}>/</span>
          <span style={{ color: t.textPrimary, fontSize: 11, fontWeight: 500 }}>Pavilion_01</span>
          <span
            style={{
              background: t.accentBg,
              color: t.accent,
              fontSize: 8,
              padding: '1px 5px',
              borderRadius: 3,
              fontWeight: 600,
              letterSpacing: '0.04em',
              marginLeft: 2,
            }}
          >
            .VOL
          </span>
        </div>

        {/* Edit tools */}
        <div style={{ width: 1, height: 12, background: t.divider, margin: '0 2px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {[
            { icon: Undo2, label: 'Undo' },
            { icon: Redo2, label: 'Redo' },
          ].map(({ icon: Icon, label }) => (
            <button
              key={label}
              title={label}
              style={{ color: t.textMuted, padding: '3px 5px', borderRadius: 5, background: 'transparent', border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = t.btnBg;
                (e.currentTarget as HTMLButtonElement).style.color = t.textPrimary;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = t.textMuted;
              }}
            >
              <Icon size={12} />
            </button>
          ))}

          <button
            onClick={handleSave}
            style={{
              color: saved ? t.success : t.textMuted,
              padding: '3px 5px',
              borderRadius: 5,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            title="Save (Cmd+S)"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = t.btnBg;
              (e.currentTarget as HTMLButtonElement).style.color = t.textPrimary;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = saved ? t.success : t.textMuted;
            }}
          >
            <Save size={12} />
          </button>
        </div>
      </div>

      {/* Right: GPU + theme + user */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* GPU status */}
        <div
          style={{
            background: t.tagBg,
            borderRadius: 5,
            padding: '3px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            border: `1px solid ${t.panelBorder}`,
          }}
        >
          <Cpu size={10} style={{ color: t.accent }} />
          <span style={{ color: t.textSecondary, fontSize: 10, fontWeight: 500 }}>RTX 4090</span>
          <div
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: t.success,
              boxShadow: `0 0 5px ${t.success}80`,
            }}
          />
        </div>

        <div style={{ width: 1, height: 14, background: t.divider }} />

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          style={{
            background: t.btnBg,
            border: `1px solid ${t.panelBorder}`,
            borderRadius: 6,
            padding: '4px 9px',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            color: t.textSecondary,
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontSize: 10,
            fontWeight: 500,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = t.btnBgHover;
            (e.currentTarget as HTMLButtonElement).style.color = t.textPrimary;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = t.btnBg;
            (e.currentTarget as HTMLButtonElement).style.color = t.textSecondary;
          }}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDark ? <><Sun size={11} /><span>Light</span></> : <><Moon size={11} /><span>Dark</span></>}
        </button>

        {/* User avatar */}
        <button
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${t.accent} 0%, ${t.accentLight} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            cursor: 'pointer',
            border: `1.5px solid ${t.accentBg}`,
            flexShrink: 0,
            fontSize: 9,
            fontWeight: 700,
          }}
          title="Account"
        >
          JD
        </button>
      </div>
    </div>
  );
}
