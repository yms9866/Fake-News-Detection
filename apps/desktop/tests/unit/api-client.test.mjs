import assert from "node:assert/strict";
import { test } from "node:test";
import { DesktopApiClient, DesktopApiError } from "../../dist/src/renderer/api/client.js";

function response(payload, status = 200, textPayload = null) {
  const headers = new Map([
    ["X-Request-ID", "req-test"],
    ["X-Trace-ID", "trace-test"]
  ]);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers.get(name) || null },
    json: async () => payload,
    text: async () => textPayload || JSON.stringify(payload)
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

test("text analysis uses the API workflow endpoint", async () => {
  const calls = [];
  await withFetch(async (url, init) => {
    calls.push({ url: String(url), init });
    return response({ analysis_id: "a1", final_verdict: "UNVERIFIED" });
  }, async () => {
    const result = await new DesktopApiClient({ backendOrigin: "http://127.0.0.1:8000" }).analyzeText({ text: " Claim " });
    assert.equal(result.analysis_id, "a1");
  });
  assert.match(calls[0].url, /\/v1\/analyses\/text$/u);
  assert.equal(JSON.parse(calls[0].init.body).text, "Claim");
});

test("URL analysis validates and submits web URLs", async () => {
  let body;
  await withFetch(async (_url, init) => {
    body = JSON.parse(init.body);
    return response({ analysis_id: "u1" });
  }, async () => {
    await new DesktopApiClient({ backendOrigin: "http://localhost:8000" }).analyzeUrl({ url: "https://example.com/a" });
  });
  assert.equal(body.url, "https://example.com/a");
});

test("image upload posts multipart data", async () => {
  let capturedUrl;
  await withFetch(async (url) => {
    capturedUrl = String(url);
    return response({ job_id: "j-image", status: "queued" }, 202);
  }, async () => {
    const blob = Object.assign(new Blob(["png"], { type: "image/png" }), { name: "capture.png" });
    await new DesktopApiClient({ backendOrigin: "http://127.0.0.1:8000" }).uploadImage(blob);
  });
  assert.match(capturedUrl, /\/v1\/analyses\/image$/u);
});

test("audio upload posts to the audio endpoint", async () => {
  let capturedUrl;
  await withFetch(async (url) => {
    capturedUrl = String(url);
    return response({ job_id: "j-audio" }, 202);
  }, async () => {
    const blob = Object.assign(new Blob(["wav"], { type: "audio/wav" }), { name: "clip.wav" });
    await new DesktopApiClient({ backendOrigin: "http://127.0.0.1:8000" }).uploadAudio(blob);
  });
  assert.match(capturedUrl, /\/v1\/analyses\/audio$/u);
});

test("video upload posts to the video endpoint", async () => {
  let capturedUrl;
  await withFetch(async (url) => {
    capturedUrl = String(url);
    return response({ job_id: "j-video" }, 202);
  }, async () => {
    const blob = Object.assign(new Blob(["mp4"], { type: "video/mp4" }), { name: "clip.mp4" });
    await new DesktopApiClient({ backendOrigin: "http://127.0.0.1:8000" }).uploadVideo(blob);
  });
  assert.match(capturedUrl, /\/v1\/analyses\/video$/u);
});

test("job progress can be polled", async () => {
  await withFetch(async () => response({ job_id: "j1", status: "completed", progress: 1 }), async () => {
    const job = await new DesktopApiClient({ backendOrigin: "http://127.0.0.1:8000" }).getJob("j1");
    assert.equal(job.status, "completed");
  });
});

test("job cancellation calls the cancellation endpoint", async () => {
  let method;
  let capturedUrl;
  await withFetch(async (url, init) => {
    method = init.method;
    capturedUrl = String(url);
    return response({ job_id: "j1", status: "cancelled" });
  }, async () => {
    await new DesktopApiClient({ backendOrigin: "http://127.0.0.1:8000" }).cancelJob("j1");
  });
  assert.equal(method, "POST");
  assert.match(capturedUrl, /\/v1\/jobs\/j1\/cancel$/u);
});

test("provider failures do not expose stack traces through client errors", async () => {
  await withFetch(async () => response({ error_code: "PROVIDER_FAILED", message: "Provider failed safely." }, 500), async () => {
    await assert.rejects(
      () => new DesktopApiClient({ backendOrigin: "http://127.0.0.1:8000" }).models(),
      (error) => error instanceof DesktopApiError && !String(error.message).includes("Traceback")
    );
  });
});
