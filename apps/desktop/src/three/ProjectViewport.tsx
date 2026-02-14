import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useT } from "@/volumia/i18n/useT";
import { useSettings } from "@/volumia/settings/context";
import { SceneMassing } from "./SceneMassing";

type ViewportSize = {
  width: number;
  height: number;
};

type FrameLimiterProps = {
  fpsLimit: 30 | 60 | 120;
};

function FrameLimiter({ fpsLimit }: FrameLimiterProps) {
  const { invalidate } = useThree();

  useEffect(() => {
    const frameDurationMs = Math.max(8, Math.round(1000 / fpsLimit));
    invalidate();

    const interval = window.setInterval(() => {
      invalidate();
    }, frameDurationMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [fpsLimit, invalidate]);

  return null;
}

export function ProjectViewport() {
  const { t } = useT();
  const { settings } = useSettings();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<ViewportSize>({ width: 0, height: 0 });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const updateSize = () => {
      setSize({
        width: host.clientWidth,
        height: host.clientHeight,
      });
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      const interval = window.setInterval(updateSize, 200);
      return () => window.clearInterval(interval);
    }

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const canRenderCanvas = size.width >= 10 && size.height >= 10;

  return (
    <div
      ref={hostRef}
      className="relative h-[360px] min-h-[300px] w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-[var(--shadow)] xl:h-full"
    >
      <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {t("project.viewport")}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-[10px] text-[var(--text-muted)]">
        {t("project.viewportHint")}
      </div>
      {canRenderCanvas ? (
        <Canvas
          key={`viewport-aa-${settings.antialias}-fps-${settings.fpsLimit}`}
          camera={{ position: [8, 6, 8], fov: 48, near: 0.1, far: 200 }}
          dpr={[1, 2]}
          frameloop="demand"
          gl={{ antialias: settings.antialias }}
        >
          <FrameLimiter fpsLimit={settings.fpsLimit} />
          <color attach="background" args={["#1a1511"]} />
          <ambientLight intensity={0.52} color="#d8ccb9" />
          <hemisphereLight args={["#d3c6b2", "#1b1511", 0.42]} />
          <directionalLight
            intensity={1.0}
            color="#f8f0e3"
            position={[10, 12, 8]}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          <SceneMassing />
          <OrbitControls makeDefault target={[0, 1.5, 0]} enableDamping dampingFactor={0.08} />
        </Canvas>
      ) : null}
    </div>
  );
}
