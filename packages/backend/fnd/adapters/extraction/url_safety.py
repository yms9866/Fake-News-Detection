"""SSRF-aware URL validation and safe page fetching."""

from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

from packages.backend.fnd.domain.errors import UnsafeUrlError

BLOCKED_HOSTS = {"localhost", "localhost.localdomain"}
ALLOWED_SCHEMES = {"http", "https"}


def _is_blocked_ip(address: str) -> bool:
    ip = ipaddress.ip_address(address)

    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


@dataclass(frozen=True)
class UrlSafetyPolicy:
    """Validate URLs before any network request is made."""

    def assert_safe_url(self, url: str) -> None:
        parsed = urlparse(url)

        if parsed.scheme.lower() not in ALLOWED_SCHEMES:
            raise UnsafeUrlError("Only http and https URLs are allowed.")

        hostname = parsed.hostname
        if not hostname:
            raise UnsafeUrlError("URL must include a hostname.")

        normalized_host = hostname.strip().lower().rstrip(".")
        if normalized_host in BLOCKED_HOSTS:
            raise UnsafeUrlError("Localhost URLs are not allowed.")

        try:
            if _is_blocked_ip(normalized_host):
                raise UnsafeUrlError(
                    "Private, local, metadata, and reserved IPs are not allowed."
                )
            return
        except ValueError:
            pass

        addresses = {
            str(result[4][0])
            for result in socket.getaddrinfo(
                normalized_host,
                parsed.port or (443 if parsed.scheme.lower() == "https" else 80),
                type=socket.SOCK_STREAM,
            )
        }

        if not addresses:
            raise UnsafeUrlError("Hostname did not resolve to an IP address.")

        for address in addresses:
            if _is_blocked_ip(address):
                raise UnsafeUrlError(
                    "URL resolves to a private, local, or reserved IP address."
                )


@dataclass
class FetchedPage:
    url: str
    final_url: str
    content_type: str
    text: str


class SafePageFetcher:
    def __init__(
        self,
        safety_policy: UrlSafetyPolicy | None = None,
        timeout_seconds: float = 20,
        max_bytes: int = 2_000_000,
        max_redirects: int = 5,
    ) -> None:
        self.safety_policy = safety_policy or UrlSafetyPolicy()
        self.timeout_seconds = timeout_seconds
        self.max_bytes = max_bytes
        self.max_redirects = max_redirects

    def fetch(self, url: str) -> FetchedPage:
        import requests

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
            )
        }

        current_url = url
        response = None

        for _ in range(self.max_redirects + 1):
            self.safety_policy.assert_safe_url(current_url)
            response = requests.get(
                current_url,
                headers=headers,
                timeout=self.timeout_seconds,
                allow_redirects=False,
                stream=True,
            )
            response.raise_for_status()

            if 300 <= response.status_code < 400:
                location = response.headers.get("Location")
                if not location:
                    raise UnsafeUrlError(
                        "Redirect response did not include a Location header."
                    )

                current_url = urljoin(current_url, location)
                continue

            break
        else:
            raise UnsafeUrlError("URL exceeded the configured redirect limit.")

        if response is None:
            raise UnsafeUrlError("URL fetch did not return a response.")

        content_type = response.headers.get("Content-Type", "")
        if "text/html" not in content_type and "text/plain" not in content_type:
            raise UnsafeUrlError(
                f"Unsupported URL content type: {content_type or 'unknown'}"
            )

        chunks: list[bytes] = []
        total = 0
        for chunk in response.iter_content(chunk_size=64_000):
            if not chunk:
                continue

            total += len(chunk)
            if total > self.max_bytes:
                raise UnsafeUrlError("URL response exceeded the configured byte limit.")
            chunks.append(chunk)

        text = b"".join(chunks).decode(response.encoding or "utf-8", errors="replace")

        return FetchedPage(
            url=url,
            final_url=str(response.url),
            content_type=content_type,
            text=text,
        )
