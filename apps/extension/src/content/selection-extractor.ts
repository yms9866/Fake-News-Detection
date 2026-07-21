import { normalizeWhitespace } from "./metadata-extractor.js";

export function extractSelectionFromWindow(win = globalThis.window) {
  const selection = win && win.getSelection ? win.getSelection() : null;
  const text = normalizeWhitespace(selection ? selection.toString() : "");
  if (!text) {
    return {
      ok: false,
      errorCode: "NO_SELECTED_TEXT",
      message: "Select text on the page before running analysis."
    };
  }
  return { ok: true, text };
}

