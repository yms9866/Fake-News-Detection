import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "node:fs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const src = join(root, "src");
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

async function copyText(from, to, transform = (value) => value) {
  await mkdir(dirname(to), { recursive: true });
  const text = await readFile(from, "utf8");
  await writeFile(to, transform(text), "utf8");
}

await copyText(join(root, "manifest.json"), join(dist, "manifest.json"));
await cp(join(root, "public"), join(dist, "public"), { recursive: true });

for (const file of globSync("src/**/*", { cwd: root, nodir: true })) {
  const extension = extname(file);
  const source = join(root, file);
  const rel = relative(src, source);
  if (extension === ".ts" || extension === ".tsx") {
    const out = join(dist, rel).replace(/\.(tsx|ts)$/u, ".js");
    const text = await readFile(source, "utf8");
    if (/^\s*(export\s+)?(type|interface)\s/mu.test(text)) {
      continue;
    }
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, text, "utf8");
  } else if (extension === ".html" || extension === ".css") {
    await copyText(source, join(dist, rel));
  }
}
