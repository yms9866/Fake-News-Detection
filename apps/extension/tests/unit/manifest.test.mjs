import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const manifest = JSON.parse(
  await readFile(new URL("../../manifest.json", import.meta.url), "utf8")
);

test("manifest is valid MV3 with minimal permissions", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.sort(), [
    "activeTab",
    "contextMenus",
    "scripting",
    "storage"
  ].sort());
  assert.equal(manifest.incognito, undefined);
  assert.equal(manifest.permissions.includes("tabs"), false);
});

test("manifest has no wildcard host permission or remote scripts", () => {
  assert.equal(manifest.host_permissions.includes("<all_urls>"), false);
  assert.equal(manifest.host_permissions.includes("*://*/*"), false);
  assert.match(manifest.content_security_policy.extension_pages, /script-src 'self'/u);
  assert.doesNotMatch(JSON.stringify(manifest), /https?:\/\/.+\.js/iu);
});

