import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { desktopApi, hasDesktopBridge } from "@/electron/desktopApi";
import { Button } from "@/ui/primitives";
import {
  generationClient,
  type LocalSettings,
  type ToolsStatusResponse,
} from "@/services/generationClient";
import { applyResolvedThemeToDocument } from "@/ui/theme";
import { resolveTheme } from "@/volumia/settings/resolvers";
import {
  loadAppSettings as loadAppearanceSettings,
  saveAppSettings as saveAppearanceSettings,
} from "@/volumia/settings/storage";
import type {
  AppSettings as AppearanceSettings,
  Theme as AppearanceTheme,
} from "@/volumia/settings/types";

const fields: Array<{ key: keyof LocalSettings; label: string; placeholder: string }> = [
  {
    key: "VOLUMIA_PYTHON",
    label: "Python",
    placeholder: "F:\\MINICONDA\\envs\\volumia\\python.exe",
  },
  {
    key: "VOLUMIA_BLENDER",
    label: "Blender",
    placeholder: "C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe",
  },
  {
    key: "VOLUMIA_SKETCHUP",
    label: "SketchUp",
    placeholder: "C:\\Program Files\\SketchUp\\SketchUp 2026\\SketchUp.exe",
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
    label: "Hunyuan model path",
    placeholder: "tencent/Hunyuan3D-2",
  },
  {
    key: "VOLUMIA_HUNYUAN_SHAPE_SUBFOLDER",
    label: "Hunyuan shape subfolder",
    placeholder: "hunyuan3d-dit-v2-0",
  },
  {
    key: "VOLUMIA_HUNYUAN_PAINT_SUBFOLDER",
    label: "Hunyuan paint subfolder",
    placeholder: "hunyuan3d-paint-v2-0-turbo",
  },
  {
    key: "VOLUMIA_MESHROOM_DIR",
    label: "Meshroom",
    placeholder: "E:\\AI\\Meshroom",
  },
];

