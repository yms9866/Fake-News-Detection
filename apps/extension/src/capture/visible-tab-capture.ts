import { MAX_SCREENSHOT_BYTES } from "../shared/constants.js";
import { EXTENSION_ERROR_CODES, ExtensionError } from "../shared/errors.js";

export async function captureVisibleTabOnce() {
  if (!chrome.tabs || !chrome.tabs.captureVisibleTab) {
    throw new ExtensionError(
      EXTENSION_ERROR_CODES.screenshotCaptureFailed,
      "Visible-tab capture is unavailable in this browser context."
    );
  }
  const dataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
  return await dataUrlToBlob(dataUrl);
}

export async function dataUrlToBlob(dataUrl) {
  if (!String(dataUrl || "").startsWith("data:image/")) {
    throw new ExtensionError(
      EXTENSION_ERROR_CODES.screenshotCaptureFailed,
      "Captured tab data was not an image."
    );
  }
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  if (blob.size > MAX_SCREENSHOT_BYTES) {
    throw new ExtensionError(
      EXTENSION_ERROR_CODES.uploadFailed,
      "Captured screenshot exceeds the configured upload limit."
    );
  }
  return blob;
}

