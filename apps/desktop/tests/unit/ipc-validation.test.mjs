import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALLOWED_IPC_CHANNELS,
  DesktopRuntimeError,
  normalizeBackendOrigin,
  validateCaptureRequest,
  validateExternalUrl,
  validateIpcRequest,
  validateSettings,
  validateTextRequest,
  validateUrlRequest
} from "../../dist/src/shared/runtime-validation.js";
import { openExternalLink } from "../../dist/electron/main/external-links.js";

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

test("safe HTTP and HTTPS source URLs are accepted for external opening", () => {
  assert.equal(validateExternalUrl("https://example.com/report"), "https://example.com/report");
  assert.equal(validateExternalUrl("http://example.com/report"), "http://example.com/report");
});

test("credentialed and injected external URLs are rejected", () => {
  assert.throws(() => validateExternalUrl("https://user:pass@example.com"), DesktopRuntimeError);
  assert.throws(() => validateExternalUrl("https://example.com/a\nb"), DesktopRuntimeError);
  assert.throws(() => validateExternalUrl("data:text/html,hi"), DesktopRuntimeError);
});

test("main-process external link helper validates before opening", () => {
  const opened = [];
  const shell = { openExternal: (url) => opened.push(url) };
  const result = openExternalLink(shell, "https://example.com/source");
  assert.equal(result.opened, true);
  assert.deepEqual(opened, ["https://example.com/source"]);
  assert.throws(() => openExternalLink(shell, "chrome://settings"), DesktopRuntimeError);
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
