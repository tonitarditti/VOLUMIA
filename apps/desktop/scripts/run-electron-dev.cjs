const path = require("path");
const { spawn } = require("child_process");
const http = require("http");
const https = require("https");

const electronBinary = require("electron");
const mainEntry = path.resolve(__dirname, "../electron-dist/main.js");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

function parsePort(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function probeServer(url) {
  return new Promise((resolve) => {
    const transport = url.startsWith("https://") ? https : http;

    const request = transport.get(url, (response) => {
      response.resume();
      resolve(true);
    });

    request.setTimeout(2000, () => {
      request.destroy();
      resolve(false);
    });

    request.on("error", () => {
      resolve(false);
    });
  });
}

async function waitForDevServer(url, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probeServer(url)) {
      return true;
    }
    await delay(400);
  }
  return false;
}

async function main() {
  const desktopPort = parsePort(env.VOLUMIA_DESKTOP_PORT, 5173);
  env.VITE_DEV_SERVER_URL = env.VITE_DEV_SERVER_URL || `http://127.0.0.1:${desktopPort}`;

  const ready = await waitForDevServer(env.VITE_DEV_SERVER_URL);
  if (!ready) {
    console.error(`[electron:dev] Timed out waiting for ${env.VITE_DEV_SERVER_URL}`);
    process.exit(1);
    return;
  }

  const child = spawn(electronBinary, [mainEntry], {
    stdio: "inherit",
    env,
    windowsHide: false,
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error("[electron:dev] Failed to start:", error);
  process.exit(1);
});
