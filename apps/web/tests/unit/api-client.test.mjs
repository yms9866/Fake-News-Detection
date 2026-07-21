import assert from "node:assert/strict";
import { test } from "node:test";
import { WebApiClient, WebClientError } from "../../dist/api/client.js";

function response(payload, status = 200) {
  const headers = new Map([
    ["X-Request-ID", "req-web"],
    ["X-Trace-ID", "trace-web"]
  ]);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers.get(name) || null },
    json: async () => payload,
    text: async () => JSON.stringify(payload)
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

test("text analysis flow calls backend contract", async () => {
  let captured;
  await withFetch(async (url, init) => {
    captured = { url: String(url), init };
    return response({ analysis_id: "text-web", final_verdict: "UNVERIFIED" });
  }, async () => {
    const result = await new WebApiClient({ backendOrigin: "http://127.0.0.1:8000" }).analyzeText({ text: " Claim " });
    assert.equal(result.analysis_id, "text-web");
  });
  assert.match(captured.url, /\/v1\/analyses\/text$/u);
  assert.equal(JSON.parse(captured.init.body).text, "Claim");
});

test("URL analysis flow validates HTTP URLs", async () => {
  let body;
  await withFetch(async (_url, init) => {
    body = JSON.parse(init.body);
    return response({ analysis_id: "url-web" });
  }, async () => {
    await new WebApiClient({ backendOrigin: "http://localhost:8000" }).analyzeUrl({ url: "https://example.com/a" });
  });
  assert.equal(body.url, "https://example.com/a");
});

test("invalid URL is rejected before backend call", async () => {
  const client = new WebApiClient({ backendOrigin: "http://127.0.0.1:8000" });
  assert.throws(() => client.analyzeUrl({ url: "javascript:alert(1)" }), WebClientError);
});

test("media upload supports image audio and video endpoints", async () => {
  const paths = [];
  await withFetch(async (url) => {
    paths.push(new URL(String(url)).pathname);
    return response({ job_id: "job", status: "queued" }, 202);
  }, async () => {
    const client = new WebApiClient({ backendOrigin: "http://127.0.0.1:8000" });
    await client.uploadImage(Object.assign(new Blob(["png"], { type: "image/png" }), { name: "a.png" }));
    await client.uploadAudio(Object.assign(new Blob(["wav"], { type: "audio/wav" }), { name: "a.wav" }));
    await client.uploadVideo(Object.assign(new Blob(["mp4"], { type: "video/mp4" }), { name: "a.mp4" }));
  });
  assert.deepEqual(paths, ["/v1/analyses/image", "/v1/analyses/audio", "/v1/analyses/video"]);
});

test("async progress and cancellation use job endpoints", async () => {
  const calls = [];
  await withFetch(async (url, init = {}) => {
    calls.push({ path: new URL(String(url)).pathname, method: init.method || "GET" });
    return response({ job_id: "j1", status: "cancelled" });
  }, async () => {
    const client = new WebApiClient({ backendOrigin: "http://127.0.0.1:8000" });
    await client.getJob("j1");
    await client.cancelJob("j1");
  });
  assert.deepEqual(calls, [
    { path: "/v1/jobs/j1", method: "GET" },
    { path: "/v1/jobs/j1/cancel", method: "POST" }
  ]);
});

test("live OCR web flow uses live-session endpoints", async () => {
  const paths = [];
  await withFetch(async (url) => {
    paths.push(new URL(String(url)).pathname);
    return response({ session_id: "live-web", status: "capturing" });
  }, async () => {
    const client = new WebApiClient({ backendOrigin: "http://127.0.0.1:8000" });
    await client.createLiveSession({ source_type: "screen", source_id: "display", permission_granted: true });
    await client.submitLiveFrame("live-web", { frame_id: "f1", perceptual_hash: "aaa", ocr_text: "claim" });
    await client.verifyLiveSession("live-web", { trigger: "user", force: true });
  });
  assert.deepEqual(paths, [
    "/v1/live-sessions",
    "/v1/live-sessions/live-web/frames",
    "/v1/live-sessions/live-web/verify"
  ]);
});

test("CSRF header is attached to mutating JSON requests", async () => {
  let token;
  await withFetch(async (_url, init) => {
    token = init.headers.get("X-CSRF-Token");
    return response({ analysis_id: "csrf" });
  }, async () => {
    await new WebApiClient({ backendOrigin: "http://127.0.0.1:8000", csrfToken: "csrf-token" }).analyzeText({ text: "claim" });
  });
  assert.equal(token, "csrf-token");
});
