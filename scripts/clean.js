const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = process.cwd();
const isDeep = process.argv.includes("--deep");

const targetDirs = new Set([
  "dist",
  "dist-electron",
  "electron-dist",
  "build",
  "out",
  ".vite",
  ".cache",
  "coverage",
  ".turbo",
  "__pycache__",
]);

const excludedDirs = new Set([".git"]);
if (!isDeep) {
  excludedDirs.add("node_modules");
}

const removedPaths = [];
const skippedPaths = [];
const seen = new Set();
const trackedGlb = loadTrackedGlbFiles();

function normalizeForPrint(value) {
  return path.relative(rootDir, value).split(path.sep).join("/") || ".";
}

function tryRemove(targetPath) {
  if (seen.has(targetPath)) {
    return;
  }
  seen.add(targetPath);
  if (!fs.existsSync(targetPath)) {
    return;
  }
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
    removedPaths.push(normalizeForPrint(targetPath));
  } catch {
    skippedPaths.push(normalizeForPrint(targetPath));
  }
}

function isLogFile(fileName) {
  const lower = fileName.toLowerCase();
  return (
    lower.endsWith(".log") ||
    /^dev-run-.*\.log$/i.test(fileName) ||
    /^dev-run-.*\.err\.log$/i.test(fileName) ||
    /^npm-debug\.log/i.test(fileName) ||
    /^yarn-debug\.log/i.test(fileName) ||
    /^pnpm-debug\.log/i.test(fileName)
  );
}

function isTemplateGlb(absoluteFilePath) {
  const normalized = absoluteFilePath.split(path.sep).join("/").toLowerCase();
  return normalized.includes("/assets/templates/");
}

function loadTrackedGlbFiles() {
  const tracked = new Set();
  try {
    const result = spawnSync("git", ["ls-files", "*.glb"], {
      cwd: rootDir,
      windowsHide: true,
      encoding: "utf8",
      shell: false,
    });
    if (result.status !== 0) {
      return tracked;
    }
    const lines = (result.stdout || "").split(/\r?\n/).filter(Boolean);
    for (const relPath of lines) {
      tracked.add(path.resolve(rootDir, relPath));
    }
  } catch {
    return tracked;
  }
  return tracked;
}

function shouldRemoveFile(absoluteFilePath, fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (isLogFile(fileName)) {
    return true;
  }
  if (ext === ".pyc" || ext === ".pyo") {
    return true;
  }
  if (
    ext === ".glb" &&
    !isTemplateGlb(absoluteFilePath) &&
    !trackedGlb.has(path.resolve(absoluteFilePath))
  ) {
    return true;
  }
  return false;
}

function walk(currentDir) {
  let entries = [];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      if (excludedDirs.has(entry.name)) {
        continue;
      }
      if (targetDirs.has(entry.name)) {
        tryRemove(fullPath);
        continue;
      }
      walk(fullPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (shouldRemoveFile(fullPath, entry.name)) {
      tryRemove(fullPath);
    }
  }
}

walk(rootDir);

if (isDeep) {
  tryRemove(path.join(rootDir, "node_modules"));
  tryRemove(path.join(rootDir, "package-lock.json"));
}

if (removedPaths.length > 0) {
  removedPaths.sort();
  for (const item of removedPaths) {
    console.log(`removed: ${item}`);
  }
}
if (skippedPaths.length > 0) {
  skippedPaths.sort();
  for (const item of skippedPaths) {
    console.log(`skipped: ${item}`);
  }
}
if (removedPaths.length === 0 && skippedPaths.length === 0) {
  console.log("No files or directories removed.");
  process.exit(0);
}
console.log(`Total removed: ${removedPaths.length}`);
if (skippedPaths.length > 0) {
  console.log(`Total skipped: ${skippedPaths.length}`);
}
