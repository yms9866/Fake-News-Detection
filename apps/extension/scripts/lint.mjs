import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { globSync } from "node:fs";

const root = join(import.meta.dirname, "..");
const files = globSync("{src,tests}/**/*.{ts,tsx,mjs,html,css}", {
  cwd: root,
  nodir: true
});
const forbidden = [
  /GEMINI_API_KEY/u,
  /GOOGLE_API_KEY/u,
  /api[_-]?key\s*[:=]/iu,
  /<script\s+src=["']https?:/iu,
  /\beval\s*\(/u,
  /\.innerHTML\s*=/u
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

console.log(`Lint passed for ${files.length} extension files.`);

