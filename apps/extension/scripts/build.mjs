import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "node:fs";
import * as esbuild from "esbuild";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const src = join(root, "src");
const dist = join(root, "dist");
const sdkAlias = {
  "@fnd/client-sdk": join(root, "../../packages/client-sdk/src/index.ts"),
  "@fnd/analysis-view-model": join(root, "../../packages/analysis-view-model/src/index.ts")
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await mkdir(dirname(join(dist, "manifest.json")), { recursive: true });
await writeFile(join(dist, "manifest.json"), await readFile(join(root, "manifest.json"), "utf8"), "utf8");
await cp(join(root, "public"), join(dist, "public"), { recursive: true });

function needsBundle(rel) {
  return /shared\/api-client\.(ts|tsx)$/u.test(rel.replace(/\\/gu, "/"));
}

for (const file of globSync("src/**/*", { cwd: root, nodir: true })) {
  const extension = extname(file);
  const source = join(root, file);
  const rel = relative(src, source);
  if (extension === ".ts" || extension === ".tsx") {
    const text = await readFile(source, "utf8");
    if (/^\s*(export\s+)?(type|interface)\s/mu.test(text) && !text.includes("export function") && !text.includes("export class") && !text.includes("export const")) {
      continue;
    }
    const out = join(dist, rel).replace(/\.(tsx|ts)$/u, ".js");
    const bundle = needsBundle(rel);
    await mkdir(dirname(out), { recursive: true });
    await esbuild.build({
      entryPoints: [source],
      outfile: out,
      format: "esm",
      platform: "neutral",
      bundle,
      alias: bundle ? sdkAlias : undefined,
      jsx: "automatic",
      logLevel: "warning"
    });
  } else if (extension === ".html" || extension === ".css") {
    const out = join(dist, rel);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, await readFile(source, "utf8"), "utf8");
  }
}

console.log("Extension build artifacts written to apps/extension/dist.");
