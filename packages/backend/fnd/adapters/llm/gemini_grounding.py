"""Gemini Google Search grounding adapter."""

from __future__ import annotations

from collections import OrderedDict
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from hashlib import sha256
import re
from threading import Lock
from time import perf_counter, time
from typing import Any
from urllib.parse import quote, urlparse

from packages.backend.fnd.adapters.llm.gemini import (
    normalize_quality,
    normalize_verdict,
    parse_ai_json,
    parse_claim_assessments,
)
from packages.backend.fnd.domain.entities import (
    EvidenceAnalysis,
    EvidenceItem,
    RelevantPassage,
    SearchContext,
    SearchQueryRecord,
    SearchResult,
    normalize_text,
)
from packages.backend.fnd.domain.enums import (
    EvidenceQuality,
    EvidenceStance,
    FinalVerdict,
    SourceType,
)

GEMINI_GENERATE_CONTENT_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)

JsonTransport = Callable[[str, dict[str, str], dict[str, Any], float], dict[str, Any]]

# Google Search grounding hands back opaque redirect links instead of the
# publisher URL, so citations must be resolved before they are shown or stored.
GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com"
GEMINI_RUN_CACHE_TTL_SECONDS = 30 * 60
GEMINI_RUN_CACHE_MAX_ENTRIES = 64


class _TtlLruCache:
    """Process-local cache for identical Gemini grounding runs."""

    def __init__(self, *, max_entries: int, ttl_seconds: float) -> None:
        self._max_entries = max_entries
        self._ttl_seconds = ttl_seconds
        self._lock = Lock()
        self._items: OrderedDict[str, tuple[float, _GroundedRun]] = OrderedDict()

    def get(self, key: str) -> _GroundedRun | None:
        now = time()
        with self._lock:
            item = self._items.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at <= now:
                del self._items[key]
                return None
            self._items.move_to_end(key)
            return value

    def set(self, key: str, value: _GroundedRun) -> None:
        expires_at = time() + self._ttl_seconds
        with self._lock:
            self._items[key] = (expires_at, value)
            self._items.move_to_end(key)
            while len(self._items) > self._max_entries:
                self._items.popitem(last=False)


def _grounding_cache_key(claim_text: str, model_name: str) -> str:
    normalized = normalize_text(claim_text).lower()
    digest = sha256(f"{model_name}\n{normalized}".encode("utf-8")).hexdigest()
    return digest


RedirectResolver = Callable[[str, float], str]


def _default_redirect_resolver(url: str, timeout_seconds: float) -> str:
    import requests

    try:
        response = requests.head(url, allow_redirects=True, timeout=timeout_seconds)
        if response.status_code >= 400:
            response = requests.get(
                url,
                allow_redirects=True,
                timeout=timeout_seconds,
                stream=True,
            )
            response.close()
        return str(response.url or "").strip() or url
    except Exception:
        return url


def is_grounding_redirect(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host == GROUNDING_REDIRECT_HOST or host.endswith(
        f".{GROUNDING_REDIRECT_HOST}"
    )


def resolve_grounding_redirects(
    urls: Iterable[str],
    resolver: RedirectResolver,
    timeout_seconds: float,
) -> dict[str, str]:
    """Maps grounding redirect links to their final publisher URL.

    Unresolvable links are omitted so callers keep the original redirect rather
    than losing the citation entirely.
    """
    targets = sorted({url for url in urls if url and is_grounding_redirect(url)})
    if not targets:
        return {}

    resolved: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=min(8, len(targets))) as pool:
        pending = {pool.submit(resolver, url, timeout_seconds): url for url in targets}
        for future in as_completed(pending):
            original = pending[future]
            try:
                final = str(future.result() or "").strip()
            except Exception:
                continue
            if final and final != original and not is_grounding_redirect(final):
                resolved[original] = final
    return resolved


def _chunk_urls(metadata: dict[str, Any]) -> tuple[str, ...]:
    chunks = metadata.get("groundingChunks")
    if not isinstance(chunks, list):
        return ()
    urls: list[str] = []
    for chunk in chunks:
        if not isinstance(chunk, dict):
            continue
        web = chunk.get("web")
        if not isinstance(web, dict):
            continue
        url = str(web.get("uri") or "").strip()
        if url:
            urls.append(url)
    return tuple(urls)


