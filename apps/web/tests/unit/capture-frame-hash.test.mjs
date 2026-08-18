import assert from "node:assert/strict";
import { test } from "node:test";
import { frameHash } from "../../dist/capture/browser-capture.js";

function withFakeCanvas(pixels, run) {
  const original = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: () => {},
        getImageData: () => ({ data: pixels })
      })
    })
  };
  try {
    return run();
  } finally {
    globalThis.document = original;
  }
}

function pixels(brightPixelCount) {
  const data = new Uint8ClampedArray(8 * 8 * 4);
  for (let pixel = 0; pixel < 64; pixel += 1) {
    const value = pixel < brightPixelCount ? 255 : 0;
    data[pixel * 4] = value;
    data[pixel * 4 + 1] = value;
    data[pixel * 4 + 2] = value;
    data[pixel * 4 + 3] = 255;
  }
  return data;
}

test("frame hash fits the live-frame perceptual_hash contract", () => {
  const hash = withFakeCanvas(pixels(32), () => frameHash({}));
  assert.equal(hash.length, 16);
  assert.ok(hash.length <= 256, "perceptual_hash must fit the 256 character API limit");
  assert.match(hash, /^[0-9a-f]{16}$/u, "backend hamming distance requires hex digits");
});

test("frame hash separates visually different frames", () => {
  const top = withFakeCanvas(pixels(32), () => frameHash({}));
  const inverted = withFakeCanvas(pixels(0), () => frameHash({}));
  assert.equal(top, "ffffffff00000000");
  assert.notEqual(top, inverted);
});
