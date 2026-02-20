const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const packageRoot = path.resolve(__dirname, "..");

function parsePort(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function isPortAvailable(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host, port }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort, limit = 50) {
  for (let offset = 0; offset < limit; offset += 1) {
    const candidate = startPort + offset;
    if (await isPortAvailable(candidate)) {
      return candidate;
    }
  }

  throw new Error(`No free port found between ${startPort} and ${startPort + limit - 1}.`);
}

function spawnNpm(args, options) {
  const spawnOptions = { ...options, cwd: packageRoot };
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`], spawnOptions);
  }
  return spawn("npm", args, spawnOptions);
}

function killProcessTree(pid) {
  if (!pid) return;

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.on("error", () => {
      // best effort
    });
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // process already exited
  }
}

async function main() {
  const requestedDesktopPort = parsePort(process.env.VOLUMIA_DESKTOP_PORT, 5173);
  const desktopPort = await findAvailablePort(requestedDesktopPort);

  const sharedEnv = {
    ...process.env,
    VOLUMIA_DESKTOP_PORT: String(desktopPort),
    VITE_DEV_SERVER_URL: `http://127.0.0.1:${desktopPort}`,
  };

  console.log(`[desktop:dev] Frontend port: ${desktopPort}${desktopPort !== requestedDesktopPort ? ` (requested ${requestedDesktopPort})` : ""}`);

  const children = [
    {
      name: "react",
      process: spawnNpm(["run", "react", "--", "--port", String(desktopPort), "--strictPort"], {
        stdio: "inherit",
        env: sharedEnv,
      }),
    },
    {
      name: "electron",
      process: spawnNpm(["run", "electron:dev"], {
        stdio: "inherit",
        env: sharedEnv,
      }),
    },
  ];

  let shuttingDown = false;

  const shutdown = (exitCode) => {
    if (shuttingDown) return;
    shuttingDown = true;

    for (const child of children) {
      killProcessTree(child.process.pid);
    }

    setTimeout(() => process.exit(exitCode), 350);
  };

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  for (const child of children) {
    child.process.on("exit", (code, signal) => {
      if (shuttingDown) return;

      if (signal || (code ?? 0) !== 0) {
        const reason = signal ? `signal ${signal}` : `code ${code}`;
        console.error(`[desktop:dev] ${child.name} exited with ${reason}.`);
        shutdown(code ?? 1);
        return;
      }

      console.log(`[desktop:dev] ${child.name} exited. Stopping remaining processes.`);
      shutdown(0);
    });
  }
}

main().catch((error) => {
  console.error("[desktop:dev] Failed to start:", error);
  process.exit(1);
});
