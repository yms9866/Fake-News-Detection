import assert from "node:assert/strict";
import { test } from "node:test";
import { WEB_CSP, assertNoWildcardConnectSrc } from "../../dist/security/csp.js";

test("web CSP avoids remote scripts and wildcard origins", () => {
  assert.equal(WEB_CSP.includes("script-src 'self'"), true);
  assert.equal(WEB_CSP.includes("https://"), false);
  assert.equal(assertNoWildcardConnectSrc(WEB_CSP), true);
});
