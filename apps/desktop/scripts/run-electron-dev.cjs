const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const http = require("http");
const https = require("https");

const electronBinary = require("electron");
const packageRoot = path.resolve(__dirname, "..");
const mainEntry = path.resolve(packageRoot, "electron-dist/main.js");

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

function spawnNpm(args, options = {}) {
  const spawnOptions = { ...options, cwd: packageRoot };
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`], spawnOptions);
  }
  return spawn("npm", args, spawnOptions);
}

function runNpmScript(args, scriptLabel) {
  return new Promise((resolve, reject) => {
    const child = spawnNpm(args, {
      stdio: "inherit",
      env,
      windowsHide: false,
    });

    child.on("error", (error) => {
      reject(new Error(`[electron:dev] Failed to start npm ${scriptLabel}: ${error.message}`));
    });

    child.on("exit", (code, signal) => {
      if (signal || (code ?? 0) !== 0) {
        const reason = signal ? `signal ${signal}` : `code ${code}`;
        reject(new Error(`[electron:dev] npm ${scriptLabel} exited with ${reason}.`));
        return;
      }
      resolve();
    });
  });
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

  await runNpmScript(["run", "electron:build"], "run electron:build");

  if (!fs.existsSync(mainEntry)) {
    throw new Error(
      `[electron:dev] Electron entry not found after build: ${mainEntry}. Run "npm run electron:build" in apps/desktop and check tsconfig.electron.json output.`
    );
  }

  const ready = await waitForDevServer(env.VITE_DEV_SERVER_URL);
  if (!ready) {
    console.error(`[electron:dev] Timed out waiting for ${env.VITE_DEV_SERVER_URL}`);
    process.exit(1);
    return;
  }

  const child = spawn(electronBinary, [mainEntry], {
    stdio: "inherit",
    env,
    cwd: packageRoot,
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
