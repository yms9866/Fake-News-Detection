export function createAndroidCaptureRevocationHandler() {
  let revoked = false;
  return {
    revoke() {
      revoked = true;
    },
    isRevoked() {
      return revoked;
    },
    assertActive() {
      if (revoked) {
        throw new Error("Android capture permission was revoked.");
      }
    }
  };
}

export function parseAndroidShareIntent(intent) {
  return {
    text: intent && intent.text ? String(intent.text) : "",
    url: intent && intent.url ? String(intent.url) : null,
    mediaUri: intent && intent.mediaUri ? String(intent.mediaUri) : null
  };
}
