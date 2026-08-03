"""Atomic-claim extraction and public-web evidence review pipeline."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from hashlib import sha256
from time import perf_counter
from typing import Iterable
from urllib.parse import urlparse
import html
import re

from packages.backend.fnd.domain.entities import (
    AtomicClaim,
    ClaimAssessment,
    EvidenceItem,
    RelevantPassage,
    SearchContext,
    SearchQueryRecord,
    SearchResult,
    normalize_text,
    utc_now,
)
from packages.backend.fnd.domain.enums import (
    ClaimImportance,
    ClaimStatus,
    ClaimType,
    EvidenceQuality,
    EvidenceStance,
    SourceType,
)
from packages.backend.fnd.ports.search import SearchProvider, SourcePageFetcher

MAX_CLAIMS = 8
MAX_QUERIES_PER_CLAIM = 6
MAX_REVIEWED_SOURCES = 24
MIN_SUPPORT_RELEVANCE = 0.42
MIN_MENTION_RELEVANCE = 0.18

MONTH_PATTERN = (
    r"January|February|March|April|May|June|July|August|September|October|"
    r"November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|"
    r"Sep\.?|Sept\.?|Oct\.?|Nov\.?|Dec\.?"
)
DATE_RE = re.compile(
    rf"\b(?:{MONTH_PATTERN})\s+\d{{1,2}}(?:,\s*\d{{4}})?\b|\b(?:19|20)\d{{2}}\b",
    re.IGNORECASE,
)
ENTITY_RE = re.compile(r"\b[A-Z][a-zA-Z0-9'&.-]*(?:\s+[A-Z][a-zA-Z0-9'&.-]*){0,4}\b")
WORD_RE = re.compile(r"[a-z0-9]+", re.IGNORECASE)

STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "been",
    "by",
    "for",
    "from",
    "has",
    "have",
    "in",
    "is",
    "it",
    "its",
    "of",
    "on",
    "or",
    "that",
    "the",
    "their",
    "this",
    "to",
    "was",
    "were",
    "will",
    "with",
}

OPINION_MARKERS = {
    "i think",
    "i believe",
    "should",
    "best",
    "worst",
    "amazing",
    "terrible",
    "satire",
}

FACT_CHECK_DOMAINS = {
    "factcheck.org",
    "politifact.com",
    "snopes.com",
    "reuters.com/fact-check",
    "apnews.com/hub/ap-fact-check",
}
WIRE_DOMAINS = {"reuters.com", "apnews.com", "afp.com", "associatedpress.com"}
ESTABLISHED_NEWS_DOMAINS = {
    "bbc.com",
    "bbc.co.uk",
    "nytimes.com",
    "washingtonpost.com",
    "theguardian.com",
    "cnn.com",
    "npr.org",
    "nbcnews.com",
    "cbsnews.com",
    "abcnews.go.com",
    "aljazeera.com",
}
SOCIAL_DOMAINS = {
    "facebook.com",
    "x.com",
    "twitter.com",
    "tiktok.com",
    "instagram.com",
    "reddit.com",
    "youtube.com",
}
INTERNATIONAL_ORG_DOMAINS = {"un.org", "who.int", "worldbank.org", "imf.org"}


@dataclass(frozen=True)
class EvidencePipelineResult:
    claims: tuple[AtomicClaim, ...]
    search_context: SearchContext
    evidence_items: tuple[EvidenceItem, ...]


@dataclass(frozen=True)
class SourceClassification:
    source_type: SourceType
    reliability: EvidenceQuality
    reason: str
    family: str


class AtomicClaimExtractor:
    """Small deterministic claim extractor for independently checkable facts."""

    def extract(self, text: str) -> tuple[AtomicClaim, ...]:
        normalized = normalize_text(text)
        if not normalized:
            return ()

        claims: list[AtomicClaim] = []
        for candidate in _candidate_claims(normalized):
            if len(claims) >= MAX_CLAIMS:
                break
            if not _looks_verifiable(candidate):
                continue
            sequence = len(claims) + 1
            claim_id = f"claim-{sequence}"
            entities = _entities(candidate)
            dates = tuple(DATE_RE.findall(candidate))
            claim_type = _claim_type(candidate)
            claim = AtomicClaim(
                claim_id=claim_id,
                sequence=sequence,
                claim_text=candidate,
                normalized_claim=normalize_text(candidate).lower(),
                importance=_importance(sequence, candidate),
                claim_type=claim_type,
                entities=entities,
                people=_people(entities),
                organizations=_organizations(entities),
                locations=_locations(entities),
                detected_dates=dates,
                publication_period=dates[0] if dates else None,
                verifiability="VERIFIABLE",
                search_queries=tuple(_queries_for_claim(candidate, entities, dates)),
                unresolved_reason="No qualifying evidence has been reviewed yet.",
            )
            claims.append(claim)

        if not claims:
            return (
                AtomicClaim(
                    claim_id="claim-1",
                    sequence=1,
                    claim_text=truncate_claim(normalized),
                    normalized_claim=truncate_claim(normalized).lower(),
                    importance=ClaimImportance.LOW,
                    claim_type=ClaimType.OTHER,
                    verifiability="NOT_VERIFIABLE",
                    verification_status=ClaimStatus.NOT_VERIFIABLE,
                    confidence=EvidenceQuality.LOW,
                    explanation=(
                        "The input did not contain a clearly checkable factual claim."
                    ),
                    unresolved_reason="The text appears vague, opinion-based, or not factual.",
                ),
            )

        return tuple(claims)


@dataclass
class EvidenceReviewPipeline:
    search_provider: SearchProvider
    source_fetcher: SourcePageFetcher
    claim_extractor: AtomicClaimExtractor | None = None

    def review(self, text: str, max_results: int) -> EvidencePipelineResult:
        extractor = self.claim_extractor or AtomicClaimExtractor()
        claims = extractor.extract(text)
        query_records: list[SearchQueryRecord] = []
        search_results: list[SearchResult] = []
        evidence_items: list[EvidenceItem] = []
        seen_urls: set[str] = set()
        source_families_seen: dict[str, str] = {}

        for claim in claims:
            if claim.verifiability != "VERIFIABLE":
                continue
            for query_index, query in enumerate(
                claim.search_queries[:MAX_QUERIES_PER_CLAIM],
                start=1,
            ):
                if len(evidence_items) >= MAX_REVIEWED_SOURCES:
                    break
                start = perf_counter()
                search_context = _search_query(
                    self.search_provider,
                    query,
                    max_results=max(1, min(max_results, 4)),
                )
                duration_ms = (perf_counter() - start) * 1000
                query_records.append(
                    SearchQueryRecord(
                        query_id=f"{claim.claim_id}-query-{query_index}",
                        claim_id=claim.claim_id,
                        query=query,
                        query_type=_query_type(query_index),
                        provider="public_web",
                        result_count=len(search_context.results),
                        duration_ms=duration_ms,
                        error=search_context.error,
                    )
                )
                search_results.extend(search_context.results)
                for rank, result in enumerate(search_context.results, start=1):
                    if len(evidence_items) >= MAX_REVIEWED_SOURCES:
                        break
                    normalized_url = _canonical_url(result.url)
                    if not normalized_url or normalized_url in seen_urls:
                        continue
                    seen_urls.add(normalized_url)
                    source_id = f"source-{len(evidence_items) + 1}"
                    item = self._review_source(
                        claim=claim,
                        source_id=source_id,
                        result=result,
                        query=query,
                        rank=rank,
                        source_families_seen=source_families_seen,
                    )
                    evidence_items.append(item)

        claim_assessments = _assess_claims(claims, evidence_items)
        assessed_claims = tuple(
            claim.with_assessment(
                claim_assessments.get(claim.claim_id, _not_run(claim))
            )
            for claim in claims
        )
        raw_context = _reviewed_context(assessed_claims, evidence_items, query_records)
        return EvidencePipelineResult(
            claims=assessed_claims,
            search_context=SearchContext(
                query="; ".join(record.query for record in query_records[:8]),
                results=tuple(search_results),
                raw_context=raw_context,
                error=_first_error(query_records),
                queries=tuple(query_records),
                reviewed_sources=tuple(evidence_items),
            ),
            evidence_items=tuple(evidence_items),
        )

    def _review_source(
        self,
        *,
        claim: AtomicClaim,
        source_id: str,
        result: SearchResult,
        query: str,
        rank: int,
        source_families_seen: dict[str, str],
    ) -> EvidenceItem:
        canonical_url = _canonical_url(result.url)
        classification = _classify_source(canonical_url)
        base = {
            "title": result.title,
            "publisher": _publisher(result.url),
            "source_id": source_id,
            "related_claim_ids": (claim.claim_id,),
            "source_type": classification.source_type,
            "reliability": classification.reliability,
            "reliability_reason": classification.reason,
            "independence_key": classification.family,
            "fetch_attempted": True,
            "search_provider": "public_web",
            "search_query": query,
            "search_rank": rank,
            "search_snippet": result.snippet,
            "retrieved_at": claim_publication_time(),
        }
        try:
            fetched = self.source_fetcher.fetch(result.url)
            page_text = _extract_text(fetched.text, fetched.content_type)
        except Exception as exc:
            return EvidenceItem(
                **base,
                url=result.url,
                canonical_url=canonical_url,
                fetched=False,
                fetch_error_code=_safe_fetch_error(exc),
                content_type="",
                stance=EvidenceStance.MENTIONS,
                mentions_only=True,
                page_text=result.snippet,
                rejection_reasons=("SOURCE_NOT_FETCHED",),
                qualification_status="NOT_QUALIFIED",
            )

        passages = _relevant_passages(claim.claim_text, page_text)
        relevance = passages[0].relevance_score if passages else 0.0
        stance = _stance_from_passages(claim.claim_text, passages)
        source_family = _source_family(classification.family, page_text, result.title)
        duplicate_of = source_families_seen.get(source_family)
        rejection_reasons = _rejection_reasons(
            fetched=True,
            reliability=classification.reliability,
            stance=stance,
            relevance=relevance,
            duplicate=duplicate_of is not None,
        )
        qualified = not rejection_reasons
        if qualified:
            source_families_seen[source_family] = source_id

        return EvidenceItem(
            **base,
            url=result.url,
            canonical_url=fetched.final_url or canonical_url,
            fetched=True,
            fetch_status=200,
            content_type=fetched.content_type,
            stance=stance,
            direct=stance in {EvidenceStance.SUPPORTS, EvidenceStance.CONTRADICTS},
            mentions_only=stance == EvidenceStance.MENTIONS,
            matches_claim=stance != EvidenceStance.IRRELEVANT,
            copied_from=duplicate_of,
            page_text=page_text[:4000],
            text_hash=sha256(page_text.encode("utf-8", errors="ignore")).hexdigest(),
            extracted_char_count=len(page_text),
            relevant_passages=tuple(passages),
            relevance_score=relevance,
            qualification_status="QUALIFIED" if qualified else "NOT_QUALIFIED",
            rejection_reasons=tuple(rejection_reasons),
            used_in_explanation=qualified,
        )


def _candidate_claims(text: str) -> Iterable[str]:
    sentences = re.split(r"(?<=[.!?])\s+|\n+", text)
    for sentence in sentences:
        sentence = normalize_text(sentence.strip(" -"))
        if not sentence:
            continue
        pieces = re.split(r"\s*;\s*|\s+(?=and\s+[A-Z0-9])", sentence)
        for piece in pieces:
            piece = normalize_text(piece)
            if 5 <= len(piece) <= 360:
                yield piece.rstrip(".!?")


def _looks_verifiable(text: str) -> bool:
    lowered = text.lower()
    if "?" in text or any(marker in lowered for marker in OPINION_MARKERS):
        return False
    return bool(
        DATE_RE.search(text) or ENTITY_RE.search(text) or re.search(r"\d", text)
    )


def _queries_for_claim(
    claim: str,
    entities: tuple[str, ...],
    dates: tuple[str, ...],
) -> list[str]:
    query_claim = truncate_claim(claim, 140)
    queries = [
        f'"{query_claim}"',
        f"{query_claim} fact check",
        f"{query_claim} official source",
    ]
    if entities:
        queries.append(f"{' '.join(entities[:4])} {query_claim}")
        queries.append(f"{' '.join(entities[:3])} official statement")
    if dates:
        queries.append(f"{query_claim} {' '.join(dates[:2])}")
    return _dedupe_strings(queries)


def _query_type(index: int) -> str:
    return (
        "exact_phrase",
        "fact_check",
        "official_source",
        "entity_based",
        "organization_based",
        "date_aware",
    )[min(index - 1, 5)]


def _search_query(
    provider: SearchProvider,
    query: str,
    max_results: int,
) -> SearchContext:
    direct = getattr(provider, "search_query", None)
    if callable(direct):
        return direct(query=query, max_results=max_results)
    return provider.search(query, max_results=max_results)


def _extract_text(raw_text: str, content_type: str) -> str:
    if "html" not in content_type.lower():
        return normalize_text(raw_text)
    try:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(raw_text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()
        paragraphs = [p.get_text(" ", strip=True) for p in soup.find_all("p")]
        text = " ".join(p for p in paragraphs if p)
        if not text:
            text = soup.get_text(" ", strip=True)
        return normalize_text(html.unescape(text))
    except Exception:
        return normalize_text(re.sub(r"<[^>]+>", " ", raw_text))


def _classify_source(url: str) -> SourceClassification:
    domain = _domain(url)
    root = _registrable_domain(domain)
    if domain.endswith(".gov") or domain.endswith(".mil"):
        return SourceClassification(
            SourceType.GOVERNMENT,
            EvidenceQuality.HIGH,
            "Government or official public-domain source.",
            root,
        )
    if root in INTERNATIONAL_ORG_DOMAINS or domain.endswith(".int"):
        return SourceClassification(
            SourceType.INTERNATIONAL_ORGANIZATION,
            EvidenceQuality.HIGH,
            "International organization source.",
            root,
        )
    if any(marker in url for marker in FACT_CHECK_DOMAINS):
        return SourceClassification(
            SourceType.FACT_CHECKER,
            EvidenceQuality.HIGH,
            "Established fact-checking source.",
            root,
        )
    if root in WIRE_DOMAINS:
        return SourceClassification(
            SourceType.WIRE_SERVICE,
            EvidenceQuality.HIGH,
            "Wire-service or primary newswire source.",
            "wire:" + root,
        )
    if root in ESTABLISHED_NEWS_DOMAINS:
        return SourceClassification(
            SourceType.ESTABLISHED_NEWS,
            EvidenceQuality.MEDIUM,
            "Established news publisher.",
            root,
        )
    if root in SOCIAL_DOMAINS:
        return SourceClassification(
            SourceType.SOCIAL_PLATFORM,
            EvidenceQuality.UNKNOWN,
            "Social or user-generated platform; not independent confirmation by itself.",
            root,
        )
    if "wikipedia.org" in domain:
        return SourceClassification(
            SourceType.WIKI,
            EvidenceQuality.LOW,
            "Wiki-style source; useful for leads but not qualifying evidence.",
            root,
        )
    return SourceClassification(
        SourceType.UNKNOWN,
        EvidenceQuality.UNKNOWN,
        "Source reliability is not configured for this domain.",
        root or domain,
    )


def _relevant_passages(claim: str, page_text: str) -> list[RelevantPassage]:
    claim_tokens = _content_tokens(claim)
    if not claim_tokens:
        return []
    sentences = re.split(r"(?<=[.!?])\s+", page_text)
    scored: list[RelevantPassage] = []
    for sentence in sentences:
        text = normalize_text(sentence)
        if len(text) < 30:
            continue
        score = _overlap_score(claim_tokens, _content_tokens(text))
        if score >= MIN_MENTION_RELEVANCE:
            scored.append(
                RelevantPassage(text=truncate_claim(text, 500), relevance_score=score)
            )
    scored.sort(key=lambda item: item.relevance_score, reverse=True)
    return scored[:3]


def _stance_from_passages(
    claim: str,
    passages: list[RelevantPassage],
) -> EvidenceStance:
    if not passages:
        return EvidenceStance.IRRELEVANT
    best = passages[0]
    lowered = best.text.lower()
    if best.relevance_score < MIN_MENTION_RELEVANCE:
        return EvidenceStance.IRRELEVANT
    if best.relevance_score >= MIN_SUPPORT_RELEVANCE:
        if _contains_contradiction_marker(lowered):
            return EvidenceStance.CONTRADICTS
        return EvidenceStance.SUPPORTS
    return EvidenceStance.MENTIONS


def _contains_contradiction_marker(text: str) -> bool:
    return any(
        marker in text
        for marker in (
            "false",
            "not true",
            "did not",
            "has not",
            "no evidence",
            "denied",
            "debunked",
            "hoax",
            "misleading",
        )
    )


def _rejection_reasons(
    *,
    fetched: bool,
    reliability: EvidenceQuality,
    stance: EvidenceStance,
    relevance: float,
    duplicate: bool,
) -> list[str]:
    reasons: list[str] = []
    if not fetched:
        reasons.append("SOURCE_NOT_FETCHED")
    if reliability == EvidenceQuality.UNKNOWN:
        reasons.append("UNKNOWN_SOURCE")
    elif reliability == EvidenceQuality.LOW:
        reasons.append("LOW_RELIABILITY")
    if stance == EvidenceStance.IRRELEVANT or relevance < MIN_MENTION_RELEVANCE:
        reasons.append("IRRELEVANT_TO_CLAIM")
    elif stance == EvidenceStance.MENTIONS:
        reasons.append("NO_SUPPORTING_PASSAGE")
    if duplicate:
        reasons.append("DUPLICATE_SOURCE_FAMILY")
    return reasons


def _assess_claims(
    claims: tuple[AtomicClaim, ...],
    items: list[EvidenceItem],
) -> dict[str, ClaimAssessment]:
    by_claim: dict[str, list[EvidenceItem]] = defaultdict(list)
    for item in items:
        for claim_id in item.related_claim_ids:
            by_claim[claim_id].append(item)

    assessments: dict[str, ClaimAssessment] = {}
    for claim in claims:
        if claim.verifiability != "VERIFIABLE":
            assessments[claim.claim_id] = ClaimAssessment(
                claim_id=claim.claim_id,
                verdict=ClaimStatus.NOT_VERIFIABLE,
                confidence=EvidenceQuality.LOW,
                explanation="The claim was not suitable for factual verification.",
                unresolved_reason=claim.unresolved_reason,
            )
            continue
        claim_items = by_claim.get(claim.claim_id, [])
        eligible = [
            item for item in claim_items if item.qualification_status == "QUALIFIED"
        ]
        support = [item for item in eligible if item.stance == EvidenceStance.SUPPORTS]
        contradict = [
            item for item in eligible if item.stance == EvidenceStance.CONTRADICTS
        ]
        support_groups = {item.independence_group for item in support}
        contradict_groups = {item.independence_group for item in contradict}
        if support_groups and contradict_groups:
            verdict = ClaimStatus.MIXED
            confidence = EvidenceQuality.LOW
            explanation = "Reviewed sources conflict, so this claim remains unresolved."
        elif len(support_groups) >= 2:
            verdict = ClaimStatus.SUPPORTED
            confidence = _best_quality(support)
            explanation = "Multiple independent reviewed sources support this claim."
        elif len(support_groups) == 1:
            verdict = ClaimStatus.LIKELY_SUPPORTED
            confidence = EvidenceQuality.MEDIUM
            explanation = "One qualifying reviewed source supports this claim."
        elif len(contradict_groups) >= 2:
            verdict = ClaimStatus.CONTRADICTED
            confidence = _best_quality(contradict)
            explanation = "Multiple independent reviewed sources contradict this claim."
        elif len(contradict_groups) == 1:
            verdict = ClaimStatus.LIKELY_CONTRADICTED
            confidence = EvidenceQuality.MEDIUM
            explanation = "One qualifying reviewed source contradicts this claim."
        else:
            verdict = ClaimStatus.INSUFFICIENT_EVIDENCE
            confidence = EvidenceQuality.LOW
            explanation = "No qualifying reviewed source resolved this claim."

        assessments[claim.claim_id] = ClaimAssessment(
            claim_id=claim.claim_id,
            verdict=verdict,
            confidence=confidence,
            explanation=explanation,
            supporting_source_ids=tuple(item.source_id for item in support),
            contradicting_source_ids=tuple(item.source_id for item in contradict),
            unresolved_reason=(
                None
                if verdict
                not in {ClaimStatus.INSUFFICIENT_EVIDENCE, ClaimStatus.NOT_VERIFIABLE}
                else explanation
            ),
        )
    return assessments


def _reviewed_context(
    claims: tuple[AtomicClaim, ...],
    items: list[EvidenceItem],
    queries: list[SearchQueryRecord],
) -> str:
    parts = ["Search broadly across the public web.", "Checked claims:"]
    for claim in claims:
        parts.append(f"- {claim.claim_id}: {claim.claim_text}")
    parts.append("\nSearches performed:")
    for record in queries[:24]:
        parts.append(f"- {record.claim_id}: {record.query}")
    parts.append("\nReviewed sources:")
    for item in items:
        passage_text = " ".join(passage.text for passage in item.relevant_passages[:2])
        if not passage_text and not item.fetched:
            passage_text = (
                "A search result appears relevant, but the source page could not be "
                "fully reviewed."
            )
        parts.append(
            f"[{item.source_id}] {item.title or item.url}\n"
            f"URL: {item.url}\n"
            f"Claim IDs: {', '.join(item.related_claim_ids)}\n"
            f"Type/Reliability: {item.source_type.value}/{item.reliability.value}\n"
            f"Fetched: {item.fetched}; Stance: {item.stance.value}; "
            f"Qualified: {item.qualification_status == 'QUALIFIED'}\n"
            f"Passages: {passage_text[:1200]}"
        )
    return "\n".join(parts)


def _not_run(claim: AtomicClaim) -> ClaimAssessment:
    return ClaimAssessment(
        claim_id=claim.claim_id,
        verdict=claim.verification_status,
        confidence=claim.confidence,
        explanation=claim.explanation,
        unresolved_reason=claim.unresolved_reason,
    )


def _safe_fetch_error(exc: Exception) -> str:
    name = exc.__class__.__name__.upper()
    message = str(exc).lower()
    if "timeout" in message:
        return "FETCH_TIMEOUT"
    if "content type" in message:
        return "UNSUPPORTED_CONTENT_TYPE"
    if "status" in message or "http" in message:
        return "HTTP_ERROR"
    if "safe" in message or "private" in message or "localhost" in message:
        return "FETCH_BLOCKED"
    return name[:64] or "FETCH_FAILED"


def _first_error(records: list[SearchQueryRecord]) -> str | None:
    for record in records:
        if record.error:
            return record.error
    return None


def _best_quality(items: list[EvidenceItem]) -> EvidenceQuality:
    if any(item.reliability == EvidenceQuality.HIGH for item in items):
        return EvidenceQuality.HIGH
    if any(item.reliability == EvidenceQuality.MEDIUM for item in items):
        return EvidenceQuality.MEDIUM
    return EvidenceQuality.LOW


def _source_family(default_family: str, page_text: str, title: str) -> str:
    lowered = f"{title}\n{page_text[:2000]}".lower()
    if "reuters" in lowered:
        return "wire:reuters"
    if "associated press" in lowered or " ap " in lowered:
        return "wire:ap"
    if "agence france-presse" in lowered or "afp" in lowered:
        return "wire:afp"
    return default_family


def _canonical_url(url: str) -> str:
    try:
        parsed = urlparse(str(url or "").strip())
    except ValueError:
        return ""
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return ""
    path = parsed.path.rstrip("/") or "/"
    return f"{parsed.scheme}://{parsed.hostname.lower()}{path}"


def _domain(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower().lstrip("www.")
    except ValueError:
        return ""


def _registrable_domain(domain: str) -> str:
    pieces = domain.split(".")
    if len(pieces) <= 2:
        return domain
    return ".".join(pieces[-2:])


def _publisher(url: str) -> str:
    domain = _domain(url)
    return domain.replace("www.", "")


def _entities(text: str) -> tuple[str, ...]:
    return tuple(
        entity
        for entity in _dedupe_strings(
            match.group(0).strip() for match in ENTITY_RE.finditer(text)
        )
        if entity.lower() not in {"the", "this"}
    )


def _people(entities: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(entity for entity in entities if 1 < len(entity.split()) <= 3)


def _organizations(entities: tuple[str, ...]) -> tuple[str, ...]:
    markers = ("Inc", "Corp", "LLC", "University", "Ministry", "Department", "Court")
    return tuple(
        entity for entity in entities if any(marker in entity for marker in markers)
    )


def _locations(entities: tuple[str, ...]) -> tuple[str, ...]:
    known = {
        "Gaza",
        "Israel",
        "Rafah",
        "Morocco",
        "Uganda",
        "United States",
        "Washington",
        "London",
    }
    return tuple(entity for entity in entities if entity in known)


def _claim_type(text: str) -> ClaimType:
    lowered = text.lower()
    if re.search(r"\b\d+[\d,.-]*\b", text):
        return ClaimType.QUANTITY
    if DATE_RE.search(text):
        return ClaimType.DATE
    if any(word in lowered for word in ("said", "announced", "reported", "approved")):
        return ClaimType.ATTRIBUTION
    if any(word in lowered for word in ("in ", "at ", "near ", "from ")):
        return ClaimType.LOCATION
    return ClaimType.EVENT


def _importance(sequence: int, text: str) -> ClaimImportance:
    if sequence <= 2:
        return ClaimImportance.HIGH
    if re.search(r"\b\d+[\d,.-]*\b", text) or DATE_RE.search(text):
        return ClaimImportance.MEDIUM
    return ClaimImportance.LOW


def _content_tokens(text: str) -> set[str]:
    return {
        token.lower()
        for token in WORD_RE.findall(text)
        if len(token) > 2 and token.lower() not in STOPWORDS
    }


def _overlap_score(claim_tokens: set[str], passage_tokens: set[str]) -> float:
    if not claim_tokens or not passage_tokens:
        return 0.0
    return len(claim_tokens & passage_tokens) / max(1, len(claim_tokens))


def _dedupe_strings(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        item = normalize_text(value)
        key = item.lower()
        if item and key not in seen:
            seen.add(key)
            deduped.append(item)
    return deduped


def truncate_claim(text: str, limit: int = 220) -> str:
    normalized = normalize_text(text)
    if len(normalized) <= limit:
        return normalized
    return normalized[:limit].rstrip() + "..."


def claim_publication_time():
    return utc_now()
