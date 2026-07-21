import {
  extractMetadataFromHtml,
  normalizeWhitespace,
  textFromHtml
} from "./metadata-extractor.js";
import { stripUnwantedBlocks } from "./article-extractor.js";

export function extractPageFromDocument(doc = globalThis.document) {
  const html = doc && doc.documentElement ? doc.documentElement.outerHTML : "";
  const url = doc && doc.location ? doc.location.href : "";
  return extractPageFromHtml(html, url);
}

export function extractPageFromHtml(html, currentUrl = "") {
  const metadata = extractMetadataFromHtml(html, currentUrl);
  const bodyMatch = String(html || "").match(/<body\b[^>]*>([\s\S]*?)<\/body>/iu);
  const source = bodyMatch ? bodyMatch[1] : html;
  const text = normalizeWhitespace(textFromHtml(stripUnwantedBlocks(source)));
  if (!text) {
    return {
      ok: false,
      errorCode: "INVALID_PAGE",
      message: "No readable page text was found.",
      metadata,
      warnings: ["Page extraction found no readable text."]
    };
  }
  return {
    ok: true,
    text,
    metadata: {
      ...metadata,
      extractionMethod: "page_visible_text"
    },
    warnings: ["Page analysis may include mixed page content."]
  };
}

