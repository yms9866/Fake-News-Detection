import { spawn, spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const isWindows = process.platform === "win32";

function runBuild() {
  const result = spawnSync(process.execPath, ["scripts/build.mjs"], {
    cwd: root,
    stdio: "inherit",
    shell: false,
    windowsHide: true
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveElectronLaunch() {
  if (process.env.ELECTRON_BINARY && await exists(process.env.ELECTRON_BINARY)) {
    return {
      command: process.env.ELECTRON_BINARY,
      args: [],
      label: process.env.ELECTRON_BINARY
    };
  }

  const electronExecutable = join(root, "node_modules", "electron", "dist", isWindows ? "electron.exe" : "electron");
  if (await exists(electronExecutable)) {
    return {
      command: electronExecutable,
      args: [],
      label: electronExecutable
    };
  }

  const electronCli = join(root, "node_modules", "electron", "cli.js");
  if (await exists(electronCli)) {
    return {
      command: process.execPath,
      args: [electronCli],
      label: `${process.execPath} ${electronCli}`
    };
  }

  const localElectron = join(root, "node_modules", ".bin", "electron");
  if (!isWindows && await exists(localElectron)) {
    return {
      command: localElectron,
      args: [],
      label: localElectron
    };
  }

  return {
    command: "electron",
    args: [],
    label: "electron"
  };
}

runBuild();

const electronLaunch = await resolveElectronLaunch();
console.log(`Starting desktop with ${electronLaunch.label}`);

const child = spawn(electronLaunch.command, [...electronLaunch.args, "."], {
  cwd: root,
  stdio: "inherit",
  shell: false,
  windowsHide: false
});

child.on("error", (error) => {
  console.error(
    `Unable to start Electron (${error.message}). Install Electron locally or set ELECTRON_BINARY to the executable path.`
  );
  process.exit(1);
});

child.on("exit", (code) => process.exit(code || 0));
