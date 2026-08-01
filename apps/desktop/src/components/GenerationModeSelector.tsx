import type { GenerationMode } from "@/services/generationClient";

type GenerationModeSelectorProps = {
  value: GenerationMode;
  disabled?: boolean;
  onChange: (mode: GenerationMode) => void;
};

const modes: Array<{ id: GenerationMode; label: string; detail: string }> = [
  { id: "demo", label: "Demo", detail: "GLB de ejemplo" },
  { id: "quick", label: "Quick", detail: "TripoSR" },
  { id: "textured", label: "Texturizado", detail: "Hunyuan3D" },
  { id: "photogrammetry", label: "Fotogrametría", detail: "Meshroom" },
];

export function GenerationModeSelector({ value, disabled = false, onChange }: GenerationModeSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {modes.map((mode) => {
        const active = mode.id === value;
        return (
          <button
            key={mode.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(mode.id)}
            className={`rounded-[var(--radius-md)] border px-3 py-3 text-left transition-colors ${
              active
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-strong)]"
            }`}
          >
            <span className="block text-sm font-medium">{mode.label}</span>
            <span className="mt-1 block text-xs">{mode.detail}</span>
          </button>
        );
      })}
    </div>
  );
}
