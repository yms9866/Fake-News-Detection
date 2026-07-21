import assert from "node:assert/strict";
import { test } from "node:test";
import { WebApiClient } from "../../dist/api/client.js";

function json(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  };
}

function fakeFetch() {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    calls.push({ path, method: init.method || "GET" });
    if (path === "/v1/analyses/text") {
      return json({ analysis_id: "text", final_verdict: "UNVERIFIED", confidence: "LOW" });
    }
    if (path === "/v1/analyses/url") {
      return json({ analysis_id: "url", final_verdict: "UNVERIFIED", confidence: "LOW" });
    }
    if (path.startsWith("/v1/analyses/image") || path.startsWith("/v1/analyses/audio") || path.startsWith("/v1/analyses/video")) {
      return json({ job_id: "job", analysis_id: "media", status: "queued" }, 202);
    }
    if (path === "/v1/jobs/job") {
      return json({ job_id: "job", status: "completed", progress: 1 });
    }
    return json({ status: "ready" });
  };
  return { calls, fetchImpl };
}

async function withFetch(fetchImpl, operation) {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await operation();
  } finally {
    globalThis.fetch = original;
  }
}

test("deterministic text and URL flows complete", async () => {
  const { fetchImpl } = fakeFetch();
  await withFetch(fetchImpl, async () => {
    const client = new WebApiClient({ backendOrigin: "http://127.0.0.1:8000" });
    assert.equal((await client.analyzeText({ text: "claim" })).analysis_id, "text");
    assert.equal((await client.analyzeUrl({ url: "https://example.com" })).analysis_id, "url");
  });
});

test("deterministic media flow queues and polls job", async () => {
  const { fetchImpl } = fakeFetch();
  await withFetch(fetchImpl, async () => {
    const client = new WebApiClient({ backendOrigin: "http://127.0.0.1:8000" });
    const accepted = await client.uploadImage(Object.assign(new Blob(["png"], { type: "image/png" }), { name: "a.png" }));
    const job = await client.getJob(accepted.job_id);
    assert.equal(job.status, "completed");
  });
});

test("generated-contract compatibility paths are used", async () => {
  const { calls, fetchImpl } = fakeFetch();
  await withFetch(fetchImpl, async () => {
    const client = new WebApiClient({ backendOrigin: "http://127.0.0.1:8000" });
    await client.analyzeText({ text: "claim" });
    await client.uploadVideo(Object.assign(new Blob(["mp4"], { type: "video/mp4" }), { name: "v.mp4" }));
  });
  assert.equal(calls.some((call) => call.path === "/v1/analyses/text"), true);
  assert.equal(calls.some((call) => call.path === "/v1/analyses/video"), true);
});
