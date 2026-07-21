import { DESKTOP_ERROR_CODES, DesktopRuntimeError, validateCaptureRequest } from "../../src/shared/runtime-validation.js";

export class CaptureController {
  constructor(options = {}) {
    this.sourcesProvider = options.sourcesProvider || null;
    this.frameProvider = options.frameProvider || null;
    this.lastSelectedSourceId = null;
    this.lastFrameBytes = null;
    this.captureCount = 0;
  }

  async listSources(sourceType = "screen") {
    if (!this.sourcesProvider) {
      return [];
    }
    const types = sourceType === "window" ? ["window"] : ["screen"];
    const sources = await this.sourcesProvider({ types, thumbnailSize: { width: 1280, height: 720 } });
    return sources.map((source) => ({
      id: String(source.id),
      name: String(source.name || "Untitled source"),
      sourceType: sourceType === "window" ? "window" : "screen",
      thumbnailDataUrl: typeof source.thumbnailDataUrl === "string" ? source.thumbnailDataUrl : null
    }));
  }

  selectSource(sourceId) {
    this.lastSelectedSourceId = sourceId;
  }

  async captureOnce(payload) {
    const request = validateCaptureRequest(payload);
    if (!request.confirm) {
      throw new DesktopRuntimeError(
        DESKTOP_ERROR_CODES.capturePermissionRequired,
        "Capture requires an explicit confirmation from the user."
      );
    }
    this.selectSource(request.sourceId);
    if (!this.frameProvider) {
      throw new DesktopRuntimeError(
        DESKTOP_ERROR_CODES.captureSourceRequired,
        "No desktop capture provider is available."
      );
    }

    const frame = await this.frameProvider({
      sourceId: request.sourceId,
      sourceType: request.sourceType,
      crop: request.crop
    });
    const bytes = frame.bytes || new Uint8Array();
    this.lastFrameBytes = bytes;
    this.captureCount += 1;
    const result = {
      sourceId: request.sourceId,
      sourceType: request.sourceType,
      crop: request.crop,
      mimeType: frame.mimeType || "image/png",
      sizeBytes: bytes.byteLength || bytes.length || 0,
      dataUrl: frame.dataUrl || bytesToDataUrl(bytes, frame.mimeType || "image/png"),
      capturedAt: new Date().toISOString()
    };
    this.releaseFrame();
    return result;
  }

  releaseFrame() {
    this.lastFrameBytes = null;
  }

  hasPersistedFrame() {
    return this.lastFrameBytes !== null;
  }
}

export function bytesToDataUrl(bytes, mimeType = "image/png") {
  const buffer = Buffer.from(bytes);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}
