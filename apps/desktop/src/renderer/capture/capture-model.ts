export function canUploadCapture(captureResult) {
  return Boolean(captureResult && captureResult.dataUrl && captureResult.mimeType === "image/png");
}

export async function captureDataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return await response.blob();
}

export function makeCaptureUploadOptions(settings = {}) {
  return {
    deepCheck: Boolean(settings.defaultDeepCheck),
    maxLength: settings.defaultMaxLength || 512,
    idempotencyKey: `desktop-capture-${Date.now()}`
  };
}
