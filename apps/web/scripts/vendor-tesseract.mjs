/**
 * Copies the Tesseract worker/WASM core into the app's own static assets and
 * downloads the English traineddata. The web CSP only allows same-origin
 * script/worker/connect sources, so the CDN defaults used by tesseract.js can
 * never load in this app.
 */
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = join(import.meta.dirname, "..");
const outDir = join(root, "public", "tesseract");
const langDir = join(outDir, "lang");

const LANG_URL = "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz";

const CORE_FILES = [
  "tesseract-core.wasm",
  "tesseract-core.wasm.js",
  "tesseract-core-simd.wasm",
  "tesseract-core-simd.wasm.js",
  "tesseract-core-lstm.wasm",
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm",
  "tesseract-core-simd-lstm.wasm.js"
];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(langDir, { recursive: true });

  const workerSource = require.resolve("tesseract.js/dist/worker.min.js");
  await copyFile(workerSource, join(outDir, "worker.min.js"));

  const coreDir = dirname(require.resolve("tesseract.js-core/package.json"));
  for (const file of CORE_FILES) {
    const source = join(coreDir, file);
    if (await exists(source)) {
      await copyFile(source, join(outDir, file));
    }
  }

  const langFile = join(langDir, "eng.traineddata.gz");
  if (await exists(langFile)) {
    console.log("Tesseract assets vendored (language data already present).");
    return;
  }

  const response = await fetch(LANG_URL);
  if (!response.ok) {
    throw new Error(
      `Could not download ${LANG_URL} (${response.status}). Download it manually into ${langDir}.`
    );
  }
  await writeFile(langFile, Buffer.from(await response.arrayBuffer()));
  console.log("Tesseract assets vendored to apps/web/public/tesseract.");
}

await main();
