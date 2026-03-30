"""External URL client for non-X/non-GitHub bookmarks."""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from pathlib import Path
from typing import Optional

import urllib.error
import urllib.request

from lib.config import (
    CACHE_DIR,
    CACHE_TTL,
    PROXY,
    REQUEST_BACKOFF_FACTOR,
    REQUEST_MAX_RETRIES,
    REQUEST_TIMEOUT,
)

logger = logging.getLogger(__name__)


class ExternalURLError(Exception):
    """Failed to fetch external URL (network or HTTP error)."""


class ExternalContentError(Exception):
    """External URL returned non-HTML or unexpected content."""


class ExternalParseError(Exception):
    """Failed to parse external content."""


def _html_to_text(html: str) -> str:
    """Convert HTML string to plain text."""
    text = re.sub(r'<br\s*/?>', '\n', html)
    text = re.sub(r'</p>', '\n\n', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _extract_title_and_description(html: str) -> tuple[str, str]:
    """
    Extract title and meta description from HTML.

    Args:
        html: Raw HTML content.

    Returns:
        Tuple of (title, description).
    """
    title = ""
    description = ""

    title_match = re.search(r'<title[^>]*>([^<]+)</title>', html, re.IGNORECASE)
    if title_match:
        title = title_match.group(1).strip()

    desc_match = re.search(
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']',
        html,
        re.IGNORECASE,
    )
    if desc_match:
        description = desc_match.group(1).strip()
    else:
        desc_match = re.search(
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']description["\']',
            html,
            re.IGNORECASE,
        )
        if desc_match:
            description = desc_match.group(1).strip()

    return title, description


def _is_html_content(content_type: str) -> bool:
    """Check if content type indicates HTML."""
    ct_lower = content_type.lower()
    return "text/html" in ct_lower or "application/xhtml" in ct_lower


class ExternalClient:
    """Client for fetching external (non-X/non-GitHub) URLs."""

    def __init__(self):
        self.cache_dir = CACHE_DIR
        self.ttl = CACHE_TTL["external"]
        self.proxy = PROXY
        self._max_retries = REQUEST_MAX_RETRIES
        self._backoff_factor = REQUEST_BACKOFF_FACTOR
        self._timeout = REQUEST_TIMEOUT
        self._ensure_cache_dir()

    def _ensure_cache_dir(self) -> None:
        """Ensure cache directory exists."""
        (self.cache_dir / "external").mkdir(parents=True, exist_ok=True)

    def _hash_url(self, url: str) -> str:
        """
        Generate MD5 hash of URL for cache filename.

        Args:
            url: The URL to hash.

        Returns:
            32-character hex string (MD5).
        """
        return hashlib.md5(url.encode("utf-8")).hexdigest()

    def _cache_path(self, url: str) -> Path:
        """Get cache file path for URL."""
        url_hash = self._hash_url(url)
        return self.cache_dir / "external" / f"{url_hash}.json"

    def _get_cached(self, url: str) -> Optional[dict]:
        """
        Load external content from cache if valid.

        Args:
            url: The original URL.

        Returns:
            Cached data dict or None if not cached/expired.
        """
        cache_path = self._cache_path(url)
        if not cache_path.exists():
            return None

        mtime = cache_path.stat().st_mtime
        if time.time() - mtime > self.ttl:
            logger.debug(f"Cache expired for external URL: {url}")
            return None

        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Failed to read cache for {url}: {e}")
            return None

    def _set_cached(self, url: str, data: dict) -> None:
        """
        Save external content to cache.

        Args:
            url: The original URL.
            data: Data dict to cache.
        """
        cache_path = self._cache_path(url)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except OSError as e:
            logger.warning(f"Failed to write cache for {url}: {e}")

    def _build_opener(self) -> urllib.request.Opener:
        """Build urllib opener with optional proxy."""
        if self.proxy:
            proxy_handler = urllib.request.ProxyHandler(
                {"http": self.proxy, "https": self.proxy}
            )
            return urllib.request.build_opener(proxy_handler)
        return urllib.request.build_opener()

    def _unshorten(self, url: str) -> str:
        """
        Unshorten t.co shortlink to final URL.

        Uses GET request with browser-like headers to follow redirects.
        urllib automatically follows redirects, and resp.geturl() returns
        the final URL after all redirects are resolved.

        Args:
            url: Short URL (e.g., https://t.co/xxx).

        Returns:
            Final URL after all redirects.
        """
        if not url.startswith("https://t.co") and not url.startswith("http://t.co"):
            return url

        last_err: Exception | None = None
        for attempt in range(self._max_retries):
            try:
                req = urllib.request.Request(url)
                req.add_header(
                    "User-Agent",
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
                opener = self._build_opener()
                with opener.open(req, timeout=self._timeout) as resp:
                    final_url = resp.geturl()
                    if final_url and final_url != url:
                        logger.debug(f"Unshortened {url} -> {final_url}")
                        return final_url
                    return url
            except urllib.error.HTTPError as e:
                last_err = e
                wait = (2**attempt) * self._backoff_factor
                logger.warning(
                    "HTTP error %d unshortening %s, attempt %d, waiting %.1fs",
                    e.code, url, attempt + 1, wait,
                )
                if attempt < self._max_retries - 1:
                    time.sleep(wait)
            except (urllib.error.URLError, TimeoutError) as e:
                last_err = e
                wait = (2**attempt) * self._backoff_factor
                logger.warning(
                    "Request failed unshortening %s, attempt %d, waiting %.1fs: %s",
                    url, attempt + 1, wait, e,
                )
                if attempt < self._max_retries - 1:
                    time.sleep(wait)

        logger.warning(f"Failed to unshorten {url}, using as-is: {last_err}")
        return url

    def _fetch(self, url: str) -> dict:
        """
        Fetch external URL and extract content.

        Args:
            url: The final URL to fetch.

        Returns:
            Dict with keys: original_url, final_url, content, content_type, title,
                           description, fetched_at.

        Raises:
            ExternalURLError: If fetch fails.
            ExternalContentError: If content type is not HTML.
            ExternalParseError: If parsing fails.
        """
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }

        last_err: Exception | None = None
        for attempt in range(self._max_retries):
            try:
                req = urllib.request.Request(url, headers=headers)
                opener = self._build_opener()

                with opener.open(req, timeout=self._timeout) as resp:
                    content_type = resp.headers.get("Content-Type", "application/octet-stream")
                    raw_content = resp.read()

                    content_type_lower = content_type.lower().split(";")[0].strip()

                    if not _is_html_content(content_type):
                        return {
                            "original_url": url,
                            "final_url": url,
                            "content": "",
                            "content_type": content_type_lower,
                            "title": "",
                            "description": "",
                            "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        }

                    try:
                        html = raw_content.decode("utf-8", errors="replace")
                    except UnicodeDecodeError:
                        try:
                            html = raw_content.decode("latin-1", errors="replace")
                        except Exception as e:
                            raise ExternalParseError(f"Failed to decode content: {e}") from e

                    title, description = _extract_title_and_description(html)

                    body_text = _html_to_text(html)
                    body_text = body_text[:500] if len(body_text) > 500 else body_text

                    return {
                        "original_url": url,
                        "final_url": url,
                        "content": body_text,
                        "content_type": content_type_lower,
                        "title": title,
                        "description": description,
                        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    }

            except urllib.error.HTTPError as e:
                last_err = e
                if 400 <= e.code < 500 and e.code != 429:
                    raise ExternalURLError(f"HTTP {e.code}: {e.reason}") from e
                wait = (2**attempt) * self._backoff_factor
                logger.warning(
                    "HTTP error %d for %s, attempt %d, waiting %.1fs",
                    e.code,
                    url,
                    attempt + 1,
                    wait,
                )
                if attempt < self._max_retries - 1:
                    time.sleep(wait)
            except (urllib.error.URLError, TimeoutError) as e:
                last_err = e
                wait = (2**attempt) * self._backoff_factor
                logger.warning(
                    "Request failed for %s, attempt %d, waiting %.1fs: %s",
                    url,
                    attempt + 1,
                    wait,
                    e,
                )
                if attempt < self._max_retries - 1:
                    time.sleep(wait)

        raise ExternalURLError(
            f"Failed after {self._max_retries} attempts: {last_err}"
        ) from last_err

    def get_content(self, url: str) -> dict:
        """
        Get external content for a URL.

        Handles t.co shortlinks by unshortening first. Caches results for 24 hours.

        Args:
            url: The original URL (may be a t.co shortlink).

        Returns:
            Dict with keys:
                - original_url: The original URL provided
                - final_url: The resolved URL (after unshortening)
                - content: Extracted text content (first 500 chars)
                - content_type: MIME type (e.g., "text/html")
                - title: Page title (if HTML)
                - description: Meta description (if HTML)
                - fetched_at: ISO timestamp of fetch

        Raises:
            ExternalURLError: If fetch fails.
            ExternalParseError: If parsing fails.
        """
        cached = self._get_cached(url)
        if cached is not None:
            logger.info(f"External URL cache hit: {url}")
            return cached

        final_url = self._unshorten(url)
        data = self._fetch(final_url)

        if url != final_url:
            data["original_url"] = url

        self._set_cached(url, data)
        return data
