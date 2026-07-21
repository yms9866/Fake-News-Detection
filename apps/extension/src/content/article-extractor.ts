import {
  extractMetadataFromHtml,
  normalizeWhitespace,
  textFromHtml
} from "./metadata-extractor.js";

const ARTICLE_PATTERNS = [
  /<article\b[^>]*>([\s\S]*?)<\/article>/iu,
  /<main\b[^>]*>([\s\S]*?)<\/main>/iu,
  /<[^>]+itemprop=["']articleBody["'][^>]*>([\s\S]*?)<\/[^>]+>/iu,
  /<[^>]+class=["'][^"']*(?:article-content|story-body|post-content)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/iu
];

const EXCLUDE_BLOCKS = [
  "nav",
  "footer",
  "header",
  "aside",
  "script",
  "style",
  "noscript",
  "form"
];

export function extractArticleFromDocument(doc = globalThis.document) {
  const html = doc && doc.documentElement ? doc.documentElement.outerHTML : "";
  const url = doc && doc.location ? doc.location.href : "";
  return extractArticleFromHtml(html, url);
}

export function extractArticleFromHtml(html, currentUrl = "") {
  const metadata = extractMetadataFromHtml(html, currentUrl);
  let chosen = "";
  let method = "article_fallback";
  for (const pattern of ARTICLE_PATTERNS) {
    const match = String(html || "").match(pattern);
    if (match) {
      chosen = match[1];
      method = pattern === ARTICLE_PATTERNS[0] ? "article_element" : "article_selector";
      break;
    }
  }
  if (!chosen) {
    return {
      ok: false,
      errorCode: "ARTICLE_EXTRACTION_FAILED",
      message: "No coherent article body was detected.",
      metadata,
      warnings: ["Article extraction could not find an article-like content region."]
    };
  }
  const cleaned = stripUnwantedBlocks(chosen);
  const text = deduplicateLines(textFromHtml(cleaned));
  const wordCount = text ? text.split(/\s+/u).length : 0;
  if (wordCount < 20) {
    return {
      ok: false,
      errorCode: "ARTICLE_EXTRACTION_FAILED",
      message: "The article body was too short for analysis.",
      metadata,
      warnings: ["Article extraction returned limited text."]
    };
  }
  return {
    ok: true,
    text,
    metadata: {
      ...metadata,
      extractionMethod: method,
      extractionConfidence: wordCount >= 80 ? "high" : "medium"
    },
    warnings: wordCount < 80 ? ["Article extraction returned a short article body."] : []
  };
}

export function stripUnwantedBlocks(html) {
  let output = String(html || "");
  for (const tag of EXCLUDE_BLOCKS) {
    output = output.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "giu"), " ");
  }
  output = output.replace(/<[^>]+(?:cookie|advert|comment|share|sidebar|recommend)[^>]*>[\s\S]*?<\/[^>]+>/giu, " ");
  output = output.replace(/<[^>]+hidden[^>]*>[\s\S]*?<\/[^>]+>/giu, " ");
  output = output.replace(/<[^>]+style=["'][^"']*display\s*:\s*none[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/giu, " ");
  return output;
}

export function deduplicateLines(text) {
  const seen = new Set();
  const lines = normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  const kept = [];
  for (const line of lines) {
    const fingerprint = line.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
    if (seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    kept.push(line);
  }
  return normalizeWhitespace(kept.join(" "));
}

