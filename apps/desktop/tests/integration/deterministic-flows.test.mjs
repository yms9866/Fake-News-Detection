import assert from "node:assert/strict";
import { test } from "node:test";
import { CaptureController } from "../../dist/electron/main/capture-controller.js";
import { DesktopApiClient } from "../../dist/src/renderer/api/client.js";
import { summarizeHistoryItem } from "../../dist/src/renderer/components/safe-content.js";

function fakeApiFetch() {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    calls.push({ path, method: init.method || "GET" });
    if (path === "/v1/health/live") {
      return json({ status: "live" });
    }
    if (path === "/v1/health/ready") {
      return json({ status: "ready" });
    }
    if (path === "/v1/analyses/text") {
      return json(result("text-analysis"));
    }
    if (path === "/v1/analyses/url") {
      return json(result("url-analysis"));
    }
    if (path === "/v1/analyses/image") {
      return json({ analysis_id: "image-analysis", job_id: "job-image", status: "queued" }, 202);
    }
    if (path === "/v1/jobs/job-image") {
      return json({ job_id: "job-image", analysis_id: "image-analysis", status: "completed", progress: 1, current_stage: "completed" });
    }
    if (path === "/v1/jobs/job-image/cancel") {
      return json({ job_id: "job-image", analysis_id: "image-analysis", status: "cancelled", progress: 0.5, current_stage: "cancelled" });
    }
    if (path === "/v1/analyses/image-analysis") {
      return json(result("image-analysis"));
    }
    return json({ error_code: "NOT_FOUND", message: "not found" }, 404);
  };
  return { fetchImpl, calls };
}

function json(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  };
}

function result(id) {
  return {
    analysis_id: id,
    status: "completed",
    input_type: "text",
    media_type: null,
    extracted_text: "claim",
    cleaned_text: "claim",
    source_url: null,
    style_signal: "LOW_STYLE_RISK",
    verification: null,
    final_verdict: "UNVERIFIED",
    confidence: "LOW",
    reason: "Deterministic fake API result.",
    warnings: [],
    created_at: "2026-07-22T00:00:00Z",
    completed_at: "2026-07-22T00:00:01Z",
    request_id: "req",
    trace_id: "trace"
  };
}

async function withFetch(fakeFetch, operation) {
  const original = globalThis.fetch;
  globalThis.fetch = fakeFetch;
  try {
    return await operation();
  } finally {
    globalThis.fetch = original;
  }
}

test("deterministic API reports liveness and readiness", async () => {
  const { fetchImpl } = fakeApiFetch();
  await withFetch(fetchImpl, async () => {
    const client = new DesktopApiClient({ backendOrigin: "http://127.0.0.1:8000" });
    assert.equal((await client.live()).status, "live");
    assert.equal((await client.ready()).status, "ready");
  });
});

test("text analysis flow completes through backend API", async () => {
  const { fetchImpl } = fakeApiFetch();
  await withFetch(fetchImpl, async () => {
    const resultPayload = await new DesktopApiClient({ backendOrigin: "http://127.0.0.1:8000" }).analyzeText({ text: "news claim" });
    assert.equal(resultPayload.analysis_id, "text-analysis");
  });
});

test("URL analysis flow completes through backend API", async () => {
  const { fetchImpl } = fakeApiFetch();
  await withFetch(fetchImpl, async () => {
    const resultPayload = await new DesktopApiClient({ backendOrigin: "http://127.0.0.1:8000" }).analyzeUrl({ url: "https://example.com/news" });
    assert.equal(resultPayload.analysis_id, "url-analysis");
  });
});

test("one image upload produces a job and result", async () => {
  const { fetchImpl } = fakeApiFetch();
  await withFetch(fetchImpl, async () => {
    const client = new DesktopApiClient({ backendOrigin: "http://127.0.0.1:8000" });
    const blob = Object.assign(new Blob(["png"], { type: "image/png" }), { name: "capture.png" });
    const accepted = await client.uploadImage(blob);
    const job = await client.getJob(accepted.job_id);
    const analysis = await client.getAnalysis(job.analysis_id);
    assert.equal(job.status, "completed");
    assert.equal(analysis.analysis_id, "image-analysis");
  });
});

test("job cancellation returns cancelled status", async () => {
  const { fetchImpl } = fakeApiFetch();
  await withFetch(fetchImpl, async () => {
    const job = await new DesktopApiClient({ backendOrigin: "http://127.0.0.1:8000" }).cancelJob("job-image");
    assert.equal(job.status, "cancelled");
  });
});

test("capture fixture frame is released after upload handoff", async () => {
  const capture = new CaptureController({
    sourcesProvider: async () => [{ id: "screen:1", name: "Fixture screen" }],
    frameProvider: async () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" })
  });
  const frame = await capture.captureOnce({ sourceId: "screen:1", sourceType: "screen", confirm: true });
  assert.match(frame.dataUrl, /^data:image\/png;base64,/u);
  assert.equal(capture.hasPersistedFrame(), false);
});

test("history shell stores only compact result references", () => {
  const item = summarizeHistoryItem(result("history-analysis"));
  assert.deepEqual(Object.keys(item).sort(), ["analysisId", "createdAt", "finalVerdict", "inputType", "jobId"].sort());
});

test("deterministic flow uses no desktop verdict decision", async () => {
  const { fetchImpl, calls } = fakeApiFetch();
  await withFetch(fetchImpl, async () => {
    await new DesktopApiClient({ backendOrigin: "http://127.0.0.1:8000" }).analyzeText({ text: "claim" });
  });
  assert.equal(calls.some((call) => call.path === "/v1/analyses/text"), true);
});
