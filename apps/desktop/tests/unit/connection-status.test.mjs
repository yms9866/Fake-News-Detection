import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("connection status recognizes externally managed backend states", async () => {
  const source = await readFile(new URL("../../src/renderer/components/ui.ts", import.meta.url), "utf8");
  assert.match(source, /connected-existing/u);
  assert.match(source, /running-owned/u);
  assert.match(source, /Backend live/u);
  assert.match(source, /renderConnectionStatus/u);
});

test("desktop shell mirrors web sticky collapsible sidebar", async () => {
  const app = await readFile(new URL("../../src/renderer/App.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../../src/renderer/styles.css", import.meta.url), "utf8");
  assert.match(app, /toggleSidebar/u);
  assert.match(app, /sidebar collapsed/u);
  assert.match(app, /top-header/u);
  assert.match(css, /--sidebar-collapsed-width/u);
  assert.match(css, /\.sidebar\.collapsed/u);
  assert.match(css, /position:\s*sticky/u);
});

test("toggle row uses a label so the switch is clickable", async () => {
  const source = await readFile(new URL("../../src/renderer/components/ui.ts", import.meta.url), "utf8");
  assert.match(source, /createElement\("label"\)/u);
  assert.match(source, /toggle-switch/u);
});

test("analyze screen redraws when switching text and url tabs", async () => {
  const source = await readFile(new URL("../../src/renderer/screens/analyze-screen.ts", import.meta.url), "utf8");
  assert.match(source, /actions\.redraw\(\)/u);
});

test("diagnostics refresh probes for an existing backend", async () => {
  const source = await readFile(new URL("../../electron/main/main.ts", import.meta.url), "utf8");
  assert.match(source, /detectExisting\(settings\.getSettings\(\)\.backendOrigin\)/u);
});
