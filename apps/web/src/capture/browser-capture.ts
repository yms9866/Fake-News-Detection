export class BrowserCaptureError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BrowserCaptureError";
    this.code = code;
  }
}

export async function requestDisplayCapture(mediaDevices = navigator.mediaDevices) {
  try {
    return await mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch {
    throw new BrowserCaptureError("WEB_DISPLAY_CAPTURE_DENIED", "Display capture permission was denied.");
  }
}

export async function requestCameraImage(mediaDevices = navigator.mediaDevices) {
  try {
    return await mediaDevices.getUserMedia({ video: true, audio: false });
  } catch {
    throw new BrowserCaptureError("WEB_CAMERA_PERMISSION_DENIED", "Camera permission was denied.");
  }
}

export async function requestMicrophone(mediaDevices = navigator.mediaDevices) {
  try {
    return await mediaDevices.getUserMedia({ video: false, audio: true });
  } catch {
    throw new BrowserCaptureError("WEB_MICROPHONE_PERMISSION_DENIED", "Microphone permission was denied.");
  }
}

export function stopStream(stream) {
  if (!stream || typeof stream.getTracks !== "function") {
    return;
  }
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
