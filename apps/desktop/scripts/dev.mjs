import { spawn } from "node:child_process";

console.log("Starting desktop in development mode. Install Electron to launch the UI.");

const child = spawn("electron", ["."], {
  cwd: new URL("..", import.meta.url),
  stdio: "inherit",
  shell: false,
  windowsHide: true
});

child.on("exit", (code) => process.exit(code || 0));
