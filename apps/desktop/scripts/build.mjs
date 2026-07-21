import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { globSync } from "node:fs";

const root = join(import.meta.dirname, "..");
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

async function copyText(from, to, transform = (value) => value) {
  await mkdir(dirname(to), { recursive: true });
  const text = await readFile(from, "utf8");
  await writeFile(to, transform(text), "utf8");
}

function isTypeOnly(text) {
  return /^\s*(export\s+)?(type|interface)\s/mu.test(text);
}

for (const file of globSync("{electron,src}/**/*", { cwd: root, nodir: true })) {
  const extension = extname(file);
  const source = join(root, file);
  const out = join(dist, file).replace(/\.(tsx|ts)$/u, ".js");
  if (extension === ".ts" || extension === ".tsx") {
    const text = await readFile(source, "utf8");
    if (isTypeOnly(text)) {
      continue;
    }
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, text, "utf8");
  } else if (extension === ".html" || extension === ".css" || extension === ".json") {
    await copyText(source, join(dist, file));
  }
}

try {
  await cp(join(root, "public"), join(dist, "public"), { recursive: true });
} catch (error) {
  if (error && error.code !== "ENOENT") {
    throw error;
  }
}

console.log("Desktop build artifacts written to apps/desktop/dist.");
