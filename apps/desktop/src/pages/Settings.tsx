import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button } from "@/ui/primitives";
import {
  generationClient,
  type LocalSettings,
  type ToolsStatusResponse,
} from "@/services/generationClient";
import { useSettings } from "@/volumia/settings/context";
import type { Theme as AppearanceTheme } from "@/volumia/settings/types";

const fields: Array<{
  key: keyof LocalSettings;
  label: string;
  placeholder: string;
}> = [
  {
    key: "VOLUMIA_PYTHON",
    label: "Python",
    placeholder: "F:\\MINICONDA\\envs\\volumia\\python.exe",
  },
  {
    key: "VOLUMIA_BLENDER",
    label: "Blender",
    placeholder:
      "C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe",
  },
  {
    key: "VOLUMIA_SKETCHUP",
    label: "SketchUp",
    placeholder: "C:\\Program Files\\SketchUp\\SketchUp 2026\\SketchUp.exe",
  },
  {
    key: "VOLUMIA_SKETCHUP_BRIDGE_DIR",
    label: "Carpeta Plugins de SketchUp",
    placeholder:
      "C:\\Users\\Usuario\\AppData\\Roaming\\SketchUp\\SketchUp 2026\\SketchUp\\Plugins",
  },
  {
    key: "VOLUMIA_TRIPOSR_DIR",
    label: "TripoSR",
    placeholder: "E:\\AI\\TripoSR",
  },
  {
    key: "VOLUMIA_HUNYUAN_DIR",
    label: "Hunyuan3D",
    placeholder: "E:\\AI\\Hunyuan3D-2.1",
  },
  {
    key: "VOLUMIA_HUNYUAN_MODEL_PATH",
    label: "Ruta del modelo Hunyuan",
    placeholder: "tencent/Hunyuan3D-2",
  },
  {
    key: "VOLUMIA_HUNYUAN_SHAPE_SUBFOLDER",
    label: "Subcarpeta shape de Hunyuan",
    placeholder: "hunyuan3d-dit-v2-0",
  },
  {
    key: "VOLUMIA_HUNYUAN_PAINT_SUBFOLDER",
    label: "Subcarpeta paint de Hunyuan",
    placeholder: "hunyuan3d-paint-v2-0-turbo",
  },
  {
    key: "VOLUMIA_MESHROOM_DIR",
    label: "Meshroom (sólo fotogrametría)",
    placeholder: "E:\\AI\\Meshroom",
  },
];

const rotationFields: Array<{
  key: keyof LocalSettings;
  label: string;
  placeholder: string;
}> = [
  {
    key: "VOLUMIA_QUICK_ROTATION_X",
    label: "Quick X grados",
    placeholder: "-90",
  },
  {
    key: "VOLUMIA_QUICK_ROTATION_Y",
    label: "Quick Y grados",
    placeholder: "0",
  },
  {
    key: "VOLUMIA_QUICK_ROTATION_Z",
    label: "Quick Z grados",
    placeholder: "0",
  },
  {
    key: "VOLUMIA_HUNYUAN_ROTATION_X",
    label: "Hunyuan X grados",
    placeholder: "0",
  },
  {
    key: "VOLUMIA_HUNYUAN_ROTATION_Y",
    label: "Hunyuan Y grados",
    placeholder: "0",
  },
  {
    key: "VOLUMIA_HUNYUAN_ROTATION_Z",
    label: "Hunyuan Z grados",
    placeholder: "0",
  },
];

function emptySettings(): LocalSettings {
  return {
    VOLUMIA_PYTHON: "",
    VOLUMIA_BLENDER: "",
    VOLUMIA_SKETCHUP: "",
    VOLUMIA_SKETCHUP_BRIDGE_DIR: "",
    VOLUMIA_TRIPOSR_DIR: "",
    VOLUMIA_HUNYUAN_DIR: "",
    VOLUMIA_HUNYUAN_MODEL_PATH: "tencent/Hunyuan3D-2",
    VOLUMIA_HUNYUAN_SHAPE_SUBFOLDER: "hunyuan3d-dit-v2-0",
    VOLUMIA_HUNYUAN_PAINT_SUBFOLDER: "hunyuan3d-paint-v2-0-turbo",
    VOLUMIA_MESHROOM_DIR: "",
    VOLUMIA_QUICK_ROTATION_X: "-90",
    VOLUMIA_QUICK_ROTATION_Y: "0",
    VOLUMIA_QUICK_ROTATION_Z: "0",
    VOLUMIA_HUNYUAN_ROTATION_X: "0",
    VOLUMIA_HUNYUAN_ROTATION_Y: "0",
    VOLUMIA_HUNYUAN_ROTATION_Z: "0",
  };
}

