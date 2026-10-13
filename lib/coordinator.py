"""Bookmark Coordinator - orchestrates the entire workflow."""

from __future__ import annotations

import json
import logging
import os
import re
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from lib.article_client import ArticleClient, ArticleNotFound
from lib.config import PROJECT_ROOT, REPORT
from lib.external_client import ExternalClient, sanitize_url
from lib.github_client import GitHubClient
from lib.media_utils import extract_media_details
from lib.quoted_client import QuotedClient
from lib.replies_client import RepliesClient, build_reply_tree
from lib.report_builder import BookmarkReport, ReportOptions, SingleBookmarkReport

logger = logging.getLogger(__name__)

# Max errors retained in deep-batch resume state file (avoids unbounded growth)
_DEEP_STATE_MAX_ERRORS = 100

# Default bookmarks path: respect BOOKMARKS_PATH env var (set in .env or shell).
# Fallback order: env var → ../twitter_data/bookmarks.json → data/bookmarks.json
def _resolve_default_bookmarks_path() -> Path:
    env_val = os.getenv("BOOKMARKS_PATH", "").strip()
    if env_val:
        p = Path(env_val)
        return p if p.is_absolute() else (PROJECT_ROOT / p).resolve()
    # Try the canonical location used in this project
    candidate = (PROJECT_ROOT / ".." / "twitter_data" / "bookmarks.json").resolve()
    if candidate.exists():
        return candidate
    return PROJECT_ROOT / "data" / "bookmarks.json"


DEFAULT_BOOKMARKS_PATH = _resolve_default_bookmarks_path()

# Output directory
OUTPUT_DIR = PROJECT_ROOT / "output"


def _is_twitter_host(url: str) -> bool:
    """精确判断 URL 的 hostname 是否属于 Twitter/X（避免 'x.com/' 子串误匹配 dropbox.com / nginx.com）。"""
    if not url:
        return False
    try:
        host = (urlparse(url).hostname or "").lower().rstrip(".")
    except ValueError:
        return False
    return host in ("x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com", "t.co")


def _is_github_host(url: str) -> bool:
    """精确判断 URL 的 hostname 是否属于 github.com。"""
    if not url:
        return False
    try:
        host = (urlparse(url).hostname or "").lower().rstrip(".")
    except ValueError:
        return False
    return host in ("github.com", "www.github.com")


def classify_url(url: str) -> str:
    """
    Classify a URL into 'article', 'quoted', 'github', or 'external'.

    Args:
        url: The URL to classify.

    Returns:
        URL type: 'article', 'quoted', 'github', or 'external'.

    >>> classify_url('https://x.com/i/article/123')
    'article'
    >>> classify_url('https://x.com/user/status/456')
    'needs_api_check'
    >>> classify_url('https://github.com/facebook/react')
    'github'
    >>> classify_url('https://example.com/article')
    'external'
    """
    if not url:
        return "unknown"

    url_lower = url.lower()

    # GitHub（精确匹配域名）
    if _is_github_host(url_lower):
        return "github"

    # Twitter / X URLs（精确匹配域名，避免误伤 dropbox.com / box.com）
    if _is_twitter_host(url_lower):
        # Article URL pattern - handle both /i/article/ and /i/articles/
        if "/i/article" in url_lower:
            return "article"
        # Status URL pattern - needs API check to differentiate
        if "/status/" in url_lower or "/i/status/" in url_lower:
            return "needs_api_check"
        return "external"  # other x/twitter URLs (or unresolved t.co)

    # Everything else is external
    return "external"


def _is_self_or_media_twitter_url(url: str, bookmark_id: Optional[str]) -> bool:
    """判断解析后的 URL 是否为当前书签自身的推文/媒体链接（/photo/1、/video/1），
    若是则必须过滤掉，防止主循环将书签误判为「引用了自己」或白抓 x.com 页面（修复 B-TCO-UNSHORTEN-BROKEN）。
    """
    if not url or not _is_twitter_host(url):
        return False
    u_lower = url.lower()
    # 任何推文的附属图片/视频链接都已由 media 字段处理，不应作为独立外链或引用推文抓取
    if "/photo/" in u_lower or "/video/" in u_lower:
        return True
    if bookmark_id:
        tid = extract_tweet_id(url)
        if tid and str(tid) == str(bookmark_id):
            return True
    return False


def extract_tweet_id(url: str) -> Optional[str]:
    """
    Extract tweet ID from Twitter/X URL.

    Args:
        url: Twitter/X URL like https://x.com/user/status/123

    Returns:
        Tweet ID string or None if not found.

    >>> extract_tweet_id('https://x.com/user/status/123456')
    '123456'
    >>> extract_tweet_id('https://twitter.com/user/i/status/789')
    '789'
    >>> extract_tweet_id('https://example.com/article')
    >>> extract_tweet_id('https://x.com/i/article/abc')
    """
    if not url:
        return None
    match = re.search(r'/(?:status|i/status)/(\d+)', url, re.IGNORECASE)
    if match:
        return match.group(1)
    return None


def _enrich_article_dict_from_bookmark(article_dict: dict, bookmark: dict) -> None:
    """Merge bookmark tweet engagement/media into article dict for reporting."""
    article_dict["like_count"] = int(bookmark.get("likeCount") or 0)
    article_dict["retweet_count"] = int(bookmark.get("retweetCount") or 0)
    article_dict["reply_count"] = int(bookmark.get("replyCount") or 0)
    article_dict["view_count"] = int(bookmark.get("viewCount") or 0)
    article_dict["bookmark_count"] = int(bookmark.get("bookmarkCount") or 0)
    if bookmark.get("media") is not None:
        article_dict["media"] = bookmark.get("media") or []
    if bookmark.get("entities") is not None:
        article_dict["entities"] = bookmark.get("entities") or {}


