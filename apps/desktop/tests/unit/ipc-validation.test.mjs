import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALLOWED_IPC_CHANNELS,
  DesktopRuntimeError,
  normalizeBackendOrigin,
  validateCaptureRequest,
  validateIpcRequest,
  validateSettings,
  validateTextRequest,
  validateUrlRequest
} from "../../dist/src/shared/runtime-validation.js";

test("known IPC channel validates", () => {
  const payload = validateIpcRequest(ALLOWED_IPC_CHANNELS.captureSources, { sourceType: "window" });
  assert.equal(payload.sourceType, "window");
});

test("unknown IPC channel is rejected", () => {
  assert.throws(() => validateIpcRequest("desktop:anything", {}), DesktopRuntimeError);
});

test("renderer cannot request arbitrary external protocols", () => {
  assert.throws(() => validateIpcRequest(ALLOWED_IPC_CHANNELS.externalOpen, { url: "file:///tmp/a" }), DesktopRuntimeError);
});

test("loopback backend origin is normalized", () => {
  assert.equal(normalizeBackendOrigin("http://127.0.0.1:8000/path?q=1"), "http://127.0.0.1:8000");
});

test("remote backend origin is rejected by default", () => {
  assert.throws(() => normalizeBackendOrigin("https://example.com"), DesktopRuntimeError);
});

test("text request validation rejects empty text", () => {
  assert.throws(() => validateTextRequest({ text: "   " }), DesktopRuntimeError);
});

test("URL request validation rejects non-web schemes", () => {
  assert.throws(() => validateUrlRequest({ url: "javascript:alert(1)" }), DesktopRuntimeError);
});

test("capture request preserves region crop", () => {
  const payload = validateCaptureRequest({
    sourceId: "screen:1",
    sourceType: "screen",
    confirm: true,
    crop: { x: 5, y: 8, width: 640, height: 360 }
  });
  assert.deepEqual(payload.crop, { x: 5, y: 8, width: 640, height: 360 });
});

test("settings validation keeps request timeout bounded", () => {
  const settings = validateSettings({ backendOrigin: "http://localhost:8000", requestTimeoutMs: 999999 });
  assert.equal(settings.requestTimeoutMs, 120000);
});
