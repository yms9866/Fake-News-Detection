export function parseIosShareExtension(payload) {
  return {
    text: payload && payload.text ? String(payload.text) : "",
    url: payload && payload.url ? String(payload.url) : null,
    attachmentUri: payload && payload.attachmentUri ? String(payload.attachmentUri) : null
  };
}

export function restrictedCaptureFallback(reason = "restricted") {
  return {
    mode: "screenshot_or_share",
    reason,
    message: "Use screenshot analysis or the share extension when direct capture is restricted."
  };
}
