import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyzeScreenshot,
  captureCameraImage,
  pickGalleryImage,
  recordMicrophone,
  recordVideo,
  selectAudio,
  selectVideo
} from "../../dist/media/mobile-media.js";
import { PermissionError, requirePermission } from "../../dist/platform/permissions.js";

function adapter(granted = true) {
  return {
    permissions: { request: async () => granted },
    camera: { captureImage: async () => ({ uri: "camera.jpg" }) },
    gallery: {
      pickImage: async () => ({ uri: "gallery.jpg" }),
      pickScreenshot: async () => ({ uri: "screenshot.png" })
    },
    audio: {
      record: async () => ({ uri: "recording.wav" }),
      pick: async () => ({ uri: "selected.wav" })
    },
    video: {
      record: async () => ({ uri: "recording.mp4" }),
      pick: async () => ({ uri: "selected.mp4" })
    }
  };
}

test("camera permission denial is stable", async () => {
  await assert.rejects(() => captureCameraImage(adapter(false)), PermissionError);
});

test("gallery image permission works", async () => {
  assert.equal((await pickGalleryImage(adapter())).uri, "gallery.jpg");
});

test("microphone recording permission works", async () => {
  assert.equal((await recordMicrophone(adapter())).uri, "recording.wav");
});

test("audio selection permission works", async () => {
  assert.equal((await selectAudio(adapter())).uri, "selected.wav");
});

test("video recording permission works", async () => {
  assert.equal((await recordVideo(adapter())).uri, "recording.mp4");
});

test("video selection permission works", async () => {
  assert.equal((await selectVideo(adapter())).uri, "selected.mp4");
});

test("screenshot analysis uses gallery permission", async () => {
  assert.equal((await analyzeScreenshot(adapter())).uri, "screenshot.png");
});

test("permission helper reports specific denial code", async () => {
  await assert.rejects(
    () => requirePermission("camera", { request: async () => false }),
    (error) => error.code === "MOBILE_CAMERA_PERMISSION_DENIED"
  );
});
