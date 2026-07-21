import assert from "node:assert/strict";
import { test } from "node:test";
import { createMobileAuthAdapter } from "../../dist/auth/mobile-auth.js";
import { createCompletionNotification } from "../../dist/notifications/completion.js";
import { createOfflineQueue } from "../../dist/offline/offline-queue.js";
import { createSecureSettingsStore } from "../../dist/secure/secure-settings.js";
import { resultSummary } from "../../dist/components/result-view.js";

test("offline queue enqueues and flushes requests", async () => {
  const queue = createOfflineQueue();
  queue.enqueue({ type: "text", text: "claim" });
  const flushed = await queue.flush(async (item) => ({ sent: item.type }));
  assert.deepEqual(flushed, [{ sent: "text" }]);
  assert.equal(queue.list().length, 0);
});

test("secure settings redact token on save", () => {
  const store = createSecureSettingsStore();
  const saved = store.save({ backendOrigin: "http://127.0.0.1:8000", authToken: "secret", expiresAt: 999 });
  assert.equal(saved.authToken, "[configured]");
  assert.equal(store.get().authToken, "secret");
});

test("auth token abstraction expires tokens", async () => {
  const store = createSecureSettingsStore();
  const auth = createMobileAuthAdapter(store);
  await auth.setToken("token", 1000);
  assert.equal(auth.getToken(999), "token");
  assert.equal(auth.getToken(1001), null);
});

test("remote logout clears secure storage", async () => {
  const store = createSecureSettingsStore();
  const auth = createMobileAuthAdapter(store);
  await auth.setToken("token", 9999);
  assert.equal(auth.remoteLogout().loggedOut, true);
  assert.deepEqual(store.get(), {});
});

test("completion notification includes result summary", () => {
  const notification = createCompletionNotification({ analysis_id: "a1", final_verdict: "UNVERIFIED", confidence: "LOW" });
  assert.equal(notification.data.analysisId, "a1");
});

test("result evidence summary is display-only", () => {
  const summary = resultSummary({
    analysis_id: "a1",
    final_verdict: "UNVERIFIED",
    confidence: "LOW",
    verification: { evidence: [{ url: "https://example.com" }] }
  });
  assert.equal(summary.evidenceCount, 1);
});