const rotationFields: Array<{ key: keyof LocalSettings; label: string; placeholder: string }> = [
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

function detectSystemTheme(): AppearanceTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function fieldFromTools(key: keyof LocalSettings, tools: ToolsStatusResponse["tools"] | null) {
  if (!tools) return "";
  const entry = Object.values(tools).find((tool) => tool.env === key);
  return entry?.path ?? "";
}

export function Settings() {
  const navigate = useNavigate();
  const [tools, setTools] = useState<ToolsStatusResponse["tools"] | null>(null);
  const [form, setForm] = useState<LocalSettings>(emptySettings());
  const [settingsPath, setSettingsPath] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [appearanceSettings, setAppearanceSettings] =
    useState<AppearanceSettings>(() => loadAppearanceSettings());
  const [systemTheme, setSystemTheme] = useState<AppearanceTheme>(() =>
    detectSystemTheme(),
  );

  const resolvedTheme = useMemo(
    () => resolveTheme(appearanceSettings, systemTheme, new Date()),
    [appearanceSettings, systemTheme],
  );

  useEffect(() => {
    saveAppearanceSettings(appearanceSettings);
    applyResolvedThemeToDocument(resolvedTheme, {
      colorway: appearanceSettings.colorway,
      glassStyle: appearanceSettings.glassStyle,
      reduceMotion: appearanceSettings.reduceMotion,
    });
  }, [appearanceSettings, resolvedTheme]);

  useEffect(() => {
    if (!hasDesktopBridge()) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => setSystemTheme(detectSystemTheme());
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    let active = true;
    const unsubscribe = desktopApi.onSystemThemeChanged(setSystemTheme);
    void desktopApi
      .getSystemTheme()
      .then((theme) => {
        if (active) setSystemTheme(theme);
      })
      .catch(() => undefined);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const setThemePreference = (theme: AppearanceTheme) => {
    setAppearanceSettings((current) => ({
      ...current,
      themeMode: "manual",
      theme,
    }));
  };

  const followSystemTheme = () => {
    setAppearanceSettings((current) => ({
      ...current,
      themeMode: "system",
    }));
  };

  const load = async () => {
    const response = await generationClient.settings();
    setTools(response.tools);
    setSettingsPath(response.settingsPath);
    const next = emptySettings();
    for (const field of fields) {
      next[field.key] = response.settings[field.key] ?? fieldFromTools(field.key, response.tools);
    }
    for (const field of rotationFields) {
      next[field.key] = response.settings[field.key] ?? next[field.key] ?? "";
    }
    setForm(next);
  };

  useEffect(() => {
    void load().catch((error) => {
      setMessage(error instanceof Error ? error.message : "No se pudo leer la configuracion.");
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
      setMessage(error instanceof Error ? error.message : "No se pudieron guardar las rutas.");
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
      setMessage(error instanceof Error ? error.message : "No se pudo detectar herramientas.");
    } finally {
      setDetecting(false);
    }
  };

  const toolItems = tools ? Object.entries(tools) : [];

  return (
    <main className="h-full min-h-0 overflow-y-auto p-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-faint)]">Settings</p>
            <h1 className="mt-2 text-3xl font-medium text-[var(--text)]">Configuracion local</h1>
          </div>
          <Button variant="secondary" onClick={() => navigate("/")}>
            Inicio
          </Button>
        </div>

        <section className="mt-8 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-faint)]">
              Apariencia
            </p>
            <h2 className="mt-1 text-lg font-medium text-[var(--text)]">
              Tema de la interfaz
            </h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Elegí cómo se muestra VOLUMIA. La opción del sistema se actualiza automáticamente.
            </p>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
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
              Oscuro
            </Button>
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
              Claro
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
              Igual al sistema
            </Button>
          </div>

          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {appearanceSettings.themeMode === "system"
              ? `Tema del sistema: ${systemTheme === "dark" ? "Oscuro" : "Claro"}`
              : `Tema aplicado: ${resolvedTheme === "dark" ? "Oscuro" : "Claro"}`}
          </p>
        </section>

        <section className="mt-8 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium text-[var(--text)]">Rutas reales</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Se guardan en {settingsPath || "apps/desktop/backend/config/local.settings.json"}.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={detecting} onClick={() => void detect()}>
                {detecting ? "Detectando..." : "Detectar herramientas"}
              </Button>
              <Button variant="primary" disabled={saving} onClick={() => void save()}>
                {saving ? "Guardando..." : "Guardar rutas"}
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            {fields.map((field) => (
              <label key={field.key} className="grid gap-2">
                <span className="text-xs font-medium text-[var(--text-muted)]">{field.label}</span>
                <input
                  value={form[field.key] ?? ""}
                  placeholder={field.placeholder}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  className="h-10 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)]"
                />
              </label>
            ))}
          </div>
          {message ? <p className="mt-4 text-sm text-[var(--text-muted)]">{message}</p> : null}
        </section>

        <section className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <h2 className="text-sm font-medium text-[var(--text)]">Orientacion del pipeline</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Estos grados se aplican en Blender antes de exportar el GLB final.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {rotationFields.map((field) => (
              <label key={field.key} className="grid gap-2">
                <span className="text-xs font-medium text-[var(--text-muted)]">{field.label}</span>
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
                  className="h-10 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)]"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <h2 className="text-sm font-medium text-[var(--text)]">Estado real</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {toolItems.map(([key, tool]) => (
              <div key={key} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-[var(--text)]">{tool.name}</span>
                  <span className={tool.exists ? "text-xs text-[var(--status-success)]" : "text-xs text-[var(--text-faint)]"}>
                    {tool.status}
                  </span>
                </div>
                <p className="mt-2 break-all text-xs text-[var(--text-muted)]">{tool.env}: {tool.path ?? "sin configurar"}</p>
                {tool.details ? <p className="mt-1 text-xs text-[var(--text-faint)]">{tool.details}</p> : null}
              </div>
            ))}
            {!tools && <p className="text-sm text-[var(--text-muted)]">{message || "Cargando..."}</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
