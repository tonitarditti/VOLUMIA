import net from "net";
import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from "child_process";
import { logger } from "./logger";

export type SpawnProcessOptions = SpawnOptionsWithoutStdio & {
  name: string;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
};

export type ManagedProcess = {
  name: string;
  pid: number;
  child: ChildProcessWithoutNullStreams;
  stdout: string[];
  stderr: string[];
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
};

type StreamLineBuffer = {
  remaining: string;
  lines: string[];
};

function readStreamLines(state: StreamLineBuffer, chunk: string) {
  const merged = `${state.remaining}${chunk}`;
  const parts = merged.split(/\r?\n/u);
  const nextRemaining = parts.pop() ?? "";
  const lines = parts.map((line) => line.trim()).filter((line) => line.length > 0);
  state.remaining = nextRemaining;
  state.lines.push(...lines);
  return lines;
}

export async function killProcessTree(pid: number) {
  if (!Number.isFinite(pid) || pid <= 0) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise<void>((resolvePromise) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.on("error", () => resolvePromise());
      killer.on("exit", () => resolvePromise());
    });
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // No-op by design.
    }
  }
}

export async function waitForPort(host: string, port: number, timeoutMs: number) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const ok = await new Promise<boolean>((resolvePromise) => {
      const socket = new net.Socket();
      const done = (value: boolean) => {
        socket.removeAllListeners();
        socket.destroy();
        resolvePromise(value);
      };

      socket.setTimeout(1200);
      socket.once("connect", () => done(true));
      socket.once("error", () => done(false));
      socket.once("timeout", () => done(false));
      socket.connect(port, host);
    });

    if (ok) {
      return true;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 400));
  }

  return false;
}

export class ProcessManager {
  private processes = new Map<number, ManagedProcess>();
  private hooksRegistered = false;

  constructor() {
    this.registerShutdownHooks();
  }

  private registerShutdownHooks() {
    if (this.hooksRegistered) {
      return;
    }
    this.hooksRegistered = true;

    const shutdown = () => {
      void this.stopAll("process-exit");
    };

    process.once("exit", shutdown);
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  }

  spawn(command: string, args: string[], options: SpawnProcessOptions): ManagedProcess {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: options.windowsHide ?? true,
      shell: options.shell ?? false,
      stdio: "pipe",
    });

    if (!child.pid) {
      throw new Error(`No se pudo obtener PID para proceso "${options.name}".`);
    }

    const stdout: string[] = [];
    const stderr: string[] = [];
    const stdoutBuffer: StreamLineBuffer = { remaining: "", lines: stdout };
    const stderrBuffer: StreamLineBuffer = { remaining: "", lines: stderr };

    child.stdout.on("data", (chunk) => {
      const lines = readStreamLines(stdoutBuffer, String(chunk));
      if (lines.length === 0) {
        return;
      }
      for (const line of lines) {
        options.onStdoutLine?.(line);
      }
    });

    child.stderr.on("data", (chunk) => {
      const lines = readStreamLines(stderrBuffer, String(chunk));
      if (lines.length === 0) {
        return;
      }
      for (const line of lines) {
        options.onStderrLine?.(line);
      }
    });

    child.stdout.on("error", (error) => {
      const errorCode = (error as NodeJS.ErrnoException).code ?? "unknown";
      logger.warn(`stdout stream error for ${options.name}.`, { code: errorCode, message: String(error) });
    });

    child.stderr.on("error", (error) => {
      const errorCode = (error as NodeJS.ErrnoException).code ?? "unknown";
      logger.warn(`stderr stream error for ${options.name}.`, { code: errorCode, message: String(error) });
    });

    const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolvePromise) => {
      child.on("exit", (code, signal) => {
        const stdoutTail = stdoutBuffer.remaining.trim();
        if (stdoutTail.length > 0) {
          stdout.push(stdoutTail);
          options.onStdoutLine?.(stdoutTail);
        }
        const stderrTail = stderrBuffer.remaining.trim();
        if (stderrTail.length > 0) {
          stderr.push(stderrTail);
          options.onStderrLine?.(stderrTail);
        }
        this.processes.delete(child.pid!);
        resolvePromise({ code, signal });
      });
    });

    const managed: ManagedProcess = {
      name: options.name,
      pid: child.pid,
      child,
      stdout,
      stderr,
      exit,
    };

    child.on("error", (error) => {
      logger.error(`Fallo al iniciar proceso ${options.name}.`, error);
    });

    this.processes.set(child.pid, managed);
    logger.info(`Proceso iniciado: ${options.name}`, { pid: child.pid, command, args });
    return managed;
  }

  async stopAll(reason = "manual-stop") {
    const pids = Array.from(this.processes.keys());
    if (pids.length === 0) {
      return;
    }
    logger.info("Deteniendo procesos hijos...", { reason, pids });
    await Promise.all(pids.map((pid) => killProcessTree(pid)));
    this.processes.clear();
  }

  getActiveProcesses() {
    return Array.from(this.processes.values()).map((item) => ({
      name: item.name,
      pid: item.pid,
    }));
  }
}
