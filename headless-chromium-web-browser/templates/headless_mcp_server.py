#!/usr/bin/env python3
"""Headless Chromium MCP service for domain-locked, JS-free page retrieval.

This service is intentionally conservative:
- The requested hostname is the default trust boundary.
- Cross-origin requests and redirects are rejected.
- JavaScript is disabled before navigation and script resources are blocked.
- Returned HTML removes scripts, event handlers, javascript: URLs, iframes,
  forms, and CSS by default.
- A provenance manifest records final URL, response headers, content hashes,
  and every same-origin resource observed by Chromium.

This is evidence of transport/origin consistency, not proof that a website's
claims are factually true.
"""

from __future__ import annotations

import hashlib
import ipaddress
import json
import os
import re
import socket
from dataclasses import asdict, dataclass
from typing import Any
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from mcp.server.fastmcp import FastMCP
from playwright.async_api import Browser, Page, async_playwright

mcp = FastMCP("headless-chromium-web-browser")

MAX_BYTES = int(os.getenv("MAX_PAGE_BYTES", "5000000"))
SCRIPT_RE = re.compile(r"(?:javascript:|data:text/html)", re.IGNORECASE)


class BrowserPolicyError(ValueError):
    pass


@dataclass
class ResourceRecord:
    url: str
    type: str
    status: int | None
    content_type: str | None
    sha256: str | None
    bytes: int | None
    allowed: bool
    reason: str | None = None


@dataclass
class PageCapture:
    requested_url: str
    final_url: str
    hostname: str
    origin_verified: bool
    javascript_executed: bool
    html_sha256: str
    sanitized_html_sha256: str
    resources: list[ResourceRecord]
    warnings: list[str]


def _host(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise BrowserPolicyError("Only absolute http:// or https:// URLs are allowed")
    if parsed.username or parsed.password:
        raise BrowserPolicyError("URLs containing credentials are not allowed")
    try:
        port = parsed.port
    except ValueError as exc:
        raise BrowserPolicyError("Invalid URL port") from exc
    if port not in {None, 80, 443}:
        raise BrowserPolicyError("Only default HTTP/HTTPS ports are allowed")
    return parsed.hostname.lower().rstrip(".")


def _assert_public_host(hostname: str) -> None:
    """Reject loopback, private, link-local, reserved, and multicast targets."""
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(hostname, None)}
    except OSError as exc:
        raise BrowserPolicyError(f"Could not resolve requested host: {hostname}") from exc
    if not addresses:
        raise BrowserPolicyError("Requested host has no resolved address")
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if any((ip.is_private, ip.is_loopback, ip.is_link_local, ip.is_reserved, ip.is_multicast, ip.is_unspecified)):
            raise BrowserPolicyError("Private or reserved network destinations are not allowed")


def _same_host(candidate: str, requested_host: str, allow_subdomains: bool) -> bool:
    candidate_host = _host(candidate)
    return candidate_host == requested_host or (
        allow_subdomains and candidate_host.endswith("." + requested_host)
    )


def _hash_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sanitize_html(html: str, include_css: bool) -> str:
    soup = BeautifulSoup(html, "html.parser")

    for tag in soup.find_all(["script", "noscript", "iframe", "object", "embed", "form"]):
        tag.decompose()

    if not include_css:
        for tag in soup.find_all(["style"]):
            tag.decompose()
        for tag in soup.find_all("link"):
            rel = {str(v).lower() for v in (tag.get("rel") or [])}
            if "stylesheet" in rel:
                tag.decompose()

    for tag in soup.find_all(True):
        for attr in list(tag.attrs):
            attr_lower = attr.lower()
            value = tag.attrs[attr]
            if attr_lower.startswith("on") or attr_lower in {"srcdoc", "integrity"}:
                del tag.attrs[attr]
                continue
            if attr_lower in {"href", "src", "action", "formaction", "poster"}:
                if isinstance(value, str) and SCRIPT_RE.search(value):
                    del tag.attrs[attr]
        # Avoid misleading execution-oriented metadata in the returned artifact.
        if tag.name == "meta" and str(tag.get("http-equiv", "")).lower() == "refresh":
            tag.decompose()

    return str(soup)


