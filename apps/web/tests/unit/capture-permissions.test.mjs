import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BrowserCaptureError,
  requestCameraImage,
  requestDisplayCapture,
  requestMicrophone,
  stopStream
} from "../../dist/capture/browser-capture.js";

test("display-capture permission denial is stable", async () => {
  await assert.rejects(
    () => requestDisplayCapture({ getDisplayMedia: async () => { throw new Error("denied"); } }),
    (error) => error instanceof BrowserCaptureError && error.code === "WEB_DISPLAY_CAPTURE_DENIED"
  );
});

test("camera permission denial is stable", async () => {
  await assert.rejects(
    () => requestCameraImage({ getUserMedia: async () => { throw new Error("denied"); } }),
    (error) => error instanceof BrowserCaptureError && error.code === "WEB_CAMERA_PERMISSION_DENIED"
  );
});

test("microphone permission denial is stable", async () => {
  await assert.rejects(
    () => requestMicrophone({ getUserMedia: async () => { throw new Error("denied"); } }),
    (error) => error instanceof BrowserCaptureError && error.code === "WEB_MICROPHONE_PERMISSION_DENIED"
  );
});

test("captured streams can be stopped immediately", () => {
  const stopped = [];
  stopStream({ getTracks: () => [{ stop: () => stopped.push("video") }, { stop: () => stopped.push("audio") }] });
  assert.deepEqual(stopped, ["video", "audio"]);
});
