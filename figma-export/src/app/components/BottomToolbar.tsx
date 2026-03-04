import React, { useState } from 'react';
import {
  MousePointer2, Move3D, RotateCcw, Maximize2,
  Sparkles, Layers, ImagePlus, Download,
  Grid3X3, Magnet, Ruler, AlignCenter,
  ChevronDown, Zap, Square, X,
  Cpu, Play
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

type TransformTool = 'select' | 'move' | 'rotate' | 'scale';

interface BottomToolbarProps {
  isGenerating: boolean;
  generateProgress: number;
  onStartGenerate: () => void;
  onCancelGenerate: () => void;
}

export function BottomToolbar({
  isGenerating,
  generateProgress,
  onStartGenerate,
  onCancelGenerate,
}: BottomToolbarProps) {
  const { t } = useTheme();
  const [activeTool, setActiveTool] = useState<TransformTool>('select');
  const [snapActive, setSnapActive] = useState(true);
  const [gridActive, setGridActive] = useState(true);
  const [showGenMenu, setShowGenMenu] = useState(false);

  const handleImport = () => {
    alert('Import Reference Image — File picker would open here in production.');
  };

  const handleExport = () => {
    alert('Export GLB — File would be exported in production.');
  };

  const transformTools = [
    { icon: MousePointer2, label: 'Select', id: 'select' as const, key: 'Q' },
    { icon: Move3D, label: 'Move', id: 'move' as const, key: 'W' },
    { icon: RotateCcw, label: 'Rotate', id: 'rotate' as const, key: 'E' },
    { icon: Maximize2, label: 'Scale', id: 'scale' as const, key: 'R' },
  ];

  return (
    <div
      style={{
        position: 'relative',
        background: t.toolbarBg,
        borderTop: `1px solid ${t.divider}`,
        /* Structural Base Bar — micro gradient at top */
        backgroundImage: `linear-gradient(180deg, ${t.divider} 0px, transparent 1px), none`,
        zIndex: 50,
        flexShrink: 0,
        height: 64,
      }}
    >
      {/* AI Progress bar — full-width underlay */}
      {isGenerating && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: t.divider,
            zIndex: 1,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${generateProgress}%`,
              background: `linear-gradient(90deg, ${t.accent}80, ${t.accentLight}, ${t.accent}80)`,
              transition: 'width 0.15s linear',
              boxShadow: `0 0 8px ${t.accent}60`,
            }}
          />
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          padding: '0 16px',
          gap: 0,
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* ── ZONE 1: TRANSFORM TOOLS ──────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            background: isGenerating ? 'transparent' : t.inputBg,
            border: isGenerating ? '1px solid transparent' : `1px solid ${t.divider}`,
            borderRadius: 9,
            padding: '5px 6px',
            transition: 'opacity 0.3s, background 0.3s',
            opacity: isGenerating ? 0.3 : 1,
            pointerEvents: isGenerating ? 'none' : 'auto',
            flexShrink: 0,
          }}
        >
          {transformTools.map(({ icon: Icon, label, id, key }) => {
            const isActive = activeTool === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTool(id)}
                title={`${label} (${key})`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  padding: '5px 9px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  background: isActive ? t.btnBgActive : 'transparent',
                  color: isActive ? t.accent : t.textSecondary,
                  transition: 'all 0.12s',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background = t.btnBg;
                    (e.currentTarget as HTMLButtonElement).style.color = t.textPrimary;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    (e.currentTarget as HTMLButtonElement).style.color = t.textSecondary;
                  }
                }}
              >
                {isActive && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 2,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 14,
                      height: 1.5,
                      background: t.accent,
                      borderRadius: 1,
                    }}
                  />
                )}
                <Icon size={14} strokeWidth={isActive ? 2 : 1.6} />
                <span style={{ fontSize: 7.5, letterSpacing: '0.04em', lineHeight: 1 }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 28, background: t.divider, margin: '0 10px', flexShrink: 0, opacity: isGenerating ? 0.3 : 1 }} />

        {/* ── ZONE 2: UTILITIES ────────────────────────────────────────── */}
        {isGenerating ? (
          /* When AI is running — show generation status text */
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: t.accent,
                  boxShadow: `0 0 8px ${t.accent}`,
                  animation: 'none',
                  opacity: generateProgress % 20 < 10 ? 1 : 0.5,
                  transition: 'opacity 0.2s',
                }}
              />
              <span style={{ color: t.textSecondary, fontSize: 11, fontWeight: 500 }}>
                Generating 3D Mesh
              </span>
              <span style={{ color: t.textMuted, fontSize: 10 }}>
                AI Engine Active · RTX Accelerated
              </span>
            </div>

            {/* Progress stats */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginLeft: 'auto',
                marginRight: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ color: t.textMuted, fontSize: 9 }}>PROGRESS</span>
                <span style={{ color: t.accent, fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {Math.floor(generateProgress)}%
                </span>
              </div>
              <div
                style={{
                  width: 120,
                  height: 3,
                  background: t.divider,
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${generateProgress}%`,
                    background: `linear-gradient(90deg, ${t.accent}, ${t.accentLight})`,
                    borderRadius: 2,
                    transition: 'width 0.15s',
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Normal utilities */
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <button
              onClick={() => setGridActive((g) => !g)}
              title="Toggle Grid"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '5px 9px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: gridActive ? t.btnBgActive : 'transparent',
                color: gridActive ? t.accent : t.textMuted,
                transition: 'all 0.12s',
              }}
              onMouseEnter={(e) => {
                if (!gridActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = t.btnBg;
                  (e.currentTarget as HTMLButtonElement).style.color = t.textSecondary;
                }
              }}
              onMouseLeave={(e) => {
                if (!gridActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = t.textMuted;
                }
              }}
            >
              <Grid3X3 size={13} />
              <span style={{ fontSize: 7.5, letterSpacing: '0.04em' }}>Grid</span>
            </button>

            <button
              onClick={() => setSnapActive((s) => !s)}
              title="Toggle Snap"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '5px 9px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: snapActive ? t.btnBgActive : 'transparent',
                color: snapActive ? t.accent : t.textMuted,
                transition: 'all 0.12s',
              }}
              onMouseEnter={(e) => {
                if (!snapActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = t.btnBg;
                  (e.currentTarget as HTMLButtonElement).style.color = t.textSecondary;
                }
              }}
              onMouseLeave={(e) => {
                if (!snapActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = t.textMuted;
                }
              }}
            >
              <Magnet size={13} />
              <span style={{ fontSize: 7.5, letterSpacing: '0.04em' }}>Snap</span>
            </button>

            <button
              title="Measure Tool"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '5px 9px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: 'transparent',
                color: t.textMuted,
                transition: 'all 0.12s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = t.btnBg;
                (e.currentTarget as HTMLButtonElement).style.color = t.textSecondary;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = t.textMuted;
              }}
            >
              <Ruler size={13} />
              <span style={{ fontSize: 7.5, letterSpacing: '0.04em' }}>Measure</span>
            </button>

            <button
              title="Align Objects"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '5px 9px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: 'transparent',
                color: t.textMuted,
                transition: 'all 0.12s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = t.btnBg;
                (e.currentTarget as HTMLButtonElement).style.color = t.textSecondary;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = t.textMuted;
              }}
            >
              <AlignCenter size={13} />
              <span style={{ fontSize: 7.5, letterSpacing: '0.04em' }}>Align</span>
            </button>
          </div>
        )}

        {/* ── ZONE 3: ACTION BUTTONS (right, dominant) ─────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {/* RTX indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: t.tagBg,
              borderRadius: 6,
              padding: '4px 9px',
              border: `1px solid ${t.panelBorder}`,
            }}
          >
            <Zap size={10} style={{ color: t.accent }} />
            <span style={{ color: t.textSecondary, fontSize: 9, fontWeight: 600, letterSpacing: '0.04em' }}>RTX</span>
            <div
              style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: t.success,
                boxShadow: `0 0 4px ${t.success}80`,
              }}
            />
          </div>

          <div style={{ width: 1, height: 24, background: t.divider }} />

          {!isGenerating ? (
            <>
              {/* Secondary: Apply Texture */}
              <SecondaryBtn icon={<Layers size={13} />} label="Apply Texture" t={t} />

              {/* Secondary: Import Reference */}
              <SecondaryBtn icon={<ImagePlus size={13} />} label="Import Reference" t={t} onClick={handleImport} />

              {/* Secondary: Export GLB */}
              <SecondaryBtn icon={<Download size={13} />} label="Export GLB" t={t} onClick={handleExport} />

              <div style={{ width: 1, height: 24, background: t.divider }} />

              {/* PRIMARY: Generate 3D */}
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: 0 }}>
                  <button
                    onClick={() => { setShowGenMenu(false); onStartGenerate(); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      padding: '8px 18px',
                      background: `linear-gradient(135deg, ${t.accent} 0%, ${t.accentLight} 100%)`,
                      border: `1px solid ${t.accent}`,
                      borderRight: 'none',
                      borderRadius: '8px 0 0 8px',
                      cursor: 'pointer',
                      color: '#FFFFFF',
                      boxShadow: `0 2px 14px ${t.accent}50, 0 1px 4px rgba(0,0,0,0.18)`,
                      transition: 'filter 0.15s',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.10)'}
                    onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1)'}
                  >
                    <Sparkles size={14} />
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '-0.01em' }}>
                      Generate 3D
                    </span>
                  </button>
                  <button
                    onClick={() => setShowGenMenu((s) => !s)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 8px',
                      background: `linear-gradient(135deg, ${t.accentLight} 0%, ${t.accent} 100%)`,
                      border: `1px solid ${t.accentLight}`,
                      borderRadius: '0 8px 8px 0',
                      cursor: 'pointer',
                      color: '#FFFFFF',
                      boxShadow: `0 2px 14px ${t.accent}40`,
                    }}
                  >
                    <ChevronDown size={11} />
                  </button>
                </div>

                {/* Generate dropdown */}
                {showGenMenu && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '100%',
                      right: 0,
                      marginBottom: 8,
                      background: t.panelBg,
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      border: `1px solid ${t.panelBorder}`,
                      borderRadius: 9,
                      boxShadow: t.shadowPanel,
                      padding: 5,
                      minWidth: 210,
                      zIndex: 200,
                    }}
                  >
                    {[
                      { icon: Sparkles, label: 'Generate from Text Prompt', desc: 'AI · Ctrl+G' },
                      { icon: ImagePlus, label: 'Generate from Image', desc: 'AI · Ctrl+Shift+G' },
                      { icon: Layers, label: 'Generate Variants', desc: '3 variations' },
                      { icon: Cpu, label: 'RTX Denoise Pass', desc: 'DLSS 3.0' },
                    ].map(({ icon: Icon, label, desc }) => (
                      <button
                        key={label}
                        onClick={() => { setShowGenMenu(false); onStartGenerate(); }}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 9,
                          padding: '8px 10px',
                          background: 'transparent',
                          border: 'none',
                          borderRadius: 6,
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'background 0.12s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.background = t.btnBg}
                        onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
                      >
                        <Icon size={13} style={{ color: t.accent, flexShrink: 0 }} />
                        <div>
                          <div style={{ color: t.textPrimary, fontSize: 11 }}>{label}</div>
                          <div style={{ color: t.textMuted, fontSize: 9, marginTop: 1 }}>{desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ── AI IS ACTIVE — Cancel button ── */
            <button
              onClick={onCancelGenerate}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 18px',
                background: `rgba(208,80,96,0.12)`,
                border: `1px solid ${t.error}60`,
                borderRadius: 8,
                cursor: 'pointer',
                color: t.error,
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = `rgba(208,80,96,0.22)`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = `rgba(208,80,96,0.12)`;
              }}
            >
              <X size={13} />
              <span style={{ fontSize: 11, fontWeight: 600 }}>Cancel</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Reusable secondary button ────────────────────────────────────────────────

function SecondaryBtn({
  icon,
  label,
  t,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  t: any;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        background: t.btnBg,
        border: `1px solid ${t.panelBorder}`,
        borderRadius: 7,
        cursor: 'pointer',
        color: t.textSecondary,
        transition: 'all 0.13s',
        whiteSpace: 'nowrap',
        fontSize: 11,
        fontWeight: 500,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = t.btnBgHover;
        (e.currentTarget as HTMLButtonElement).style.color = t.textPrimary;
        (e.currentTarget as HTMLButtonElement).style.borderColor = t.accent + '70';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = t.btnBg;
        (e.currentTarget as HTMLButtonElement).style.color = t.textSecondary;
        (e.currentTarget as HTMLButtonElement).style.borderColor = t.panelBorder;
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
