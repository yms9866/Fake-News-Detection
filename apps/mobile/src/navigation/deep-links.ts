export function parseDeepLink(url) {
  const parsed = new URL(url);
  return {
    scheme: parsed.protocol.replace(":", ""),
    path: parsed.pathname,
    analysisId: parsed.searchParams.get("analysis_id")
  };
}
