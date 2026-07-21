from __future__ import annotations

import socket
import unittest
from unittest.mock import patch

from packages.backend.fnd.adapters.extraction.url_safety import UrlSafetyPolicy
from packages.backend.fnd.domain.errors import UnsafeUrlError


class SafeUrlPolicyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.policy = UrlSafetyPolicy()

    def assert_blocked(self, url: str) -> None:
        with self.assertRaises(UnsafeUrlError):
            self.policy.assert_safe_url(url)

    def test_blocks_non_http_schemes(self) -> None:
        self.assert_blocked("file:///C:/Windows/win.ini")
        self.assert_blocked("ftp://example.com/file")

    def test_blocks_localhost_names(self) -> None:
        self.assert_blocked("http://localhost:8000")
        self.assert_blocked("http://localhost.localdomain")

    def test_blocks_private_loopback_link_local_and_metadata_ips(self) -> None:
        for url in [
            "http://127.0.0.1:8000",
            "http://10.0.0.1",
            "http://172.16.0.5",
            "http://192.168.1.1",
            "http://169.254.169.254/latest/meta-data",
            "http://0.0.0.0",
            "http://[::1]/",
        ]:
            self.assert_blocked(url)

    def test_allows_public_ip_literal(self) -> None:
        self.policy.assert_safe_url("https://93.184.216.34/article")

    def test_blocks_domains_that_resolve_to_private_ips(self) -> None:
        fake_result = [
            (
                socket.AF_INET,
                socket.SOCK_STREAM,
                6,
                "",
                ("127.0.0.1", 80),
            )
        ]

        with patch("socket.getaddrinfo", return_value=fake_result):
            self.assert_blocked("https://example.test/article")

    def test_allows_domains_that_resolve_to_public_ips(self) -> None:
        fake_result = [
            (
                socket.AF_INET,
                socket.SOCK_STREAM,
                6,
                "",
                ("93.184.216.34", 443),
            )
        ]

        with patch("socket.getaddrinfo", return_value=fake_result):
            self.policy.assert_safe_url("https://example.test/article")


if __name__ == "__main__":
    unittest.main()
