import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { globSync } from "node:fs";

const root = join(import.meta.dirname, "..");
const src = join(root, "src");
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

function isTypeOnly(text) {
  return /^\s*(export\s+)?(type|interface)\s/mu.test(text);
}

for (const file of globSync("src/**/*", { cwd: root, nodir: true })) {
  const extension = extname(file);
  const source = join(root, file);
  if ((await stat(source)).isDirectory()) {
    continue;
  }
  const rel = relative(src, source);
  const output = join(dist, rel).replace(/\.(tsx|ts)$/u, ".js");
  const text = await readFile(source, "utf8");
  await mkdir(dirname(output), { recursive: true });
  if (extension === ".ts" || extension === ".tsx") {
    if (isTypeOnly(text)) {
      continue;
    }
    await writeFile(output, text, "utf8");
  } else if (extension === ".html" || extension === ".css" || extension === ".json") {
    await writeFile(join(dist, rel), text, "utf8");
  }
}

console.log("Web build artifacts written to apps/web/dist.");
