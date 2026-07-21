import assert from "node:assert/strict";
import { test } from "node:test";
import { evidenceLinkDescriptor, compactHistoryItem, textOnly } from "../../dist/components/safe-rendering.js";
import { createHistoryStore } from "../../dist/stores/history-store.js";

test("safe source links allow only web URLs", () => {
  assert.equal(evidenceLinkDescriptor({ url: "javascript:alert(1)", title: "Bad" }).url, null);
  assert.equal(evidenceLinkDescriptor({ url: "https://example.com", title: "Good" }).url, "https://example.com/");
});

test("text rendering coerces untrusted values to text", () => {
  assert.equal(textOnly("<img src=x>"), "<img src=x>");
});

test("history stores compact analysis references", () => {
  const item = compactHistoryItem({
    analysis_id: "a1",
    input_type: "text",
    final_verdict: "UNVERIFIED",
    confidence: "LOW",
    created_at: "2026-07-22T00:00:00Z",
    extracted_text: "long body"
  });
  assert.deepEqual(Object.keys(item).sort(), ["analysisId", "confidence", "createdAt", "finalVerdict", "inputType"].sort());
});

test("history can be cleared", () => {
  const store = createHistoryStore(2);
  store.add({ analysisId: "a1" });
  store.add({ analysisId: "a2" });
  assert.equal(store.list().length, 2);
  assert.equal(store.clear().length, 0);
});
