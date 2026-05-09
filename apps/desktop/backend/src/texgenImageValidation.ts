import fs from "fs";
import path from "path";
import type { TexgenImageValidation } from "./texgenTypes";

const MIN_IMAGE_FILE_SIZE_BYTES = 1024;
const MIN_IMAGE_EDGE_PX = 256;

type ImageProbeResult = Pick<
  TexgenImageValidation,
  "format" | "width" | "height" | "hasAlpha"
>;

function readUInt24BE(buffer: Buffer, offset: number) {
  return (buffer[offset]! << 16) | (buffer[offset + 1]! << 8) | buffer[offset + 2]!;
}

function probePng(buffer: Buffer): ImageProbeResult | null {
  if (buffer.length < 26) {
    return null;
  }
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    return null;
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colorType = buffer[25] ?? 0;
  const hasAlpha = colorType === 4 || colorType === 6;
  return {
    format: "png",
    width,
    height,
    hasAlpha,
  };
}

function probeJpeg(buffer: Buffer): ImageProbeResult | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1]!;
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (
      marker >= 0xc0 &&
      marker <= 0xc3 &&
      offset + 8 < buffer.length
    ) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return {
        format: "jpeg",
        width,
        height,
        hasAlpha: false,
      };
    }
    if (segmentLength < 2) {
      break;
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function probeWebp(buffer: Buffer): ImageProbeResult | null {
  if (
    buffer.length < 30 ||
    buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
    buffer.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    return null;
  }
  const chunkType = buffer.subarray(12, 16).toString("ascii");
  if (chunkType === "VP8X" && buffer.length >= 30) {
    const flags = buffer[20] ?? 0;
    const width = 1 + readUInt24BE(buffer, 24);
    const height = 1 + readUInt24BE(buffer, 27);
    return {
      format: "webp",
      width,
      height,
      hasAlpha: Boolean(flags & 0b0001_0000),
    };
  }
  return {
    format: "webp",
    width: 0,
    height: 0,
    hasAlpha: null,
  };
}

function probeGif(buffer: Buffer): ImageProbeResult | null {
  if (
    buffer.length < 10 ||
    !buffer.subarray(0, 6).toString("ascii").startsWith("GIF8")
  ) {
    return null;
  }
  return {
    format: "gif",
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
    hasAlpha: null,
  };
}

function probeBmp(buffer: Buffer): ImageProbeResult | null {
  if (buffer.length < 26 || buffer.subarray(0, 2).toString("ascii") !== "BM") {
    return null;
  }
  return {
    format: "bmp",
    width: Math.abs(buffer.readInt32LE(18)),
    height: Math.abs(buffer.readInt32LE(22)),
    hasAlpha: null,
  };
}

function probeImage(buffer: Buffer): ImageProbeResult {
  return (
    probePng(buffer) ??
    probeJpeg(buffer) ??
    probeWebp(buffer) ??
    probeGif(buffer) ??
    probeBmp(buffer) ?? {
      format: "unknown",
      width: 0,
      height: 0,
      hasAlpha: null,
    }
  );
}

export function validateImageForTexGen(imagePath: string): TexgenImageValidation {
  const resolvedPath = path.resolve(imagePath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      imagePath: resolvedPath,
      format: "unknown",
      fileSizeBytes: 0,
      readable: false,
      width: 0,
      height: 0,
      hasAlpha: null,
      warnings: [],
      reason: "Input image does not exist.",
    };
  }

  const fileSizeBytes = fs.statSync(resolvedPath).size;
  if (fileSizeBytes < MIN_IMAGE_FILE_SIZE_BYTES) {
    return {
      ok: false,
      imagePath: resolvedPath,
      format: "unknown",
      fileSizeBytes,
      readable: false,
      width: 0,
      height: 0,
      hasAlpha: null,
      warnings: [],
      reason: `Input image is too small (${fileSizeBytes} bytes).`,
    };
  }

  try {
    const buffer = fs.readFileSync(resolvedPath);
    const probe = probeImage(buffer);
    const warnings: string[] = [];
    if (probe.format === "unknown") {
      return {
        ok: false,
        imagePath: resolvedPath,
        format: "unknown",
        fileSizeBytes,
        readable: false,
        width: 0,
        height: 0,
        hasAlpha: null,
        warnings,
        reason: "Input image format is not supported for texgen preflight.",
      };
    }
    if (probe.width < MIN_IMAGE_EDGE_PX || probe.height < MIN_IMAGE_EDGE_PX) {
      return {
        ok: false,
        imagePath: resolvedPath,
        format: probe.format,
        fileSizeBytes,
        readable: true,
        width: probe.width,
        height: probe.height,
        hasAlpha: probe.hasAlpha,
        warnings,
        reason: `Input image resolution is too low (${probe.width}x${probe.height}).`,
      };
    }
    if (probe.hasAlpha === false && probe.format === "png") {
      warnings.push("PNG input has no alpha channel.");
    }
    return {
      ok: true,
      imagePath: resolvedPath,
      format: probe.format,
      fileSizeBytes,
      readable: true,
      width: probe.width,
      height: probe.height,
      hasAlpha: probe.hasAlpha,
      warnings,
    };
  } catch (error) {
    return {
      ok: false,
      imagePath: resolvedPath,
      format: "unknown",
      fileSizeBytes,
      readable: false,
      width: 0,
      height: 0,
      hasAlpha: null,
      warnings: [],
      reason:
        error instanceof Error
          ? `Input image could not be read: ${error.message}`
          : "Input image could not be read.",
    };
  }
}
