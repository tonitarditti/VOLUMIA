const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "_figma_capture_dev.log");
const err = path.join(root, "_figma_capture_dev.err.log");
const outFd = fs.openSync(out, "a");
const errFd = fs.openSync(err, "a");

const child = spawn("npm.cmd", ["run", "react"], {
  cwd: root,
  detached: true,
  stdio: ["ignore", outFd, errFd],
});

child.unref();
console.log(child.pid);
