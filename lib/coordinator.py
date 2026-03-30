"""Bookmark Coordinator - orchestrates the entire workflow."""

from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from lib.article_client import ArticleClient, ArticleNotFound
from lib.config import PROJECT_ROOT, REPORT
from lib.external_client import ExternalClient
from lib.github_client import GitHubClient
from lib.quoted_client import QuotedClient
from lib.report_builder import BookmarkReport, ReportOptions

logger = logging.getLogger(__name__)


# Default bookmarks path
DEFAULT_BOOKMARKS_PATH = Path(
    "/Users/tizer_mac_studio/work/Cursor/Twitter Bookmark/twitter_data/bookmarks.json"
)

# Output directory
OUTPUT_DIR = PROJECT_ROOT / "output"


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

    # GitHub
    if "github.com/" in url_lower:
        return "github"

    # Twitter / X URLs
    if "x.com/" in url_lower or "twitter.com/" in url_lower:
        # Article URL pattern - handle both /i/article/ and /i/articles/
        if "/i/article" in url_lower:
            return "article"
        # Status URL pattern - needs API check to differentiate
        if "/status/" in url_lower or "/i/status/" in url_lower:
            return "needs_api_check"
        return "external"  # other x/twitter URLs

    # Everything else is external
    return "external"


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
    ) -> None:
        """
        Initialize the coordinator.

        Args:
            bookmarks_path: Path to bookmarks JSON file.
                           Defaults to DEFAULT_BOOKMARKS_PATH.
            output_dir: Directory for output reports.
                       Defaults to OUTPUT_DIR.
            skip_cache: If True, skip reading from cache.
        """
        self.bookmarks_path = bookmarks_path or DEFAULT_BOOKMARKS_PATH
        self.output_dir = output_dir or OUTPUT_DIR
        self.skip_cache = skip_cache

        # Initialize clients
        self.article_client = ArticleClient()
        self.quoted_client = QuotedClient()
        self.github_client = GitHubClient()
        self.external_client = ExternalClient()

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

        # Classify based on first significant URL
        for url in urls:
            url_type = classify_url(url)
            if url_type not in ("unknown", "external"):
                return url_type
            if url_type == "external":
                return "external"  # Non-Twitter, non-GitHub external link

        # If all URLs are t.co, need to unshorten first
        for url in urls:
            if url.startswith("https://t.co") or url.startswith("http://t.co"):
                return "external"  # Will be unshortened by external_client

        return "unknown"

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
            article = self.article_client.get(tweet_id)
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

        return urls

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
            "error": None,
        }

        # Extract URLs
        urls = self._extract_urls_from_bookmark(bookmark)
        result["urls"] = [u[0] for u in urls]

        # Process each URL type
        for url, source in urls:
            url_type = classify_url(url)

            if url_type == "article":
                article_id = extract_article_id(url)
                if article_id:
                    result["url"] = url
                    result["type"] = "article"
                    try:
                        article = self.article_client.get(article_id)
                        result["article"] = article.to_dict()
                        self._stats["articles"] += 1
                        logger.info(f"Fetched article {article_id}")
                        break  # Only process first article
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

            elif url_type == "needs_api_check":
                tweet_id = extract_tweet_id(url)
                if tweet_id:
                    result["url"] = url
                    # Try Article API first
                    try:
                        article = self.article_client.get(tweet_id)
                        if article and article.content_text:
                            result["type"] = "article"
                            result["article"] = article.to_dict()
                            self._stats["articles"] += 1
                            logger.info(f"Tweet {tweet_id} is an article")
                            break
                    except (ArticleNotFound, Exception):
                        pass

                    # Not an article, try as quoted tweet
                    try:
                        tweet = self.quoted_client.get(tweet_id)
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
                    readme = self.github_client.get_readme(url)
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
                if not result["url"]:  # Only set if not already set
                    result["url"] = url
                    result["type"] = "external"
                try:
                    external = self.external_client.get_content(url)
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

        return result

    def run(self, limit: Optional[int] = None, full: bool = False) -> dict:
        """
        Run the entire bookmark processing workflow.

        Args:
            limit: Optional limit on number of bookmarks to process.
            full: If True, process all bookmarks regardless of cache.

        Returns:
            Dictionary with processed bookmarks and statistics.
        """
        start_time = time.time()
        logger.info("Starting bookmark processing")

        # Load bookmarks
        try:
            bookmarks = self.load_bookmarks()
        except Exception as e:
            logger.error(f"Failed to load bookmarks: {e}")
            return {"error": str(e), "bookmarks": [], "stats": self._stats}

        # Optionally limit bookmarks
        if limit:
            bookmarks = bookmarks[:limit]

        # Process each bookmark
        processed: list[dict] = []
        for i, bookmark in enumerate(bookmarks, 1):
            self._stats["total"] += 1
            logger.info(f"Processing bookmark {i}/{len(bookmarks)}: {bookmark.get('id', 'unknown')}")

            try:
                result = self.process_bookmark(bookmark)
                processed.append(result)

                # Progress indicator
                if i % 10 == 0:
                    elapsed = time.time() - start_time
                    rate = i / elapsed if elapsed > 0 else 0
                    logger.info(
                        f"Progress: {i}/{len(bookmarks)} "
                        f"({100*i/len(bookmarks):.1f}%) - {rate:.1f} bookmarks/sec"
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
                logger.error(f"Error processing bookmark {bookmark.get('id', 'unknown')}: {e}")

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

    def save_report(
        self,
        report: str,
        format: str = "markdown",
    ) -> Path:
        """
        Save a report to disk.

        Args:
            report: Report content string.
            format: Report format ('markdown' or 'html').

        Returns:
            Path to the saved report file.
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        extension = "md" if format.lower() == "markdown" else "html"
        filename = f"bookmark-report-{timestamp}.{extension}"
        output_path = self.output_dir / filename

        with open(output_path, "w", encoding="utf-8") as f:
            f.write(report)

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
