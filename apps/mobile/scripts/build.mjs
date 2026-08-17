import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { globSync } from "node:fs";
import * as esbuild from "esbuild";

const root = join(import.meta.dirname, "..");
const src = join(root, "src");
const dist = join(root, "dist");
const sdkAlias = {
  "@fnd/client-sdk": join(root, "../../packages/client-sdk/src/index.ts"),
  "@fnd/analysis-view-model": join(root, "../../packages/analysis-view-model/src/index.ts")
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

function needsBundle(rel) {
  return /api\/client\.(ts|tsx)$|components\/result-view\.(ts|tsx)$/u.test(rel.replace(/\\/gu, "/"));
}

for (const file of globSync("src/**/*", { cwd: root, nodir: true })) {
  const source = join(root, file);
  const extension = extname(file);
  const rel = relative(src, source);
  const output = join(dist, rel).replace(/\.(tsx|ts)$/u, ".js");
  await mkdir(dirname(output), { recursive: true });
  if (extension === ".ts" || extension === ".tsx") {
    const text = await readFile(source, "utf8");
    if (/^\s*(export\s+)?(type|interface)\s/mu.test(text) && !text.includes("export function") && !text.includes("export class") && !text.includes("export const") && !text.includes("export default")) {
      continue;
    }
    const bundle = needsBundle(rel);
    await esbuild.build({
      entryPoints: [source],
      outfile: output,
      format: "esm",
      platform: "neutral",
      bundle,
      alias: bundle ? sdkAlias : undefined,
      jsx: "automatic",
      logLevel: "warning"
    });
  } else if (extension === ".json") {
    await writeFile(join(dist, rel), await readFile(source, "utf8"), "utf8");
  }
}

console.log("Mobile build artifacts written to apps/mobile/dist.");
