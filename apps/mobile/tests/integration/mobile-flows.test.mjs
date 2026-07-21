import assert from "node:assert/strict";
import { test } from "node:test";
import { MobileApiClient } from "../../dist/api/client.js";
import { createOfflineQueue } from "../../dist/offline/offline-queue.js";

test("background upload resumes through offline queue", async () => {
  const queue = createOfflineQueue();
  queue.enqueue({ mediaType: "image", uri: "file://queued.png" });
  const sent = await queue.flush(async (item) => ({ uploaded: item.uri }));
  assert.deepEqual(sent, [{ uploaded: "file://queued.png" }]);
});

test("text and URL mobile flows use shared API client", async () => {
  const paths = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    paths.push(new URL(String(url)).pathname);
    return { ok: true, json: async () => ({ analysis_id: "a" }) };
  };
  try {
    const client = new MobileApiClient();
    await client.analyzeText({ text: "claim" });
    await client.analyzeUrl({ url: "https://example.com" });
  } finally {
    globalThis.fetch = original;
  }
  assert.deepEqual(paths, ["/v1/analyses/text", "/v1/analyses/url"]);
});
