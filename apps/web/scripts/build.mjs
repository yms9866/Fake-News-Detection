import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { build as viteBuild } from "vite";
import * as esbuild from "esbuild";

const root = join(import.meta.dirname, "..");

await import("./vendor-tesseract.mjs");
await viteBuild({ configFile: join(root, "vite.config.ts") });
await copyFile(join(root, "dist/bundle.js"), join(root, "dist/main.js")).catch(async () => {
  await mkdir(join(root, "dist"), { recursive: true });
});

const testEntries = [
  "api/client.ts",
  "api/validation.ts",
  "capture/browser-capture.ts",
  "security/csp.ts",
  "stores/history-store.ts",
  "components/safe-rendering.ts"
];

for (const relPath of testEntries) {
  await esbuild.build({
    entryPoints: [join(root, "src", relPath)],
    bundle: true,
    outfile: join(root, "dist", relPath.replace(/\.tsx?$/u, ".js")),
    format: "esm",
    platform: "node",
    target: "es2022",
    packages: "external",
    alias: {
      "@fnd/client-sdk": join(root, "../../packages/client-sdk/src/index.ts"),
      "@fnd/analysis-view-model": join(root, "../../packages/analysis-view-model/src/index.ts")
    }
  });
}

console.log("Web build artifacts written to apps/web/dist.");
