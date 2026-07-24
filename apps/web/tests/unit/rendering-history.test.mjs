import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { evidenceLinkDescriptor, compactHistoryItem, textOnly } from "../../dist/components/safe-rendering.js";
import { createHistoryStore } from "../../dist/stores/history-store.js";

test("safe source links allow only web URLs", () => {
  assert.equal(evidenceLinkDescriptor({ url: "javascript:alert(1)", title: "Bad" }).url, null);
  assert.equal(evidenceLinkDescriptor({ url: "https://user:pass@example.com", title: "Bad" }).url, null);
  assert.equal(evidenceLinkDescriptor({ url: "https://example.com/a\nb", title: "Bad" }).url, null);
  assert.equal(evidenceLinkDescriptor({ url: "https://example.com", title: "Good" }).url, "https://example.com/");
});

test("source descriptors expose structured evidence labels", () => {
  const descriptor = evidenceLinkDescriptor({
    source_id: "source-2",
    source_number: 2,
    citation_label: "Source 2",
    url: "https://example.com/report",
    title: "Report",
    publisher: "Example",
    domain: "example.com",
    stance: "MENTIONS",
    source_type: "REPUTABLE_NEWS",
    reliability: "LOW",
    fetched: false,
    used_in_explanation: false
  });

  assert.equal(descriptor.sourceId, "source-2");
  assert.equal(descriptor.citationLabel, "Source 2");
  assert.equal(descriptor.stance, "MENTIONS");
  assert.equal(descriptor.fetched, false);
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

test("result UI keeps safe link attributes and style disclaimer", async () => {
  const source = await readFile(new URL("../../src/components/result-view.ts", import.meta.url), "utf8");
  assert.match(source, /target\s*=\s*"_blank"/u);
  assert.match(source, /rel\s*=\s*"noopener noreferrer"/u);
  assert.match(source, /Writing-style risk does not prove that the claim is false\./u);
  assert.match(source, /Mentions the topic/u);
  assert.match(source, /Source not fetched/u);
});

test("error UI is accessible and retry is explicit", async () => {
  const source = await readFile(new URL("../../src/components/status-panels.ts", import.meta.url), "utf8");
  assert.match(source, /role", "alert"/u);
  assert.match(source, /Retry request/u);
  assert.match(source, /Technical details/u);
});
