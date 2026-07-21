import assert from "node:assert/strict";
import { test } from "node:test";
import { CaptureController } from "../../dist/electron/main/capture-controller.js";

function controller() {
  return new CaptureController({
    sourcesProvider: async ({ types }) => [
      { id: `${types[0]}:1`, name: `${types[0]} source`, thumbnailDataUrl: "data:image/png;base64,AA==" }
    ],
    frameProvider: async ({ sourceId, crop }) => ({
      bytes: new Uint8Array([137, 80, 78, 71]),
      mimeType: "image/png",
      sourceId,
      crop
    })
  });
}

test("one-time screen sources can be listed", async () => {
  const sources = await controller().listSources("screen");
  assert.equal(sources[0].sourceType, "screen");
});

test("one-time window sources can be listed", async () => {
  const sources = await controller().listSources("window");
  assert.equal(sources[0].sourceType, "window");
});

test("capture requires explicit confirmation", async () => {
  await assert.rejects(() => controller().captureOnce({ sourceId: "screen:1", sourceType: "screen" }));
});

test("capture releases frame bytes after returning one frame", async () => {
  const capture = controller();
  const result = await capture.captureOnce({ sourceId: "screen:1", sourceType: "screen", confirm: true });
  assert.equal(result.mimeType, "image/png");
  assert.equal(capture.hasPersistedFrame(), false);
  assert.equal(capture.captureCount, 1);
});

test("region crop is preserved on the capture request", async () => {
  const crop = { x: 10, y: 20, width: 300, height: 200 };
  const result = await controller().captureOnce({ sourceId: "window:1", sourceType: "window", confirm: true, crop });
  assert.deepEqual(result.crop, crop);
});
