import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MESSAGE_TYPES,
  assertExtensionMessage,
  isExtensionMessage,
  makeIdempotencyKey
} from "../../dist/shared/messages.js";
import {
  clearExtensionState,
  getSettings,
  memoryStorageForTests,
  saveActiveAnalysis,
  saveLatestSummary
} from "../../dist/shared/storage.js";

test("message validator accepts only known message contracts", () => {
  assert.equal(isExtensionMessage({ type: MESSAGE_TYPES.analyzeSelection, payload: null }), true);
  assert.equal(isExtensionMessage({ type: "RUN_ARBITRARY_CODE", payload: {} }), false);
  assert.throws(() => assertExtensionMessage({ payload: null }));
});

test("idempotency keys are generated without content data", () => {
  const key = makeIdempotencyKey("visible-tab");
  assert.match(key, /^visible-tab-\d+-[a-f0-9]+$/u);
});

test("clear-state removes lightweight analysis references", async () => {
  await saveActiveAnalysis({ jobId: "job-1" });
  await saveLatestSummary({ analysisId: "analysis-1" });
  await clearExtensionState();

  assert.equal(memoryStorageForTests.memorySession.has("fnd.activeAnalysis"), false);
  assert.equal(memoryStorageForTests.memoryLocal.has("fnd.latestSummary"), false);
  assert.equal((await getSettings()).backendOrigin, "http://127.0.0.1:8000");
});

