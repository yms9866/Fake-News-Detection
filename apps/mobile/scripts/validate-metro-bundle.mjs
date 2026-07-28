import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const outputDir = join(root, ".expo-export", "test");

function resolveExpoCli() {
  try {
    return require.resolve("expo/bin/cli", { paths: [root] });
  } catch {
    return null;
  }
}

const expoCli = resolveExpoCli();
if (!expoCli) {
  console.error("Expo CLI is not installed for apps/mobile.");
  process.exit(1);
}

rmSync(outputDir, { recursive: true, force: true });

const result = spawnSync(process.execPath, [
  expoCli,
  "export",
  "--platform",
  "android",
  "--output-dir",
  outputDir
], {
  cwd: root,
  env: {
    ...process.env,
    EXPO_NO_TELEMETRY: process.env.EXPO_NO_TELEMETRY || "1"
  },
  encoding: "utf8"
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (result.status !== 0) {
  process.exit(result.status || 1);
}

if (!existsSync(join(outputDir, "_expo", "static", "js", "android"))) {
  console.error("Expo export completed, but the Android JavaScript bundle directory was not produced.");
  process.exit(1);
}

rmSync(outputDir, { recursive: true, force: true });
console.log("Expo Android Metro bundle validation passed.");
