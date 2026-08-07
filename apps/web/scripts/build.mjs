import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as esbuild from "esbuild";

const root = join(import.meta.dirname, "..");
const src = join(root, "src");
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// Copy static assets (HTML, CSS)
const indexHtml = await readFile(join(src, "index.html"), "utf8");
await writeFile(join(dist, "index.html"), indexHtml, "utf8");

const stylesCss = await readFile(join(src, "styles.css"), "utf8");
await writeFile(join(dist, "styles.css"), stylesCss, "utf8");

// Build React app with esbuild
await esbuild.build({
  entryPoints: [join(src, "main.tsx")],
  bundle: true,
  outfile: join(dist, "bundle.js"),
  format: "esm",
  target: "es2022",
  jsx: "automatic",
  loader: {
    ".ts": "tsx",
    ".tsx": "tsx"
  },
  external: [],
  sourcemap: true,
  logLevel: "info"
});

console.log("Web build artifacts written to apps/web/dist.");
