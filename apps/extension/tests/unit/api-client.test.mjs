import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiClient } from "../../dist/shared/api-client.js";

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": "req-1",
      "X-Trace-ID": "trace-1",
      ...(init.headers || {})
    }
  });
}

test("text analysis request is typed and preserves deep_check", async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return jsonResponse({ analysis_id: "a1", status: "completed" });
  };
  const client = new ApiClient({ backendOrigin: "http://127.0.0.1:8000" });
  await client.analyzeText({ text: "Selected text only", deep_check: true, max_length: 512 });

  assert.equal(captured.url, "http://127.0.0.1:8000/v1/analyses/text");
  assert.equal(captured.init.method, "POST");
  assert.deepEqual(JSON.parse(captured.init.body), {
    text: "Selected text only",
    deep_check: true,
    max_length: 512
  });
});

test("URL analysis request uses the URL endpoint", async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return jsonResponse({ analysis_id: "url-1" });
  };
  const client = new ApiClient({ backendOrigin: "http://localhost:8000/" });
  await client.analyzeUrl({ url: "https://example.test/article", deep_check: false });

  assert.equal(captured.url, "http://localhost:8000/v1/analyses/url");
  assert.equal(JSON.parse(captured.init.body).url, "https://example.test/article");
});

test("screenshot upload uses multipart, idempotency, and pairing header", async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return jsonResponse({ analysis_id: "a2", job_id: "j2", status: "queued" });
  };
  const client = new ApiClient({
    backendOrigin: "http://127.0.0.1:8000",
    pairingToken: "pair-token"
  });
  await client.uploadImage(new Blob(["png"], { type: "image/png" }), {
    deepCheck: true,
    maxLength: 512,
    idempotencyKey: "idem-1"
  });

  assert.equal(captured.url, "http://127.0.0.1:8000/v1/analyses/image");
  assert.equal(captured.init.headers.get("X-FND-Pairing-Token"), "pair-token");
  assert.equal(captured.init.headers.get("Idempotency-Key"), "idem-1");
  assert.equal(captured.init.body instanceof FormData, true);
});

test("request timeout maps to stable extension error", async () => {
  globalThis.fetch = async (url, init) =>
    await new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  const client = new ApiClient({
    backendOrigin: "http://127.0.0.1:8000",
    requestTimeoutMs: 1
  });

  await assert.rejects(() => client.live(), /timed out/iu);
});

test("backend error preserves stable code and request IDs", async () => {
  globalThis.fetch = async () =>
    jsonResponse(
      {
        error_code: "JOB_NOT_FOUND",
        message: "Job was not found.",
        request_id: "req-404",
        trace_id: "trace-404"
      },
      { status: 404 }
    );
  const client = new ApiClient({ backendOrigin: "http://127.0.0.1:8000" });

  await assert.rejects(async () => await client.getJob("missing"), (error) => {
    assert.equal(error.code, "JOB_NOT_FOUND");
    assert.equal(error.requestId, "req-404");
    assert.equal(error.traceId, "trace-404");
    return true;
  });
});

test("extension auth keeps tokens in background API client headers", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ path: new URL(String(url)).pathname, headers: init.headers });
    if (String(url).endsWith("/v1/auth/sign-in")) {
      return jsonResponse({
        authenticated: true,
        access_token: "extension-token",
        user: { user_id: "extension-reviewer" }
      });
    }
    return jsonResponse({ status: "ready" });
  };
  const client = new ApiClient({ backendOrigin: "http://127.0.0.1:8000" });
  await client.signIn({ username: "extension-reviewer" });
  await client.ready();

  assert.equal(calls[0].path, "/v1/auth/sign-in");
  assert.equal(calls[1].headers.get("Authorization"), "Bearer extension-token");
});

test("live browser-tab handoff uses live session endpoints", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ session_id: "live-tab", status: "capturing" });
  };
  const client = new ApiClient({ backendOrigin: "http://127.0.0.1:8000" });
  await client.createLiveSession({
    source_type: "browser_tab",
    source_id: "tab-1",
    permission_granted: true,
    source_url: "https://example.test/article"
  });
  await client.submitLiveFrame("live-tab", {
    frame_id: "dom-1",
    perceptual_hash: "dom-hash",
    dom_text: "Article text from DOM",
    source_url: "https://example.test/article"
  });
  await client.verifyLiveSession("live-tab", { trigger: "user", force: true });

  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    "/v1/live-sessions",
    "/v1/live-sessions/live-tab/frames",
    "/v1/live-sessions/live-tab/verify"
  ]);
});
