"""Twitter Article client via TwitterAPI.io."""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
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
    TWITTER_API_BASE_URL,
    TWITTER_API_IO_KEY,
)

logger = logging.getLogger(__name__)


class ArticleNotFound(Exception):
    """Article does not exist or is unavailable."""


class ArticleAPIError(Exception):
    """API returned an error."""


class ArticleParseError(Exception):
    """Failed to parse article response."""


def _html_to_text(html: str) -> str:
    """Convert HTML string to plain text."""
    text = re.sub(r'<br\s*/?>', '\n', html)
    text = re.sub(r'</p>', '\n\n', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


@dataclass
class Article:
    id: str
    title: str
    content_text: str
    author_name: str
    author_username: str
    author_avatar: str
    url: str
    cover_image: Optional[str]
    cover_width: Optional[int]
    cover_height: Optional[int]
    lang: str
    published_at: str
    bookmarked_at: Optional[str]
    source: str

    def to_dict(self) -> dict:
        """Convert to dict for serialization."""
        return {
            "id": self.id,
            "title": self.title,
            "content_text": self.content_text,
            "author_name": self.author_name,
            "author_username": self.author_username,
            "author_avatar": self.author_avatar,
            "url": self.url,
            "cover_image": self.cover_image,
            "cover_width": self.cover_width,
            "cover_height": self.cover_height,
            "lang": self.lang,
            "published_at": self.published_at,
            "bookmarked_at": self.bookmarked_at,
            "source": self.source,
        }

    @classmethod
    def from_dict(cls, data: dict) -> Article:
        """Create Article from dict."""
        return cls(
            id=data["id"],
            title=data["title"],
            content_text=data["content_text"],
            author_name=data["author_name"],
            author_username=data["author_username"],
            author_avatar=data["author_avatar"],
            url=data["url"],
            cover_image=data.get("cover_image"),
            cover_width=data.get("cover_width"),
            cover_height=data.get("cover_height"),
            lang=data["lang"],
            published_at=data["published_at"],
            bookmarked_at=data.get("bookmarked_at"),
            source=data["source"],
        )


class ArticleClient:
    """Client for fetching Twitter articles from TwitterAPI.io."""

    def __init__(self):
        self.base_url = TWITTER_API_BASE_URL
        self.api_key = TWITTER_API_IO_KEY
        self.cache_dir = CACHE_DIR
        self.proxy = PROXY
        self.ttl = CACHE_TTL["article"]
        self._max_retries = REQUEST_MAX_RETRIES
        self._backoff_factor = REQUEST_BACKOFF_FACTOR
        self._timeout = REQUEST_TIMEOUT
        self._ensure_cache_dir()

    def _ensure_cache_dir(self) -> None:
        """Ensure cache directory exists."""
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _cache_path(self, article_id: str) -> Path:
        """Get cache file path for article."""
        return self.cache_dir / "articles" / f"{article_id}.json"

    def _get_cached(self, article_id: str) -> Optional[Article]:
        """Load article from cache if valid."""
        cache_path = self._cache_path(article_id)
        if not cache_path.exists():
            return None

        mtime = cache_path.stat().st_mtime
        if time.time() - mtime > self.ttl:
            logger.debug(f"Cache expired for article {article_id}")
            return None

        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return Article.from_dict(data)
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Failed to read cache for {article_id}: {e}")
            return None

    def _set_cached(self, article: Article) -> None:
        """Save article to cache."""
        cache_path = self._cache_path(article.id)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(article.to_dict(), f, ensure_ascii=False, indent=2)
        except OSError as e:
            logger.warning(f"Failed to write cache for {article.id}: {e}")

    def _fetch(self, article_id: str) -> Article:
        """Fetch article from TwitterAPI.io with retry."""
        url = f"{self.base_url}/twitter/article?tweet_id={article_id}"
        headers = {
            "X-API-Key": self.api_key,
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
        }
        last_err: Exception | None = None

        for attempt in range(self._max_retries):
            try:
                req = urllib.request.Request(url, headers=headers)
                if self.proxy:
                    proxy_handler = urllib.request.ProxyHandler({"http": self.proxy, "https": self.proxy})
                    opener = urllib.request.build_opener(proxy_handler)
                else:
                    opener = urllib.request.build_opener()
                with opener.open(req, timeout=self._timeout) as resp:
                    raw = resp.read().decode()
                    data = json.loads(raw)
                    # TwitterAPI.io returns {"status": "success"/"failed", "article": {...}} per OpenAPI spec.
                    # Check "failed" status first (covers article=null case too).
                    if data.get("status") == "failed":
                        msg = data.get("msg") or data.get("message", "unknown error")
                        if "not found" in msg.lower():
                            raise ArticleNotFound(f"Article not found: {article_id}")
                        raise ArticleAPIError(f"API error: {msg}")
                    # Success path: article object must be present and non-null.
                    if data.get("article"):
                        return self._parse_article(data["article"], article_id)
                    # Legacy compatibility: old APIs may still use "result".
                    if "result" in data:
                        return self._parse_article(data["result"], article_id)
                    raise ArticleAPIError(f"Unexpected response: {data}")
            except urllib.error.HTTPError as e:
                last_err = e
                if e.code == 429:
                    wait = (2**attempt) * self._backoff_factor
                    logger.warning(
                        "Rate limited (429), attempt %d, waiting %.1fs",
                        attempt + 1,
                        wait,
                    )
                elif 400 <= e.code < 500 and e.code != 429:
                    if e.code == 404:
                        raise ArticleNotFound(f"Article not found: {article_id}") from e
                    logger.error("HTTP %d: %s", e.code, e.reason)
                    raise ArticleAPIError(f"HTTP {e.code}: {e.reason}") from e
                else:
                    wait = (2**attempt) * self._backoff_factor
                    logger.warning(
                        "HTTP error %d, attempt %d, waiting %.1fs",
                        e.code,
                        attempt + 1,
                        wait,
                    )
                if attempt < self._max_retries - 1:
                    time.sleep(wait)
            except (urllib.error.URLError, TimeoutError) as e:
                last_err = e
                wait = (2**attempt) * self._backoff_factor
                logger.warning(
                    "Request failed, attempt %d, waiting %.1fs: %s",
                    attempt + 1,
                    wait,
                    e,
                )
                if attempt < self._max_retries - 1:
                    time.sleep(wait)
            except json.JSONDecodeError as e:
                last_err = e
                wait = (2**attempt) * self._backoff_factor
                logger.warning(
                    "JSON decode error, attempt %d, waiting %.1fs: %s",
                    attempt + 1,
                    wait,
                    e,
                )
                if attempt < self._max_retries - 1:
                    time.sleep(wait)

        raise RuntimeError(
            f"Failed after {self._max_retries} attempts"
        ) from last_err

    def _parse_article(self, data: dict, tweet_id: str) -> Article:
        """Parse article data from API response.

        Args:
            data: Article object from the API response.
            tweet_id: Tweet ID used for the API call (fallback for missing id).
        """
        article_id = data.get("id") or tweet_id

        title = data.get("title", "")

        # Build plain text from contents array (OpenAPI spec).
        # Each block has a type (unstyled/header-one/markdown/image/gif/divider)
        # and may have text/url fields.
        contents = data.get("contents", [])
        content_parts: list[str] = []
        ordered_list_counter: int = 0
        for block in contents:
            if not isinstance(block, dict):
                continue
            block_type = block.get("type", "")
            # Reset ordered list counter on non-list blocks
            if block_type != "ordered-list-item":
                ordered_list_counter = 0

            if block_type in ("unstyled", "paragraph"):
                text = block.get("text", "").strip()
                if text:
                    content_parts.append(text)
            elif block_type == "header-one":
                heading = block.get("text", "").strip()
                if heading:
                    content_parts.append(f"# {heading}")
            elif block_type == "header-two":
                heading = block.get("text", "").strip()
                if heading:
                    content_parts.append(f"## {heading}")
            elif block_type == "header-three":
                heading = block.get("text", "").strip()
                if heading:
                    content_parts.append(f"### {heading}")
            elif block_type == "header-four":
                heading = block.get("text", "").strip()
                if heading:
                    content_parts.append(f"#### {heading}")
            elif block_type == "header-five":
                heading = block.get("text", "").strip()
                if heading:
                    content_parts.append(f"##### {heading}")
            elif block_type == "header-six":
                heading = block.get("text", "").strip()
                if heading:
                    content_parts.append(f"###### {heading}")
            elif block_type in ("markdown",):
                text = block.get("text", "").strip()
                if text:
                    content_parts.append(text)
            elif block_type == "unordered-list-item":
                text = block.get("text", "").strip()
                if text:
                    depth = int(block.get("depth") or 0)
                    indent = "  " * depth
                    content_parts.append(f"{indent}- {text}")
            elif block_type == "ordered-list-item":
                text = block.get("text", "").strip()
                if text:
                    ordered_list_counter += 1
                    depth = int(block.get("depth") or 0)
                    indent = "  " * depth
                    content_parts.append(f"{indent}{ordered_list_counter}. {text}")
            elif block_type == "blockquote":
                text = block.get("text", "").strip()
                if text:
                    content_parts.append(f"> {text}")
            elif block_type == "code-block":
                text = block.get("text", "").strip()
                if text:
                    content_parts.append(f"```\n{text}\n```")
            elif block_type == "image":
                url = block.get("url", "")
                if url:
                    content_parts.append(f"[Image: {url}]")
            elif block_type == "gif":
                url = block.get("url", "")
                if url:
                    content_parts.append(f"[GIF: {url}]")
            elif block_type == "video":
                url = block.get("url", "")
                if url:
                    content_parts.append(f"[Video: {url}]")
            elif block_type == "divider":
                content_parts.append("---")
            else:
                # Unknown block type — capture any text to prevent silent data loss
                text = block.get("text", "").strip()
                if text:
                    logger.debug("Unknown article block type %r, capturing text", block_type)
                    content_parts.append(text)
                elif block.get("url"):
                    content_parts.append(f"[{block_type}: {block['url']}]")
        content_text = "\n\n".join(content_parts)
        if not content_text:
            # Fallback: legacy HTML content field (old API format)
            content_html = data.get("content", "")
            content_text = _html_to_text(content_html)

        # OpenAPI author fields: userName, name, profilePicture, id, url
        author_data = data.get("author", {})
        if isinstance(author_data, dict):
            author_username = author_data.get("userName", "unknown")
            author_name = author_data.get("name", author_data.get("displayName", "Unknown"))
            author_avatar = author_data.get("profilePicture", author_data.get("avatarUrl", ""))
        else:
            author_username = "unknown"
            author_name = "Unknown"
            author_avatar = ""

        url = data.get("url", "")

        source = data.get("source", "")
        if source:
            source = source.lower()
            if source not in ("twitter", "x"):
                source = "twitter"

        # OpenAPI: cover_media_img_url
        cover_image = data.get("cover_media_img_url") or data.get("coverImageUrl")
        # Width/height not in OpenAPI spec; preserve None per spec.
        cover_width: Optional[int] = None
        cover_height: Optional[int] = None

        lang = data.get("lang", "en")

        # OpenAPI: createdAt
        published_at = data.get("createdAt") or data.get("publishedAt") or data.get("bookmarkedAt")
        if not published_at:
            published_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        bookmarked_at = data.get("bookmarkedAt")

        return Article(
            id=article_id,
            title=title,
            content_text=content_text,
            author_name=author_name,
            author_username=author_username,
            author_avatar=author_avatar,
            url=url,
            cover_image=cover_image,
            cover_width=cover_width,
            cover_height=cover_height,
            lang=lang,
            published_at=published_at,
            bookmarked_at=bookmarked_at,
            source=source,
        )

    def get(self, url_or_id: str, *, skip_cache: bool = False) -> Article:
        """
        Get article from URL or article ID.

        Args:
            url_or_id: URL like https://x.com/i/articles/{id} or just the article ID.
            skip_cache: If True, bypass cache read/write for this request.

        Returns:
            Article object.

        Raises:
            ArticleNotFound: If article does not exist.
            ArticleAPIError: If API returns an error.
            ValueError: If article ID cannot be extracted.
        """
        article_id = self._extract_article_id(url_or_id)
        if not skip_cache:
            cached = self._get_cached(article_id)
            if cached is not None:
                logger.info(f"Article {article_id} cache hit")
                return cached
        article = self._fetch(article_id)
        if not skip_cache:
            self._set_cached(article)
        return article

    def _extract_article_id(self, url_or_id: str) -> str:
        """Extract article ID from URL or return as-is if already an ID."""
        m = re.search(r'/i/articles?/([^/?#]+)', url_or_id)
        if m:
            return m.group(1)
        # Assume it's a bare article ID (may contain letters, numbers, hyphens)
        if re.match(r'^[A-Za-z0-9_-]+$', url_or_id):
            return url_or_id
        raise ValueError(f"Cannot extract article ID from: {url_or_id}")