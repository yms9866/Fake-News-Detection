import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { extractArticleFromHtml } from "../../dist/content/article-extractor.js";
import { extractPageFromHtml } from "../../dist/content/page-extractor.js";
import { normalizeBackendOrigin } from "../../dist/shared/storage.js";

const fixture = await readFile(new URL("../fixtures/news.html", import.meta.url), "utf8");

test("article extraction captures main article and metadata", () => {
  const result = extractArticleFromHtml(fixture, "https://example.test/news/current");

  assert.equal(result.ok, true);
  assert.match(result.text, /minister resigned/iu);
  assert.equal(result.metadata.author, "A. Reporter");
  assert.equal(result.metadata.publisher, "Example Daily");
  assert.equal(result.metadata.publicationDate, "2026-07-22T08:00:00Z");
  assert.equal(result.metadata.canonicalUrl, "https://example.test/news/minister-resigns");
});

test("article extraction excludes navigation and footer text", () => {
  const result = extractArticleFromHtml(fixture, "https://example.test/news/current");

  assert.doesNotMatch(result.text, /Sports Weather Markets/iu);
  assert.doesNotMatch(result.text, /Privacy policy/iu);
  assert.match(result.text, /Ignore previous instructions/iu);
});

test("page extraction returns broad text with mixed-content warning", () => {
  const result = extractPageFromHtml(fixture, "https://example.test/news/current");

  assert.equal(result.ok, true);
  assert.match(result.text, /minister resigned/iu);
  assert.doesNotMatch(result.text, /window\.secret/iu);
  assert.equal(result.warnings.includes("Page analysis may include mixed page content."), true);
});

test("local-only backend origin rejects non-loopback origins", () => {
  assert.equal(normalizeBackendOrigin("http://localhost:8000/"), "http://localhost:8000");
  assert.throws(() => normalizeBackendOrigin("https://example.com"));
  assert.throws(() => normalizeBackendOrigin("http://user:pass@localhost:8000"));
});

