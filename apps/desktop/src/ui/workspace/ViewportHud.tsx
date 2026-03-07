import { getWorkspaceModeDefinition, type WorkspaceMode } from "./modes";

type ViewportHudProps = {
  mode: WorkspaceMode;
  projectName: string;
  hasModel: boolean;
  wireframe: boolean;
  cameraTelemetry: unknown;
  modelStats: unknown;
  onSetWireframe: (nextValue: boolean) => void;
};

export function ViewportHud({
  mode,
  hasModel,
}: ViewportHudProps) {
  const modeDefinition = getWorkspaceModeDefinition(mode);
  const statusLabel = hasModel ? "Model loaded" : "Awaiting model";

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="flex items-start justify-between px-4 py-4">
        <div className="rounded-[12px] border border-[rgba(255,255,255,0.12)] bg-[rgba(17,15,13,0.4)] px-3 py-2 backdrop-blur-md">
          <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[rgba(243,239,234,0.62)]">
            {modeDefinition.shortLabel}
          </p>
          <p className="mt-0.5 text-[11px] text-[rgba(243,239,234,0.84)]">
            {statusLabel}
          </p>
        </div>
      </div>
    </div>
  );
}
