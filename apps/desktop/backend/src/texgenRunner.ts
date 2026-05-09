import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import type { TexgenAttemptOutcome } from "./texgenTypes";

type TexgenSpawnPlan = {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  runnerDetails: string;
};

type RunnerCallbacks = {
  onLog?: (message: string, level?: "info" | "warn") => void;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
};

type RunTexgenAttemptParams = {
  stageLabel: string;
  outputDir: string;
  metadataPath: string;
  hardTimeoutMs: number;
  stallTimeoutMs: number;
  stallGraceMs: number;
  outputGraceMs: number;
  plan: TexgenSpawnPlan;
  callbacks?: RunnerCallbacks;
};

function quoteCmdArg(value: string) {
  if (value.length === 0) {
    return "\"\"";
  }
  if (!/[\s"]/u.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function trimLines(value: string, maxLines = 40) {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(-maxLines);
}

function readJsonFileIfPresent(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function collectOutputProgress(outputDir: string) {
  const stats: Array<{ filePath: string; size: number; mtimeMs: number }> = [];
  if (!fs.existsSync(outputDir)) {
    return stats;
  }
  for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    const filePath = path.join(outputDir, entry.name);
    try {
      const fileStats = fs.statSync(filePath);
      stats.push({
        filePath,
        size: fileStats.size,
        mtimeMs: fileStats.mtimeMs,
      });
    } catch {
      // No-op by design.
    }
  }
  return stats;
}

function serializeOutputProgress(stats: Array<{ filePath: string; size: number; mtimeMs: number }>) {
  return stats
    .sort((left, right) => left.filePath.localeCompare(right.filePath))
    .map((item) => `${item.filePath}:${item.size}:${Math.floor(item.mtimeMs)}`)
    .join("|");
}

export async function runTexgenAttempt(
  params: RunTexgenAttemptParams,
): Promise<TexgenAttemptOutcome> {
  const startedAt = Date.now();
  const commandLine = [params.plan.command, ...params.plan.args]
    .map((part) => quoteCmdArg(part))
    .join(" ");
  const callbacks = params.callbacks;
  callbacks?.onLog?.(
    `[${params.stageLabel}] Launching texgen with ${params.plan.runnerDetails}`,
  );
  callbacks?.onLog?.(
    `[${params.stageLabel}] texgen command: ${commandLine}`,
  );

  return await new Promise<TexgenAttemptOutcome>((resolve) => {
    let stdout = "";
    let stderr = "";
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let exitCode = -1;
    let completed = false;
    let timedOut = false;
    let stalled = false;
    let killReason = "";
    let lastProgressAt = Date.now();
    let lastOutputSignature = serializeOutputProgress(
      collectOutputProgress(params.outputDir),
    );

    const child = spawn(params.plan.command, params.plan.args, {
      cwd: params.plan.cwd,
      env: {
        ...process.env,
        ...(params.plan.env ?? {}),
      },
      shell: false,
      windowsHide: true,
    });

    const cleanup = () => {
      clearTimeout(hardTimeout);
      clearInterval(stallInterval);
    };

    const finish = (status: TexgenAttemptOutcome["status"], reason: string) => {
      if (completed) {
        return;
      }
      completed = true;
      cleanup();
      const metadata = readJsonFileIfPresent(params.metadataPath);
      resolve({
        status,
        reason,
        exitCode,
        stdout,
        stderr,
        timedOut,
        stalled,
        runnerDetails: params.plan.runnerDetails,
        commandLine,
        metadata,
        outputPath:
          typeof metadata?.textured_glb_path === "string"
            ? metadata.textured_glb_path
            : undefined,
      });
    };

    const touchProgress = (source: "stdout" | "stderr" | "files") => {
      lastProgressAt = Date.now();
      if (source === "files") {
        callbacks?.onLog?.(
          `[${params.stageLabel}] texgen output activity detected`,
        );
      }
    };

    const flushLines = (buffer: string, cb?: (line: string) => void) => {
      const lines = buffer.split(/\r?\n/u);
      const carry = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        cb?.(trimmed);
      }
      return carry;
    };

    const hardTimeout = setTimeout(() => {
      timedOut = true;
      killReason = `TexGen hard timeout reached (${params.hardTimeoutMs}ms).`;
      callbacks?.onLog?.(
        `[${params.stageLabel}] texgen_watchdog_timeout hard_timeout_ms=${params.hardTimeoutMs}`,
        "warn",
      );
      try {
        child.kill();
      } catch {
        // No-op by design.
      }
    }, params.hardTimeoutMs);

    const stallInterval = setInterval(() => {
      const now = Date.now();
      const currentOutputSignature = serializeOutputProgress(
        collectOutputProgress(params.outputDir),
      );
      if (currentOutputSignature !== lastOutputSignature) {
        lastOutputSignature = currentOutputSignature;
        touchProgress("files");
      }

      const elapsedSinceProgress = now - lastProgressAt;
      const elapsedSinceStart = now - startedAt;
      const beforeGraceWindow = elapsedSinceStart < params.stallGraceMs;
      if (beforeGraceWindow) {
        return;
      }
      if (elapsedSinceProgress < params.stallTimeoutMs) {
        return;
      }

      const metadataPresent = fs.existsSync(params.metadataPath);
      const outputFilesPresent = collectOutputProgress(params.outputDir).length > 0;
      if (
        !metadataPresent &&
        !outputFilesPresent &&
        elapsedSinceStart < params.outputGraceMs
      ) {
        return;
      }

      stalled = true;
      killReason = `TexGen watchdog stalled after ${elapsedSinceProgress}ms without observable progress.`;
      callbacks?.onLog?.(
        `[${params.stageLabel}] texgen_watchdog_stalled inactivity_ms=${elapsedSinceProgress}`,
        "warn",
      );
      try {
        child.kill();
      } catch {
        // No-op by design.
      }
    }, 5_000);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      stdout += text;
      stdoutBuffer += text;
      touchProgress("stdout");
      stdoutBuffer = flushLines(stdoutBuffer, (line) => {
        callbacks?.onStdoutLine?.(line);
      });
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      stderr += text;
      stderrBuffer += text;
      touchProgress("stderr");
      stderrBuffer = flushLines(stderrBuffer, (line) => {
        callbacks?.onStderrLine?.(line);
      });
    });

    child.on("error", (error) => {
      const message =
        error instanceof Error ? error.message : "TexGen process failed to start.";
      exitCode = -1;
      finish("process_start_failed", message);
    });

    child.on("close", (code) => {
      exitCode = code ?? -1;
      if (stdoutBuffer.trim().length > 0) {
        callbacks?.onStdoutLine?.(stdoutBuffer.trim());
      }
      if (stderrBuffer.trim().length > 0) {
        callbacks?.onStderrLine?.(stderrBuffer.trim());
      }

      if (stalled) {
        finish("stalled", killReason || "TexGen process stalled.");
        return;
      }
      if (timedOut) {
        finish("timed_out", killReason || "TexGen process timed out.");
        return;
      }
      if (exitCode !== 0) {
        finish(
          "runtime_error",
          trimLines(stderr, 1)[0] ??
            trimLines(stdout, 1)[0] ??
            `TexGen exited with code ${exitCode}.`,
        );
        return;
      }

      const metadata = readJsonFileIfPresent(params.metadataPath);
      const outputPath =
        typeof metadata?.textured_glb_path === "string"
          ? metadata.textured_glb_path
          : path.join(params.outputDir, "textured.glb");
      if (!fs.existsSync(outputPath)) {
        finish(
          "no_output_generated",
          "TexGen exited cleanly but did not produce a textured output.",
        );
        return;
      }

      finish("success", "TexGen produced an output candidate.");
    });
  });
}