async def _capture(
    url: str,
    allow_subdomains: bool,
    include_css: bool,
    max_bytes: int,
) -> tuple[str, PageCapture]:
    requested_host = _host(url)
    _assert_public_host(requested_host)
    resources: list[ResourceRecord] = []
    warnings: list[str] = []

    async with async_playwright() as pw:
        browser: Browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            java_script_enabled=False,
            service_workers="block",
            ignore_https_errors=False,
        )
        page: Page = await context.new_page()

        async def handle_route(route) -> None:
            request = route.request
            request_url = request.url
            try:
                allowed = _same_host(request_url, requested_host, allow_subdomains)
            except BrowserPolicyError:
                allowed = False
            resource_type = request.resource_type
            if resource_type == "script" or request_url.lower().startswith("javascript:"):
                resources.append(ResourceRecord(request_url, resource_type, None, None, None, None, False, "script_blocked"))
                await route.abort()
                return
            if not allowed:
                resources.append(ResourceRecord(request_url, resource_type, None, None, None, None, False, "cross_origin_blocked"))
                await route.abort()
                return
            await route.continue_()

        await page.route("**/*", handle_route)

        async def record_response(response) -> None:
            response_url = response.url
            try:
                allowed = _same_host(response_url, requested_host, allow_subdomains)
            except BrowserPolicyError:
                allowed = False
            body_hash = None
            body_size = None
            if allowed and response.request.resource_type not in {"document", "script"}:
                try:
                    body = await response.body()
                    if len(body) <= max_bytes:
                        body_hash = _hash_bytes(body)
                        body_size = len(body)
                except Exception as exc:
                    warnings.append(f"Could not hash resource {response_url}: {type(exc).__name__}")
            resources.append(ResourceRecord(
                response_url,
                response.request.resource_type,
                response.status,
                response.headers.get("content-type"),
                body_hash,
                body_size,
                allowed,
                None if allowed else "cross_origin_response",
            ))

        page.on("response", record_response)
        response = await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        if response is None:
            raise BrowserPolicyError("Navigation produced no response")
        final_url = page.url
        if not _same_host(final_url, requested_host, allow_subdomains):
            raise BrowserPolicyError("Redirect left the requested domain")
        original_html = await page.content()
        if len(original_html.encode("utf-8")) > max_bytes:
            raise BrowserPolicyError("Page exceeds MAX_PAGE_BYTES")
        sanitized = _sanitize_html(original_html, include_css)
        headers = await response.all_headers()
        await browser.close()

    capture = PageCapture(
        requested_url=url,
        final_url=final_url,
        hostname=requested_host,
        origin_verified=True,
        javascript_executed=False,
        html_sha256=_hash_bytes(original_html.encode("utf-8")),
        sanitized_html_sha256=_hash_bytes(sanitized.encode("utf-8")),
        resources=resources,
        warnings=warnings + [
            "Origin verification covers URL/redirect/resource policy and TLS transport; it does not prove the truth of the page's claims.",
            "JavaScript was disabled before navigation and script resources were blocked.",
            f"Main response content-type: {headers.get('content-type', 'unknown')}",
        ],
    )
    return sanitized, capture


@mcp.tool()
async def fetch_authenticated_page(
    url: str,
    allow_subdomains: bool = False,
    include_css: bool = False,
    max_bytes: int = MAX_BYTES,
) -> dict[str, Any]:
    """Fetch one page from its requested domain and return sanitized HTML plus provenance.

    The hostname in `url` is the trust boundary. By default, redirects and
    resources from other hosts are blocked. Set allow_subdomains only when
    first-party subdomains are explicitly part of the requested domain.
    CSS is removed by default; set include_css=true only when presentation is
    needed for interpretation.
    """
    if max_bytes < 1 or max_bytes > MAX_BYTES:
        raise ValueError(f"max_bytes must be between 1 and {MAX_BYTES}")
    sanitized, capture = await _capture(url, allow_subdomains, include_css, max_bytes)
    return {
        "html": sanitized,
        "provenance": asdict(capture),
        "resource_count": len(capture.resources),
    }


@mcp.tool()
async def verify_domain_consistency(url: str, allow_subdomains: bool = False) -> dict[str, Any]:
    """Return a provenance-only check without returning page HTML."""
    _, capture = await _capture(url, allow_subdomains, include_css=False, max_bytes=MAX_BYTES)
    blocked = [asdict(r) for r in capture.resources if not r.allowed]
    return {
        "requested_url": capture.requested_url,
        "final_url": capture.final_url,
        "origin_verified": capture.origin_verified,
        "javascript_executed": capture.javascript_executed,
        "blocked_resources": blocked,
        "html_sha256": capture.html_sha256,
        "resource_hashes": [asdict(r) for r in capture.resources if r.sha256],
        "warnings": capture.warnings,
    }


def main() -> None:
    transport = os.getenv("MCP_TRANSPORT", "stdio")
    if transport == "streamable-http":
        mcp.run(
            transport="streamable-http",
            host=os.getenv("MCP_HOST", "0.0.0.0"),
            port=int(os.getenv("MCP_PORT", "8000")),
        )
    else:
        mcp.run()


if __name__ == "__main__":
    main()
