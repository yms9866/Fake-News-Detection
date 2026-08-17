import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { globSync } from "node:fs";
import * as esbuild from "esbuild";

const root = join(import.meta.dirname, "..");
const dist = join(root, "dist");
const sdkAlias = {
  "@fnd/client-sdk": join(root, "../../packages/client-sdk/src/index.ts"),
  "@fnd/analysis-view-model": join(root, "../../packages/analysis-view-model/src/index.ts")
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

function needsBundle(file) {
  return /api\/client\.(ts|tsx)$|safe-content\.(ts|tsx)$|result-view\.(ts|tsx)$/u.test(file.replace(/\\/gu, "/"));
}

for (const file of globSync("{electron,src}/**/*", { cwd: root, nodir: true })) {
  const extension = extname(file);
  const source = join(root, file);
  const normalizedFile = file.replace(/\\/gu, "/");
  if (normalizedFile === "electron/preload/preload.ts") {
    await esbuild.build({
      entryPoints: [source],
      outfile: join(dist, "electron/preload/preload.cjs"),
      format: "cjs",
      platform: "node",
      bundle: false,
      logLevel: "warning"
    });
    continue;
  }
  if (extension === ".ts" || extension === ".tsx") {
    const text = await readFile(source, "utf8");
    if (/^\s*(export\s+)?(type|interface)\s/mu.test(text) && !text.includes("export function") && !text.includes("export class") && !text.includes("export const")) {
      continue;
    }
    const out = join(dist, file).replace(/\.(tsx|ts)$/u, ".js");
    const bundle = needsBundle(normalizedFile);
    await mkdir(dirname(out), { recursive: true });
    await esbuild.build({
      entryPoints: [source],
      outfile: out,
      format: "esm",
      platform: "neutral",
      bundle,
      packages: bundle ? undefined : undefined,
      alias: bundle ? sdkAlias : undefined,
      jsx: "automatic",
      logLevel: "warning"
    });
  } else if (extension === ".html" || extension === ".css" || extension === ".json") {
    const out = join(dist, file);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, await readFile(source, "utf8"), "utf8");
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
