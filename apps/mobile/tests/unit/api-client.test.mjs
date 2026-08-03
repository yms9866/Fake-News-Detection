import assert from "node:assert/strict";
import { test } from "node:test";
import { MobileApiClient } from "../../dist/api/client.js";

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
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

test("mobile text flow calls backend contract", async () => {
  let captured;
  await withFetch(async (url, init) => {
    captured = { path: new URL(String(url)).pathname, body: JSON.parse(init.body) };
    return response({ analysis_id: "text-mobile" });
  }, async () => {
    const result = await new MobileApiClient().analyzeText({ text: " Claim " });
    assert.equal(result.analysis_id, "text-mobile");
  });
  assert.equal(captured.path, "/v1/analyses/text");
  assert.equal(captured.body.text, "Claim");
});

test("mobile URL flow calls backend contract", async () => {
  let captured;
  await withFetch(async (url, init) => {
    captured = { path: new URL(String(url)).pathname, body: JSON.parse(init.body) };
    return response({ analysis_id: "url-mobile" });
  }, async () => {
    await new MobileApiClient().analyzeUrl({ url: "https://example.com" });
  });
  assert.equal(captured.path, "/v1/analyses/url");
  assert.equal(captured.body.url, "https://example.com");
});

test("mobile upload flow uses media endpoint and progress job", async () => {
  const paths = [];
  await withFetch(async (url) => {
    paths.push(new URL(String(url)).pathname);
    return response(paths.length === 1 ? { job_id: "job" } : { job_id: "job", status: "completed" }, paths.length === 1 ? 202 : 200);
  }, async () => {
    const client = new MobileApiClient();
    const accepted = await client.uploadMedia("image", Object.assign(new Blob(["png"], { type: "image/png" }), { name: "a.png" }));
    const job = await client.getJob(accepted.job_id);
    assert.equal(job.status, "completed");
  });
  assert.deepEqual(paths, ["/v1/analyses/image", "/v1/jobs/job"]);
});

test("mobile cancellation calls job cancel endpoint", async () => {
  let path;
  await withFetch(async (url) => {
    path = new URL(String(url)).pathname;
    return response({ status: "cancelled" });
  }, async () => {
    await new MobileApiClient().cancelJob("job");
  });
  assert.equal(path, "/v1/jobs/job/cancel");
});

test("mobile auth signs in and attaches bearer token", async () => {
  const calls = [];
  await withFetch(async (url, init = {}) => {
    calls.push({ path: new URL(String(url)).pathname, headers: init.headers || {} });
    if (String(url).endsWith("/v1/auth/sign-in")) {
      return response({
        authenticated: true,
        access_token: "mobile-token",
        user: { user_id: "mobile-reviewer" }
      });
    }
    return response({ status: "live" });
  }, async () => {
    const client = new MobileApiClient();
    await client.signIn({ username: "mobile-reviewer" });
    await client.getHealth();
  });

  assert.equal(calls[0].path, "/v1/auth/sign-in");
  assert.equal(calls[1].headers.Authorization, "Bearer mobile-token");
});
