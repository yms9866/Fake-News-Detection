export const MESSAGE_TYPES = {
  analyzeSelection: "ANALYZE_SELECTION",
  analyzeArticle: "ANALYZE_ARTICLE",
  analyzePage: "ANALYZE_PAGE",
  analyzeUrl: "ANALYZE_URL",
  captureVisibleTab: "CAPTURE_VISIBLE_TAB",
  getAnalysisState: "GET_ANALYSIS_STATE",
  cancelJob: "CANCEL_JOB",
  showOverlay: "SHOW_OVERLAY",
  dismissOverlay: "DISMISS_OVERLAY",
  openLatestReport: "OPEN_LATEST_REPORT",
  extractSelection: "EXTRACT_SELECTION",
  extractArticle: "EXTRACT_ARTICLE",
  extractPage: "EXTRACT_PAGE",
  testConnection: "TEST_CONNECTION",
  signIn: "SIGN_IN",
  signOut: "SIGN_OUT",
  saveSettings: "SAVE_SETTINGS",
  clearState: "CLEAR_STATE",
  settingsUpdated: "SETTINGS_UPDATED"
};

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isExtensionMessage(message) {
  if (!isPlainObject(message) || typeof message.type !== "string") {
    return false;
  }
  return Object.values(MESSAGE_TYPES).includes(message.type);
}

export function assertExtensionMessage(message) {
  if (!isExtensionMessage(message)) {
    throw new Error("Invalid extension message.");
  }
  return message;
}

export function makeMessage(type, payload = null) {
  return { type, payload };
}

export function makeIdempotencyKey(prefix = "fnd") {
  const random = crypto.getRandomValues(new Uint32Array(4));
  return `${prefix}-${Date.now()}-${Array.from(random).map((item) => item.toString(16)).join("")}`;
}
