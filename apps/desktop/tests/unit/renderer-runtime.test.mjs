import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { DesktopInitializationError, resolveDesktopBridge } from "../../dist/src/renderer/App.js";

function bridgeFixture() {
  return {
    desktopApi: {
      backend: { start: async () => ({ ok: true, value: { state: "running" } }) },
      capture: {},
      settings: {},
      history: {},
      diagnostics: {},
      external: { open: async () => ({ ok: true, value: { opened: true } }) }
    }
  };
}

test("renderer bridge global name matches preload contract", () => {
  const bridge = resolveDesktopBridge(bridgeFixture());
  assert.equal(typeof bridge.backend.start, "function");
  assert.equal(typeof bridge.external.open, "function");
});

test("missing desktop bridge produces a clear initialization error", () => {
  assert.throws(
    () => resolveDesktopBridge({}),
    (error) =>
      error instanceof DesktopInitializationError &&
      error.code === "DESKTOP_BRIDGE_MISSING"
  );
});

test("incomplete desktop bridge is rejected before rendering", () => {
  assert.throws(
    () => resolveDesktopBridge({ desktopApi: { backend: {} } }),
    (error) =>
      error instanceof DesktopInitializationError &&
      error.code === "DESKTOP_BRIDGE_INCOMPLETE"
  );
});

test("desktop result view uses secure source action and visible evidence labels", async () => {
  const source = await readFile(new URL("../../src/renderer/components/result-view.ts", import.meta.url), "utf8");
  assert.match(source, /actions\.openSource/u);
  assert.match(source, /aria-label/u);
  assert.equal(source.includes("bridge.external"), false);
  assert.match(source, /Writing style alone cannot establish whether the claims are true or false\./u);
  assert.match(source, /Gemini evidence analysis/u);
  assert.match(source, /Mentions the topic/u);
  assert.match(source, /Source not fetched/u);
});

test("desktop app imports DOM helpers used by startup loading state", async () => {
  const source = await readFile(new URL("../../src/renderer/App.tsx", import.meta.url), "utf8");
  assert.match(source, /import\s+\{\s*el\s*\}\s+from\s+"\.\/components\/dom\.js"/u);
  assert.match(source, /renderLoadingPanel/u);
});
