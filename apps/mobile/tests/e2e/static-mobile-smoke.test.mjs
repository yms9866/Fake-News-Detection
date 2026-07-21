import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("mobile build contains app and adapter entry points", () => {
  assert.equal(existsSync(new URL("../../dist/App.js", import.meta.url)), true);
  assert.equal(existsSync(new URL("../../dist/api/client.js", import.meta.url)), true);
  assert.equal(existsSync(new URL("../../dist/media/mobile-media.js", import.meta.url)), true);
});

test("app shell lists required mobile screens", async () => {
  const app = await readFile(new URL("../../src/App.tsx", import.meta.url), "utf8");
  for (const screen of ["TextAnalysis", "UrlAnalysis", "CameraImage", "GalleryImage", "MicrophoneRecording", "VideoRecording", "ScreenshotAnalysis", "ShareIntent", "ShareExtension", "UploadProgress", "ResultEvidence", "History", "SecureSettings", "Auth", "DeepLinks", "OfflineQueue"]) {
    assert.equal(app.includes(screen), true);
  }
});

test("mobile source does not bundle provider secrets", async () => {
  const app = await readFile(new URL("../../src/App.tsx", import.meta.url), "utf8");
  assert.equal(app.includes("GEMINI" + "_API_KEY"), false);
  assert.equal(app.includes("GOOGLE" + "_API_KEY"), false);
});

test("mobile source does not implement verdict policy", async () => {
  const result = await readFile(new URL("../../src/components/result-view.ts", import.meta.url), "utf8");
  assert.equal(/final_verdict\s*=\s*["']REAL/u.test(result), false);
  assert.equal(/final_verdict\s*=\s*["']FAKE/u.test(result), false);
});
