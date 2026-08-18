from __future__ import annotations

import unittest

from packages.backend.fnd.adapters.llm.gemini_grounding import (
    GeminiGroundedSearchEvidenceProvider,
    is_grounding_redirect,
    resolve_grounding_redirects,
)
from packages.backend.fnd.application.services.verdict_policy import VerdictPolicy
from packages.backend.fnd.domain.entities import StyleAnalysis
from packages.backend.fnd.domain.enums import (
    EvidenceQuality,
    EvidenceStance,
    FinalVerdict,
    StyleRiskSignal,
)


def _grounded_response() -> dict[str, object]:
    return {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": """
{
  "verdict": "FAKE",
  "confidence": "HIGH",
  "evidence_quality": "HIGH",
  "explanation": "Two current reputable reports contradict the claim.",
  "evidence_summary": ["The person made a public appearance today."],
  "sources": [
    {
      "source_index": 1,
      "stance": "CONTRADICTS",
      "reliability": "HIGH",
      "source_type": "ESTABLISHED_NEWS",
      "direct": true,
      "reliability_reason": "Current attributed reporting",
      "related_claim_ids": ["claim-1"]
    },
    {
      "source_index": 2,
      "stance": "CONTRADICTS",
      "reliability": "HIGH",
      "source_type": "WIRE_SERVICE",
      "direct": true,
      "reliability_reason": "Independent current report",
      "related_claim_ids": ["claim-1"]
    }
  ],
  "claims": [
    {
      "claim_id": "claim-1",
      "verdict": "CONTRADICTED",
      "confidence": "HIGH",
      "supporting_source_ids": [],
      "contradicting_source_ids": ["source-1", "source-2"],
      "explanation": "Current reports contradict the claim.",
      "unresolved_reason": null
    }
  ],
  "limitations": [],
  "recommendation": "Treat the claim as false."
}
""".strip()
                        }
                    ]
                },
                "groundingMetadata": {
                    "webSearchQueries": ["example claim latest status"],
                    "groundingChunks": [
                        {
                            "web": {
                                "uri": "https://news.example/report",
                                "title": "Current report",
                            }
                        },
                        {
                            "web": {
                                "uri": "https://wire.example/story",
                                "title": "Wire report",
                            }
                        },
                    ],
                    "groundingSupports": [
                        {
                            "segment": {
                                "text": "The person made a public appearance today."
                            },
                            "groundingChunkIndices": [0],
                        },
                        {
                            "segment": {
                                "text": "An independent report confirms the appearance."
                            },
                            "groundingChunkIndices": [1],
                        },
                    ],
                },
            }
        ]
    }


class GeminiGroundedSearchEvidenceProviderTests(unittest.TestCase):
    def test_search_and_verify_share_one_grounded_call(self) -> None:
        calls: list[dict[str, object]] = []

        def transport(url, headers, payload, timeout):
            calls.append(
                {
                    "url": url,
                    "headers": headers,
                    "payload": payload,
                    "timeout": timeout,
                }
            )
            return _grounded_response()

        provider = GeminiGroundedSearchEvidenceProvider(
            api_key="test-key",
            transport=transport,
        )
        context = provider.search("Example claim", max_results=6)
        evidence = provider.verify("Example claim", context)

        self.assertEqual(len(calls), 1)
        self.assertEqual(context.queries[0].provider, "gemini_google_search")
        self.assertEqual(len(context.reviewed_sources), 2)
        self.assertTrue(evidence.grounding_used)
        self.assertEqual(evidence.verdict, FinalVerdict.FAKE)
        self.assertEqual(evidence.items[0].stance, EvidenceStance.CONTRADICTS)
        self.assertEqual(evidence.items[0].qualification_status, "QUALIFIED")
        self.assertIn("google_search", calls[0]["payload"]["tools"][0])

    def test_google_grounding_redirect_is_resolved_to_the_publisher_url(self) -> None:
        response = _grounded_response()
        candidate = response["candidates"][0]
        grounding = candidate["groundingMetadata"]
        redirect = (
            "https://vertexaisearch.cloud.google.com/grounding-api-redirect/example"
        )
        grounding["groundingChunks"][0]["web"] = {
            "uri": redirect,
            "title": "reuters.com",
        }
        provider = GeminiGroundedSearchEvidenceProvider(
            api_key="test-key",
            transport=lambda *_: response,
            redirect_resolver=lambda url, _timeout: (
                "https://www.reuters.com/world/real-article-2026"
                if url == redirect
                else url
            ),
        )

        context = provider.search("Example claim", max_results=6)

        self.assertEqual(
            context.reviewed_sources[0].url,
            "https://www.reuters.com/world/real-article-2026",
        )
        self.assertEqual(context.reviewed_sources[0].publisher, "reuters.com")
        self.assertNotIn(
            "vertexaisearch.cloud.google.com",
            context.reviewed_sources[0].url,
        )

    def test_unresolvable_redirect_keeps_the_original_citation(self) -> None:
        response = _grounded_response()
        candidate = response["candidates"][0]
        grounding = candidate["groundingMetadata"]
        redirect = (
            "https://vertexaisearch.cloud.google.com/grounding-api-redirect/example"
        )
        grounding["groundingChunks"][0]["web"] = {
            "uri": redirect,
            "title": "reuters.com",
        }

        def failing_resolver(_url: str, _timeout: float) -> str:
            raise RuntimeError("network unavailable")

        provider = GeminiGroundedSearchEvidenceProvider(
            api_key="test-key",
            transport=lambda *_: response,
            redirect_resolver=failing_resolver,
        )

        context = provider.search("Example claim", max_results=6)

        self.assertEqual(context.reviewed_sources[0].url, redirect)
        self.assertEqual(context.reviewed_sources[0].publisher, "reuters.com")

    def test_direct_publisher_urls_are_never_resolved(self) -> None:
        calls: list[str] = []

        def tracking_resolver(url: str, _timeout: float) -> str:
            calls.append(url)
            return url

        provider = GeminiGroundedSearchEvidenceProvider(
            api_key="test-key",
            transport=lambda *_: _grounded_response(),
            redirect_resolver=tracking_resolver,
        )

        context = provider.search("Example claim", max_results=6)

        self.assertEqual(calls, [])
        self.assertEqual(context.reviewed_sources[0].url, "https://news.example/report")


class GroundingRedirectHelperTests(unittest.TestCase):
    def test_only_google_redirect_links_are_detected(self) -> None:
        self.assertTrue(
            is_grounding_redirect(
                "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc"
            )
        )
        self.assertFalse(is_grounding_redirect("https://reuters.com/article"))
        self.assertFalse(is_grounding_redirect(""))

    def test_redirect_chains_landing_on_another_redirect_are_rejected(self) -> None:
        resolved = resolve_grounding_redirects(
            ["https://vertexaisearch.cloud.google.com/grounding-api-redirect/a"],
            lambda _url, _timeout: (
                "https://vertexaisearch.cloud.google.com/grounding-api-redirect/b"
            ),
            1.0,
        )
        self.assertEqual(resolved, {})

    def test_duplicate_redirects_are_resolved_once(self) -> None:
        calls: list[str] = []

        def resolver(url: str, _timeout: float) -> str:
            calls.append(url)
            return "https://reuters.com/article"

        redirect = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/a"
        resolved = resolve_grounding_redirects(
            [redirect, redirect, redirect], resolver, 1.0
        )

        self.assertEqual(len(calls), 1)
        self.assertEqual(resolved, {redirect: "https://reuters.com/article"})

    def test_grounded_sources_can_drive_existing_final_policy(self) -> None:
        provider = GeminiGroundedSearchEvidenceProvider(
            api_key="test-key",
            transport=lambda *_: _grounded_response(),
        )
        context = provider.search("Example claim", max_results=6)
        evidence = provider.verify("Example claim", context)
        style = StyleAnalysis.from_prediction(
            signal=StyleRiskSignal.LOW,
            confidence=0.99,
            text="This is a sufficiently long article-style input " * 4,
        )

        decision = VerdictPolicy().decide(style=style, evidence=evidence)

        self.assertEqual(decision.verdict, FinalVerdict.FAKE)
        self.assertEqual(decision.confidence, EvidenceQuality.HIGH)

    def test_no_grounding_metadata_forces_unverified(self) -> None:
        response = _grounded_response()
        candidate = response["candidates"][0]
        candidate.pop("groundingMetadata")
        provider = GeminiGroundedSearchEvidenceProvider(
            api_key="test-key",
            transport=lambda *_: response,
        )

        context = provider.search("Example claim", max_results=6)
        evidence = provider.verify("Example claim", context)

        self.assertFalse(evidence.grounding_used)
        self.assertEqual(evidence.verdict, FinalVerdict.UNVERIFIED)
        self.assertEqual(evidence.items, ())
        self.assertTrue(
            any(
                "no usable" in limitation.lower() for limitation in evidence.limitations
            )
        )

    def test_missing_key_is_structured_and_does_not_call_transport(self) -> None:
        def unexpected_transport(*_):
            raise AssertionError("transport must not be called")

        provider = GeminiGroundedSearchEvidenceProvider(
            api_key=None,
            transport=unexpected_transport,
        )

        context = provider.search("Example claim", max_results=6)
        evidence = provider.verify("Example claim", context)

        self.assertEqual(context.error, "GEMINI_API_KEY_MISSING")
        self.assertEqual(evidence.verdict, FinalVerdict.ERROR)
        self.assertEqual(evidence.error, "GEMINI_API_KEY_MISSING")

    def test_provider_failure_does_not_expose_exception_message(self) -> None:
        def failing_transport(*_):
            raise RuntimeError("secret provider response")

        provider = GeminiGroundedSearchEvidenceProvider(
            api_key="test-key",
            transport=failing_transport,
        )

        context = provider.search("Example claim", max_results=6)
        evidence = provider.verify("Example claim", context)

        self.assertEqual(context.error, "GEMINI_GROUNDED_SEARCH_FAILED")
        self.assertNotIn("secret provider response", evidence.error or "")
        self.assertIn("RuntimeError", evidence.error or "")


if __name__ == "__main__":
    unittest.main()
