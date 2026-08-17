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

test("default backend origin and liveness route are stable", async () => {
  let capturedUrl;
  await withFetch(async (url) => {
    capturedUrl = String(url);
    return response({ status: "live" });
  }, async () => {
    const client = new WebApiClient();
    assert.equal(client.backendOrigin, "http://127.0.0.1:8000");
    assert.equal((await client.live()).status, "live");
  });
  assert.equal(capturedUrl, "http://127.0.0.1:8000/v1/health/live");
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

test("HTTP validation errors preserve backend details", async () => {
  await withFetch(async () => response({
    error_code: "VALIDATION_ERROR",
    message: "Validation failed.",
    request_id: "req-422",
    trace_id: "trace-422",
    details: [{ loc: ["body", "text"], msg: "String should have at least 1 character" }]
  }, 422), async () => {
    const client = new WebApiClient({ backendOrigin: "http://127.0.0.1:8000" });
    await assert.rejects(
      () => client.analyzeText({ text: "claim" }),
      (error) => {
        assert.equal(error instanceof WebClientError, true);
        assert.equal(error.code, "VALIDATION_ERROR");
        assert.equal(error.status, 422);
        assert.equal(error.requestId, "req-422");
        assert.equal(error.traceId, "trace-422");
        assert.equal(error.validationDetails[0].loc[1], "text");
        return true;
      }
    );
  });
});

test("connection refusal is not reported as an HTTP error", async () => {
  await withFetch(async () => {
    throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:8000"), {
      cause: { code: "ECONNREFUSED" }
    });
  }, async () => {
    const client = new WebApiClient({ backendOrigin: "http://127.0.0.1:8000" });
    await assert.rejects(
      () => client.live(),
      (error) => error instanceof WebClientError && error.code === "FND_CONNECTION_REFUSED"
    );
  });
});

test("timeouts and malformed responses get stable error codes", async () => {
  await withFetch(async () => {
    const error = new Error("The operation was aborted.");
    error.name = "AbortError";
    throw error;
  }, async () => {
    await assert.rejects(
      () => new WebApiClient({ backendOrigin: "http://127.0.0.1:8000" }).live(),
      (error) => error instanceof WebClientError && error.code === "FND_REQUEST_TIMEOUT"
    );
  });

  await withFetch(async () => response(null, 200), async () => {
    await assert.rejects(
      () => new WebApiClient({ backendOrigin: "http://127.0.0.1:8000" }).live(),
      (error) => error instanceof WebClientError && error.code === "FND_MALFORMED_RESPONSE"
    );
  });
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

test("mutating JSON requests do not send CSRF headers", async () => {
  let token;
  await withFetch(async (_url, init) => {
    token = init.headers.get("X-CSRF-Token");
    return response({ analysis_id: "ok" });
  }, async () => {
    await new WebApiClient({ backendOrigin: "http://127.0.0.1:8000" }).analyzeText({ text: "claim" });
  });
  assert.equal(token, null);
});
