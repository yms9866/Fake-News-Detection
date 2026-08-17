import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

// Use tsc for type checking (esbuild doesn't do type checking)
const tsc = spawnSync("npx", ["tsc", "--noEmit"], {
  cwd: root,
  stdio: "inherit",
  shell: true
});

if (tsc.status !== 0) {
  process.exit(tsc.status || 1);
}

console.log("Web TypeScript type check passed.");
