const { spawn } = require("child_process");

function spawnNpm(args, options) {
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`], options);
  }
  return spawn("npm", args, options);
}

const child = spawnNpm(["--workspace", "@volumia/desktop", "run", "dev"], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
