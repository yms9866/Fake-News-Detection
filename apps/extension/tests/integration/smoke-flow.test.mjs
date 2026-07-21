import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { ApiClient } from "../../dist/shared/api-client.js";
import { extractArticleFromHtml } from "../../dist/content/article-extractor.js";
import { summarizeAnalysis } from "../../dist/background/job-monitor.js";

const fixture = await readFile(new URL("../fixtures/news.html", import.meta.url), "utf8");

test("deterministic article and screenshot flow uses backend contracts", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith("/v1/analyses/text")) {
      return json({ ...analysis("text-1"), extracted_text: JSON.parse(init.body).text });
    }
    if (url.endsWith("/v1/analyses/image")) {
      return json({
        analysis_id: "image-1",
        job_id: "job-1",
        status: "queued",
        input_type: "file",
        media_type: "image",
        status_url: "/v1/analyses/image-1",
        job_url: "/v1/jobs/job-1",
        events_url: "/v1/jobs/job-1/events",
        request_id: "req-upload",
        trace_id: "trace-upload"
      });
    }
    if (url.endsWith("/v1/jobs/job-1")) {
      return json({
        job_id: "job-1",
        analysis_id: "image-1",
        status: "completed",
        progress: 100,
        current_stage: "completed",
        message: "done",
        error: null,
        request_id: "req-job",
        trace_id: "trace-job"
      });
    }
    if (url.endsWith("/v1/analyses/image-1")) {
      return json(analysis("image-1"));
    }
    return json({ status: "live" });
  };

  const client = new ApiClient({ backendOrigin: "http://127.0.0.1:8000" });
  const article = extractArticleFromHtml(fixture, "https://example.test/news/current");
  const textResult = await client.analyzeText({ text: article.text, deep_check: false, max_length: 512 });
  const upload = await client.uploadImage(new Blob(["png"], { type: "image/png" }), {
    idempotencyKey: "idem-smoke",
    deepCheck: false,
    maxLength: 512
  });
  const job = await client.getJob(upload.job_id);
  const imageResult = await client.getAnalysis(job.analysis_id);
  const summary = summarizeAnalysis(imageResult, job);

  assert.equal(textResult.input_type, "text");
  assert.equal(upload.job_id, "job-1");
  assert.equal(summary.finalVerdict, "UNVERIFIED");
  assert.equal(calls.filter((call) => call.url.endsWith("/v1/analyses/image")).length, 1);
  assert.equal(calls.some((call) => call.init.body instanceof FormData), true);
});

function json(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function analysis(id) {
  return {
    analysis_id: id,
    status: "completed",
    input_type: "text",
    media_type: null,
    extracted_text: "The minister resigned after an inquiry released a report.",
    cleaned_text: "The minister resigned after an inquiry released a report.",
    source_url: null,
    media_metadata: null,
    extraction_metadata: null,
    style_signal: "LOW_STYLE_RISK",
    style_confidence: 0.74,
    style_scope_reliable: false,
    style_word_count: 9,
    style_minimum_word_count: 20,
    style_warning: "Short input scope limitation.",
    verification: null,
    final_verdict: "UNVERIFIED",
    confidence: "LOW",
    reason: "Factual verification was not performed.",
    warnings: ["Short input scope limitation."],
    created_at: "2026-07-22T00:00:00Z",
    completed_at: "2026-07-22T00:00:01Z",
    request_id: "req-analysis",
    trace_id: "trace-analysis"
  };
}

