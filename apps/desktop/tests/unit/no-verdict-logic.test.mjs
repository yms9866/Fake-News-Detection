import assert from "node:assert/strict";
import { globSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("../..", import.meta.url);
const rootPath = fileURLToPath(root);
const files = globSync("{electron,src}/**/*.{ts,tsx}", {
  cwd: rootPath,
  nodir: true
}).filter((file) => !file.endsWith("api/contracts.ts"));

async function readAll() {
  const entries = await Promise.all(files.map(async (file) => [file, await readFile(join(rootPath, file), "utf8")]));
  return entries;
}

test("desktop code does not import backend providers", async () => {
  const text = (await readAll()).map((entry) => entry[1]).join("\n");
  assert.equal(/ModernBERT|DuckDuckGo|GeminiEvidenceProvider|adapters\/llm|adapters\/search/u.test(text), false);
});

test("desktop code does not contain deterministic verdict policy functions", async () => {
  const text = (await readAll()).map((entry) => entry[1]).join("\n");
  assert.equal(/decideFinalVerdict|VerdictPolicy|independent confirmations/u.test(text), false);
});

test("renderer bundle source does not include provider secret names", async () => {
  const renderer = (await readAll()).filter((entry) => entry[0].startsWith("src/renderer"));
  const text = renderer.map((entry) => entry[1]).join("\n");
  assert.equal(text.includes("GEMINI" + "_API_KEY"), false);
  assert.equal(text.includes("GOOGLE" + "_API_KEY"), false);
});

test("desktop source treats backend verdict as display data", async () => {
  const text = (await readAll()).map((entry) => entry[1]).join("\n");
  assert.match(text, /result\.final_verdict/u);
  assert.equal(/final_verdict\s*=\s*["']REAL/u.test(text), false);
  assert.equal(/final_verdict\s*=\s*["']FAKE/u.test(text), false);
});
