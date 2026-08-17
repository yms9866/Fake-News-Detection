export class BrowserCaptureError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BrowserCaptureError";
    this.code = code;
  }
}

type MediaDeviceApi = {
  getDisplayMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
};

export async function requestDisplayCapture(mediaDevices: MediaDeviceApi = navigator.mediaDevices) {
  try {
    if (!mediaDevices.getDisplayMedia) {
      throw new Error("missing");
    }
    return await mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch {
    throw new BrowserCaptureError("WEB_DISPLAY_CAPTURE_DENIED", "Display capture permission was denied.");
  }
}

export async function requestCameraImage(mediaDevices: MediaDeviceApi = navigator.mediaDevices) {
  try {
    if (!mediaDevices.getUserMedia) {
      throw new Error("missing");
    }
    return await mediaDevices.getUserMedia({ video: true, audio: false });
  } catch {
    throw new BrowserCaptureError("WEB_CAMERA_PERMISSION_DENIED", "Camera permission was denied.");
  }
}

export async function requestMicrophone(mediaDevices: MediaDeviceApi = navigator.mediaDevices) {
  try {
    if (!mediaDevices.getUserMedia) {
      throw new Error("missing");
    }
    return await mediaDevices.getUserMedia({ video: false, audio: true });
  } catch {
    throw new BrowserCaptureError("WEB_MICROPHONE_PERMISSION_DENIED", "Microphone permission was denied.");
  }
}

export function stopStream(stream: { getTracks?: () => Array<{ stop: () => void }> } | null) {
  if (!stream || typeof stream.getTracks !== "function") {
    return;
  }
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export async function snapshotStreamToFile(stream: MediaStream, name = "capture.jpg") {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(video.videoWidth || 1280, 1);
  canvas.height = Math.max(video.videoHeight || 720, 1);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new BrowserCaptureError("WEB_CAPTURE_FAILED", "Could not capture a frame from the stream.");
  }
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) {
    throw new BrowserCaptureError("WEB_CAPTURE_FAILED", "Could not encode the captured frame.");
  }
  return new File([blob], name, { type: "image/jpeg" });
}

export function frameHash(canvas: HTMLCanvasElement) {
  const sample = document.createElement("canvas");
  sample.width = 8;
  sample.height = 8;
  const context = sample.getContext("2d");
  if (!context) {
    return String(Date.now());
  }
  context.drawImage(canvas, 0, 0, 8, 8);
  const data = context.getImageData(0, 0, 8, 8).data;
  return Array.from(data).join(".");
}

export async function recordMicrophoneToFile(stream: MediaStream, durationMs = 8000) {
  const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  return await new Promise<File>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onerror = () => reject(new BrowserCaptureError("WEB_CAPTURE_FAILED", "Microphone recording failed."));
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      resolve(new File([blob], "microphone.webm", { type: blob.type }));
    };
    recorder.start();
    setTimeout(() => {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    }, durationMs);
  });
}
