import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { networkInterfaces } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const repoRoot = join(root, "../..");
const require = createRequire(import.meta.url);
const DEFAULT_METRO_PORT = 8081;

function tryResolve(specifier) {
  try {
    return require.resolve(specifier, { paths: [root] });
  } catch {
    return null;
  }
}

function resolveExpoCli() {
  const resolved = tryResolve("expo/bin/cli") || tryResolve("@expo/cli/build/bin/cli");
  if (resolved) {
    return resolved;
  }

  const localExpoCli = join(root, "node_modules", "expo", "bin", "cli");
  return existsSync(localExpoCli) ? localExpoCli : null;
}

function hasHostSelection(args) {
  return args.some((arg) => arg === "--host" || arg.startsWith("--host=") || arg === "--lan" || arg === "--localhost" || arg === "--tunnel");
}

function hasAndroidTarget(args) {
  return args.includes("--android") || args.includes("-a");
}

function hasPortSelection(args) {
  return args.some((arg) => arg === "--port" || arg.startsWith("--port="));
}

function isLikelyVirtualAdapter(candidate) {
  const name = candidate.name.toLowerCase();
  return /virtual|vethernet|wsl|docker|vmware|virtualbox|vbox|loopback|npcap/u.test(name)
    || candidate.address.startsWith("169.254.")
    || candidate.address.startsWith("192.168.56.");
}

function scoreLanCandidate(candidate) {
  const name = candidate.name.toLowerCase();
  if (/wi-?fi|wireless|wlan/u.test(name)) {
    return 100;
  }
  if (/ethernet|local area/u.test(name)) {
    return 80;
  }
  return 10;
}

function detectLanIp() {
  const entries = Object.entries(networkInterfaces());
  const candidates = entries.flatMap(([name, addresses]) =>
    (addresses || [])
      .filter((address) => address.family === "IPv4" && !address.internal)
      .map((address) => ({ name, address: address.address }))
  );
  const usableCandidates = candidates.filter((candidate) => !isLikelyVirtualAdapter(candidate));
  const sorted = [...(usableCandidates.length > 0 ? usableCandidates : candidates)]
    .sort((left, right) => scoreLanCandidate(right) - scoreLanCandidate(left));
  return (sorted[0] || {}).address || "";
}

function resolveAndroidPlatformTools() {
  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Android", "Sdk") : null,
    process.env.HOME ? join(process.env.HOME, "Android", "Sdk") : null
  ].filter(Boolean);

  for (const sdkRoot of sdkRoots) {
    const platformTools = join(sdkRoot, "platform-tools");
    const adbName = process.platform === "win32" ? "adb.exe" : "adb";
    if (existsSync(join(platformTools, adbName))) {
      return platformTools;
    }
  }
  return null;
}

