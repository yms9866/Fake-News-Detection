import { extractArticleFromDocument } from "./article-extractor.js";
import { isUnsupportedPageUrl } from "./metadata-extractor.js";
import { extractPageFromDocument } from "./page-extractor.js";
import { extractSelectionFromWindow } from "./selection-extractor.js";
import { dismissOverlay, showOverlay } from "./overlay/overlay-root.js";

function respond(result) {
  return Promise.resolve(result);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleMessage(message).then(sendResponse);
  return true;
});

async function handleMessage(message) {
  if (!message || typeof message.type !== "string") {
    return { ok: false, errorCode: "INVALID_MESSAGE", message: "Invalid content message." };
  }
  if (isUnsupportedPageUrl(location.href) && message.type !== "SHOW_OVERLAY") {
    return {
      ok: false,
      errorCode: "UNSUPPORTED_PAGE_URL",
      message: "This browser page URL cannot be analyzed with DOM extraction."
    };
  }
  if (message.type === "EXTRACT_SELECTION") {
    return respond({
      ...extractSelectionFromWindow(window),
      currentUrl: location.href,
      title: document.title
    });
  }
  if (message.type === "EXTRACT_ARTICLE") {
    return respond(extractArticleFromDocument(document));
  }
  if (message.type === "EXTRACT_PAGE") {
    return respond(extractPageFromDocument(document));
  }
  if (message.type === "SHOW_OVERLAY") {
    showOverlay(message.payload);
    return respond({ ok: true });
  }
  if (message.type === "DISMISS_OVERLAY") {
    dismissOverlay();
    return respond({ ok: true });
  }
  return { ok: false, errorCode: "INVALID_MESSAGE", message: "Unsupported content message." };
}

