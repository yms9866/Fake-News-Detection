import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { CaptureController } from "../../dist/electron/main/capture-controller.js";

test("desktop build contains Electron main, preload, and renderer entry points", () => {
  assert.equal(existsSync(new URL("../../dist/electron/main/main.js", import.meta.url)), true);
  assert.equal(existsSync(new URL("../../dist/electron/preload/preload.cjs", import.meta.url)), true);
  assert.equal(existsSync(new URL("../../dist/src/renderer/index.html", import.meta.url)), true);
});

test("renderer content security policy is local and loopback only", async () => {
  const html = await readFile(new URL("../../dist/src/renderer/index.html", import.meta.url), "utf8");
  assert.match(html, /default-src 'self'/u);
  assert.match(html, /connect-src http:\/\/127\.0\.0\.1:\* http:\/\/localhost:\*/u);
});

test("static smoke captures one fixture frame without retaining bytes", async () => {
  const capture = new CaptureController({
    sourcesProvider: async () => [{ id: "window:1", name: "Fixture window" }],
    frameProvider: async () => ({ bytes: new Uint8Array([4, 5, 6]), mimeType: "image/png" })
  });
  const result = await capture.captureOnce({ sourceId: "window:1", sourceType: "window", confirm: true });
  assert.equal(result.sizeBytes, 3);
  assert.equal(capture.hasPersistedFrame(), false);
});

test("static smoke includes all required desktop screens", async () => {
  const app = await readFile(new URL("../../src/renderer/App.tsx", import.meta.url), "utf8");
  for (const route of ["home", "new-analysis", "text-url", "media", "capture", "live-ocr", "active-job", "result", "history", "settings", "diagnostics"]) {
    assert.equal(app.includes(route), true);
  }
});
