import fs from "fs";
import path from "path";
import { getLogsDir } from "./paths";

export type LogLevel = "debug" | "info" | "warn" | "error";

const PREFIX = "[VOLUMIA][backend]";
const LOG_FILE_NAME = "backend.log";
const ROTATED_LOG_FILE_NAME = "backend.log.1";
const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024;

function levelToConsole(level: LogLevel, line: string) {
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export class BackendLogger {
  private debugEnabled = process.env.VOLUMIA_BACKEND_DEBUG === "1";
  private logFilePath = path.join(getLogsDir(), LOG_FILE_NAME);

  private rotateIfNeeded() {
    try {
      if (!fs.existsSync(this.logFilePath)) {
        return;
      }
      const fileStats = fs.statSync(this.logFilePath);
      if (fileStats.size < MAX_LOG_SIZE_BYTES) {
        return;
      }

      const rotatedPath = path.join(getLogsDir(), ROTATED_LOG_FILE_NAME);
      if (fs.existsSync(rotatedPath)) {
        fs.rmSync(rotatedPath, { force: true });
      }
      fs.renameSync(this.logFilePath, rotatedPath);
    } catch {
      // No-op by design.
    }
  }

  private write(level: LogLevel, message: string, extra?: unknown) {
    const timestamp = new Date().toISOString();
    const serializedExtra = typeof extra === "undefined" ? "" : ` ${this.stringify(extra)}`;
    const line = `${timestamp} ${PREFIX} [${level.toUpperCase()}] ${message}${serializedExtra}`;

    levelToConsole(level, line);
    try {
      this.rotateIfNeeded();
      fs.appendFileSync(this.logFilePath, `${line}\n`, "utf8");
    } catch {
      // No-op by design.
    }
  }

  private stringify(value: unknown) {
    if (value instanceof Error) {
      return value.stack || value.message;
    }
    if (typeof value === "string") {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  debug(message: string, extra?: unknown) {
    if (!this.debugEnabled) {
      return;
    }
    this.write("debug", message, extra);
  }

  info(message: string, extra?: unknown) {
    this.write("info", message, extra);
  }

  warn(message: string, extra?: unknown) {
    this.write("warn", message, extra);
  }

  error(message: string, extra?: unknown) {
    this.write("error", message, extra);
  }
}

export const logger = new BackendLogger();