def extract_article_id(url: str) -> Optional[str]:
    """
    Extract article ID from Twitter/X Article URL.

    Args:
        url: Article URL like http://x.com/i/article/2037364491521048576

    Returns:
        Article ID string or None if not found.

    >>> extract_article_id('http://x.com/i/article/2037364491521048576')
    '2037364491521048576'
    >>> extract_article_id('https://x.com/i/articles/abc123')
    'abc123'
    >>> extract_article_id('https://x.com/user/status/123')
    """
    if not url:
        return None
    # Handle both /i/article/ and /i/articles/ patterns
    # Match: /i/article[s]?/ followed by the ID (s? makes 's' optional)
    match = re.search(r'/i/articles?/([A-Za-z0-9_-]+)', url, re.IGNORECASE)
    if match:
        return match.group(1)
    return None


class BookmarkCoordinator:
    """
    Coordinates the entire bookmark processing workflow.

    Loads bookmarks, classifies URLs, fetches enriched data using
    appropriate clients, builds reports, and saves results.
    """

    def __init__(
        self,
        bookmarks_path: Optional[Path] = None,
        output_dir: Optional[Path] = None,
        skip_cache: bool = False,
        include_replies: bool = False,
        deep_report: bool = False,
    ) -> None:
        """
        Initialize the coordinator.

        Args:
            bookmarks_path: Path to bookmarks JSON file.
                           Defaults to DEFAULT_BOOKMARKS_PATH.
            output_dir: Directory for output reports.
                       Defaults to OUTPUT_DIR.
            skip_cache: If True, skip reading from cache.
            include_replies: If True, fetch replies for each bookmark.
            deep_report: If True, enrich single-bookmark runs with nested replies,
                         all link details, and media metadata.
        """
        self.bookmarks_path = bookmarks_path or DEFAULT_BOOKMARKS_PATH
        self.output_dir = output_dir or OUTPUT_DIR
        self.skip_cache = skip_cache
        self.include_replies = include_replies
        self.deep_report = deep_report

        # Initialize clients
        self.article_client = ArticleClient()
        self.quoted_client = QuotedClient()
        self.github_client = GitHubClient()
        self.external_client = ExternalClient()
        self.replies_client = RepliesClient()

        # Ensure output directory exists
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Statistics
        self._stats: dict[str, int] = {
            "total": 0,
            "articles": 0,
            "quoted": 0,
            "github": 0,
            "external": 0,
            "errors": 0,
            "cache_hits": 0,
            "deep_processed": 0,
            "deep_skipped": 0,
            "deep_failed": 0,
        }
        self._errors: list[dict] = []

    def load_bookmarks(self) -> list[dict]:
        """
        Load bookmarks from the configured JSON file.

        Returns:
            List of bookmark dictionaries.

        Raises:
            FileNotFoundError: If bookmarks file doesn't exist.
            json.JSONDecodeError: If JSON is invalid.
        """
        logger.info(f"Loading bookmarks from {self.bookmarks_path}")

        if not self.bookmarks_path.exists():
            raise FileNotFoundError(f"Bookmarks file not found: {self.bookmarks_path}")

        with open(self.bookmarks_path, "r", encoding="utf-8") as f:
            bookmarks = json.load(f)

        if not isinstance(bookmarks, list):
            raise ValueError(f"Expected list of bookmarks, got {type(bookmarks)}")

        logger.info(f"Loaded {len(bookmarks)} bookmarks")
        return bookmarks

    def classify_bookmark(self, bookmark: dict) -> str:
        """
        Classify a bookmark based on its URLs.

        Checks both the main tweet URLs and quoted tweet URLs.

        Args:
            bookmark: Bookmark dictionary.

        Returns:
            URL type: 'article', 'quoted', 'github', 'external', or 'unknown'.
        """
        urls: list[str] = []

        # Collect URLs from entities
        entities = bookmark.get("entities", {})
        if isinstance(entities, dict):
            url_list = entities.get("urls", [])
            if isinstance(url_list, list):
                for url_entry in url_list:
                    url = self._extract_url_value(url_entry)
                    if url:
                        urls.append(url)

        # Collect URLs from quoted tweet
        quoted = bookmark.get("quoted")
        if isinstance(quoted, dict):
            quoted_entities = quoted.get("entities", {})
            if isinstance(quoted_entities, dict):
                quoted_urls = quoted_entities.get("urls", [])
                if isinstance(quoted_urls, list):
                    for url_entry in quoted_urls:
                        url = self._extract_url_value(url_entry)
                        if url:
                            urls.append(url)

        # Also check fullText for t.co links
        full_text = bookmark.get("fullText", "")
        if isinstance(full_text, str):
            tco_matches = re.findall(r'https://t\.co/[A-Za-z0-9]+', full_text)
            urls.extend(tco_matches)

        # Two-pass classification: high-priority types first, then fallback
        has_external = False
        for url in urls:
            url_type = classify_url(url)
            if url_type not in ("unknown", "external"):
                return url_type
            if url_type == "external":
                has_external = True

        if has_external:
            return "external"

        for url in urls:
            if url.startswith("https://t.co") or url.startswith("http://t.co"):
                return "external"

        return "quoted"

    def _extract_url_value(self, url_entry: str | dict | None) -> str | None:
        """
        Extract URL string from a URL entry.

        Twitter bookmark entities may contain URLs as either:
        - Plain strings
        - Dictionaries with 'expanded_url', 'url', or 'unwound_url' keys

        Args:
            url_entry: URL entry (string or dict).

        Returns:
            URL string or None if invalid.
        """
        if isinstance(url_entry, str):
            return url_entry if url_entry else None
        if isinstance(url_entry, dict):
            return url_entry.get("expanded_url") or url_entry.get("unwound_url") or url_entry.get("url")
        return None

    def _is_article(self, tweet_id: str) -> bool:
        """
        Check if a tweet is an Article via TwitterAPI.io.

        Args:
            tweet_id: The tweet ID to check.

        Returns:
            True if it's an article, False otherwise.
        """
        try:
            # Try fetching via Article API
            # If it returns valid data with article structure, it's an article
            article = self.article_client.get(
                tweet_id, skip_cache=self.skip_cache
            )
            return article is not None and bool(article.content_text)
        except (ArticleNotFound, Exception):
            return False

    def _extract_urls_from_bookmark(self, bookmark: dict) -> list[tuple[str, str]]:
        """
        Extract all URLs from a bookmark with their source.

        Returns:
            List of (url, source) tuples where source is
            'main' or 'quoted'.
        """
        urls: list[tuple[str, str]] = []

        # Main tweet URLs
        entities = bookmark.get("entities", {})
        if isinstance(entities, dict):
            url_list = entities.get("urls", [])
            if isinstance(url_list, list):
                for url in url_list:
                    if isinstance(url, dict):
                        # Handle dict format: {"expanded_url": "...", "url": "..."}
                        resolved_url = url.get("expanded_url") or url.get("url", "")
                        if isinstance(resolved_url, str) and resolved_url:
                            urls.append((resolved_url, "main"))
                    elif isinstance(url, str) and url:
                        urls.append((url, "main"))

        # Quoted tweet URLs
        quoted = bookmark.get("quoted")
        if isinstance(quoted, dict):
            quoted_entities = quoted.get("entities", {})
            if isinstance(quoted_entities, dict):
                quoted_urls = quoted_entities.get("urls", [])
                if isinstance(quoted_urls, list):
                    for url in quoted_urls:
                        if isinstance(url, dict):
                            # Handle dict format: {"expanded_url": "...", "url": "..."}
                            resolved_url = url.get("expanded_url") or url.get("url", "")
                            if isinstance(resolved_url, str) and resolved_url:
                                urls.append((resolved_url, "quoted"))
                        elif isinstance(url, str) and url:
                            urls.append((url, "quoted"))

        # Also check fullText for t.co links
        full_text = bookmark.get("fullText", "")
        if isinstance(full_text, str):
            tco_matches = re.findall(r'https://t\.co/[A-Za-z0-9]+', full_text)
            for tco_url in tco_matches:
                urls.append((tco_url, "fulltext"))

        return urls

    def _resolve_and_filter_urls(
        self,
        raw_urls: list[tuple[str, str]],
        bookmark_id: Optional[str] = None,
    ) -> list[tuple[str, str]]:
        """先清洗并解包 t.co 短链，过滤掉指向书签自身或媒体（/photo/、/video/）的链接，再交给下游按真实域名分流。"""
        resolved_list: list[tuple[str, str]] = []
        seen: set[str] = set()
        for raw_url, source in raw_urls:
            clean = sanitize_url(raw_url)
            if not clean:
                continue
            # 若是 t.co 短链，先解包成真实落地 URL 再做分类
            if clean.lower().startswith(("https://t.co/", "http://t.co/")):
                try:
                    clean = self.external_client.unshorten(clean) or clean
                except Exception as exc:
                    logger.debug("Unshorten failed for %s: %s", clean, exc)
            clean = sanitize_url(clean) or clean
            if _is_self_or_media_twitter_url(clean, bookmark_id):
                logger.debug("Skipping self/media Twitter URL %s (bookmark=%s)", clean, bookmark_id)
                continue
            dedup_key = f"{source}:{clean}"
            if dedup_key in seen:
                continue
            seen.add(dedup_key)
            resolved_list.append((clean, source))
        return resolved_list

    def _enrich_deep_links(self, bookmark: dict, result: dict) -> None:
        """Fetch GitHub meta + README excerpt and external previews for all URLs."""
        seen_gh: set[str] = set()
        seen_ext: set[str] = set()
        bookmark_id = str(bookmark.get("id") or "")

        # Build URL list: bookmark entities/fullText + article body
        url_sources: list[tuple[str, str]] = list(self._extract_urls_from_bookmark(bookmark))

        article_text = (result.get("article") or {}).get("content_text", "")
        if article_text:
            for m in re.finditer(r'https?://[^\s\]）),"\'<>]+', article_text):
                raw = sanitize_url(m.group(0))
                if raw:
                    url_sources.append((raw, "article_body"))

        # Reply thread: plain URLs in text + expanded URLs from url_map (t.co)
        rep_data = result.get("replies")
        if rep_data:
            for reply in (rep_data.get("replies") or []):
                for m in re.finditer(
                    r'https?://[^\s\]）),"\'<>]+',
                    reply.get("text") or "",
                ):
                    raw = sanitize_url(m.group(0))
                    if raw:
                        url_sources.append((raw, "reply"))
                for tco, expanded in (reply.get("url_map") or {}).items():
                    if expanded and expanded != tco:
                        clean_exp = sanitize_url(expanded)
                        if clean_exp:
                            url_sources.append((clean_exp, "reply"))

        # 关键修复（B-TCO-UNSHORTEN-BROKEN）：在 Pass 1（GitHub）和 Pass 2（External）之前，
        # 统一解包所有 t.co 短链并过滤自引用，确保指向 GitHub 的短链进入 Pass 1 抓 README，
        # 指向自身配图的短链被直接丢弃。
        url_sources = self._resolve_and_filter_urls(url_sources, bookmark_id)

        # Pass 1: process all GitHub URLs first so seen_gh is fully populated
        # before any external-URL filtering runs (avoids ordering-dependent misses).
        for url, source in url_sources:
            url = (url or "").strip()
            if not url:
                continue
            if classify_url(url) != "github":
                continue
            key = url.split("?")[0].rstrip("/").lower()
            if key in seen_gh:
                continue
            seen_gh.add(key)
            try:
                meta = self.github_client.get_repo_info(
                    url, skip_cache=self.skip_cache
                )
                readme_excerpt = ""
                try:
                    readme_excerpt = self.github_client.get_readme(
                        url, skip_cache=self.skip_cache
                    )
                except Exception as readme_err:
                    logger.debug("README for deep link %s: %s", url, readme_err)
                result["github_links_detail"].append({
                    "url": url,
                    "source": source,
                    "meta": meta,
                    "readme_excerpt": readme_excerpt or "",
                })
            except Exception as e:
                logger.warning("Deep GitHub fetch failed for %s: %s", url, e)
                result["github_links_detail"].append({
                    "url": url,
                    "source": source,
                    "meta": None,
                    "readme_excerpt": "",
                    "error": str(e),
                })

        # Pass 2: process external URLs; seen_gh is now complete so GitHub-dup
        # filtering works correctly regardless of source ordering.
        # 仅对主推文/引用推文/文章正文来源的前 5 条外链开启 CF Browser Run 渲染兜底，回复外链不调浏览器
        browser_eligible_count = 0
        for url, source in url_sources:
            url = (url or "").strip()
            if not url:
                continue
            ut = classify_url(url)
            if ut in ("article", "needs_api_check", "github"):
                continue

            if ut == "external":
                if _is_twitter_host(url):
                    continue
                key = url.split("?")[0].rstrip("/").lower()
                if key in seen_ext:
                    continue
                seen_ext.add(key)
                allow_cf = source in ("main", "quoted", "fulltext", "article_body") and browser_eligible_count < 5
                if allow_cf:
                    browser_eligible_count += 1
                try:
                    content = self.external_client.get_content(
                        url,
                        skip_cache=self.skip_cache,
                        allow_browser=allow_cf,
                    )
                    final = content.get("final_url", "")
                    title_url = content.get("title", "")
                    # Skip if the resolved URL is an X Article (already in article section)
                    final_is_article = (
                        classify_url(final) == "article"
                        or classify_url(title_url) == "article"
                    )
                    # Skip if the resolved URL is any Twitter/X page (video, status, profile…)
                    final_is_twitter = (
                        _is_twitter_host(final) or _is_twitter_host(title_url)
                    )
                    # Skip if the resolved URL is a GitHub repo already tracked.
                    _is_known_gh = lambda u: bool(
                        u
                        and classify_url(u) == "github"
                        and u.split("?")[0].rstrip("/").lower() in seen_gh
                    )
                    final_is_known_gh = _is_known_gh(final) or _is_known_gh(title_url)
                    if final_is_article or final_is_twitter or final_is_known_gh:
                        logger.debug(
                            "Skipping external link %s: final=%s "
                            "(article=%s twitter=%s known_gh=%s)",
                            url, final,
                            final_is_article, final_is_twitter, final_is_known_gh,
                        )
                        continue
                    result["external_links_detail"].append({
                        "url": url,
                        "source": source,
                        "content": content,
                    })
                except Exception as e:
                    logger.warning("Deep external fetch failed for %s: %s", url, e)
                    result["external_links_detail"].append({
                        "url": url,
                        "source": source,
                        "content": None,
                        "error": str(e),
                    })

    def _expand_reply_tco_batch(self, result: dict) -> None:
        """
        Batch-unshorten t.co links that were NOT resolved by entities.urls
        (e.g. because the API returned 429 and omitted the field).

        For each reply in the flat list (result["replies"]["replies"]) and in
        the reply_tree, we:
        1. Scan the reply text for remaining t.co links not in url_map.
        2. Call ExternalClient.unshorten() (HEAD redirect only; falls back on failure).
        3. Write the result back into the reply's url_map so that
           _render_reply_nodes() picks it up automatically.
        """
        rep_data = result.get("replies")
        if not rep_data:
            return
        flat_replies: list[dict] = rep_data.get("replies") or []
        if not flat_replies:
            return

        tco_pattern = re.compile(r'https?://t\.co/[A-Za-z0-9]+')

        # Collect all unique unexpanded t.co links across every reply
        all_tco: set[str] = set()
        for reply in flat_replies:
            text = reply.get("text") or ""
            url_map: dict[str, str] = reply.get("url_map") or {}
            for match in tco_pattern.findall(text):
                if match not in url_map:
                    all_tco.add(match)

        if not all_tco:
            return

        logger.info(
            "Batch-unshortening %d unique t.co links from replies", len(all_tco)
        )

        # Resolve each unique t.co link once
        resolved: dict[str, str] = {}
        for tco in all_tco:
            try:
                expanded = self.external_client.unshorten(tco)
                resolved[tco] = expanded
                logger.debug("Unshortened reply link %s -> %s", tco, expanded)
            except Exception as e:
                logger.warning("Could not unshorten reply link %s: %s", tco, e)
                resolved[tco] = tco  # Keep original on failure

        # Write resolved URLs back into every reply's url_map
        for reply in flat_replies:
            text = reply.get("text") or ""
            url_map = reply.setdefault("url_map", {})
            for match in tco_pattern.findall(text):
                if match not in url_map and match in resolved:
                    url_map[match] = resolved[match]

        # Rebuild reply_tree so it reflects the updated url_maps
        tweet_id = str(result.get("bookmark_id") or "")
        if tweet_id:
            result["reply_tree"] = build_reply_tree(flat_replies, tweet_id)

    def _apply_quality_checks(self, bookmark: dict, result: dict) -> None:
        """Populate result['quality_checks'] for the deep report."""
        qc: dict = {}
        # For X Article bookmarks fullText is just a t.co link; use article.content_text instead
        if result.get("type") == "article":
            qc["main_text"] = bool(
                (result.get("article") or {}).get("content_text", "")
            )
        else:
            qc["main_text"] = bool((bookmark.get("fullText") or "").strip())
        q = bookmark.get("quoted")
        has_q = isinstance(q, dict)
        qc["quoted_full"] = (not has_q) or bool((q.get("fullText") or "").strip())
        qc["quoted_media"] = (not has_q) or bool(q.get("media"))

        total = int(bookmark.get("replyCount") or 0)
        rep = result.get("replies")
        fetched = int(rep.get("count") or 0) if rep else 0
        qc["replies_pair"] = (fetched, total)
        qc["replies_ok"] = fetched > 0 or total == 0

        gh = result.get("github_links_detail") or []
        if not gh:
            qc["github_ok"] = True
        else:
            qc["github_ok"] = all(x.get("meta") for x in gh)

        ext = result.get("external_links_detail") or []
        if not ext:
            qc["external_ok"] = True
        else:
            qc["external_ok"] = all(x.get("content") for x in ext)

        result["quality_checks"] = qc

    def process_bookmark(self, bookmark: dict) -> dict:
        """
        Process a single bookmark and fetch enrichment data.

        Args:
            bookmark: Raw bookmark dictionary.

        Returns:
            Processed bookmark with enrichment data added.
        """
        bookmark_id = bookmark.get("id", "unknown")
        logger.debug(f"Processing bookmark {bookmark_id}")

        quoted_bm = bookmark.get("quoted")
        result: dict = {
            "bookmark_id": bookmark_id,
            "timestamp": bookmark.get("createdAt", ""),
            "type": "unknown",
            "url": "",
            "urls": [],
            "article": None,
            "quoted_tweet": None,
            "readme_content": None,
            "external_content": None,
            "replies": None,
            "error": None,
            "raw_bookmark": bookmark,
            "quoted_raw": quoted_bm if isinstance(quoted_bm, dict) else None,
            "github_links_detail": [],
            "external_links_detail": [],
            "media_details": extract_media_details(bookmark.get("media")),
            "quoted_media_details": extract_media_details(
                (quoted_bm or {}).get("media")
            )
            if isinstance(quoted_bm, dict)
            else {"images": [], "videos": [], "raw_count": 0},
            "reply_tree": None,
            "quality_checks": {},
        }

        # Extract URLs（先解包 t.co 短链并过滤指向书签自身/媒体图片的链接，再按真实域名分流）
        raw_urls = self._extract_urls_from_bookmark(bookmark)
        urls = self._resolve_and_filter_urls(
            raw_urls, str(bookmark_id) if bookmark_id else None
        )
        result["urls"] = [u[0] for u in urls]

        # Process each URL type
        for url, source in urls:
            url_type = classify_url(url)

            if url_type == "article":
                article_id = extract_article_id(url)
                if not article_id:
                    article_id = bookmark.get("id")
                if article_id:
                    result["url"] = url
                    result["type"] = "article"
                    try:
                        article = self.article_client.get(
                            article_id, skip_cache=self.skip_cache
                        )
                        result["article"] = article.to_dict()
                        _enrich_article_dict_from_bookmark(result["article"], bookmark)
                        self._stats["articles"] += 1
                        logger.info(f"Fetched article {article_id}")
                    except ArticleNotFound:
                        # Fallback: the article URL may be the canonical link but the
                        # actual article ID is the tweet ID of the bookmark itself.
                        fallback_id = bookmark.get("id")
                        if fallback_id and fallback_id != article_id:
                            logger.info(
                                f"Article not found for {article_id}, "
                                f"retrying with bookmark id {fallback_id}"
                            )
                            try:
                                article = self.article_client.get(
                                    str(fallback_id), skip_cache=self.skip_cache
                                )
                                result["article"] = article.to_dict()
                                _enrich_article_dict_from_bookmark(result["article"], bookmark)
                                self._stats["articles"] += 1
                                logger.info(f"Fetched article (fallback) {fallback_id}")
                            except Exception as e:
                                self._stats["errors"] += 1
                                result["error"] = str(e)
                                self._errors.append({
                                    "bookmark_id": fallback_id,
                                    "type": "article",
                                    "url": url,
                                    "error": str(e),
                                })
                                logger.error(
                                    f"Failed to fetch article (fallback) {fallback_id}: {e}"
                                )
                        else:
                            self._stats["errors"] += 1
                            result["error"] = f"Article not found: {article_id}"
                            self._errors.append({
                                "bookmark_id": bookmark_id,
                                "type": "article",
                                "url": url,
                                "error": f"Article not found: {article_id}",
                            })
                            logger.error(f"Article not found: {article_id}")
                    except Exception as e:
                        self._stats["errors"] += 1
                        result["error"] = str(e)
                        self._errors.append({
                            "bookmark_id": bookmark_id,
                            "type": "article",
                            "url": url,
                            "error": str(e),
                        })
                        logger.error(f"Failed to fetch article {article_id}: {e}")
                    # Only break after successful fetch or after fallback attempt
                    if result.get("article"):
                        break

            elif url_type == "needs_api_check":
                tweet_id = extract_tweet_id(url)
                if tweet_id:
                    result["url"] = url
                    # Try Article API first
                    try:
                        article = self.article_client.get(
                            tweet_id, skip_cache=self.skip_cache
                        )
                        if article and article.content_text:
                            result["type"] = "article"
                            result["article"] = article.to_dict()
                            _enrich_article_dict_from_bookmark(result["article"], bookmark)
                            self._stats["articles"] += 1
                            logger.info(f"Tweet {tweet_id} is an article")
                            break
                    except (ArticleNotFound, Exception):
                        pass

                    # Not an article, try as quoted tweet
                    try:
                        tweet = self.quoted_client.get(
                            tweet_id, skip_cache=self.skip_cache
                        )
                        result["type"] = "quoted"
                        result["quoted_tweet"] = tweet.to_dict()
                        self._stats["quoted"] += 1
                        logger.info(f"Fetched quoted tweet {tweet_id}")
                        break
                    except Exception as e:
                        self._stats["errors"] += 1
                        result["error"] = str(e)
                        self._errors.append({
                            "bookmark_id": bookmark_id,
                            "type": "quoted",
                            "url": url,
                            "error": str(e),
                        })
                        logger.error(f"Failed to fetch tweet {tweet_id}: {e}")

            elif url_type == "github":
                result["url"] = url
                result["type"] = "github"
                try:
                    readme = self.github_client.get_readme(
                        url, skip_cache=self.skip_cache
                    )
                    result["readme_content"] = readme
                    self._stats["github"] += 1
                    logger.info(f"Fetched GitHub README for {url}")
                    break
                except Exception as e:
                    self._stats["errors"] += 1
                    result["error"] = str(e)
                    self._errors.append({
                        "bookmark_id": bookmark_id,
                        "type": "github",
                        "url": url,
                        "error": str(e),
                    })
                    logger.error(f"Failed to fetch GitHub README: {e}")

            elif url_type == "external":
                if _is_twitter_host(url):
                    continue
                if not result["url"]:  # Only set if not already set
                    result["url"] = url
                    result["type"] = "external"
                try:
                    external = self.external_client.get_content(
                        url,
                        skip_cache=self.skip_cache,
                        allow_browser=True,
                    )
                    result["external_content"] = external
                    self._stats["external"] += 1
                    logger.info(f"Fetched external content for {url}")
                    break
                except Exception as e:
                    self._stats["errors"] += 1
                    result["error"] = str(e)
                    self._errors.append({
                        "bookmark_id": bookmark_id,
                        "type": "external",
                        "url": url,
                        "error": str(e),
                    })
                    logger.error(f"Failed to fetch external content: {e}")

        # Pure text tweet without any URLs - classify as quoted type
        if result["type"] == "unknown" and not urls:
            result["type"] = "quoted"
            tb = bookmark.get("tweetBy") or {}
            result["quoted_tweet"] = {
                "full_text": bookmark.get("fullText", ""),
                "author_name": tb.get("fullName") or tb.get("name") or "Unknown",
                "author_username": tb.get("userName") or tb.get("username") or "",
                "like_count": bookmark.get("likeCount", 0),
                "retweet_count": bookmark.get("retweetCount", 0),
                "reply_count": bookmark.get("replyCount", 0),
                "view_count": bookmark.get("viewCount", 0),
                "url": f"https://x.com/{tb.get('userName', 'i')}/status/{bookmark_id}" if bookmark_id else "",
            }
            self._stats["quoted"] += 1
            logger.info(f"Treating bookmark {bookmark_id} as quoted tweet (pure text)")

        # 获取回复（批量 include_replies 或单帖 deep_report）
        if self.include_replies or self.deep_report:
            tweet_id = bookmark.get("id")
            if tweet_id:
                try:
                    replies = self.replies_client.fetch_replies(str(tweet_id))
                    if replies:
                        result["replies"] = replies
                        logger.info(
                            "Fetched %s replies for tweet %s",
                            replies.get("count", 0),
                            tweet_id,
                        )
                        if self.deep_report:
                            result["reply_tree"] = build_reply_tree(
                                replies.get("replies") or [],
                                str(tweet_id),
                            )
                except Exception as e:
                    logger.error("Failed to fetch replies for %s: %s", tweet_id, e)
                    self._stats["errors"] += 1
                    self._errors.append({
                        "bookmark_id": str(tweet_id),
                        "type": "replies",
                        "error": str(e),
                    })

        if self.deep_report:
            self._expand_reply_tco_batch(result)
            self._enrich_deep_links(bookmark, result)
            self._apply_quality_checks(bookmark, result)

        return result

    def _reset_run_stats(self) -> None:
        """Clear per-run counters and error list."""
        self._stats = {
            "total": 0,
            "articles": 0,
            "quoted": 0,
            "github": 0,
            "external": 0,
            "errors": 0,
            "cache_hits": 0,
            "deep_processed": 0,
            "deep_skipped": 0,
            "deep_failed": 0,
        }
        self._errors.clear()

    def _save_deep_state_file(self, state: dict, path: Path) -> None:
        """Persist deep-batch resume state to disk (atomic replace)."""
        tmp_path: str | None = None
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp_f = tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=str(path.parent),
                suffix=".tmp",
                delete=False,
            )
            tmp_path = tmp_f.name
            try:
                with tmp_f:
                    json.dump(state, tmp_f, ensure_ascii=False, indent=2)
                os.replace(tmp_path, str(path))
            except BaseException:
                try:
                    if tmp_path:
                        os.unlink(tmp_path)
                except OSError:
                    pass
                raise
        except OSError as e:
            logger.error("Failed to save deep run state to %s: %s", path, e)

    def run_deep(
        self,
        limit: Optional[int] = None,
        batch_size: int = 5,
        resume_file: Optional[Path] = None,
        resume: bool = True,
    ) -> dict:
        """
        Process each bookmark as an individual deep Markdown report with resume support.

        Args:
            limit: Optional max bookmarks to consider from the file (in order).
            batch_size: Log a batch checkpoint every N successful reports (0 to disable).
            resume_file: Path to JSON state file (default: output/.deep-run-state.json).
            resume: If True, skip bookmark IDs listed in the state file.

        Returns:
            Dict with stats, errors, report_paths, elapsed_seconds, resume_file.
        """
        self._reset_run_stats()
        start_time = time.time()
        resume_path = resume_file or (self.output_dir / ".deep-run-state.json")

        state: dict = {
            "completed_ids": [],
            "errors": [],
            "last_run": "",
        }
        if resume and resume_path.exists():
            try:
                with open(resume_path, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                state["completed_ids"] = list(loaded.get("completed_ids") or [])
                state["errors"] = list(loaded.get("errors") or [])[
                    -_DEEP_STATE_MAX_ERRORS:
                ]
            except (json.JSONDecodeError, OSError) as e:
                logger.warning("Could not load deep run state from %s: %s", resume_path, e)

        completed: set[str] = {str(x) for x in state["completed_ids"]}

        try:
            bookmarks = self.load_bookmarks()
        except Exception as e:
            logger.error("Failed to load bookmarks: %s", e)
            return {
                "error": str(e),
                "bookmarks": [],
                "stats": self._stats,
                "report_paths": [],
            }

        if limit:
            bookmarks = bookmarks[:limit]

        n = len(bookmarks)
        log_interval = max(1, n // 20) if n else 1

        prev_deep = self.deep_report
        prev_replies = self.include_replies
        self.deep_report = True
        self.include_replies = True

        report_paths: list[Path] = []
        deep_success_session = 0

        try:
            for i, bookmark in enumerate(bookmarks, 1):
                bid = str(bookmark.get("id", "") or "")
                if bid and bid in completed:
                    self._stats["deep_skipped"] += 1
                    # 降为 debug 级别，避免每轮打印 2600+ 行刷爆 bookmark-auto.log（修复 B-LOG-DUPLICATE-NOISE）
                    logger.debug(
                        "Skipping already completed bookmark %s (%s/%s)",
                        bid, i, n,
                    )
                    continue

                self._stats["total"] += 1
                logger.info(
                    "Deep processing %s/%s: %s",
                    i, n, bid or bookmark.get("id", "unknown"),
                )

                started = datetime.now(timezone.utc)
                t0 = time.perf_counter()
                try:
                    result = self.process_bookmark(bookmark)
                    elapsed = time.perf_counter() - t0
                    report = self.build_deep_report(result, started, elapsed)
                    safe_id = "".join(
                        c for c in bid if c.isalnum() or c in "-_"
                    )[:64] or "unknown"
                    fname = (
                        f"bookmark-deep-{safe_id}-"
                        f"{started.strftime('%Y%m%d_%H%M%S')}.md"
                    )
                    path = self.save_report(report, format="markdown", filename=fname)
                    report_paths.append(path)
                    if bid:
                        completed.add(bid)
                    state["completed_ids"] = sorted(completed)
                    state["last_run"] = datetime.now(timezone.utc).isoformat()
                    self._stats["deep_processed"] += 1
                    deep_success_session += 1
                    self._save_deep_state_file(state, resume_path)
                    if batch_size > 0 and deep_success_session % batch_size == 0:
                        logger.info(
                            "Batch checkpoint: %s deep reports saved this session",
                            deep_success_session,
                        )
                except Exception as e:
                    logger.exception("Deep run failed for bookmark %s", bid)
                    self._stats["deep_failed"] += 1
                    self._stats["errors"] += 1
                    err_entry = {
                        "id": bid,
                        "error": str(e),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                    errs = state.setdefault("errors", [])
                    errs.append(err_entry)
                    state["errors"] = errs[-_DEEP_STATE_MAX_ERRORS:]
                    self._errors.append({
                        "bookmark_id": bid,
                        "type": "deep",
                        "error": str(e),
                    })
                    self._save_deep_state_file(state, resume_path)

                if i % log_interval == 0 or i == n:
                    elapsed = time.time() - start_time
                    rate = i / elapsed if elapsed > 0 else 0
                    logger.info(
                        "Progress: %s/%s (%.1f%%) — %.2f bookmarks/sec",
                        i, n, 100 * i / n if n else 0, rate,
                    )
        except KeyboardInterrupt:
            logger.warning("Interrupted by user, saving deep run state...")
            self._save_deep_state_file(state, resume_path)
            raise
        finally:
            self.deep_report = prev_deep
            self.include_replies = prev_replies

        elapsed = time.time() - start_time
        if self._stats.get("deep_skipped", 0) > 0:
            logger.info(
                "Skipped %d already completed bookmarks (total=%d)",
                self._stats["deep_skipped"],
                n,
            )
        # PR-3：无论本次是否有新增 deep report，都更新 last_run（B-SYNC-DEEP-TIMESTAMP-MISLEADING）
        state["last_run"] = datetime.now(timezone.utc).isoformat()
        self._save_deep_state_file(state, resume_path)
        logger.info("Deep batch complete in %.1fs", elapsed)
        logger.info("Stats: %s", self._stats)
        return {
            "stats": self._stats,
            "errors": self._errors,
            "elapsed_seconds": elapsed,
            "report_paths": report_paths,
            "resume_file": str(resume_path),
        }

    def run(self, limit: Optional[int] = None, full: bool = False) -> dict:
        """
        Run the entire bookmark processing workflow.

        Args:
            limit: Optional limit on number of bookmarks to process.
            full: If True, process all bookmarks regardless of cache.

        Returns:
            Dictionary with processed bookmarks and statistics.
        """
        self._reset_run_stats()
        prev_skip_cache = self.skip_cache
        if full:
            self.skip_cache = True

        start_time = time.time()
        logger.info("Starting bookmark processing")

        # Load bookmarks
        try:
            bookmarks = self.load_bookmarks()
        except Exception as e:
            logger.error(f"Failed to load bookmarks: {e}")
            self.skip_cache = prev_skip_cache
            return {"error": str(e), "bookmarks": [], "stats": self._stats}

        # Optionally limit bookmarks
        if limit:
            bookmarks = bookmarks[:limit]

        n = len(bookmarks)
        log_interval = max(1, n // 20) if n else 1

        # Process each bookmark
        processed: list[dict] = []
        try:
            for i, bookmark in enumerate(bookmarks, 1):
                self._stats["total"] += 1
                logger.info(
                    f"Processing bookmark {i}/{len(bookmarks)}: "
                    f"{bookmark.get('id', 'unknown')}"
                )

                try:
                    result = self.process_bookmark(bookmark)
                    processed.append(result)

                    # Progress indicator (~5% steps)
                    if i % log_interval == 0 or i == n:
                        elapsed = time.time() - start_time
                        rate = i / elapsed if elapsed > 0 else 0
                        pct = 100 * i / n if n else 0
                        logger.info(
                            f"Progress: {i}/{len(bookmarks)} "
                            f"({pct:.1f}%) - {rate:.1f} bookmarks/sec"
                        )

                except Exception as e:
                    self._stats["errors"] += 1
                    error_result = {
                        "bookmark_id": bookmark.get("id", "unknown"),
                        "timestamp": bookmark.get("createdAt", ""),
                        "type": "unknown",
                        "url": "",
                        "urls": [],
                        "article": None,
                        "quoted_tweet": None,
                        "readme_content": None,
                        "external_content": None,
                        "error": str(e),
                    }
                    processed.append(error_result)
                    self._errors.append({
                        "bookmark_id": bookmark.get("id", "unknown"),
                        "type": "unknown",
                        "error": str(e),
                    })
                    logger.error(
                        "Error processing bookmark %s: %s",
                        bookmark.get("id", "unknown"),
                        e,
                    )
        finally:
            self.skip_cache = prev_skip_cache

        elapsed = time.time() - start_time
        logger.info(f"Processing complete in {elapsed:.1f}s")
        logger.info(f"Stats: {self._stats}")

        return {
            "bookmarks": processed,
            "stats": self._stats,
            "errors": self._errors,
            "elapsed_seconds": elapsed,
        }

    def build_report(
        self,
        processed_bookmarks: list[dict],
        format: str = "markdown",
    ) -> str:
        """
        Build a report from processed bookmarks.

        Args:
            processed_bookmarks: List of processed bookmark dictionaries.
            format: Report format ('markdown' or 'html').

        Returns:
            Report string in the specified format.
        """
        report = BookmarkReport(processed_bookmarks)
        if format.lower() == "html":
            return report.build_html()
        return report.build_markdown()

    def build_deep_report(
        self,
        processed: dict,
        started_at: datetime,
        duration_seconds: float,
    ) -> str:
        """Build single-bookmark deep Markdown report."""
        return SingleBookmarkReport(
            processed,
            started_at,
            duration_seconds,
        ).build_markdown()

    def save_report(
        self,
        report: str,
        format: str = "markdown",
        filename: Optional[str] = None,
    ) -> Path:
        """
        Save a report to disk.

        Args:
            report: Report content string.
            format: Report format ('markdown' or 'html').
            filename: Optional full filename (e.g. ``bookmark-deep-{id}.md``).

        Returns:
            Path to the saved report file.

        Raises:
            IOError: If the report cannot be written to disk.
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        extension = "md" if format.lower() == "markdown" else "html"
        if filename:
            out_name = filename
        else:
            out_name = f"bookmark-report-{timestamp}.{extension}"
        output_path = self.output_dir / out_name

        try:
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(report)
        except OSError as e:
            logger.error(f"Failed to write report to {output_path}: {e}")
            raise IOError(f"Failed to save report: {e}") from e

        logger.info(f"Saved report to {output_path}")
        return output_path

    def save_processed_data(self, processed_bookmarks: list[dict]) -> Path:
        """
        Save processed bookmarks as JSON for later use.

        Args:
            processed_bookmarks: List of processed bookmark dictionaries.

        Returns:
            Path to the saved JSON file.
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"processed-bookmarks-{timestamp}.json"
        output_path = self.output_dir / filename

        data = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "bookmarks": processed_bookmarks,
            "stats": self._stats,
            "errors": self._errors,
        }

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        logger.info(f"Saved processed data to {output_path}")
        return output_path

    def get_stats(self) -> dict[str, int]:
        """Get processing statistics."""
        return self._stats.copy()

    def get_errors(self) -> list[dict]:
        """Get list of errors encountered during processing."""
        return self._errors.copy()


def main() -> None:
    """Main entry point for the coordinator."""
    import argparse

    parser = argparse.ArgumentParser(description="Process Twitter bookmarks")
    parser.add_argument(
        "--full",
        action="store_true",
        help="Process all bookmarks (skip cache)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of bookmarks to process",
    )
    parser.add_argument(
        "--format",
        choices=["markdown", "html"],
        default="markdown",
        help="Report format",
    )
    parser.add_argument(
        "--bookmarks",
        type=Path,
        default=None,
        help="Path to bookmarks JSON file",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output directory",
    )

    args = parser.parse_args()

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    # Create coordinator
    coordinator = BookmarkCoordinator(
        bookmarks_path=args.bookmarks,
        output_dir=args.output,
        skip_cache=args.full,
    )

    # Run processing
    result = coordinator.run(limit=args.limit, full=args.full)

    if "error" in result:
        print(f"Error: {result['error']}")
        return

    # Build and save report
    report = coordinator.build_report(result["bookmarks"], format=args.format)
    report_path = coordinator.save_report(report, format=args.format)

    # Save processed data
    data_path = coordinator.save_processed_data(result["bookmarks"])

    # Print summary
    stats = result["stats"]
    print("\n" + "=" * 50)
    print("PROCESSING COMPLETE")
    print("=" * 50)
    print(f"Total processed: {stats['total']}")
    print(f"  - Articles: {stats['articles']}")
    print(f"  - Quoted tweets: {stats['quoted']}")
    print(f"  - GitHub links: {stats['github']}")
    print(f"  - External links: {stats['external']}")
    print(f"  - Errors: {stats['errors']}")
    print(f"\nReport: {report_path}")
    print(f"Data: {data_path}")
    print(f"Time: {result['elapsed_seconds']:.1f}s")


if __name__ == "__main__":
    main()
