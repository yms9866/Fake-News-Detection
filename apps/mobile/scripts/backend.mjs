import { spawn } from "node:child_process";
import { join } from "node:path";

const repoRoot = join(import.meta.dirname, "../../..");
const host = process.env.MOBILE_BACKEND_HOST || "0.0.0.0";
const port = process.env.MOBILE_BACKEND_PORT || "8000";

console.log(`Starting API backend for mobile devices on http://${host}:${port}`);
console.log("Emulator clients should use http://10.0.2.2:8000 inside the app.");
console.log("Physical phones should use your computer's LAN IP on port 8000.");

const child = spawn(
  "python",
  ["-m", "uvicorn", "apps.api.app.main:app", "--host", host, "--port", port],
  {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: false
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code || 0);
});

child.on("error", (error) => {
  console.error(`Failed to start mobile backend: ${error.message}`);
  process.exit(1);
});