function fieldFromTools(
  key: keyof LocalSettings,
  tools: ToolsStatusResponse["tools"] | null,
) {
  if (!tools) return "";
  const entry = Object.values(tools).find((tool) => tool.env === key);
  return entry?.path ?? "";
}

function ThemeIcon({ kind }: { kind: "light" | "dark" | "system" }) {
  if (kind === "light") {
    return (
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
      </svg>
    );
  }
  if (kind === "dark") {
    return (
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z" />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

export function Settings() {
  const navigate = useNavigate();
  const {
    settings: appearanceSettings,
    resolvedTheme,
    systemTheme,
    setTheme,
    setThemeMode,
  } = useSettings();
  const [tools, setTools] = useState<ToolsStatusResponse["tools"] | null>(null);
  const [form, setForm] = useState<LocalSettings>(emptySettings());
  const [settingsPath, setSettingsPath] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [testingTool, setTestingTool] = useState<string | null>(null);
  const setThemePreference = (theme: AppearanceTheme) => {
    setTheme(theme);
  };

  const followSystemTheme = () => {
    setThemeMode("system");
  };

  const load = async () => {
    const response = await generationClient.settings();
    setTools(response.tools);
    setSettingsPath(response.settingsPath);
    const next = emptySettings();
    for (const field of fields) {
      next[field.key] =
        response.settings[field.key] ??
        fieldFromTools(field.key, response.tools);
    }
    for (const field of rotationFields) {
      next[field.key] = response.settings[field.key] ?? next[field.key] ?? "";
    }
    setForm(next);
  };

  useEffect(() => {
    void load().catch((error) => {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo leer la configuracion.",
      );
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const response = await generationClient.saveSettings(form);
      setTools(response.tools);
      setSettingsPath(response.settingsPath);
      setMessage("Rutas guardadas.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron guardar las rutas.",
      );
    } finally {
      setSaving(false);
    }
  };

  const detect = async () => {
    setDetecting(true);
    try {
      const response = await generationClient.detectTools();
      setTools(response.tools);
      setMessage("Deteccion actualizada.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo detectar herramientas.",
      );
    } finally {
      setDetecting(false);
    }
  };

  const toolItems = tools ? Object.entries(tools) : [];

  const testTool = async (
    key: "blender" | "sketchup" | "dae" | "sketchupBridge",
  ) => {
    setTestingTool(key);
    try {
      const response = await generationClient.testTool(key);
      setTools(response.tools);
      setMessage(response.result.details);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo ejecutar la prueba.",
      );
    } finally {
      setTestingTool(null);
    }
  };

  return (
    <main className="h-full min-h-0 overflow-y-auto overflow-x-hidden bg-[var(--background)] p-5 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--volumia-cyan)]">
              Configuración
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">
              Configuración local
            </h1>
          </div>
          <Button variant="secondary" onClick={() => navigate("/")}>
            Inicio
          </Button>
        </div>

        <section className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-faint)]">
              Apariencia
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
              Tema de la interfaz
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              Elegí cómo se muestra VOLUMIA. La opción del sistema se actualiza
              automáticamente.
            </p>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Button
              variant={
                appearanceSettings.themeMode === "manual" &&
                appearanceSettings.theme === "light"
                  ? "primary"
                  : "secondary"
              }
              aria-pressed={
                appearanceSettings.themeMode === "manual" &&
                appearanceSettings.theme === "light"
              }
              onClick={() => setThemePreference("light")}
            >
              <ThemeIcon kind="light" />
              <span className="ml-2">Claro</span>
            </Button>
            <Button
              variant={
                appearanceSettings.themeMode === "manual" &&
                appearanceSettings.theme === "dark"
                  ? "primary"
                  : "secondary"
              }
              aria-pressed={
                appearanceSettings.themeMode === "manual" &&
                appearanceSettings.theme === "dark"
              }
              onClick={() => setThemePreference("dark")}
            >
              <ThemeIcon kind="dark" />
              <span className="ml-2">Oscuro</span>
            </Button>
            <Button
              variant={
                appearanceSettings.themeMode === "system"
                  ? "primary"
                  : "secondary"
              }
              aria-pressed={appearanceSettings.themeMode === "system"}
              onClick={followSystemTheme}
            >
              <ThemeIcon kind="system" />
              <span className="ml-2">Sistema</span>
            </Button>
          </div>

          <p className="mt-3 text-xs text-[var(--text-secondary)]">
            {appearanceSettings.themeMode === "system"
              ? `Tema del sistema: ${systemTheme === "dark" ? "Oscuro" : "Claro"}`
              : `Tema aplicado: ${resolvedTheme === "dark" ? "Oscuro" : "Claro"}`}
          </p>
        </section>

        <section className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Rutas y herramientas
              </h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Se guardan en{" "}
                {settingsPath ||
                  "apps/desktop/backend/config/local.settings.json"}
                .
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={detecting}
                onClick={() => void detect()}
              >
                {detecting ? "Detectando..." : "Detectar herramientas"}
              </Button>
              <Button
                variant="primary"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "Guardando..." : "Guardar rutas"}
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            {fields.map((field) => (
              <label key={field.key} className="grid gap-2">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  {field.label}
                </span>
                <input
                  value={form[field.key] ?? ""}
                  placeholder={field.placeholder}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 font-mono text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--volumia-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                />
              </label>
            ))}
          </div>
          {message ? (
            <p className="mt-4 text-sm text-[var(--text-secondary)]">
              {message}
            </p>
          ) : null}
        </section>

        <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Orientación del pipeline
          </h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Estos grados se aplican en Blender antes de exportar el GLB final.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {rotationFields.map((field) => (
              <label key={field.key} className="grid gap-2">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  {field.label}
                </span>
                <input
                  value={form[field.key] ?? ""}
                  placeholder={field.placeholder}
                  inputMode="decimal"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 font-mono text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--volumia-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Estado de herramientas
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {toolItems.map(([key, tool]) => (
              <div
                key={key}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {tool.name}
                  </span>
                  <Badge
                    tone={
                      tool.verificationStatus === "Verificado"
                        ? "success"
                        : tool.verificationStatus === "Error"
                          ? "danger"
                          : "neutral"
                    }
                    dot
                  >
                    {tool.verificationStatus}
                  </Badge>
                </div>
                <p className="mt-3 break-all font-mono text-xs leading-5 text-[var(--text-secondary)]">
                  {tool.env}: {tool.path ?? "sin configurar"}
                </p>
                {tool.details ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {tool.details}
                  </p>
                ) : null}
                {key === "sketchupBridge" && tool.bundledPath ? (
                  <p className="mt-2 break-all text-xs leading-5 text-[var(--text-secondary)]">
                    Instalación: copiá{" "}
                    <span className="font-mono">VOLUMIA_Bridge.rb</span> desde{" "}
                    <span className="font-mono">{tool.bundledPath}</span> a
                    Plugins, configurá esa carpeta y abrí SketchUp una vez.
                  </p>
                ) : null}
                {(
                  ["blender", "sketchup", "dae", "sketchupBridge"] as const
                ).includes(
                  key as "blender" | "sketchup" | "dae" | "sketchupBridge",
                ) ? (
                  <Button
                    variant="secondary"
                    className="mt-3 h-8 text-xs"
                    disabled={testingTool !== null}
                    onClick={() =>
                      void testTool(
                        key as
                          | "blender"
                          | "sketchup"
                          | "dae"
                          | "sketchupBridge",
                      )
                    }
                  >
                    {testingTool === key ? "Probando..." : "Probar"}
                  </Button>
                ) : null}
              </div>
            ))}
            {!tools && (
              <p className="text-sm text-[var(--text-secondary)]">
                {message || "Cargando..."}
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
