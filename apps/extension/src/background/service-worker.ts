import { MESSAGE_TYPES, makeMessage } from "../shared/messages.js";
import { registerMessageRouter } from "./message-router.js";
import { analyzeSelection, runControllerAction } from "./analysis-controller.js";
import { resumeActiveJobMonitoring } from "./job-monitor.js";

registerMessageRouter();
void resumeActiveJobMonitoring();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "fnd-analyze-selection",
    title: "Analyze selected text",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "fnd-analyze-selection") {
    return;
  }
  void runControllerAction(analyzeSelection, {
    text: info.selectionText || "",
    url: tab && tab.url ? tab.url : ""
  });
});

chrome.runtime.onStartup.addListener(() => {
  void resumeActiveJobMonitoring();
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.sendMessage(makeMessage(MESSAGE_TYPES.getAnalysisState));
});

