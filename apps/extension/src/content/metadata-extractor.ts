export function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/gu, " ").trim();
}

export function textFromHtml(html) {
  return normalizeWhitespace(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/giu, " ")
      .replace(/<style[\s\S]*?<\/style>/giu, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/giu, " ")
      .replace(/<[^>]+>/gu, " ")
      .replace(/&nbsp;/giu, " ")
      .replace(/&amp;/giu, "&")
      .replace(/&lt;/giu, "<")
      .replace(/&gt;/giu, ">")
      .replace(/&#39;/giu, "'")
      .replace(/&quot;/giu, "\"")
  );
}

export function extractTagContent(html, selectorName, attributeName = null, attributeValue = null) {
  const source = String(html || "");
  if (attributeName) {
    const pattern = new RegExp(
      `<${selectorName}[^>]*${attributeName}=["']${escapeRegExp(attributeValue)}["'][^>]*>`,
      "iu"
    );
    const open = source.match(pattern);
    if (!open) {
      return "";
    }
    const tag = open[0];
    const content = tag.match(/content=["']([^"']+)["']/iu);
    if (content) {
      return normalizeWhitespace(content[1]);
    }
  }
  const pattern = new RegExp(`<${selectorName}[^>]*>([\\s\\S]*?)<\\/${selectorName}>`, "iu");
  const match = source.match(pattern);
  return match ? textFromHtml(match[1]) : "";
}

export function extractMeta(html, names) {
  for (const name of names) {
    const escaped = escapeRegExp(name);
    const patterns = [
      new RegExp(`<meta[^>]*(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "iu"),
      new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']${escaped}["'][^>]*>`, "iu")
    ];
    for (const pattern of patterns) {
      const match = String(html || "").match(pattern);
      if (match) {
        return normalizeWhitespace(match[1]);
      }
    }
  }
  return "";
}

export function extractLinkHref(html, relName) {
  const pattern = new RegExp(`<link[^>]*rel=["'][^"']*${escapeRegExp(relName)}[^"']*["'][^>]*>`, "iu");
  const match = String(html || "").match(pattern);
  if (!match) {
    return "";
  }
  const href = match[0].match(/href=["']([^"']+)["']/iu);
  return href ? normalizeWhitespace(href[1]) : "";
}

export function extractMetadataFromHtml(html, currentUrl = "") {
  const title = extractMeta(html, ["og:title", "twitter:title"]) || extractTagContent(html, "title");
  return {
    title,
    author: extractMeta(html, ["author", "article:author", "parsely-author"]),
    publisher: extractMeta(html, ["og:site_name", "application-name"]),
    publicationDate: extractMeta(html, ["article:published_time", "date", "pubdate", "parsely-pub-date"]),
    canonicalUrl: resolveUrl(extractLinkHref(html, "canonical"), currentUrl),
    currentUrl,
    language: extractHtmlLanguage(html),
    description: extractMeta(html, ["description", "og:description", "twitter:description"])
  };
}

export function extractHtmlLanguage(html) {
  const match = String(html || "").match(/<html[^>]*lang=["']([^"']+)["']/iu);
  return match ? normalizeWhitespace(match[1]) : "";
}

export function resolveUrl(candidate, baseUrl) {
  if (!candidate) {
    return "";
  }
  try {
    return new URL(candidate, baseUrl || undefined).toString();
  } catch {
    return "";
  }
}

export function isUnsupportedPageUrl(url) {
  try {
    const parsed = new URL(url);
    return ["chrome:", "chrome-extension:", "about:", "file:", "view-source:", "devtools:"].includes(parsed.protocol);
  } catch {
    return true;
  }
}

export function isSafeHttpUrl(url) {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

