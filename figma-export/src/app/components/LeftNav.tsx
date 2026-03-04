import React, { useState } from 'react';
import {
  Layers, Box, Palette, Lightbulb, Camera,
  Package, Settings, Home, Grid3X3
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const navItems = [
  { icon: Home, label: 'Overview', id: 'overview' },
  { icon: Layers, label: 'Scene', id: 'scene' },
  { icon: Box, label: 'Objects', id: 'objects' },
  { icon: Palette, label: 'Materials', id: 'materials' },
  { icon: Lightbulb, label: 'Lighting', id: 'lighting' },
  { icon: Camera, label: 'Camera', id: 'camera' },
];

const libraryItems = [
  { icon: Package, label: 'Library', id: 'library' },
  { icon: Grid3X3, label: 'Assets', id: 'assets' },
];

interface LeftNavProps {
  activeItem?: string;
  onItemChange?: (id: string) => void;
}

export function LeftNav({ activeItem = 'scene', onItemChange }: LeftNavProps) {
  const { t } = useTheme();
  const [hovered, setHovered] = useState<string | null>(null);

  const NavButton = ({
    icon: Icon,
    label,
    id,
  }: {
    icon: typeof Home;
    label: string;
    id: string;
  }) => {
    const isActive = activeItem === id;
    const isHov = hovered === id;

    return (
      <button
        title={label}
        onClick={() => onItemChange?.(id)}
        onMouseEnter={() => setHovered(id)}
        onMouseLeave={() => setHovered(null)}
        style={{
          position: 'relative',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          padding: '10px 0',
          border: 'none',
          cursor: 'pointer',
          background: isActive ? t.accentBg : isHov ? t.btnBg : 'transparent',
          color: isActive ? t.accent : isHov ? t.textSecondary : t.textMuted,
          borderRadius: 0,
          transition: 'background 0.12s, color 0.12s',
        }}
      >
        {/* Active indicator — left edge */}
        {isActive && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 2,
              height: 22,
              background: t.accent,
              borderRadius: '0 2px 2px 0',
            }}
          />
        )}
        <Icon size={15} strokeWidth={isActive ? 1.8 : 1.5} />
        <span
          style={{
            fontSize: 7.5,
            letterSpacing: '0.05em',
            fontWeight: isActive ? 600 : 400,
            textTransform: 'uppercase',
            lineHeight: 1,
          }}
        >
          {label}
        </span>
      </button>
    );
  };

  return (
    <div
      style={{
        width: 64,
        flexShrink: 0,
        background: t.panelBg,
        borderRight: `1px solid ${t.divider}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 10,
      }}
    >
      {/* Primary nav */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 0', borderBottom: `1px solid ${t.divider}` }}>
        {navItems.map((item) => (
          <NavButton key={item.id} {...item} />
        ))}
      </div>

      {/* Library section */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 0', borderBottom: `1px solid ${t.divider}` }}>
        {libraryItems.map((item) => (
          <NavButton key={item.id} {...item} />
        ))}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Settings */}
      <div style={{ padding: '8px 0', borderTop: `1px solid ${t.divider}` }}>
        <button
          title="Preferences"
          onMouseEnter={() => setHovered('settings')}
          onMouseLeave={() => setHovered(null)}
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            padding: '10px 0',
            border: 'none',
            cursor: 'pointer',
            background: hovered === 'settings' ? t.btnBg : 'transparent',
            color: hovered === 'settings' ? t.textSecondary : t.textMuted,
            transition: 'all 0.12s',
          }}
        >
          <Settings size={14} strokeWidth={1.5} />
          <span style={{ fontSize: 7.5, letterSpacing: '0.05em', fontWeight: 400, textTransform: 'uppercase' }}>
            Prefs
          </span>
        </button>
      </div>
    </div>
  );
}
