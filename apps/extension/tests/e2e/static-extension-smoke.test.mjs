import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("built extension contains no provider credentials and no screenshot fixtures", async () => {
  const dist = fileURLToPath(new URL("../../dist", import.meta.url));
  const files = await collect(dist);
  const joined = (
    await Promise.all(files.map((file) => readFile(file, "utf8").catch(() => "")))
  ).join("\n");

  const forbiddenSecrets = new RegExp(
    ["GEMINI", "GOOGLE"].map((name) => `${name}_API_KEY`).join("|"),
    "iu"
  );
  assert.doesNotMatch(joined, forbiddenSecrets);
  assert.doesNotMatch(joined, /data:image\/png;base64/iu);
});

async function collect(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collect(path)));
    } else {
      files.push(path);
    }
  }
  return files;
}
