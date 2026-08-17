import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { globSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = join(import.meta.dirname, "..");
const repoRoot = join(root, "../..");
const eslintBin = join(repoRoot, "node_modules/eslint/bin/eslint.js");
const eslint = spawnSync(process.execPath, [eslintBin, "."], {
  cwd: root,
  stdio: "inherit"
});
if (eslint.status !== 0) {
  process.exit(eslint.status || 1);
}

const files = globSync("{src,tests}/**/*.{ts,tsx,mjs,html,css}", {
  cwd: root,
  nodir: true
});
const forbidden = [
  new RegExp("GEMINI" + "_API_KEY", "u"),
  new RegExp("GOOGLE" + "_API_KEY", "u"),
  /api[_-]?key\s*[:=]/iu
];
const failures = [];
for (const file of files) {
  const text = await readFile(join(root, file), "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(text)) {
      failures.push(`${file}: forbidden pattern ${pattern}`);
    }
  }
}
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Lint passed for ${files.length} files.`);
