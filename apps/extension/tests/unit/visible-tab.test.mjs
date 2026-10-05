import assert from "node:assert/strict";
import { test } from "node:test";
import { dataUrlToBlob } from "../../dist/capture/visible-tab-capture.js";
import { safeSourceUrl } from "../../dist/content/overlay/result-overlay.js";

test("screenshot data URL converts to a named PNG file", async () => {
  const blob = await dataUrlToBlob("data:image/png;base64,cG5n");
  assert.equal(blob.type, "image/png");
  assert.equal(blob.size, 3);
  assert.equal(blob.name, "visible-tab.png");
});

test("source links permit only HTTP and HTTPS", () => {
  assert.equal(safeSourceUrl("https://example.test/source"), "https://example.test/source");
  assert.equal(safeSourceUrl("javascript:alert(1)"), "");
  assert.equal(safeSourceUrl("file:///secret"), "");
});