def _default_transport(
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any],
    timeout_seconds: float,
) -> dict[str, Any]:
    import requests

    response = requests.post(
        url,
        headers=headers,
        json=payload,
        timeout=timeout_seconds,
    )
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, dict):
        raise ValueError("Gemini returned a non-object response.")
    return data


def _normalize_stance(value: Any) -> EvidenceStance:
    normalized = str(value or "").strip().upper()
    aliases = {
        "SUPPORTS": EvidenceStance.SUPPORTS,
        "SUPPORTED": EvidenceStance.SUPPORTS,
        "CONTRADICTS": EvidenceStance.CONTRADICTS,
        "CONTRADICTED": EvidenceStance.CONTRADICTS,
        "MENTIONS": EvidenceStance.MENTIONS,
        "IRRELEVANT": EvidenceStance.IRRELEVANT,
    }
    return aliases.get(normalized, EvidenceStance.UNKNOWN)


def _normalize_source_type(value: Any) -> SourceType:
    normalized = str(value or "").strip().upper()
    aliases = {
        "OFFICIAL": SourceType.OFFICIAL,
        "OFFICIAL_DOCUMENT": SourceType.OFFICIAL_DOCUMENT,
        "GOVERNMENT": SourceType.GOVERNMENT,
        "INTERNATIONAL_ORGANIZATION": SourceType.INTERNATIONAL_ORGANIZATION,
        "PRIMARY_SOURCE": SourceType.PRIMARY_SOURCE,
        "WIRE_SERVICE": SourceType.WIRE_SERVICE,
        "ESTABLISHED_NEWS": SourceType.ESTABLISHED_NEWS,
        "REPUTABLE_NEWS": SourceType.REPUTABLE_NEWS,
        "FACT_CHECK": SourceType.FACT_CHECK,
        "FACT_CHECKER": SourceType.FACT_CHECKER,
        "ACADEMIC": SourceType.ACADEMIC,
        "SOCIAL_MEDIA": SourceType.SOCIAL_MEDIA,
        "SOCIAL_PLATFORM": SourceType.SOCIAL_PLATFORM,
        "USER_GENERATED": SourceType.USER_GENERATED,
        "BLOG": SourceType.BLOG,
        "VIDEO_PLATFORM": SourceType.VIDEO_PLATFORM,
        "WIKI": SourceType.WIKI,
    }
    return aliases.get(normalized, SourceType.UNKNOWN)


def _publisher_from_url(url: str) -> str:
    hostname = (urlparse(url).hostname or "").lower()
    return hostname.removeprefix("www.")


def _publisher_from_grounding(title: str, url: str) -> str:
    normalized_title = title.strip().lower().removeprefix("www.")
    if _looks_like_domain(normalized_title):
        return normalized_title
    return _publisher_from_url(url)


def _looks_like_domain(value: str) -> bool:
    if "/" in value or " " in value:
        return False
    return bool(
        re.fullmatch(
            r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9-]{2,})+",
            value,
        )
    )


def _response_text(candidate: dict[str, Any]) -> str:
    content = candidate.get("content")
    if not isinstance(content, dict):
        return ""
    parts = content.get("parts")
    if not isinstance(parts, list):
        return ""
    return "\n".join(
        str(part.get("text") or "")
        for part in parts
        if isinstance(part, dict) and part.get("text")
    ).strip()


def _source_assessments(parsed: dict[str, Any]) -> dict[int, dict[str, Any]]:
    raw_sources = parsed.get("sources")
    if not isinstance(raw_sources, list):
        return {}

    assessments: dict[int, dict[str, Any]] = {}
    for source in raw_sources:
        if not isinstance(source, dict):
            continue
        try:
            index = int(source.get("source_index"))
        except (TypeError, ValueError):
            continue
        if index > 0:
            assessments[index - 1] = source
    return assessments


def _grounding_passages(
    metadata: dict[str, Any],
) -> dict[int, tuple[RelevantPassage, ...]]:
    passages: dict[int, list[RelevantPassage]] = {}
    supports = metadata.get("groundingSupports")
    if not isinstance(supports, list):
        return {}

    for support in supports:
        if not isinstance(support, dict):
            continue
        segment = support.get("segment")
        text = (
            str(segment.get("text") or "").strip() if isinstance(segment, dict) else ""
        )
        indices = support.get("groundingChunkIndices")
        if not text or not isinstance(indices, list):
            continue
        for raw_index in indices:
            try:
                index = int(raw_index)
            except (TypeError, ValueError):
                continue
            passages.setdefault(index, []).append(
                RelevantPassage(text=text, relevance_score=1.0)
            )

    return {index: tuple(items) for index, items in passages.items()}


