import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("web build contains static entry points", () => {
  assert.equal(existsSync(new URL("../../dist/index.html", import.meta.url)), true);
  assert.equal(existsSync(new URL("../../dist/bundle.js", import.meta.url)) || existsSync(new URL("../../dist/main.js", import.meta.url)), true);
});

test("HTML has CSP, viewport, and no remote scripts", async () => {
  const html = await readFile(new URL("../../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /Content-Security-Policy/u);
  assert.match(html, /viewport/u);
  assert.equal(/<script\s+src=["']https?:/iu.test(html), false);
});

test("application source includes required shells", async () => {
  const screens = await readFile(new URL("../../src/screens/index.tsx", import.meta.url), "utf8");
  for (const route of ["analyze", "media", "capture", "live", "result", "history", "report", "review", "admin", "diagnostics"]) {
    assert.equal(screens.includes(route) || screens.toLowerCase().includes(route), true);
  }
  assert.equal(screens.includes("auth"), false);
});

test("responsive CSS includes mobile layout", async () => {
  const css = await readFile(new URL("../../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 768px\)/u);
});

test("accessibility labels are present", async () => {
  const screens = await readFile(new URL("../../src/screens/index.tsx", import.meta.url), "utf8");
  assert.match(screens, /aria-label/u);
});

test("web source does not implement verdict policy", async () => {
  const app = await readFile(new URL("../../src/App.tsx", import.meta.url), "utf8");
  assert.equal(/final_verdict\s*=\s*["']REAL/u.test(app), false);
  assert.equal(/final_verdict\s*=\s*["']FAKE/u.test(app), false);
});

test("web app creates one browser API client and avoids Electron globals", async () => {
  const app = await readFile(new URL("../../src/App.tsx", import.meta.url), "utf8");
  const hook = await readFile(new URL("../../src/hooks/use-workspace.ts", import.meta.url), "utf8");
  const client = await readFile(new URL("../../src/api/client.ts", import.meta.url), "utf8");
  const matches = hook.match(/createWebApiClient\(/gu) || [];
  assert.equal(matches.length, 1);
  assert.equal(/desktopApi|ipcRenderer|electron/iu.test(app + client), false);
});
