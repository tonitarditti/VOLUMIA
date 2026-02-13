const net = require("net");
const { spawn } = require("child_process");

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
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`], options);
  }
  return spawn("npm", args, options);
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
  const requestedServicePort = parsePort(process.env.VOLUMIA_SERVICE_PORT, 7860);
  const requestedDesktopPort = parsePort(process.env.VOLUMIA_DESKTOP_PORT, 5173);

  const servicePort = await findAvailablePort(requestedServicePort);
  const desktopPort = await findAvailablePort(requestedDesktopPort);

  const sharedEnv = {
    ...process.env,
    VOLUMIA_SERVICE_PORT: String(servicePort),
    VOLUMIA_DESKTOP_PORT: String(desktopPort),
    VITE_DEV_SERVER_URL: `http://127.0.0.1:${desktopPort}`,
  };

  console.log(`[dev] Service port: ${servicePort}${servicePort !== requestedServicePort ? ` (requested ${requestedServicePort})` : ""}`);
  console.log(`[dev] Desktop port: ${desktopPort}${desktopPort !== requestedDesktopPort ? ` (requested ${requestedDesktopPort})` : ""}`);

  const children = [
    { name: "service", process: spawnNpm(["run", "dev:service"], { stdio: "inherit", env: sharedEnv }) },
    { name: "desktop", process: spawnNpm(["run", "dev:desktop"], { stdio: "inherit", env: sharedEnv }) },
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
        console.error(`[dev] ${child.name} exited with ${reason}.`);
        shutdown(code ?? 1);
        return;
      }

      console.log(`[dev] ${child.name} exited. Stopping remaining processes.`);
      shutdown(0);
    });
  }
}

main().catch((error) => {
  console.error("[dev] Failed to start development environment:", error);
  process.exit(1);
});
