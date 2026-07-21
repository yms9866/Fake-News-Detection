import { globSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(import.meta.dirname, "..");
const folders = process.argv.slice(2);
const files = folders.flatMap((folder) =>
  globSync(`${folder}/**/*.test.mjs`, { cwd: root, nodir: true })
);

if (files.length === 0) {
  console.log("No desktop tests matched.");
  process.exit(0);
}

const result = spawnSync(process.execPath, ["--test", ...files], {
  cwd: root,
  stdio: "inherit"
});
process.exit(result.status || 0);
