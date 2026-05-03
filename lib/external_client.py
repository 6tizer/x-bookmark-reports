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
import urllib.parse
import urllib.request

from html.parser import HTMLParser

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


def html_to_text(html: str) -> str:
    """Convert HTML to plain text, stripping CSS/JS/script/style comments."""

    if not html:
        return ""

    # 1. Strip all <style>...</style> blocks first (including inline).
    #    This handles CSS that appears anywhere in the document tree.
    #    Must handle multi-line and nested cases by stripping outermost first.
    text = html
    for _ in range(3):  # repeat to handle nested style tags
        stripped, count = re.subn(
            r'<style[^>]*>.*?</style>',
            '',
            text,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if count == 0:
            break
        text = stripped

    # 2. Strip <script>...</script> blocks.
    for _ in range(3):
        stripped, count = re.subn(
            r'<script[^>]*>.*?</script>',
            '',
            text,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if count == 0:
            break
        text = stripped

    # 3. Strip HTML comments.
    text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)

    # 4. Parse structural HTML for block-level elements.
    class TextExtractor(HTMLParser):
        def __init__(self):
            super().__init__()
            self.text_parts: list[str] = []
            self.skip_tags = {'script', 'style', 'head', 'noscript', 'iframe', 'textarea', 'select'}
            self.skip_depth = 0
            self._inline_skip = False  # true when inside a skipped tag

        def handle_starttag(self, tag: str, attrs) -> None:
            if tag in self.skip_tags:
                self.skip_depth += 1
                self._inline_skip = True
            elif tag == 'br':
                self.text_parts.append('\n')
            elif tag == 'p':
                self.text_parts.append('\n\n')

        def handle_endtag(self, tag: str) -> None:
            if tag in self.skip_tags:
                self.skip_depth = max(0, self.skip_depth - 1)
                if self.skip_depth == 0:
                    self._inline_skip = False

        def handle_data(self, data: str) -> None:
            if not self._inline_skip:
                text = data.strip()
                if text:
                    self.text_parts.append(text + ' ')

        def get_text(self) -> str:
            return ''.join(self.text_parts)

    try:
        parser = TextExtractor()
        parser.feed(text)
        result = parser.get_text()
        result = re.sub(r' +', ' ', result)
        result = re.sub(r'\n{3,}', '\n\n', result)
        return result.strip()
    except Exception:
        # 5. Fallback regex path (still strip known CSS patterns first).
        fallback = re.sub(r'<style[^>]*>.*?</style>', '', text,
                          flags=re.IGNORECASE | re.DOTALL)
        fallback = re.sub(r'<script[^>]*>.*?</script>', '', fallback,
                          flags=re.IGNORECASE | re.DOTALL)
        fallback = re.sub(r'<br\s*/?>', '\n', fallback)
        fallback = re.sub(r'</p>', '\n\n', fallback)
        fallback = re.sub(r'<[^>]+>', '', fallback)
        fallback = re.sub(r'\n{3,}', '\n\n', fallback)
        return fallback.strip()


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


MAX_REDIRECTS = 10
# Cap HTML/binary read size to avoid OOM on huge responses
MAX_RESPONSE_BYTES = 5 * 1024 * 1024


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

        Tries HEAD first (no body download). If the server rejects HEAD
        (403/405/501), retries once with GET for that attempt; urllib follows
        redirects and ``geturl()`` returns the final URL.

        Args:
            url: Short URL (e.g., https://t.co/xxx).

        Returns:
            Final URL after all redirects.
        """
        if not url.startswith("https://t.co") and not url.startswith("http://t.co"):
            return url

        def _open_follow(method: str) -> str:
            req = urllib.request.Request(url, method=method)
            req.add_header(
                "User-Agent",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
            opener = self._build_opener()
            with opener.open(req, timeout=self._timeout) as resp:
                return resp.geturl()

        last_err: Exception | None = None
        for attempt in range(self._max_retries):
            try:
                final_url = _open_follow("HEAD")
                if final_url and final_url != url:
                    logger.debug("Unshortened %s -> %s", url, final_url)
                    return final_url
                return url
            except urllib.error.HTTPError as e:
                last_err = e
                if e.code in (403, 405, 501):
                    try:
                        final_url = _open_follow("GET")
                        if final_url and final_url != url:
                            logger.debug("Unshortened (GET) %s -> %s", url, final_url)
                            return final_url
                        return url
                    except urllib.error.HTTPError as e2:
                        last_err = e2
                wait = (2**attempt) * self._backoff_factor
                code = (
                    last_err.code
                    if isinstance(last_err, urllib.error.HTTPError)
                    else 0
                )
                logger.warning(
                    "HTTP error %d unshortening %s, attempt %d, waiting %.1fs",
                    code,
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
                    "Request failed unshortening %s, attempt %d, waiting %.1fs: %s",
                    url, attempt + 1, wait, e,
                )
                if attempt < self._max_retries - 1:
                    time.sleep(wait)

        logger.warning(f"Failed to unshorten {url}, using as-is: {last_err}")
        return url

    def unshorten(self, url: str) -> str:
        """Unshorten a t.co shortlink to its final URL."""
        return self._unshorten(url)

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

        current_url = url
        redirect_hops = 0
        last_err: Exception | None = None

        while redirect_hops < MAX_REDIRECTS:
            for attempt in range(self._max_retries):
                try:
                    req = urllib.request.Request(current_url, headers=headers)
                    opener = self._build_opener()

                    with opener.open(req, timeout=self._timeout) as resp:
                        content_type = resp.headers.get(
                            "Content-Type", "application/octet-stream"
                        )
                        raw_content = resp.read(MAX_RESPONSE_BYTES)

                        content_type_lower = content_type.lower().split(";")[0].strip()

                        if not _is_html_content(content_type):
                            return {
                                "original_url": url,
                                "final_url": current_url,
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
                                raise ExternalParseError(
                                    f"Failed to decode content: {e}"
                                ) from e

                        title, description = _extract_title_and_description(html)

                        body_text = html_to_text(html)

                        return {
                            "original_url": url,
                            "final_url": current_url,
                            "content": body_text,
                            "content_type": content_type_lower,
                            "title": title,
                            "description": description,
                            "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        }

                except urllib.error.HTTPError as e:
                    if 300 <= e.code < 400:
                        location = e.headers.get("Location")
                        if location:
                            current_url = urllib.parse.urljoin(
                                current_url, location
                            )
                            redirect_hops += 1
                            break
                        raise ExternalURLError(
                            f"HTTP {e.code} redirect without Location header"
                        ) from e

                    last_err = e
                    if 400 <= e.code < 500 and e.code != 429:
                        raise ExternalURLError(
                            f"HTTP {e.code}: {e.reason}"
                        ) from e
                    wait = (2**attempt) * self._backoff_factor
                    logger.warning(
                        "HTTP error %d for %s, attempt %d, waiting %.1fs",
                        e.code,
                        current_url,
                        attempt + 1,
                        wait,
                    )
                    if attempt < self._max_retries - 1:
                        time.sleep(wait)
                    else:
                        raise ExternalURLError(
                            f"HTTP {e.code} after {self._max_retries} attempts"
                        ) from e

                except (urllib.error.URLError, TimeoutError) as e:
                    last_err = e
                    wait = (2**attempt) * self._backoff_factor
                    logger.warning(
                        "Request failed for %s, attempt %d, waiting %.1fs: %s",
                        current_url,
                        attempt + 1,
                        wait,
                        e,
                    )
                    if attempt < self._max_retries - 1:
                        time.sleep(wait)
                    else:
                        raise ExternalURLError(
                            f"Failed after {self._max_retries} attempts"
                        ) from e

        raise ExternalURLError(
            f"Too many redirects (> {MAX_REDIRECTS}) for {url}"
        ) from last_err

    def get_content(self, url: str, *, skip_cache: bool = False) -> dict:
        """
        Get external content for a URL.

        Handles t.co shortlinks by unshortening first. Caches results for 24 hours.

        Args:
            url: The original URL (may be a t.co shortlink).
            skip_cache: If True, bypass cache read/write for this request.

        Returns:
            Dict with keys:
                - original_url: The original URL provided
                - final_url: The resolved URL (after unshortening)
                - content: Extracted plain text from HTML (full; report may truncate)
                - content_type: MIME type (e.g., "text/html")
                - title: Page title (if HTML)
                - description: Meta description (if HTML)
                - fetched_at: ISO timestamp of fetch

        Raises:
            ExternalURLError: If fetch fails.
            ExternalParseError: If parsing fails.
        """
        if not skip_cache:
            cached = self._get_cached(url)
            if cached is not None:
                logger.info(f"External URL cache hit: {url}")
                return cached

        final_url = self._unshorten(url)
        data = self._fetch(final_url)

        if url != final_url:
            data["original_url"] = url

        if not skip_cache:
            self._set_cached(url, data)
        return data