function adbAvailable(platformToolsDir) {
  if (!platformToolsDir) {
    return false;
  }
  const adbName = process.platform === "win32" ? "adb.exe" : "adb";
  return existsSync(join(platformToolsDir, adbName));
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", (error) => {
      resolve(error && error.code === "ECONNREFUSED");
    });
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function resolveMetroPort(requestedPort = DEFAULT_METRO_PORT) {
  if (await isPortAvailable(requestedPort)) {
    return requestedPort;
  }
  for (let port = requestedPort + 1; port <= requestedPort + 20; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  return requestedPort;
}

async function checkBackendHealth(origin, timeoutMs = 2000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${origin.replace(/\/+$/u, "")}/v1/health/live`, {
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function warnAboutBackend({ phoneMode, lanIp }) {
  const localLive = await checkBackendHealth("http://127.0.0.1:8000");
  if (!localLive) {
    console.warn("");
    console.warn("Warning: API backend is not reachable at http://127.0.0.1:8000.");
    console.warn("Start it from the repo root:");
    console.warn("  pnpm --filter mobile backend");
    console.warn("");
    return;
  }

  if (!phoneMode || !lanIp) {
    return;
  }

  const lanLive = await checkBackendHealth(`http://${lanIp}:8000`);
  if (lanLive) {
    return;
  }

  console.warn("");
  console.warn(`Warning: API backend is not reachable from your phone at http://${lanIp}:8000.`);
  console.warn("The backend is probably bound to 127.0.0.1 only.");
  console.warn("Restart it so phones on your Wi-Fi can connect:");
  console.warn("  pnpm --filter mobile backend");
  console.warn("Then allow TCP port 8000 through Windows Firewall if prompted.");
  console.warn("");
}

const expoCli = resolveExpoCli();

if (!expoCli) {
  console.error("Expo runtime dependencies are not installed for apps/mobile.");
  console.error("");
  console.error("Run from the repo root:");
  console.error("  pnpm install");
  console.error("");
  console.error("Then start the real mobile app:");
  console.error("  pnpm --filter mobile dev");
  process.exit(1);
}

const rawArgs = process.argv.slice(2);
const online = rawArgs.includes("--online");
const phoneMode = rawArgs.includes("--phone") || rawArgs.includes("--device");
const emulatorMode = rawArgs.includes("--emulator");
const forwardedArgs = rawArgs.filter((arg) => !["--online", "--phone", "--device", "--emulator"].includes(arg));

if (emulatorMode && !hasAndroidTarget(forwardedArgs)) {
  forwardedArgs.push("--android");
}

const platformToolsDir = resolveAndroidPlatformTools();
const canUseAdb = adbAvailable(platformToolsDir);

if (hasAndroidTarget(forwardedArgs) && !phoneMode && !hasHostSelection(forwardedArgs)) {
  if (canUseAdb) {
    forwardedArgs.push("--localhost");
  } else {
    forwardedArgs.push("--lan");
    console.warn("Android SDK platform-tools were not found; falling back to LAN mode for the emulator.");
    console.warn("Install Android platform-tools or add adb to PATH for localhost routing.");
  }
}

if (phoneMode && !hasHostSelection(forwardedArgs)) {
  forwardedArgs.push("--lan");
}

const lanIp = process.env.MOBILE_LAN_IP || process.env.REACT_NATIVE_PACKAGER_HOSTNAME || detectLanIp();
const requestedMetroPort = Number(process.env.RCT_METRO_PORT || process.env.METRO_PORT || DEFAULT_METRO_PORT);
const metroPort = hasPortSelection(forwardedArgs)
  ? requestedMetroPort
  : await resolveMetroPort(Number.isFinite(requestedMetroPort) ? requestedMetroPort : DEFAULT_METRO_PORT);

if (!hasPortSelection(forwardedArgs) && metroPort !== requestedMetroPort) {
  console.warn(`Metro port ${requestedMetroPort} is busy; using ${metroPort} instead.`);
  forwardedArgs.push("--port", String(metroPort));
}

const args = ["start", ...forwardedArgs];
const hostSelected = hasHostSelection(forwardedArgs);
if (!online && !hostSelected && !forwardedArgs.includes("--offline")) {
  args.push("--offline");
}

console.log(`Starting Expo mobile app with ${expoCli}`);

const env = {
  ...process.env,
  EXPO_NO_TELEMETRY: process.env.EXPO_NO_TELEMETRY || "1",
  RCT_METRO_PORT: String(metroPort)
};

if (platformToolsDir) {
  const pathKey = process.platform === "win32" ? "Path" : "PATH";
  const currentPath = env[pathKey] || "";
  if (!currentPath.toLowerCase().includes(platformToolsDir.toLowerCase())) {
    env[pathKey] = `${platformToolsDir}${process.platform === "win32" ? ";" : ":"}${currentPath}`;
  }
}

if ((phoneMode || (hasAndroidTarget(forwardedArgs) && forwardedArgs.includes("--lan"))) && lanIp) {
  env.REACT_NATIVE_PACKAGER_HOSTNAME = lanIp;
}

if (phoneMode && lanIp) {
  env.EXPO_PUBLIC_API_URL = process.env.MOBILE_API_URL
    || process.env.EXPO_PUBLIC_API_URL
    || process.env.MOBILE_BACKEND_ORIGIN
    || process.env.EXPO_PUBLIC_BACKEND_ORIGIN
    || `http://${lanIp}:8000`;
  console.log(`Phone mode: using LAN IP ${lanIp}`);
  console.log(`Phone mode: API URL ${env.EXPO_PUBLIC_API_URL}`);
  if (!lanIp) {
    console.warn("Could not detect a LAN IP. Set MOBILE_LAN_IP before starting phone mode.");
  }
}

if (hasAndroidTarget(forwardedArgs) && !phoneMode) {
  env.EXPO_PUBLIC_API_URL = process.env.MOBILE_API_URL
    || process.env.EXPO_PUBLIC_API_URL
    || process.env.MOBILE_BACKEND_ORIGIN
    || process.env.EXPO_PUBLIC_BACKEND_ORIGIN
    || "http://10.0.2.2:8000";
  console.log(`Android emulator mode: using API ${env.EXPO_PUBLIC_API_URL}`);
  if (forwardedArgs.includes("--localhost") && canUseAdb) {
    console.log("Android emulator mode: Expo localhost routing enabled via adb.");
  }
  if (forwardedArgs.includes("--lan") && lanIp) {
    console.log(`Android emulator mode: Metro reachable at http://${lanIp}:${metroPort}`);
  }
}

await warnAboutBackend({ phoneMode, lanIp });

const child = spawn(process.execPath, [expoCli, ...args], {
  cwd: root,
  env,
  stdio: "inherit",
  windowsHide: false
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code || 0);
});

child.on("error", (error) => {
  console.error(`Failed to start Expo mobile app: ${error.message}`);
  process.exit(1);
});
