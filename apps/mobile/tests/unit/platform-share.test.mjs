import assert from "node:assert/strict";
import { test } from "node:test";
import { createAndroidCaptureRevocationHandler, parseAndroidShareIntent } from "../../dist/platform/android.js";
import { parseIosShareExtension, restrictedCaptureFallback } from "../../dist/platform/ios.js";
import { detectMobileSdkCapabilities } from "../../dist/platform/sdk.js";
import { parseDeepLink } from "../../dist/navigation/deep-links.js";

test("Android share intent extracts text URL and media", () => {
  assert.deepEqual(parseAndroidShareIntent({ text: "claim", url: "https://example.com", mediaUri: "content://image" }), {
    text: "claim",
    url: "https://example.com",
    mediaUri: "content://image"
  });
});

test("iOS share extension extracts text URL and attachment", () => {
  assert.equal(parseIosShareExtension({ attachmentUri: "file://a.png" }).attachmentUri, "file://a.png");
});

test("Android capture revocation blocks future capture", () => {
  const handler = createAndroidCaptureRevocationHandler();
  handler.revoke();
  assert.equal(handler.isRevoked(), true);
  assert.throws(() => handler.assertActive(), /revoked/u);
});

test("iOS restricted capture returns screenshot/share fallback", () => {
  assert.equal(restrictedCaptureFallback("screen-protected").mode, "screenshot_or_share");
});

test("deep links parse analysis identifiers", () => {
  const parsed = parseDeepLink("fnd://analysis/result?analysis_id=a1");
  assert.equal(parsed.scheme, "fnd");
  assert.equal(parsed.analysisId, "a1");
});

test("missing mobile SDKs are reported honestly", () => {
  const capabilities = detectMobileSdkCapabilities({});
  assert.equal(capabilities.android.available, false);
  assert.match(capabilities.ios.detail, /Xcode/u);
});
