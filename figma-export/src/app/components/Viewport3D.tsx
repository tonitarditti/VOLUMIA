import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';

// ─── Math Helpers ────────────────────────────────────────────────────────────

interface Vec3 { x: number; y: number; z: number; }

function shade(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(255, Math.round(r * factor))},${Math.min(255, Math.round(g * factor))},${Math.min(255, Math.round(b * factor))})`;
}

// World-to-camera transform
function worldToCam(v: Vec3, target: Vec3, theta: number, phi: number, dist: number): Vec3 {
  let px = v.x - target.x;
  let py = v.y - target.y;
  let pz = v.z - target.z;

  // Rotate Y by -theta (azimuth)
  const cosT = Math.cos(-theta), sinT = Math.sin(-theta);
  const rx = px * cosT - pz * sinT;
  const rz = px * sinT + pz * cosT;
  px = rx; pz = rz;

  // Rotate X by -phi (elevation)
  const cosP = Math.cos(-phi), sinP = Math.sin(-phi);
  const ry = py * cosP - pz * sinP;
  const rz2 = py * sinP + pz * cosP;
  py = ry; pz = rz2;

  return { x: px, y: py, z: pz - dist };
}

function project(p: Vec3, fov: number, cx: number, cy: number): [number, number] | null {
  const depth = -p.z;
  if (depth < 0.01) return null;
  const scale = fov / depth;
  return [cx + p.x * scale, cy - p.y * scale];
}

// ─── Face Definition ─────────────────────────────────────────────────────────

interface RenderFace {
  points: Vec3[];   // world-space
  baseColor: string;
  lightFactor: number; // 0..1 light multiplier
  depth?: number;
  alpha?: number;
}

// Build a box from world-space corner + dimensions
function makeBox(
  ox: number, oy: number, oz: number,
  w: number, h: number, d: number,
  baseColor: string,
  alpha = 1.0,
): RenderFace[] {
  // 8 corners
  const v = (dx: number, dy: number, dz: number): Vec3 => ({
    x: ox + dx * w, y: oy + dy * h, z: oz + dz * d,
  });

  // top=0.9, front=0.65, right=0.65, back/left/bottom=0.38
  return [
    // top (+Y)
    { points: [v(0,1,0), v(1,1,0), v(1,1,1), v(0,1,1)], baseColor, lightFactor: 0.92, alpha },
    // front (+Z) – toward camera default
    { points: [v(0,0,1), v(1,0,1), v(1,1,1), v(0,1,1)], baseColor, lightFactor: 0.68, alpha },
    // right (+X)
    { points: [v(1,0,0), v(1,0,1), v(1,1,1), v(1,1,0)], baseColor, lightFactor: 0.62, alpha },
    // left (-X)
    { points: [v(0,0,0), v(0,0,1), v(0,1,1), v(0,1,0)], baseColor, lightFactor: 0.38, alpha },
    // back (-Z)
    { points: [v(0,0,0), v(1,0,0), v(1,1,0), v(0,1,0)], baseColor, lightFactor: 0.42, alpha },
    // bottom (-Y) – usually hidden but include for completeness
    { points: [v(0,0,0), v(1,0,0), v(1,0,1), v(0,0,1)], baseColor, lightFactor: 0.25, alpha },
  ];
}

// ─── Scene Definition ─────────────────────────────────────────────────────────

function buildSceneFaces(isDark: boolean): RenderFace[] {
  // Material colors
  const concrete = isDark ? '#575250' : '#C2BAB0';
  const concreteDark = isDark ? '#464240' : '#B2AAA0';
  const platform = isDark ? '#3A3530' : '#D0CAC0';
  const roofColor = isDark ? '#484440' : '#B0A89C';
  const warmWood = isDark ? '#7A5C3C' : '#CAAA7A';
  const glassColor = isDark ? '#6890A8' : '#90B8CC';
  const groundColor = isDark ? '#1A1816' : '#E4DFD6';
  const treeColor = isDark ? '#384228' : '#6A8050';
  const tree2Color = isDark ? '#2E3820' : '#587040';
  const trunkColor = '#5A4A38';
  const waterColor = isDark ? '#1A2840' : '#78AAC0';
  const wallColor = isDark ? '#706C66' : '#B8B2A8';

  const faces: RenderFace[] = [];

  // Base platform
  faces.push(...makeBox(-4.5, -0.12, -3.5, 9, 0.14, 8, platform));
  // Main concrete volume
  faces.push(...makeBox(-3.2, 0.02, -2.1, 5.2, 2.72, 4.4, concrete));
  // Wing volume
  faces.push(...makeBox(2.0, 0.02, -0.9, 3.4, 1.92, 3.4, concreteDark));
  // Floating roof canopy
  faces.push(...makeBox(-4.2, 2.74, -3.2, 8.8, 0.22, 7.8, roofColor));
  // Overhang right extension
  faces.push(...makeBox(4.6, 2.73, -3.0, 1.4, 0.20, 7.5, roofColor));
  // Warm wood panel (west face supplement)
  faces.push(...makeBox(-3.22, 0.05, -1.8, 0.08, 2.38, 3.5, warmWood));
  // Glass curtain wall (south face, thin)
  faces.push(...makeBox(-3.1, 0.08, 2.28, 4.9, 2.56, 0.08, glassColor, 0.38));
  // Glass wing front
  faces.push(...makeBox(2.1, 0.08, 2.42, 3.1, 1.78, 0.07, glassColor, 0.32));
  // Privacy wall (left side extending)
  faces.push(...makeBox(-4.25, 0.02, -2.0, 0.12, 1.85, 6.5, wallColor));
  // Threshold step
  faces.push(...makeBox(-1.5, 0.02, 2.28, 2.0, 0.1, 0.42, platform));

  // Horizontal accent strips on south face (decorative)
  for (let i = 0; i < 3; i++) {
    faces.push(...makeBox(-3.12, 0.9 + i * 0.9, 2.26, 5.0, 0.05, 0.08, concreteDark));
  }

  // Water feature
  faces.push(...makeBox(3.0, -0.04, -3.2, 3.6, 0.08, 2.0, waterColor, 0.75));
  faces.push(...makeBox(2.9, -0.06, -3.3, 3.8, 0.10, 2.2, platform)); // border

  // Trees
  const treeDefs = [
    { x: -5.4, z: -1.8, r: 0.95, c: treeColor },
    { x: -5.0, z: 2.4, r: 0.78, c: tree2Color },
    { x: 5.5, z: -3.4, r: 0.68, c: treeColor },
  ];
  treeDefs.forEach(({ x, z, r, c }) => {
    // trunk
    faces.push(...makeBox(x - 0.07, 0.02, z - 0.07, 0.14, 1.5, 0.14, trunkColor));
    // canopy (cube approximation)
    const rs = r * 1.2;
    faces.push(...makeBox(x - rs / 2, 1.5, z - rs / 2, rs, rs, rs, c));
  });

  return faces;
}

// Ground grid lines
function buildGrid(isDark: boolean): { from: Vec3; to: Vec3; color: string }[] {
  const lines: { from: Vec3; to: Vec3; color: string }[] = [];
  const color = isDark ? '#3A3630' : '#C8BFB0';
  const majorColor = isDark ? '#524E46' : '#B0A898';
  const SIZE = 14;
  const STEP = 1;
  for (let i = -SIZE; i <= SIZE; i += STEP) {
    const isMajor = i % 5 === 0;
    const c = isMajor ? majorColor : color;
    lines.push({ from: { x: i, y: 0, z: -SIZE }, to: { x: i, y: 0, z: SIZE }, color: c });
    lines.push({ from: { x: -SIZE, y: 0, z: i }, to: { x: SIZE, y: 0, z: i }, color: c });
  }
  return lines;
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

export function Viewport3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { isDark, t } = useTheme();

  // Camera state
  const theta = useRef(0.52);  // azimuth  ~30°
  const phi = useRef(0.55);    // elevation ~31.5°
  const dist = useRef(22);
  const target = useRef<Vec3>({ x: 0, y: 1.2, z: 0 });

  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const isPanning = useRef(false);

  const [camInfo, setCamInfo] = useState({ theta: 0.52, phi: 0.55, dist: 22 });
  const [viewMode, setViewMode] = useState<'solid' | 'wireframe'>('solid');
  const animFrame = useRef(0);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = isDark ? '#141416' : '#EAEAE0';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2 + h * 0.08; // shift down slightly

    const fov = Math.min(w, h) * 0.85;
    const th = theta.current;
    const ph = phi.current;
    const ds = dist.current;
    const tgt = target.current;

    const toScreen = (v: Vec3) => {
      const cam = worldToCam(v, tgt, th, ph, ds);
      return project(cam, fov, cx, cy);
    };

    // Compute face depth for painter's sort
    const toDepth = (v: Vec3): number => {
      const cam = worldToCam(v, tgt, th, ph, ds);
      return cam.z; // more negative = farther
    };

    // ─── Draw Grid ───────────────────────────────────────────────────────────
    const gridLines = buildGrid(isDark);
    ctx.lineWidth = 0.5;
    gridLines.forEach(({ from, to, color }) => {
      const a = toScreen(from);
      const b = toScreen(to);
      if (!a || !b) return;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.strokeStyle = color;
      ctx.globalAlpha = color.startsWith('#52') || color.startsWith('#42') ? 0.55 : 0.28;
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // ─── Draw Scene Faces ────────────────────────────────────────────────────
    const faces = buildSceneFaces(isDark);

    // Compute depths
    const facesWithDepth = faces.map((f) => {
      const depths = f.points.map(toDepth);
      const avgDepth = depths.reduce((a, b) => a + b, 0) / depths.length;
      return { ...f, depth: avgDepth };
    });

    // Sort back-to-front (more negative z = farther away = draw first)
    facesWithDepth.sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));

    if (viewMode === 'solid') {
      facesWithDepth.forEach((face) => {
        const pts = face.points.map(toScreen);
        if (pts.some((p) => p === null)) return;
        const validPts = pts as [number, number][];

        ctx.beginPath();
        ctx.moveTo(validPts[0][0], validPts[0][1]);
        validPts.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.closePath();

        const finalColor = shade(face.baseColor, face.lightFactor);
        ctx.globalAlpha = face.alpha ?? 1.0;
        ctx.fillStyle = finalColor;
        ctx.fill();

        // Subtle edge line for depth reading
        ctx.lineWidth = 0.4;
        ctx.strokeStyle = isDark
          ? `rgba(0,0,0,0.30)`
          : `rgba(255,255,255,0.25)`;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    } else {
      // Wireframe mode
      facesWithDepth.forEach((face) => {
        const pts = face.points.map(toScreen);
        if (pts.some((p) => p === null)) return;
        const validPts = pts as [number, number][];

        ctx.beginPath();
        ctx.moveTo(validPts[0][0], validPts[0][1]);
        validPts.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.closePath();
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = t.accent + 'CC';
        ctx.globalAlpha = 0.9;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }

    // ─── Ground shadow ───────────────────────────────────────────────────────
    if (viewMode === 'solid') {
      // Draw subtle shadow ellipses under buildings
      [
        { x: -0.5, z: 0, rx: 4.5, rz: 3.5 },
        { x: 3.5, z: 1.0, rx: 2.5, rz: 2.0 },
      ].forEach(({ x, z, rx, rz }) => {
        const center = toScreen({ x, y: 0.01, z });
        if (!center) return;

        // Project 4 shadow edge points to find the ellipse in screen space
        const right = toScreen({ x: x + rx, y: 0.01, z });
        const back = toScreen({ x, y: 0.01, z: z - rz });
        if (!right || !back) return;

        const screenRx = Math.abs(right[0] - center[0]);
        const screenRy = Math.abs(center[1] - back[1]);

        ctx.save();
        ctx.beginPath();
        ctx.ellipse(center[0], center[1], screenRx * 1.1, screenRy * 0.6, 0, 0, Math.PI * 2);
        const shadowColor = isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.12)';
        ctx.fillStyle = shadowColor;
        ctx.filter = 'blur(8px)';
        ctx.fill();
        ctx.restore();
      });
    }

    // Update camera info
    setCamInfo({ theta: th, phi: ph, dist: ds });
  }, [isDark, viewMode, t.accent]);

  // Animation loop
  useEffect(() => {
    const loop = () => {
      render();
      animFrame.current = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animFrame.current);
  }, [render]);

  // Mouse interaction
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    isPanning.current = e.button === 2;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };

    if (isPanning.current) {
      // Pan
      const panSpeed = 0.01 * dist.current / 10;
      const tgt = target.current;
      const cosT = Math.cos(theta.current), sinT = Math.sin(theta.current);
      tgt.x -= (dx * cosT) * panSpeed;
      tgt.z -= (dx * sinT) * panSpeed;
      tgt.y += dy * panSpeed * 0.5;
      target.current = { ...tgt };
    } else {
      // Orbit
      theta.current -= dx * 0.007;
      phi.current = Math.max(0.08, Math.min(Math.PI / 2.1, phi.current - dy * 0.005));
    }
  }, []);

  const onMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    dist.current = Math.max(5, Math.min(50, dist.current + e.deltaY * 0.02));
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => render());
    ro.observe(container);
    return () => ro.disconnect();
  }, [render]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%', cursor: 'default', userSelect: 'none' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
      onContextMenu={onContextMenu}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />

      {/* ─── Top Left: Viewport label + Camera info ─── */}
      <div
        style={{ position: 'absolute', top: 14, left: 14, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 5, pointerEvents: 'none' }}
      >
        <div style={{ background: t.panelBg, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: `1px solid ${t.panelBorder}`, borderRadius: 7, padding: '5px 11px', display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.accent }} />
          <span style={{ color: t.textPrimary, fontSize: 10, fontWeight: 600, letterSpacing: '0.07em' }}>PERSPECTIVE</span>
          <span style={{ color: t.textMuted, fontSize: 9 }}>·  44°</span>
        </div>
        <div style={{ background: t.panelBg, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: `1px solid ${t.panelBorder}`, borderRadius: 7, padding: '5px 11px' }}>
          <div style={{ display: 'flex', gap: 11 }}>
            {[
              { label: 'AZ', value: `${(camInfo.theta * 180 / Math.PI).toFixed(0)}°`, color: '#D06050' },
              { label: 'EL', value: `${(camInfo.phi * 180 / Math.PI).toFixed(0)}°`, color: '#60A060' },
              { label: 'D', value: `${camInfo.dist.toFixed(1)}`, color: '#5080D0' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', gap: 4 }}>
                <span style={{ color, fontSize: 9, fontWeight: 700 }}>{label}</span>
                <span style={{ color: t.textSecondary, fontSize: 9 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Top Right: Controls ─── */}
      <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 20, display: 'flex', gap: 5 }}>
        <div style={{ background: t.panelBg, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: `1px solid ${t.panelBorder}`, borderRadius: 7, padding: 3, display: 'flex', gap: 1 }}>
          {(['solid', 'wireframe'] as const).map((mode) => (
            <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: '4px 9px', borderRadius: 5, fontSize: 9, fontWeight: 500, letterSpacing: '0.04em', border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: viewMode === mode ? t.accentBg : 'transparent', color: viewMode === mode ? t.accent : t.textMuted, pointerEvents: 'auto' }}>
              {mode === 'solid' ? 'SOLID' : 'WIRE'}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Top Center: Stats ─── */}
      <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 20, pointerEvents: 'none' }}>
        <div style={{ background: t.panelBg, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: `1px solid ${t.panelBorder}`, borderRadius: 7, padding: '4px 14px', display: 'flex', gap: 14, alignItems: 'center' }}>
          {[{ label: 'VERTS', value: '18.4K' }, { label: 'FACES', value: '36.8K' }, { label: 'OBJS', value: '16' }, { label: 'LIGHTS', value: '3' }].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ color: t.textMuted, fontSize: 8, letterSpacing: '0.07em' }}>{label}</span>
              <span style={{ color: t.textSecondary, fontSize: 9, fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Bottom Left: Control hints ─── */}
      <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 20, pointerEvents: 'none' }}>
        <div style={{ background: t.panelBg, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: `1px solid ${t.panelBorder}`, borderRadius: 7, padding: '5px 12px', display: 'flex', gap: 14 }}>
          {[{ key: 'Drag', action: 'Orbit' }, { key: 'RMB', action: 'Pan' }, { key: 'Scroll', action: 'Zoom' }].map(({ key, action }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ background: t.btnBg, border: `1px solid ${t.panelBorder}`, borderRadius: 3, padding: '1px 5px', color: t.textSecondary, fontSize: 8, fontWeight: 600 }}>{key}</span>
              <span style={{ color: t.textMuted, fontSize: 9 }}>{action}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Bottom Right: Gizmo ─── */}
      <div style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 20, pointerEvents: 'none' }}>
        <div style={{ width: 72, height: 72, background: t.panelBg, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: `1px solid ${t.panelBorder}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="60" height="60" viewBox="0 0 60 60">
            <circle cx="30" cy="30" r="26" stroke={t.divider} strokeWidth="1" fill="none" />
            <line x1="30" y1="30" x2="52" y2="30" stroke="#D06050" strokeWidth="1.5" />
            <circle cx="54" cy="30" r="3.5" fill="#D06050" />
            <text x="54" y="33.5" textAnchor="middle" fontSize="5.5" fill="#D06050" fontWeight="bold">X</text>
            <line x1="30" y1="30" x2="30" y2="8" stroke="#60A060" strokeWidth="1.5" />
            <circle cx="30" cy="5.5" r="3.5" fill="#60A060" />
            <text x="30" y="9" textAnchor="middle" fontSize="5.5" fill="#60A060" fontWeight="bold">Y</text>
            <line x1="30" y1="30" x2="13" y2="43" stroke="#5080D0" strokeWidth="1.5" />
            <circle cx="11" cy="45" r="3.5" fill="#5080D0" />
            <text x="11" y="48.5" textAnchor="middle" fontSize="5.5" fill="#5080D0" fontWeight="bold">Z</text>
            <circle cx="30" cy="30" r="3" fill={t.textSecondary} />
          </svg>
        </div>
      </div>

      {/* ─── Project Label (floating watermark) ─── */}
      <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 20, pointerEvents: 'none' }}>
        <div style={{ background: t.panelBg, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: `1px solid ${t.panelBorder}`, borderRadius: 7, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: t.accent, opacity: 0.8 }} />
          <span style={{ color: t.textMuted, fontSize: 9 }}>Pavilion_01</span>
          <span style={{ color: t.textMuted, fontSize: 9 }}>·</span>
          <span style={{ color: t.accent, fontSize: 9, fontWeight: 600 }}>VOLUMIA</span>
        </div>
      </div>
    </div>
  );
}