def _grounded_items(
    metadata: dict[str, Any],
    parsed: dict[str, Any],
    resolved_urls: dict[str, str] | None = None,
) -> tuple[EvidenceItem, ...]:
    chunks = metadata.get("groundingChunks")
    if not isinstance(chunks, list):
        return ()

    resolved_urls = resolved_urls or {}

    assessments = _source_assessments(parsed)
    passages = _grounding_passages(metadata)
    items: list[EvidenceItem] = []

    for index, chunk in enumerate(chunks):
        if not isinstance(chunk, dict):
            continue
        web = chunk.get("web")
        if not isinstance(web, dict):
            continue
        redirect_url = str(web.get("uri") or "").strip()
        if not redirect_url:
            continue
        url = resolved_urls.get(redirect_url, redirect_url)

        assessment = assessments.get(index, {})
        stance = _normalize_stance(assessment.get("stance"))
        reliability = normalize_quality(assessment.get("reliability"))
        direct = bool(assessment.get("direct", False))
        source_passages = passages.get(index, ())
        qualifies = (
            stance in {EvidenceStance.SUPPORTS, EvidenceStance.CONTRADICTS}
            and reliability in {EvidenceQuality.HIGH, EvidenceQuality.MEDIUM}
            and direct
            and bool(source_passages)
        )
        title = str(web.get("title") or url).strip()
        publisher = _publisher_from_grounding(title, url)
        related_claim_ids = assessment.get("related_claim_ids")

        items.append(
            EvidenceItem(
                source_id=f"source-{index + 1}",
                url=url,
                title=title,
                publisher=publisher,
                related_claim_ids=(
                    tuple(str(value) for value in related_claim_ids)
                    if isinstance(related_claim_ids, list)
                    else ()
                ),
                source_type=_normalize_source_type(assessment.get("source_type")),
                stance=stance,
                reliability=reliability,
                reliability_reason=str(
                    assessment.get("reliability_reason") or ""
                ).strip(),
                independence_key=publisher or url,
                fetched=True,
                fetch_attempted=True,
                direct=direct,
                mentions_only=stance == EvidenceStance.MENTIONS,
                matches_claim=stance
                in {
                    EvidenceStance.SUPPORTS,
                    EvidenceStance.CONTRADICTS,
                    EvidenceStance.MENTIONS,
                },
                search_provider="gemini_google_search",
                page_text="\n".join(passage.text for passage in source_passages),
                relevant_passages=source_passages,
                relevance_score=1.0 if source_passages else 0.0,
                qualification_status="QUALIFIED" if qualifies else "NOT_QUALIFIED",
                rejection_reasons=(
                    ()
                    if qualifies
                    else (
                        "Gemini grounding did not provide direct, reliable citation support.",
                    )
                ),
                used_in_explanation=bool(source_passages),
            )
        )

    return tuple(items)


def _search_context(
    claim_text: str,
    metadata: dict[str, Any],
    items: tuple[EvidenceItem, ...],
    duration_ms: float,
) -> SearchContext:
    raw_queries = metadata.get("webSearchQueries")
    queries = (
        tuple(str(query).strip() for query in raw_queries if str(query).strip())
        if isinstance(raw_queries, list)
        else ()
    )
    records = tuple(
        SearchQueryRecord(
            query_id=f"gemini-query-{index}",
            claim_id="claim-1",
            query=query,
            query_type="gemini_grounded_search",
            provider="gemini_google_search",
            result_count=len(items),
            duration_ms=duration_ms,
        )
        for index, query in enumerate(queries, start=1)
    )
    results = tuple(
        SearchResult(
            title=item.title,
            snippet=item.relevant_passages[0].text if item.relevant_passages else "",
            url=item.url,
        )
        for item in items
    )
    return SearchContext(
        query=queries[0] if queries else claim_text,
        results=results,
        raw_context="\n".join(
            f"[{item.source_id}] {item.title}\n{item.url}" for item in items
        ),
        queries=records,
        reviewed_sources=items,
    )


