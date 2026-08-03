from __future__ import annotations

import unittest

from packages.backend.fnd.application.services.evidence_pipeline import (
    AtomicClaimExtractor,
    EvidenceReviewPipeline,
)
from packages.backend.fnd.domain.entities import SearchContext, SearchResult
from packages.backend.fnd.domain.enums import ClaimStatus, EvidenceQuality


class FakeSearchProvider:
    def __init__(self, results: list[SearchResult]) -> None:
        self.results = tuple(results)
        self.queries: list[str] = []

    def search(self, claim_text: str, max_results: int) -> SearchContext:
        return self.search_query(query=claim_text, max_results=max_results)

    def search_query(self, query: str, max_results: int) -> SearchContext:
        self.queries.append(query)
        return SearchContext(
            query=query,
            results=self.results[:max_results],
            raw_context="",
        )


class FakeFetchedPage:
    def __init__(self, url: str, text: str) -> None:
        self.url = url
        self.final_url = url
        self.content_type = "text/plain"
        self.text = text


class FakeFetcher:
    def __init__(self, pages: dict[str, str] | None = None) -> None:
        self.pages = pages or {}

    def fetch(self, url: str) -> FakeFetchedPage:
        if url not in self.pages:
            raise TimeoutError("fetch timeout")
        return FakeFetchedPage(url, self.pages[url])


class EvidencePipelineTests(unittest.TestCase):
    def test_atomic_claim_extraction_splits_checkable_claims(self) -> None:
        claims = AtomicClaimExtractor().extract(
            "Israel approved a 200-member international force for Rafah. "
            "Morocco is participating. Uganda is participating."
        )

        self.assertGreaterEqual(len(claims), 3)
        self.assertEqual(claims[0].claim_id, "claim-1")
        self.assertTrue(claims[0].search_queries)

    def test_snippet_only_sources_do_not_qualify(self) -> None:
        result = EvidenceReviewPipeline(
            search_provider=FakeSearchProvider(
                [
                    SearchResult(
                        title="Lead",
                        snippet="Agency A approved disaster funds.",
                        url="https://agency.gov/lead",
                    )
                ]
            ),
            source_fetcher=FakeFetcher(),
        ).review("Agency A approved disaster funds.", max_results=2)

        self.assertEqual(result.evidence_items[0].qualification_status, "NOT_QUALIFIED")
        self.assertIn("SOURCE_NOT_FETCHED", result.evidence_items[0].rejection_reasons)
        self.assertEqual(
            result.claims[0].verification_status,
            ClaimStatus.INSUFFICIENT_EVIDENCE,
        )

    def test_unknown_reliability_is_not_low_and_does_not_qualify(self) -> None:
        url = "https://unknown.example/article"
        result = EvidenceReviewPipeline(
            search_provider=FakeSearchProvider(
                [
                    SearchResult(
                        title="Unknown outlet",
                        snippet="Agency A approved disaster funds.",
                        url=url,
                    )
                ]
            ),
            source_fetcher=FakeFetcher(
                {url: "Agency A approved disaster funds after a public hearing."}
            ),
        ).review("Agency A approved disaster funds.", max_results=1)

        self.assertEqual(result.evidence_items[0].reliability, EvidenceQuality.UNKNOWN)
        self.assertIn("UNKNOWN_SOURCE", result.evidence_items[0].rejection_reasons)

    def test_independent_reviewed_sources_support_claim(self) -> None:
        first = "https://agency.gov/report"
        second = "https://records.gov/notice"
        result = EvidenceReviewPipeline(
            search_provider=FakeSearchProvider(
                [
                    SearchResult(
                        title="Agency report",
                        snippet="Agency A approved disaster funds.",
                        url=first,
                    ),
                    SearchResult(
                        title="Public notice",
                        snippet="Agency A approved disaster funds.",
                        url=second,
                    ),
                ]
            ),
            source_fetcher=FakeFetcher(
                {
                    first: "Agency A approved disaster funds for flood recovery.",
                    second: "Agency A approved disaster funds for flood recovery.",
                }
            ),
        ).review("Agency A approved disaster funds for flood recovery.", max_results=2)

        self.assertGreaterEqual(len(result.evidence_items), 2)
        self.assertEqual(result.claims[0].verification_status, ClaimStatus.SUPPORTED)
        self.assertEqual(result.claims[0].confidence, EvidenceQuality.HIGH)


if __name__ == "__main__":
    unittest.main()
