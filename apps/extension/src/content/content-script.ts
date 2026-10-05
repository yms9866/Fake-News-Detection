import { extractArticleFromDocument } from "./article-extractor.js";
import { isUnsupportedPageUrl } from "./metadata-extractor.js";
import { extractPageFromDocument } from "./page-extractor.js";
import { extractSelectionFromWindow } from "./selection-extractor.js";
import { dismissOverlay, showOverlay } from "./overlay/overlay-root.js";
import { MESSAGE_TYPES } from "../shared/messages.js";

const READY_FLAG = "__FND_CONTENT_READY";

if (!globalThis[READY_FLAG]) {
  globalThis[READY_FLAG] = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const handled = handleMessage(message);
    if (!handled) {
      return false;
    }
    void handled.then(sendResponse);
    return true;
  });
}

function handleMessage(message) {
  if (!message || typeof message.type !== "string") {
    return Promise.resolve({
      ok: false,
      errorCode: "INVALID_MESSAGE",
      message: "Invalid content message."
    });
  }
  if (
    isUnsupportedPageUrl(location.href) &&
    message.type !== MESSAGE_TYPES.showOverlay &&
    message.type !== MESSAGE_TYPES.dismissOverlay
  ) {
    return Promise.resolve({
      ok: false,
      errorCode: "UNSUPPORTED_PAGE_URL",
      message: "This browser page URL cannot be analyzed with DOM extraction."
    });
  }
  if (message.type === MESSAGE_TYPES.extractSelection) {
    return Promise.resolve({
      ...extractSelectionFromWindow(window),
      currentUrl: location.href,
      title: document.title
    });
  }
  if (message.type === MESSAGE_TYPES.extractArticle) {
    return Promise.resolve(extractArticleFromDocument(document));
  }
  if (message.type === MESSAGE_TYPES.extractPage) {
    return Promise.resolve(extractPageFromDocument(document));
  }
  if (message.type === MESSAGE_TYPES.showOverlay) {
    showOverlay(message.payload);
    return Promise.resolve({ ok: true });
  }
  if (message.type === MESSAGE_TYPES.dismissOverlay) {
    dismissOverlay();
    return Promise.resolve({ ok: true });
  }
  return null;
}
