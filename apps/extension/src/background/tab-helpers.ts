import { CLIENT_STATES } from "../shared/constants.js";
import { EXTENSION_ERROR_CODES, ExtensionError } from "../shared/errors.js";
import { MESSAGE_TYPES } from "../shared/messages.js";

export async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id) {
    throw new ExtensionError(EXTENSION_ERROR_CODES.invalidPage, "No active tab is available.");
  }
  return tab;
}

export async function ensureContentScript(tabId) {
  try {
    const injected = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => Boolean(globalThis.__FND_CONTENT_READY)
    });
    if (injected && injected[0] && injected[0].result) {
      return;
    }
  } catch {
    /* inject below */
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/content-script.js"]
  });
}

export async function showSummaryOverlay(summary) {
  const tab = await getActiveTab();
  await ensureContentScript(tab.id);
  await chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.showOverlay, payload: summary });
}

export function clientStateFromJob(status) {
  if (status === "completed") {
    return CLIENT_STATES.completed;
  }
  if (status === "failed") {
    return CLIENT_STATES.failed;
  }
  if (status === "cancelled") {
    return CLIENT_STATES.cancelled;
  }
  if (status === "queued") {
    return CLIENT_STATES.queued;
  }
  return CLIENT_STATES.processing;
}
