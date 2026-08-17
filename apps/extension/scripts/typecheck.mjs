import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const tsc = spawnSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "--noEmit"], {
  cwd: root,
  stdio: "inherit"
});
if (tsc.status !== 0) {
  const npx = spawnSync("npx", ["tsc", "--noEmit"], { cwd: root, stdio: "inherit", shell: true });
  process.exit(npx.status || 1);
}
console.log("TypeScript type check passed.");
