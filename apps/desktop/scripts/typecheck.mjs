import { globSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const build = spawnSync(process.execPath, ["scripts/build.mjs"], {
  cwd: root,
  stdio: "inherit"
});
if (build.status !== 0) {
  process.exit(build.status || 1);
}

const files = globSync("dist/**/*.{js,cjs}", { cwd: root, nodir: true });
for (const file of files) {
  const check = spawnSync(process.execPath, ["--check", join(root, file)], {
    encoding: "utf8"
  });
  if (check.status !== 0) {
    process.stderr.write(check.stderr || check.stdout);
    process.exit(check.status || 1);
  }
}

console.log(`Desktop JavaScript syntax check passed for ${files.length} files.`);
