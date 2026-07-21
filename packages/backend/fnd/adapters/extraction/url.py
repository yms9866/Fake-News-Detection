"""URL and article extraction adapter."""

from __future__ import annotations

from packages.backend.fnd.adapters.extraction.text import DirectTextExtractor
from packages.backend.fnd.adapters.extraction.url_safety import SafePageFetcher
from packages.backend.fnd.domain.entities import ExtractedDocument, normalize_text
from packages.backend.fnd.domain.enums import InputType
from packages.backend.fnd.domain.errors import ExtractionError


class UrlArticleExtractor:
    def __init__(self, fetcher: SafePageFetcher | None = None) -> None:
        self.fetcher = fetcher or SafePageFetcher()
        self.text_extractor = DirectTextExtractor()

    def extract(self, url: str) -> ExtractedDocument:
        from bs4 import BeautifulSoup

        fetched = self.fetcher.fetch(url)

        soup = BeautifulSoup(fetched.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()

        paragraphs = [p.get_text(" ", strip=True) for p in soup.find_all("p")]
        extracted_text = normalize_text(" ".join(p for p in paragraphs if p))

        if not extracted_text:
            body_text = soup.get_text(" ", strip=True)
            extracted_text = normalize_text(body_text)

        if not extracted_text:
            raise ExtractionError("Failed to extract readable text from the provided URL.")

        return ExtractedDocument(
            input_type=InputType.URL,
            text=extracted_text,
            source=url,
            metadata={
                "url": url,
                "final_url": fetched.final_url,
                "content_type": fetched.content_type,
            },
        )
