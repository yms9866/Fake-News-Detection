export const WEB_CSP = [
  "default-src 'self'",
  "connect-src http://127.0.0.1:* http://localhost:*",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "style-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'"
].join("; ");

export function assertNoWildcardConnectSrc(csp = WEB_CSP) {
  return !/connect-src[^;]*\*/u.test(csp.replace(/:\*/gu, ":PORT"));
}
