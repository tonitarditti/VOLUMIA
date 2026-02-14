import type { ThemeMode } from "@/projects/types";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { TextField } from "@/ui/Input";

type SettingsPageProps = {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  aiApiKeyPlaceholder: string;
  onAiApiKeyPlaceholderChange: (value: string) => void;
  onImport: () => Promise<void>;
  onExport: () => Promise<void>;
};

export function SettingsPage({
  theme,
  onThemeChange,
  aiApiKeyPlaceholder,
  onAiApiKeyPlaceholderChange,
  onImport,
  onExport,
}: SettingsPageProps) {
  return (
    <div className="grid h-full w-full grid-cols-1 gap-5 xl:grid-cols-2">
      <Card className="p-5">
        <p className="text-[11px] uppercase tracking-[0.2em] text-volume-muted">Workspace</p>
        <h1 className="mt-1 text-xl font-semibold tracking-[0.03em]">Appearance</h1>
        <p className="mt-2 text-sm text-volume-muted">Set workspace visual mode.</p>

        <div className="mt-4 flex gap-2">
          <Button
            variant={theme === "dark" ? "primary" : "secondary"}
            onClick={() => onThemeChange("dark")}
            className="min-w-24"
          >
            Dark
          </Button>
          <Button
            variant={theme === "light" ? "primary" : "secondary"}
            onClick={() => onThemeChange("light")}
            className="min-w-24"
          >
            Light
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <p className="text-[11px] uppercase tracking-[0.2em] text-volume-muted">Data</p>
        <h2 className="mt-1 text-xl font-semibold tracking-[0.03em]">Project Data</h2>
        <p className="mt-2 text-sm text-volume-muted">Transfer projects as JSON between local environments.</p>

        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="min-w-28" onClick={() => void onImport()}>
            Import JSON
          </Button>
          <Button variant="secondary" className="min-w-28" onClick={() => void onExport()}>
            Export JSON
          </Button>
        </div>
      </Card>

      <Card className="p-5 xl:col-span-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-volume-muted">Integration</p>
        <h2 className="mt-1 text-xl font-semibold tracking-[0.03em]">AI Integration</h2>
        <p className="mt-2 text-sm text-volume-muted">Reserved field for future API key integration.</p>
        <div className="mt-4 max-w-xl">
          <TextField
            type="password"
            value={aiApiKeyPlaceholder}
            onChange={(event) => onAiApiKeyPlaceholderChange(event.target.value)}
            placeholder="Future API key placeholder"
            aria-label="Future AI API key"
          />
        </div>
      </Card>
    </div>
  );
}
