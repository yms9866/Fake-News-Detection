import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { mapSdkErrorCode, safeErrorPayload } from "../../dist/shared/errors.js";

test("content script is bundled without ESM imports so executeScript can inject it", async () => {
  const source = await readFile(new URL("../../dist/content/content-script.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^\s*import\s/mu);
  assert.match(source, /__FND_CONTENT_READY/u);
});

test("backend SDK timeout and connection errors map to extension codes", () => {
  assert.equal(mapSdkErrorCode("FND_REQUEST_TIMEOUT"), "REQUEST_TIMEOUT");
  assert.equal(mapSdkErrorCode("FND_CONNECTION_REFUSED"), "BACKEND_UNAVAILABLE");
  const payload = safeErrorPayload({
    code: "FND_REQUEST_TIMEOUT",
    message: "The request timed out before the local API responded at http://127.0.0.1:8000.",
    requestId: "req-1",
    traceId: "trace-1"
  });
  assert.equal(payload.code, "REQUEST_TIMEOUT");
  assert.equal(payload.requestId, "req-1");
});
