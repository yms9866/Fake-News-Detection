import assert from "node:assert/strict";
import { test } from "node:test";
import { MobileApiClient, MobileApiError } from "../../dist/api/client.js";
import {
  MobileConfigError,
  normalizeApiUrl,
  resolveApiUrl
} from "../../dist/config/api.js";

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

test("API URL normalization removes trailing slashes", () => {
  assert.equal(normalizeApiUrl(" http://127.0.0.1:8000/// "), "http://127.0.0.1:8000");
});

test("invalid API URLs fail with a stable mobile config error", () => {
  assert.throws(
    () => normalizeApiUrl("not a url"),
    (error) => error instanceof MobileConfigError && error.code === "MOBILE_INVALID_API_URL"
  );
});

test("missing required API URL fails with a stable mobile config error", () => {
  assert.throws(
    () => resolveApiUrl({ env: {}, requireConfigured: true }),
    (error) => error instanceof MobileConfigError && error.code === "MOBILE_API_URL_MISSING"
  );
});

test("Android emulator defaults to the host loopback bridge", () => {
  assert.equal(resolveApiUrl({ env: {}, platform: "android" }), "http://10.0.2.2:8000");
});

test("configured Expo public API URL wins over development defaults", () => {
  assert.equal(
    resolveApiUrl({ env: { EXPO_PUBLIC_API_URL: "http://192.168.1.50:8000/" }, platform: "android" }),
    "http://192.168.1.50:8000"
  );
});

test("client parses backend error payloads without exposing stack traces", async () => {
  const client = new MobileApiClient({
    apiUrl: "http://127.0.0.1:8000",
    fetchImpl: async () => response({ error_code: "VALIDATION_ERROR", message: "Text is required." }, 422)
  });

  await assert.rejects(
    () => client.analyzeText({ text: "" }),
    (error) => error instanceof MobileApiError
      && error.code === "VALIDATION_ERROR"
      && error.status === 422
      && !String(error.message).includes("Traceback")
      && !String(error.message).includes("Error:")
  );
});

test("client reports network failures with a stable mobile error code", async () => {
  const client = new MobileApiClient({
    apiUrl: "http://127.0.0.1:8000",
    fetchImpl: async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8000");
    }
  });

  await assert.rejects(
    () => client.getHealth(),
    (error) => error instanceof MobileApiError && error.code === "MOBILE_NETWORK_UNREACHABLE"
  );
});

test("client reports request timeout with a stable mobile error code", async () => {
  const client = new MobileApiClient({
    apiUrl: "http://127.0.0.1:8000",
    timeoutMs: 1,
    fetchImpl: (_url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      setTimeout(() => resolve(response({ status: "late" })), 100);
    })
  });

  await assert.rejects(
    () => client.getHealth(),
    (error) => error instanceof MobileApiError && error.code === "MOBILE_REQUEST_TIMEOUT"
  );
});

test("analysis requests can use a longer timeout than health checks", async () => {
  const client = new MobileApiClient({
    apiUrl: "http://127.0.0.1:8000",
    timeoutMs: 1,
    analysisTimeoutMs: 50,
    fetchImpl: (_url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      setTimeout(() => resolve(response({ analysis_id: "slow-ok" })), 10);
    })
  });

  const result = await client.analyzeText({ text: "slow claim" });

  assert.equal(result.analysis_id, "slow-ok");
});

test("client redacts auth tokens from thrown request errors", async () => {
  const client = new MobileApiClient({
    apiUrl: "http://127.0.0.1:8000",
    authToken: "super-secret-token",
    fetchImpl: async () => {
      throw new Error("super-secret-token cannot connect");
    }
  });

  await assert.rejects(
    () => client.getHealth(),
    (error) => error instanceof MobileApiError
      && error.code === "MOBILE_NETWORK_UNREACHABLE"
      && !String(error.message).includes("super-secret-token")
  );
});
