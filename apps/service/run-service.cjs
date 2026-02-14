const { spawn } = require("child_process");
const { existsSync } = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../..");
const serviceEntry = path.resolve(__dirname, "main.py");

const candidates = [
  process.env.VOLUMIA_PYTHON_BIN,
  "python",
].filter(Boolean);

const pythonBin = candidates.find((candidate) => candidate === "python" || existsSync(candidate)) || "python";

const child = spawn(pythonBin, [serviceEntry], {
  cwd: __dirname,
  env: process.env,
  stdio: "inherit",
  windowsHide: false,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
