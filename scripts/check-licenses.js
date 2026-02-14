#!/usr/bin/env node

/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();
const DEP_FIELDS = ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"];

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function getWorkspacePatterns(pkgJson) {
  if (!pkgJson) return [];
  if (Array.isArray(pkgJson.workspaces)) return pkgJson.workspaces;
  if (pkgJson.workspaces && Array.isArray(pkgJson.workspaces.packages)) return pkgJson.workspaces.packages;
  return [];
}

function listWorkspacePackageJson(root, pattern) {
  const results = [];
  if (typeof pattern !== "string" || !pattern) return results;

  if (pattern.endsWith("/*")) {
    const base = path.join(root, pattern.slice(0, -2));
    if (!fs.existsSync(base)) return results;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packageJsonPath = path.join(base, entry.name, "package.json");
      if (fs.existsSync(packageJsonPath)) results.push(packageJsonPath);
    }
    return results;
  }

  const directPath = path.join(root, pattern, "package.json");
  if (fs.existsSync(directPath)) results.push(directPath);
  return results;
}

function collectManifestPaths() {
  const paths = new Set();
  const rootManifest = path.join(rootDir, "package.json");
  if (fs.existsSync(rootManifest)) paths.add(rootManifest);

  const rootPkg = readJson(rootManifest);
  const workspacePatterns = getWorkspacePatterns(rootPkg);
  for (const pattern of workspacePatterns) {
    for (const manifestPath of listWorkspacePackageJson(rootDir, pattern)) {
      paths.add(manifestPath);
    }
  }
  return [...paths];
}

function collectDependencies(manifestPaths) {
  const depToSearchDirs = new Map();
  for (const manifestPath of manifestPaths) {
    const pkg = readJson(manifestPath);
    if (!pkg) continue;
    const baseDir = path.dirname(manifestPath);
    for (const field of DEP_FIELDS) {
      const deps = pkg[field];
      if (!deps || typeof deps !== "object") continue;
      for (const depName of Object.keys(deps)) {
        if (!depToSearchDirs.has(depName)) depToSearchDirs.set(depName, new Set());
        depToSearchDirs.get(depName).add(baseDir);
      }
    }
  }
  return depToSearchDirs;
}

function resolvePackageJson(depName, searchDirs) {
  for (const dir of searchDirs) {
    try {
      return require.resolve(path.posix.join(depName, "package.json"), { paths: [dir, rootDir] });
    } catch {
      // Best effort.
    }
  }
  return null;
}

function extractLicenseTexts(licenseField) {
  if (!licenseField) return [];
  if (typeof licenseField === "string") return [licenseField];
  if (Array.isArray(licenseField)) {
    return licenseField.flatMap((entry) => extractLicenseTexts(entry));
  }
  if (typeof licenseField === "object") {
    if (typeof licenseField.type === "string") return [licenseField.type];
    return [];
  }
  return [];
}

function isDisallowedLicense(licenseText) {
  if (typeof licenseText !== "string") return false;
  const normalized = licenseText.toUpperCase();
  if (normalized.includes("AGPL")) return true;
  if (normalized.includes("LGPL")) return false;
  return normalized.includes("GPL");
}

function run() {
  const manifestPaths = collectManifestPaths();
  const depToSearchDirs = collectDependencies(manifestPaths);
  const depNames = [...depToSearchDirs.keys()].sort((a, b) => a.localeCompare(b));

  console.log(`[licenses:check] Manifests scanned: ${manifestPaths.length}`);
  console.log(`[licenses:check] Dependencies discovered: ${depNames.length}`);

  const disallowed = [];
  const unresolved = [];
  const unknownLicense = [];

  for (const depName of depNames) {
    const searchDirs = [...(depToSearchDirs.get(depName) || [])];
    const pkgJsonPath = resolvePackageJson(depName, searchDirs);
    if (!pkgJsonPath) {
      unresolved.push(depName);
      continue;
    }

    const pkg = readJson(pkgJsonPath);
    if (!pkg) {
      unresolved.push(depName);
      continue;
    }

    const licenses = extractLicenseTexts(pkg.license);
    if (licenses.length === 0) {
      unknownLicense.push(depName);
      continue;
    }

    for (const licenseText of licenses) {
      if (isDisallowedLicense(licenseText)) {
        disallowed.push({
          name: depName,
          license: licenseText,
          version: pkg.version || "unknown",
        });
        break;
      }
    }
  }

  if (disallowed.length > 0) {
    console.warn("\n[licenses:check] WARNING: Potential GPL/AGPL packages detected:");
    for (const item of disallowed) {
      console.warn(`  - ${item.name}@${item.version} (${item.license})`);
    }
  } else {
    console.log("\n[licenses:check] No GPL/AGPL packages detected in resolved metadata.");
  }

  if (unknownLicense.length > 0) {
    console.warn(`\n[licenses:check] WARNING: Missing/unknown license metadata (${unknownLicense.length}):`);
    for (const name of unknownLicense.slice(0, 25)) {
      console.warn(`  - ${name}`);
    }
    if (unknownLicense.length > 25) {
      console.warn(`  ...and ${unknownLicense.length - 25} more`);
    }
  }

  if (unresolved.length > 0) {
    console.warn(`\n[licenses:check] WARNING: Unresolved packages (${unresolved.length}):`);
    for (const name of unresolved.slice(0, 25)) {
      console.warn(`  - ${name}`);
    }
    if (unresolved.length > 25) {
      console.warn(`  ...and ${unresolved.length - 25} more`);
    }
    console.warn("  Install dependencies to improve scan coverage.");
  }

  console.log("\n[licenses:check] Completed (warnings-only mode).");
}

run();
