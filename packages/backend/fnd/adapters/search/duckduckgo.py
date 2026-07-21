"""DuckDuckGo search adapter."""

from __future__ import annotations

from datetime import date
import re

from packages.backend.fnd.domain.entities import (
    SearchContext,
    SearchResult,
    normalize_text,
)


def make_search_query(text: str, max_words: int = 32) -> str:
    text = normalize_text(text)
    text = re.sub(r"https?://\S+|www\.\S+", " ", text)
    words = text.split()
    base_query = " ".join(words[:max_words]).strip(" \"'")

    if not base_query:
        return "fact check official source"

    return f"{base_query} fact check official source {date.today().isoformat()}"


def format_web_context(results: tuple[SearchResult, ...], error: str | None = None) -> str:
    if error:
        return f"WEB_SEARCH_ERROR: {error}"

    if not results:
        return "NO_RESULTS: No relevant live web search results found for this claim."

    snippets: list[str] = []
    for index, result in enumerate(results, start=1):
        snippets.append(
            f"[Source {index}]\n"
            f"Title: {result.title or 'No title'}\n"
            f"Snippet: {result.snippet or 'No snippet'}\n"
            f"URL: {result.url or 'No URL'}\n"
        )

    return "\n---\n".join(snippets)


class DuckDuckGoSearchProvider:
    def search(self, claim_text: str, max_results: int) -> SearchContext:
        query = make_search_query(claim_text)

        try:
            try:
                from ddgs import DDGS
            except ImportError:
                from duckduckgo_search import DDGS

            collected: list[SearchResult] = []
            with DDGS() as ddgs:
                results = ddgs.text(query, max_results=max_results)
                for result in results:
                    collected.append(
                        SearchResult(
                            title=str(result.get("title", "No title")),
                            snippet=str(result.get("body", "No snippet")),
                            url=str(result.get("href", "No URL")),
                        )
                    )

            result_tuple = tuple(collected)
            return SearchContext(
                query=query,
                results=result_tuple,
                raw_context=format_web_context(result_tuple),
            )

        except Exception as exc:
            error = str(exc)
            return SearchContext(
                query=query,
                results=(),
                raw_context=format_web_context((), error=error),
                error=error,
            )
