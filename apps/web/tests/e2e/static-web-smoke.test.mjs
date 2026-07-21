import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("web build contains static entry points", () => {
  assert.equal(existsSync(new URL("../../dist/index.html", import.meta.url)), true);
  assert.equal(existsSync(new URL("../../dist/main.js", import.meta.url)), true);
  assert.equal(existsSync(new URL("../../dist/styles.css", import.meta.url)), true);
});

test("HTML has CSP, viewport, and no remote scripts", async () => {
  const html = await readFile(new URL("../../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /Content-Security-Policy/u);
  assert.match(html, /viewport/u);
  assert.equal(/<script\s+src=["']https?:/iu.test(html), false);
});

test("application source includes required shells", async () => {
  const app = await readFile(new URL("../../src/App.tsx", import.meta.url), "utf8");
  for (const route of ["analyze", "media", "capture", "live", "result", "history", "report", "review", "admin", "auth", "diagnostics"]) {
    assert.equal(app.includes(route), true);
  }
});

test("responsive CSS includes mobile layout", async () => {
  const css = await readFile(new URL("../../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 760px\)/u);
});

test("accessibility labels are present in app helpers", async () => {
  const app = await readFile(new URL("../../src/App.tsx", import.meta.url), "utf8");
  const dom = await readFile(new URL("../../src/components/dom.ts", import.meta.url), "utf8");
  assert.match(app, /aria-label/u);
  assert.match(dom, /setAttribute\("for"/u);
});

test("web source does not implement verdict policy", async () => {
  const app = await readFile(new URL("../../src/App.tsx", import.meta.url), "utf8");
  assert.equal(/final_verdict\s*=\s*["']REAL/u.test(app), false);
  assert.equal(/final_verdict\s*=\s*["']FAKE/u.test(app), false);
});
