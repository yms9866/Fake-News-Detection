import assert from "node:assert/strict";
import { test } from "node:test";
import { compactSearchSummary, compactSources, safeHttpUrl } from "../../dist/ui/evidence.js";
import { summarizeAnalysis } from "../../dist/background/job-monitor.js";

test("source compaction keeps http links and drops unsafe URLs", () => {
  const sources = compactSources({
    sources: [
      {
        citation_label: "S1",
        url: "https://news.example/story",
        title: "Story",
        publisher: "Example",
        stance: "SUPPORTS",
        reliability: "HIGH",
        qualification: "qualifies"
      },
      {
        citation_label: "S2",
        url: "javascript:alert(1)",
        title: "Bad",
        stance: "MENTIONS"
      }
    ]
  });
  assert.equal(sources[0].url, "https://news.example/story");
  assert.equal(sources[1].url, "");
  assert.equal(safeHttpUrl("file:///etc/passwd"), "");
});

test("summarizeAnalysis stores search queries for the report view", () => {
  const summary = summarizeAnalysis({
    analysis_id: "a1",
    status: "completed",
    style_signal: "LOW_STYLE_RISK",
    search_summary: {
      queries: [{ query: "example claim sources" }],
      total_queries: 1,
      total_results: 4,
      reviewed_source_count: 2,
      qualifying_source_count: 1
    },
    sources: [{ url: "https://example.test/a", title: "A", stance: "SUPPORTS" }],
    final_verdict: "UNVERIFIED",
    confidence: "LOW"
  });
  assert.equal(summary.searchSummary.totalQueries, 1);
  assert.equal(summary.searchSummary.queries[0].query, "example claim sources");
  assert.equal(summary.sources[0].title, "A");
  assert.equal(compactSearchSummary(summary.searchSummary).queries.length, 1);
});
