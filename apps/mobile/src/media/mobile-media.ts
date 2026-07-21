import { requirePermission } from "../platform/permissions.js";

export async function captureCameraImage(adapter) {
  await requirePermission("camera", adapter.permissions);
  return await adapter.camera.captureImage();
}

export async function pickGalleryImage(adapter) {
  await requirePermission("gallery", adapter.permissions);
  return await adapter.gallery.pickImage();
}

export async function recordMicrophone(adapter) {
  await requirePermission("microphone", adapter.permissions);
  return await adapter.audio.record();
}

export async function selectAudio(adapter) {
  await requirePermission("audio", adapter.permissions);
  return await adapter.audio.pick();
}

export async function recordVideo(adapter) {
  await requirePermission("video", adapter.permissions);
  return await adapter.video.record();
}

export async function selectVideo(adapter) {
  await requirePermission("video", adapter.permissions);
  return await adapter.video.pick();
}

export async function analyzeScreenshot(adapter) {
  await requirePermission("gallery", adapter.permissions);
  return await adapter.gallery.pickScreenshot();
}
