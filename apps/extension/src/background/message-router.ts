import { MESSAGE_TYPES, assertExtensionMessage } from "../shared/messages.js";
import { createApiClient } from "../shared/api-client.js";
import { testConnection } from "./connection-manager.js";
import {
  analyzeArticle,
  analyzePage,
  analyzeSelection,
  analyzeUrl,
  analyzeVisibleTab,
  cancelActiveJob,
  getAnalysisState,
  openLatestReport,
  runControllerAction,
  showLatestOverlay
} from "./analysis-controller.js";
import { clearExtensionState, getSettings, saveSettings } from "../shared/storage.js";

const handlers = {
  [MESSAGE_TYPES.analyzeSelection]: analyzeSelection,
  [MESSAGE_TYPES.analyzeArticle]: analyzeArticle,
  [MESSAGE_TYPES.analyzePage]: analyzePage,
  [MESSAGE_TYPES.analyzeUrl]: analyzeUrl,
  [MESSAGE_TYPES.captureVisibleTab]: analyzeVisibleTab,
  [MESSAGE_TYPES.cancelJob]: cancelActiveJob,
  [MESSAGE_TYPES.getAnalysisState]: getAnalysisState,
  [MESSAGE_TYPES.showOverlay]: showLatestOverlay,
  [MESSAGE_TYPES.openLatestReport]: openLatestReport,
  [MESSAGE_TYPES.testConnection]: testConnection,
  [MESSAGE_TYPES.signIn]: async (payload) => {
    const settings = await getSettings();
    const client = createApiClient(settings);
    const session = await client.signIn({
      username: payload.username || "extension-reviewer"
    });
    await saveSettings({
      ...settings,
      authToken: session && session.access_token ? session.access_token : ""
    });
    return { ok: true, session: { ...session, access_token: null } };
  },
  [MESSAGE_TYPES.signOut]: async () => {
    const settings = await getSettings();
    const client = createApiClient(settings);
    try {
      await client.signOut();
    } finally {
      await saveSettings({ ...settings, authToken: "" });
    }
    return { ok: true };
  },
  [MESSAGE_TYPES.clearState]: async () => {
    await clearExtensionState();
    return { ok: true };
  },
  [MESSAGE_TYPES.saveSettings]: async (payload) => {
    const settings = await saveSettings(payload);
    return { ok: true, settings };
  }
};

export async function routeMessage(rawMessage) {
  const message = assertExtensionMessage(rawMessage);
  const handler = handlers[message.type];
  if (!handler) {
    return { ok: false, error: { code: "INVALID_MESSAGE", message: "Unsupported message type." } };
  }
  return await runControllerAction(handler, message.payload || {});
}

export function registerMessageRouter() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void routeMessage(message).then(sendResponse);
    return true;
  });
}
