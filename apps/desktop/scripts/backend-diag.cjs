const fs = require("fs");
const path = require("path");

const packageRoot = path.resolve(__dirname, "..");
const configPath = path.join(packageRoot, "backend", "config", "default.json");

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Backend config not found: ${configPath}`);
  }
  const raw = fs.readFileSync(configPath, "utf8");
  return JSON.parse(raw);
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
  const url = `http://${comfy.host}:${comfy.port}`;

  console.log("[backend:status] configPath:", configPath);
  console.log(
    "[backend:status] comfy config:",
    JSON.stringify(
      {
        host: comfy.host,
        port: comfy.port,
        rootDir: comfy.rootDir,
        pythonExe: comfy.pythonExe,
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
