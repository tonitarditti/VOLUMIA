import React, { useState } from 'react';
import {
  ChevronLeft, ChevronRight, Eye, EyeOff, Lock, Unlock,
  Sun, Circle, Layers, Sparkles, RotateCcw,
  Zap, Clock, Image
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

// ─── Shared sub-components ────────────────────────────────────────────────────

interface SliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
  color?: string;
}

function Slider({ label, value, min = 0, max = 1, step = 0.01, onChange, unit = '', color }: SliderProps) {
  const { t } = useTheme();
  const pct = ((value - min) / (max - min)) * 100;
  const accentColor = color || t.accent;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ color: t.textSecondary, fontSize: 10 }}>{label}</span>
        <span style={{ color: t.textPrimary, fontSize: 10, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
          {value.toFixed(2)}{unit}
        </span>
      </div>
      <div style={{ position: 'relative', height: 3, background: t.divider, borderRadius: 2, cursor: 'pointer' }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${pct}%`,
            background: accentColor,
            borderRadius: 2,
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            transform: 'translateY(-50%)',
            width: '100%',
            opacity: 0,
            cursor: 'pointer',
            margin: 0,
            height: 18,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `${pct}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: accentColor,
            border: `2px solid ${t.panelBg}`,
            boxShadow: `0 0 0 1px ${accentColor}`,
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}

function Vec3Input({ label, value, onChange, step = 0.1 }: {
  label: string;
  value: { x: number; y: number; z: number };
  onChange: (v: { x: number; y: number; z: number }) => void;
  step?: number;
}) {
  const { t } = useTheme();
  const axes = [
    { key: 'x' as const, color: '#D05040', bg: 'rgba(208,80,64,0.08)' },
    { key: 'y' as const, color: '#50A060', bg: 'rgba(80,160,96,0.08)' },
    { key: 'z' as const, color: '#4878C8', bg: 'rgba(72,120,200,0.08)' },
  ];

  return (
    <div style={{ marginBottom: 12 }}>
      <span style={{ color: t.textSecondary, fontSize: 9, display: 'block', marginBottom: 6, letterSpacing: '0.06em', fontWeight: 600 }}>
        {label.toUpperCase()}
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
        {axes.map(({ key, color, bg }) => (
          <div
            key={key}
            style={{
              background: t.inputBg,
              border: `1px solid ${t.inputBorder}`,
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                background: bg,
                padding: '2px 0',
                textAlign: 'center',
                borderBottom: `1px solid ${t.inputBorder}`,
              }}
            >
              <span style={{ fontSize: 7.5, fontWeight: 700, color, letterSpacing: '0.06em' }}>
                {key.toUpperCase()}
              </span>
            </div>
            <input
              type="number"
              value={value[key].toFixed(2)}
              step={step}
              onChange={(e) => onChange({ ...value, [key]: parseFloat(e.target.value) || 0 })}
              style={{
                background: 'transparent',
                border: 'none',
                color: t.textPrimary,
                fontSize: 10,
                textAlign: 'center',
                padding: '5px 2px',
                width: '100%',
                outline: 'none',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <div
      style={{
        background: t.inputBg,
        border: `1px solid ${t.divider}`,
        borderRadius: 8,
        padding: '14px',
        marginBottom: 10,
      }}
    >
      {title && (
        <div
          style={{
            color: t.textMuted,
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.1em',
            marginBottom: 12,
          }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Tab content ──────────────────────────────────────────────────────────────

function ModelTab({
  position, setPosition,
  rotation, setRotation,
  scale, setScale,
  isVisible, setIsVisible,
  isLocked, setIsLocked,
}: any) {
  const { t } = useTheme();

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Object header */}
      <Block title="">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 0 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 7,
              background: t.accentBg,
              border: `1px solid ${t.panelBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="5.5" width="12" height="8.5" rx="1.2" stroke={t.accent} strokeWidth="1.1" fill="none" />
              <rect x="4.5" y="2" width="7" height="5" rx="0.8" stroke={t.accent} strokeWidth="0.9" fill="none" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: t.textPrimary, fontSize: 12, fontWeight: 500 }}>Pavilion_Main</div>
            <div style={{ color: t.textMuted, fontSize: 9, marginTop: 1 }}>Mesh · Concrete · 18.4K verts</div>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            <button
              onClick={() => setIsVisible((v: boolean) => !v)}
              style={{
                padding: '4px 5px',
                borderRadius: 5,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: isVisible ? t.textSecondary : t.textMuted,
              }}
              title={isVisible ? 'Hide' : 'Show'}
            >
              {isVisible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
            <button
              onClick={() => setIsLocked((l: boolean) => !l)}
              style={{
                padding: '4px 5px',
                borderRadius: 5,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: isLocked ? t.warning : t.textSecondary,
              }}
              title={isLocked ? 'Unlock' : 'Lock'}
            >
              {isLocked ? <Lock size={13} /> : <Unlock size={13} />}
            </button>
          </div>
        </div>
      </Block>

      {/* Transform */}
      <Block title="TRANSFORM">
        <Vec3Input label="Position" value={position} onChange={setPosition} />
        <Vec3Input label="Rotation" value={rotation} onChange={setRotation} step={1} />
        <Vec3Input label="Scale" value={scale} onChange={setScale} step={0.05} />
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            color: t.textMuted,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: 9,
            padding: '4px 0 0',
          }}
          onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.color = t.textSecondary}
          onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.color = t.textMuted}
        >
          <RotateCcw size={10} />
          Reset Transform
        </button>
      </Block>

      {/* Object info */}
      <Block title="MESH INFO">
        {[
          { label: 'Vertices', value: '18,432' },
          { label: 'Faces', value: '18,432' },
          { label: 'Triangles', value: '36,864' },
          { label: 'UV Sets', value: '2' },
          { label: 'Materials', value: '3' },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '4px 0',
              borderBottom: `1px solid ${t.divider}`,
            }}
          >
            <span style={{ color: t.textMuted, fontSize: 10 }}>{label}</span>
            <span style={{ color: t.textSecondary, fontSize: 10, fontWeight: 500 }}>{value}</span>
          </div>
        ))}
      </Block>
    </div>
  );
}

function MaterialTab({ matColor, setMatColor, roughness, setRoughness, metalness, setMetalness, opacity, setOpacity }: any) {
  const { t } = useTheme();
  const [activeMat, setActiveMat] = useState(0);
  const mats = [
    { name: 'Concrete', color: '#C2BAB0' },
    { name: 'Warm Oak', color: '#C8A870' },
    { name: 'Dark Steel', color: '#5A5550' },
    { name: 'Glass', color: '#90B8CC' },
  ];

  return (
    <div style={{ padding: '12px 16px' }}>
      {/* Material slot selector */}
      <Block title="MATERIAL SLOTS">
        <div style={{ display: 'flex', gap: 6, marginBottom: 0, flexWrap: 'wrap' }}>
          {mats.map((mat, i) => (
            <button
              key={mat.name}
              title={mat.name}
              onClick={() => setActiveMat(i)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 7,
                background: mat.color,
                border: activeMat === i
                  ? `2.5px solid ${t.accent}`
                  : `2px solid ${t.panelBorder}`,
                cursor: 'pointer',
                boxShadow: activeMat === i ? `0 0 0 1px ${t.accent}50` : 'none',
                transition: 'all 0.12s',
                flexShrink: 0,
              }}
            />
          ))}
          <button
            style={{
              width: 36,
              height: 36,
              borderRadius: 7,
              background: t.btnBg,
              border: `1.5px dashed ${t.panelBorder}`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: t.textMuted,
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            +
          </button>
        </div>
      </Block>

      {/* Material properties */}
      <Block title="BASE PROPERTIES">
        {/* Color picker */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: t.textSecondary, fontSize: 10 }}>Base Color</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="color"
              value={matColor}
              onChange={(e) => setMatColor(e.target.value)}
              style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                border: `1px solid ${t.inputBorder}`,
                cursor: 'pointer',
                padding: 2,
                background: 'transparent',
              }}
            />
            <div
              style={{
                background: t.inputBg,
                border: `1px solid ${t.inputBorder}`,
                borderRadius: 6,
                padding: '5px 10px',
                color: t.textPrimary,
                fontSize: 10,
                fontFamily: 'monospace',
                flex: 1,
              }}
            >
              {matColor.toUpperCase()}
            </div>
          </div>
        </div>

        <Slider label="Roughness" value={roughness} onChange={setRoughness} />
        <Slider label="Metalness" value={metalness} onChange={setMetalness} color="#8090B0" />
        <Slider label="Opacity" value={opacity} onChange={setOpacity} color="#A090C0" />
        <Slider label="Normal Scale" value={0.8} onChange={() => {}} color="#90A880" />
      </Block>

      {/* Texture maps */}
      <Block title="TEXTURE MAPS">
        {['Albedo', 'Normal', 'Roughness', 'AO'].map((map) => (
          <div
            key={map}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 0',
              borderBottom: `1px solid ${t.divider}`,
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 5,
                background: t.btnBg,
                border: `1px dashed ${t.panelBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Image size={10} style={{ color: t.textMuted }} />
            </div>
            <span style={{ flex: 1, color: t.textSecondary, fontSize: 10 }}>{map}</span>
            <span style={{ color: t.textMuted, fontSize: 9 }}>—</span>
          </div>
        ))}
      </Block>
    </div>
  );
}

function LightTab({ ambientIntensity, setAmbientIntensity, sunIntensity, setSunIntensity, sunAngle, setSunAngle, shadowSoftness, setShadowSoftness }: any) {
  const { t } = useTheme();
  const [activeEnv, setActiveEnv] = useState('Outdoor');

  return (
    <div style={{ padding: '12px 16px' }}>
      <Block title="AMBIENT">
        <Slider label="Intensity" value={ambientIntensity} max={2} onChange={setAmbientIntensity} color="#C8B890" />
        <Slider label="Exposure" value={1.05} min={0.1} max={3} onChange={() => {}} color="#D8C090" />
      </Block>

      <Block title="DIRECTIONAL (SUN)">
        <Slider label="Intensity" value={sunIntensity} max={4} onChange={setSunIntensity} color="#E8C880" />
        <Slider label="Azimuth" value={sunAngle} max={1} onChange={setSunAngle} color="#D0A860" />
        <Slider label="Elevation" value={0.45} max={1} onChange={() => {}} color="#C8A050" />
        <Slider label="Shadow Softness" value={shadowSoftness} onChange={setShadowSoftness} color="#9090B0" />
      </Block>

      <Block title="HDRI ENVIRONMENT">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          {['Studio', 'Outdoor', 'Interior', 'Sky', 'Dawn', 'Dusk'].map((env) => (
            <button
              key={env}
              onClick={() => setActiveEnv(env)}
              style={{
                padding: '7px 4px',
                borderRadius: 6,
                border: `1px solid ${activeEnv === env ? t.accent : t.panelBorder}`,
                background: activeEnv === env ? t.accentBg : t.btnBg,
                color: activeEnv === env ? t.accent : t.textMuted,
                fontSize: 9,
                cursor: 'pointer',
                fontWeight: activeEnv === env ? 600 : 400,
                letterSpacing: '0.03em',
                transition: 'all 0.12s',
              }}
            >
              {env}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <Slider label="HDRI Rotation" value={0.3} max={1} onChange={() => {}} color="#A0A8C8" />
          <Slider label="HDRI Intensity" value={0.7} max={2} onChange={() => {}} color="#A8B0D0" />
        </div>
      </Block>

      <Block title="RENDER QUALITY">
        <div style={{ display: 'flex', gap: 5 }}>
          {['Draft', 'Medium', 'High', 'RTX'].map((q) => (
            <button
              key={q}
              style={{
                flex: 1,
                padding: '6px 2px',
                borderRadius: 6,
                border: `1px solid ${q === 'High' ? t.accent : t.panelBorder}`,
                background: q === 'High' ? t.accentBg : t.btnBg,
                color: q === 'High' ? t.accent : q === 'RTX' ? '#7888C0' : t.textMuted,
                fontSize: 8,
                cursor: 'pointer',
                fontWeight: q === 'RTX' ? 700 : q === 'High' ? 600 : 400,
                letterSpacing: '0.03em',
                transition: 'all 0.12s',
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </Block>
    </div>
  );
}

function AITab({ isGenerating, generateProgress }: { isGenerating: boolean; generateProgress: number }) {
  const { t } = useTheme();
  const [prompt, setPrompt] = useState('');
  const [activeStyle, setActiveStyle] = useState('Minimalist');

  const styles = ['Brutalist', 'Minimalist', 'Organic', 'Industrial', 'Contemporary', 'Parametric'];

  const recentGens = [
    { label: 'Roof detail', color: '#2A2016' },
    { label: 'Glass facade', color: '#0E1420' },
    { label: 'Entry portal', color: '#141418' },
    { label: 'Column row', color: '#181210' },
    { label: 'Staircase', color: '#101610' },
    { label: 'Water feat.', color: '#0C1618' },
  ];

  return (
    <div style={{ padding: '12px 16px' }}>
      {/* Prompt */}
      <Block title="PROMPT">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the architectural element to generate..."
          disabled={isGenerating}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: t.textPrimary,
            fontSize: 11,
            resize: 'none',
            height: 72,
            lineHeight: 1.6,
            opacity: isGenerating ? 0.5 : 1,
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 8,
            borderTop: `1px solid ${t.divider}`,
          }}
        >
          <span style={{ color: t.textMuted, fontSize: 9 }}>{prompt.length} / 300</span>
          <div style={{ display: 'flex', gap: 5 }}>
            <button
              style={{
                padding: '3px 7px',
                borderRadius: 5,
                border: `1px solid ${t.panelBorder}`,
                background: t.btnBg,
                color: t.textMuted,
                fontSize: 9,
                cursor: 'pointer',
              }}
            >
              Enhance
            </button>
          </div>
        </div>
      </Block>

      {/* Style presets */}
      <Block title="STYLE">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {styles.map((style) => (
            <button
              key={style}
              onClick={() => !isGenerating && setActiveStyle(style)}
              style={{
                padding: '6px 4px',
                borderRadius: 6,
                border: `1px solid ${activeStyle === style ? t.accent : t.panelBorder}`,
                background: activeStyle === style ? t.accentBg : t.btnBg,
                color: activeStyle === style ? t.accent : t.textMuted,
                fontSize: 9,
                cursor: isGenerating ? 'not-allowed' : 'pointer',
                fontWeight: activeStyle === style ? 600 : 400,
                letterSpacing: '0.02em',
                transition: 'all 0.12s',
                opacity: isGenerating && activeStyle !== style ? 0.5 : 1,
              }}
            >
              {style}
            </button>
          ))}
        </div>
      </Block>

      {/* Generation state */}
      {isGenerating ? (
        <Block title="">
          {/* Progress ring + status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
              <svg width="36" height="36" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="14" fill="none" stroke={t.divider} strokeWidth="2.5" />
                <circle
                  cx="18" cy="18" r="14"
                  fill="none"
                  stroke={t.accent}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 14}`}
                  strokeDashoffset={`${2 * Math.PI * 14 * (1 - generateProgress / 100)}`}
                  transform="rotate(-90 18 18)"
                  style={{ transition: 'stroke-dashoffset 0.2s' }}
                />
              </svg>
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 8,
                  fontWeight: 700,
                  color: t.accent,
                }}
              >
                {Math.floor(generateProgress)}%
              </span>
            </div>
            <div>
              <div style={{ color: t.textPrimary, fontSize: 11, fontWeight: 500 }}>Generating…</div>
              <div style={{ color: t.textMuted, fontSize: 9, marginTop: 2 }}>
                AI Engine · {activeStyle} · RTX Active
              </div>
            </div>
          </div>
          <div style={{ height: 2, background: t.divider, borderRadius: 1, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${generateProgress}%`,
                background: `linear-gradient(90deg, ${t.accent}, ${t.accentLight})`,
                borderRadius: 1,
                transition: 'width 0.15s',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 8 }}>
            <Clock size={9} style={{ color: t.textMuted }} />
            <span style={{ color: t.textMuted, fontSize: 9 }}>
              Est. {Math.max(0, Math.ceil((100 - generateProgress) / 25))}s remaining
            </span>
          </div>
        </Block>
      ) : (
        <Block title="GENERATION">
          <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: t.textMuted, fontSize: 9, marginBottom: 5 }}>Quality</div>
              <div style={{ display: 'flex', gap: 3 }}>
                {['Fast', 'Balanced', 'Quality'].map((q, i) => (
                  <button
                    key={q}
                    style={{
                      flex: 1,
                      padding: '4px 2px',
                      borderRadius: 5,
                      border: `1px solid ${i === 1 ? t.accent : t.panelBorder}`,
                      background: i === 1 ? t.accentBg : t.btnBg,
                      color: i === 1 ? t.accent : t.textMuted,
                      fontSize: 8,
                      cursor: 'pointer',
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <Slider label="Iterations" value={0.5} onChange={() => {}} color="#8898C8" />
          <Slider label="Guidance Scale" value={0.7} onChange={() => {}} color="#98A8C8" />
        </Block>
      )}

      {/* Recent generations */}
      <Block title="RECENT GENERATIONS">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {recentGens.map((gen, i) => (
            <button
              key={i}
              style={{
                background: gen.color,
                border: `1px solid ${t.panelBorder}`,
                borderRadius: 6,
                overflow: 'hidden',
                cursor: 'pointer',
                padding: 0,
                transition: 'all 0.12s',
                aspectRatio: '1',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = t.accent + '80';
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.04)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = t.panelBorder;
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  padding: '0 0 4px',
                  background: `linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.5) 100%)`,
                  minHeight: 54,
                }}
              >
                <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 7, textAlign: 'center' }}>
                  {gen.label}
                </span>
              </div>
            </button>
          ))}
        </div>
      </Block>
    </div>
  );
}

// ─── Main RightPanel ──────────────────────────────────────────────────────────

type Tab = 'MODEL' | 'MATERIAL' | 'LIGHT' | 'AI';

interface RightPanelProps {
  isCollapsed: boolean;
  onToggle: () => void;
  isGenerating?: boolean;
  generateProgress?: number;
}

export function RightPanel({ isCollapsed, onToggle, isGenerating = false, generateProgress = 0 }: RightPanelProps) {
  const { t } = useTheme();

  const [activeTab, setActiveTab] = useState<Tab>('MODEL');

  const [position, setPosition] = useState({ x: 0.0, y: 0.0, z: 0.0 });
  const [rotation, setRotation] = useState({ x: 0.0, y: 0.0, z: 0.0 });
  const [scale, setScale] = useState({ x: 1.0, y: 1.0, z: 1.0 });
  const [matColor, setMatColor] = useState('#C2BAB0');
  const [roughness, setRoughness] = useState(0.88);
  const [metalness, setMetalness] = useState(0.02);
  const [opacity, setOpacity] = useState(1.0);
  const [ambientIntensity, setAmbientIntensity] = useState(0.8);
  const [sunIntensity, setSunIntensity] = useState(1.9);
  const [sunAngle, setSunAngle] = useState(0.62);
  const [shadowSoftness, setShadowSoftness] = useState(0.72);
  const [isVisible, setIsVisible] = useState(true);
  const [isLocked, setIsLocked] = useState(false);

  const tabs: Tab[] = ['MODEL', 'MATERIAL', 'LIGHT', 'AI'];

  // Switch to AI tab when generating starts
  React.useEffect(() => {
    if (isGenerating) setActiveTab('AI');
  }, [isGenerating]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        height: '100%',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        style={{
          position: 'absolute',
          left: isCollapsed ? 0 : -16,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 20,
          width: 16,
          height: 44,
          background: t.panelBg,
          border: `1px solid ${t.panelBorder}`,
          borderRight: isCollapsed ? `1px solid ${t.panelBorder}` : 'none',
          borderRadius: '6px 0 0 6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: t.textMuted,
          transition: 'all 0.25s',
        }}
        onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.color = t.accent}
        onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.color = t.textMuted}
      >
        {isCollapsed ? <ChevronLeft size={10} /> : <ChevronRight size={10} />}
      </button>

      {/* Panel body */}
      <div
        style={{
          width: isCollapsed ? 0 : 360,
          overflow: 'hidden',
          transition: 'width 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
          height: '100%',
          background: t.panelBg,
          borderLeft: `1px solid ${t.panelBorder}`,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ width: 360, height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Tab bar — top strip */}
          <div
            style={{
              display: 'flex',
              borderBottom: `1px solid ${t.divider}`,
              flexShrink: 0,
            }}
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    flex: 1,
                    padding: '0 0',
                    height: 42,
                    border: 'none',
                    borderBottom: isActive ? `2px solid ${t.accent}` : '2px solid transparent',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: isActive ? t.accent : t.textMuted,
                    fontSize: 9.5,
                    fontWeight: isActive ? 700 : 500,
                    letterSpacing: '0.08em',
                    transition: 'all 0.15s',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = t.textSecondary;
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = t.textMuted;
                  }}
                >
                  {tab}
                  {tab === 'AI' && isGenerating && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: t.accent,
                        boxShadow: `0 0 6px ${t.accent}`,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {activeTab === 'MODEL' && (
              <ModelTab
                position={position} setPosition={setPosition}
                rotation={rotation} setRotation={setRotation}
                scale={scale} setScale={setScale}
                isVisible={isVisible} setIsVisible={setIsVisible}
                isLocked={isLocked} setIsLocked={setIsLocked}
              />
            )}
            {activeTab === 'MATERIAL' && (
              <MaterialTab
                matColor={matColor} setMatColor={setMatColor}
                roughness={roughness} setRoughness={setRoughness}
                metalness={metalness} setMetalness={setMetalness}
                opacity={opacity} setOpacity={setOpacity}
              />
            )}
            {activeTab === 'LIGHT' && (
              <LightTab
                ambientIntensity={ambientIntensity} setAmbientIntensity={setAmbientIntensity}
                sunIntensity={sunIntensity} setSunIntensity={setSunIntensity}
                sunAngle={sunAngle} setSunAngle={setSunAngle}
                shadowSoftness={shadowSoftness} setShadowSoftness={setShadowSoftness}
              />
            )}
            {activeTab === 'AI' && (
              <AITab isGenerating={isGenerating} generateProgress={generateProgress} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