def _prompt(claim_text: str) -> str:
    return f"""
Fact-check the claim or article below using Google Search.

Claim/article:
\"\"\"{claim_text}\"\"\"

Search the live public web before deciding. Prefer official statements, primary
sources, wire services, established news organizations, and recognized
fact-checkers. Check dates carefully. Do not use writing style as evidence.
If evidence is missing, weak, stale, or conflicting, return UNKNOWN rather than
guessing. Every factual conclusion must be supported by the Google Search
citations attached to your response.

Return JSON only:
{{
  "verdict": "REAL | FAKE | UNKNOWN",
  "confidence": "HIGH | MEDIUM | LOW",
  "evidence_quality": "HIGH | MEDIUM | LOW",
  "explanation": "concise conclusion based only on searched evidence",
  "evidence_summary": ["evidence point"],
  "sources": [
    {{
      "source_index": 1,
      "stance": "SUPPORTS | CONTRADICTS | MENTIONS | IRRELEVANT",
      "reliability": "HIGH | MEDIUM | LOW",
      "source_type": "OFFICIAL | GOVERNMENT | PRIMARY_SOURCE | WIRE_SERVICE | ESTABLISHED_NEWS | REPUTABLE_NEWS | FACT_CHECK | ACADEMIC | SOCIAL_MEDIA | BLOG | UNKNOWN",
      "direct": true,
      "reliability_reason": "short reason",
      "related_claim_ids": ["claim-1"]
    }}
  ],
  "claims": [
    {{
      "claim_id": "claim-1",
      "verdict": "SUPPORTED | LIKELY_SUPPORTED | CONTRADICTED | LIKELY_CONTRADICTED | MIXED | INSUFFICIENT_EVIDENCE | NOT_VERIFIABLE",
      "confidence": "HIGH | MEDIUM | LOW",
      "supporting_source_ids": ["source-1"],
      "contradicting_source_ids": [],
      "explanation": "claim-level explanation",
      "unresolved_reason": null
    }}
  ],
  "limitations": ["short limitation"],
  "recommendation": "next step"
}}

The source_index is the one-based order of the Google Search grounding sources
attached by the API. Do not invent URLs or sources in the JSON.
""".strip()


@dataclass(frozen=True)
class _GroundedRun:
    context: SearchContext
    evidence: EvidenceAnalysis


