const fs = require("fs");
const path = require("path");
const os = require("os");

const packageRoot = path.resolve(__dirname, "..");
const defaultConfigPath = path.join(packageRoot, "backend", "config", "comfy.default.json");
const legacyConfigPath = path.join(packageRoot, "backend", "config", "default.json");
const userConfigPath = path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "volumia", "config", "comfy.user.json");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function loadConfig() {
  const base = readJson(defaultConfigPath) || readJson(legacyConfigPath) || {};
  const user = readJson(userConfigPath) || {};
  const comfyBase = base.comfy || {};
  const comfyUser = user.comfy || {};

  const host = comfyUser.host || comfyBase.host || "127.0.0.1";
  const port = Number.parseInt(String(comfyUser.port || comfyBase.port || 8188), 10) || 8188;
  const baseUrl = comfyUser.baseUrl || comfyBase.baseUrl || `http://${host}:${port}`;

  return {
    comfy: {
      host,
      port,
      baseUrl,
      comfyDir: comfyUser.comfyDir || comfyBase.comfyDir || comfyBase.rootDir || "",
      condaHook: comfyUser.condaHook || comfyBase.condaHook || "",
      condaEnvName: comfyUser.condaEnvName || comfyBase.condaEnvName || "",
      pythonExeOverride: comfyUser.pythonExeOverride || comfyBase.pythonExeOverride || comfyBase.pythonExe || "",
      args: comfyUser.args || comfyBase.args || [],
      startupTimeoutMs: comfyUser.startupTimeoutMs || comfyBase.startupTimeoutMs || 90000,
    },
  };
}

async function checkComfy(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${url}/system_stats`, { signal: controller.signal });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      bodyPreview: body.slice(0, 400),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      bodyPreview: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const config = loadConfig();
  const comfy = config.comfy ?? {};
  const url = typeof comfy.baseUrl === "string" ? comfy.baseUrl : `http://${comfy.host ?? "127.0.0.1"}:${comfy.port ?? 8188}`;
  let host = "127.0.0.1";
  let port = 8188;
  try {
    const parsed = new URL(url);
    host = parsed.hostname || host;
    port = Number.parseInt(parsed.port || "8188", 10);
  } catch {
    // keep defaults
  }

  console.log("[backend:status] configPath:", defaultConfigPath);
  console.log("[backend:status] userOverridePath:", userConfigPath);
  console.log(
    "[backend:status] comfy config:",
    JSON.stringify(
      {
        baseUrl: url,
        host,
        port,
        comfyDir: comfy.comfyDir,
        condaHook: comfy.condaHook,
        condaEnvName: comfy.condaEnvName,
        pythonExeOverride: comfy.pythonExeOverride,
        args: comfy.args,
        startupTimeoutMs: comfy.startupTimeoutMs,
      },
      null,
      2
    )
  );

  const result = await checkComfy(url);
  console.log(`[backend:status] GET ${url}/system_stats => ${result.status} (ok=${result.ok})`);
  console.log("[backend:status] response:", result.bodyPreview);
  process.exitCode = result.ok ? 0 : 1;
}

main().catch((error) => {
  console.error("[backend:status] failed:", error);
  process.exit(1);
});
