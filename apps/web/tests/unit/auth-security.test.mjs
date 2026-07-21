import assert from "node:assert/strict";
import { test } from "node:test";
import { createDevAuthAdapter, createPkceChallenge } from "../../dist/auth/dev-auth.js";
import { WEB_CSP, assertNoWildcardConnectSrc } from "../../dist/security/csp.js";
import { createCsrfToken, validateCsrfToken } from "../../dist/security/csrf.js";

test("auth shell creates a PKCE-shaped development challenge", () => {
  const challenge = createPkceChallenge("reviewer");
  assert.equal(challenge.verifier.includes("reviewer"), true);
  assert.equal(challenge.challenge.length > 0, true);
});

test("development auth session expires", async () => {
  let now = 1000;
  const auth = createDevAuthAdapter(() => now);
  await auth.signIn("user");
  assert.equal(auth.getSession().user.id, "user");
  now += 61 * 60 * 1000;
  assert.equal(auth.getSession(), null);
});

test("role guard abstraction denies missing roles", async () => {
  const auth = createDevAuthAdapter(() => 1000);
  await auth.signIn("user");
  assert.equal(auth.requireRole("organization_admin"), false);
});

test("CSRF token validation is exact", () => {
  const token = createCsrfToken("stable");
  assert.equal(validateCsrfToken(token, token), true);
  assert.equal(validateCsrfToken(token, "other"), false);
});

test("web CSP avoids remote scripts and wildcard origins", () => {
  assert.equal(WEB_CSP.includes("script-src 'self'"), true);
  assert.equal(WEB_CSP.includes("https://"), false);
  assert.equal(assertNoWildcardConnectSrc(WEB_CSP), true);
});