class GeminiGroundedSearchEvidenceProvider:
    """One-call Gemini verifier that also fulfills the workflow search port."""

    def __init__(
        self,
        api_key: str | None,
        model_name: str = "gemini-2.5-flash",
        timeout_seconds: float = 30.0,
        transport: JsonTransport = _default_transport,
        redirect_resolver: RedirectResolver = _default_redirect_resolver,
        redirect_timeout_seconds: float = 8.0,
    ) -> None:
        self.api_key = api_key
        self.model_name = model_name
        self.timeout_seconds = timeout_seconds
        self.transport = transport
        self.redirect_resolver = redirect_resolver
        self.redirect_timeout_seconds = redirect_timeout_seconds
        self._cached_claim: str | None = None
        self._cached_run: _GroundedRun | None = None
        self._run_cache = _TtlLruCache(
            max_entries=GEMINI_RUN_CACHE_MAX_ENTRIES,
            ttl_seconds=GEMINI_RUN_CACHE_TTL_SECONDS,
        )

    def search(self, claim_text: str, max_results: int) -> SearchContext:
        del max_results  # Gemini controls the number of grounded search results.
        run = self._run(claim_text)
        self._cached_claim = claim_text
        self._cached_run = run
        return run.context

    def verify(
        self,
        claim_text: str,
        search_context: SearchContext,
    ) -> EvidenceAnalysis:
        if self._cached_claim == claim_text and self._cached_run is not None:
            return self._cached_run.evidence
        return self._run(claim_text).evidence

    def _run(self, claim_text: str) -> _GroundedRun:
        cache_key = _grounding_cache_key(claim_text, self.model_name)
        cached = self._run_cache.get(cache_key)
        if cached is not None:
            return cached

        if not self.api_key:
            context = SearchContext(
                query=claim_text,
                error="GEMINI_API_KEY_MISSING",
                raw_context="Gemini Google Search grounding did not run.",
            )
            evidence = EvidenceAnalysis(
                provider_name="gemini_google_search",
                verdict=FinalVerdict.ERROR,
                evidence_quality=EvidenceQuality.LOW,
                confidence=EvidenceQuality.LOW,
                explanation="Gemini Google Search grounding is unavailable.",
                recommendation=(
                    "Fill GEMINI_API_KEY in .env (or set GOOGLE_API_KEY) and run "
                    "with --deep-check again."
                ),
                grounding_used=False,
                error="GEMINI_API_KEY_MISSING",
            )
            return _GroundedRun(context=context, evidence=evidence)

        url = GEMINI_GENERATE_CONTENT_URL.format(
            model=quote(self.model_name, safe="-._")
        )
        payload = {
            "contents": [{"role": "user", "parts": [{"text": _prompt(claim_text)}]}],
            "tools": [{"google_search": {}}],
            "generationConfig": {"temperature": 0.0},
        }
        started = perf_counter()

        try:
            response = self.transport(
                url,
                {
                    "Content-Type": "application/json",
                    "x-goog-api-key": self.api_key,
                },
                payload,
                self.timeout_seconds,
            )
            duration_ms = (perf_counter() - started) * 1000
            candidates = response.get("candidates")
            if not isinstance(candidates, list) or not candidates:
                raise ValueError("Gemini returned no candidate.")
            candidate = candidates[0]
            if not isinstance(candidate, dict):
                raise ValueError("Gemini returned an invalid candidate.")

            output = _response_text(candidate)
            parsed = parse_ai_json(output)
            metadata = candidate.get("groundingMetadata")
            metadata = metadata if isinstance(metadata, dict) else {}
            resolved_urls = resolve_grounding_redirects(
                _chunk_urls(metadata),
                self.redirect_resolver,
                self.redirect_timeout_seconds,
            )
            items = _grounded_items(metadata, parsed, resolved_urls)
            context = _search_context(claim_text, metadata, items, duration_ms)
            grounding_used = bool(items) and bool(metadata.get("groundingSupports"))

            verdict = normalize_verdict(parsed.get("verdict"))
            quality = normalize_quality(parsed.get("evidence_quality"))
            confidence = normalize_quality(parsed.get("confidence"))
            limitations = parsed.get("limitations")
            limitations = limitations if isinstance(limitations, list) else []
            summary = parsed.get("evidence_summary")
            summary = summary if isinstance(summary, list) else []

            if not grounding_used:
                verdict = FinalVerdict.UNVERIFIED
                quality = EvidenceQuality.LOW
                confidence = EvidenceQuality.LOW
                limitations = [
                    *limitations,
                    "Gemini returned no usable Google Search grounding citations.",
                ]

            evidence = EvidenceAnalysis(
                provider_name="gemini_google_search",
                verdict=verdict,
                evidence_quality=quality,
                confidence=confidence,
                explanation=str(parsed.get("explanation") or "").strip()
                or "Gemini returned no explanation.",
                evidence_summary=tuple(
                    str(item).strip() for item in summary if str(item).strip()
                ),
                recommendation=str(parsed.get("recommendation") or "").strip()
                or "Manual review recommended.",
                items=items,
                claim_assessments=parse_claim_assessments(parsed.get("claims")),
                grounding_used=grounding_used,
                limitations=tuple(
                    str(item).strip() for item in limitations if str(item).strip()
                ),
                raw_context=output,
            )
            run = _GroundedRun(context=context, evidence=evidence)
            if not evidence.error:
                self._run_cache.set(cache_key, run)
            return run
        except Exception as exc:
            context = SearchContext(
                query=claim_text,
                error="GEMINI_GROUNDED_SEARCH_FAILED",
                raw_context="Gemini Google Search grounding failed.",
            )
            evidence = EvidenceAnalysis(
                provider_name="gemini_google_search",
                verdict=FinalVerdict.ERROR,
                evidence_quality=EvidenceQuality.LOW,
                confidence=EvidenceQuality.LOW,
                explanation="Gemini could not complete the grounded web review.",
                recommendation=(
                    "Check GEMINI_API_KEY, model access, quota, and internet access."
                ),
                grounding_used=False,
                error=f"GEMINI_GROUNDED_SEARCH_FAILED: {type(exc).__name__}",
            )
            return _GroundedRun(context=context, evidence=evidence)
