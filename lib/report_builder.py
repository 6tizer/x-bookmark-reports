"""Build structured reports from collected bookmark data."""

from __future__ import annotations

import html
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ReportOptions:
    """Options for report generation."""

    include_content: bool = True
    max_content_chars: int = 300
    max_entries_per_section: Optional[int] = None
    sort_by_timestamp: bool = True
    date_format: str = "%Y-%m-%d %H:%M"


@dataclass
class BookmarkStats:
    """Statistics for a bookmark report."""

    total: int = 0
    articles: int = 0
    quoted_tweets: int = 0
    github_links: int = 0
    external_links: int = 0


class BookmarkReport:
    """
    Build a structured report from collected bookmark data.

    Takes raw data from all clients and produces a well-organized
    Markdown or HTML report summarizing the bookmarks, their metadata,
    and enriched content.
    """

    def __init__(
        self,
        bookmarks: list[dict],
        options: Optional[ReportOptions] = None,
    ) -> None:
        """
        Initialize the report builder.

        Args:
            bookmarks: List of bookmark data dicts.
            options: Optional report generation options.
        """
        self.bookmarks = bookmarks
        self.options = options or ReportOptions()
        self._stats: BookmarkStats | None = None

    def _parse_timestamp(self, timestamp: str) -> datetime:
        """
        Parse ISO timestamp string to datetime.

        Handles multiple formats:
        - ISO 8601: 2024-01-15T10:30:00Z
        - ISO 8601 with timezone: 2024-01-15T10:30:00+00:00
        - Twitter format: Sat Mar 28 02:04:44 +0000 2026

        Args:
            timestamp: Timestamp string.

        Returns:
            datetime object.
        """
        if not timestamp:
            return datetime.now()

        # Try ISO format first
        try:
            # Handle Z suffix
            ts = timestamp.replace("Z", "+00:00")
            return datetime.fromisoformat(ts)
        except ValueError:
            pass

        # Handle Twitter format: "Sat Mar 28 02:04:44 +0000 2026"
        try:
            return datetime.strptime(timestamp, "%a %b %d %H:%M:%S %z %Y")
        except ValueError:
            pass

        # Try with naive datetime
        try:
            return datetime.strptime(timestamp, "%a %b %d %H:%M:%S +0000 %Y")
        except ValueError:
            pass

        # Last resort: try generic parsing
        try:
            return datetime.fromisoformat(timestamp)
        except ValueError:
            logger.warning(f"Could not parse timestamp: {timestamp}")
            return datetime.now()

    def _format_timestamp(self, timestamp: str) -> str:
        """
        Format timestamp for display.

        Args:
            timestamp: ISO timestamp string.

        Returns:
            Formatted timestamp string.
        """
        dt = self._parse_timestamp(timestamp)
        return dt.strftime(self.options.date_format)

    def _calculate_stats(self) -> BookmarkStats:
        """
        Calculate summary statistics for bookmarks.

        Returns:
            BookmarkStats with counts by type.
        """
        stats = BookmarkStats()
        for bookmark in self.bookmarks:
            bookmark_type = bookmark.get("type", "unknown")
            stats.total += 1
            if bookmark_type == "article":
                stats.articles += 1
            elif bookmark_type == "quoted":
                stats.quoted_tweets += 1
            elif bookmark_type == "github":
                stats.github_links += 1
            elif bookmark_type == "external":
                stats.external_links += 1
        return stats

    def _extract_readme_summary(self, readme_content: str, max_chars: int = 300) -> str:
        """
        Extract first N characters of README as summary.

        Strips markdown headers and normalizes whitespace.

        Args:
            readme_content: Raw README content.
            max_chars: Maximum characters to include.

        Returns:
            Truncated summary string.
        """
        if not readme_content:
            return "(No content available)"

        # Strip common markdown headers
        content = re.sub(r"^#+\s*", "", readme_content, flags=re.MULTILINE)
        content = re.sub(r"^\*\s*", "", content, flags=re.MULTILINE)
        content = re.sub(r"^-+\s*", "", content, flags=re.MULTILINE)
        content = re.sub(r"^>\s*", "", content, flags=re.MULTILINE)
        content = re.sub(r"\*{2,}", "", content)  # Remove bold markers
        content = re.sub(r"\*{1}", "", content)  # Remove italic markers
        content = re.sub(r"`{1,3}", "", content)  # Remove code markers
        content = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", content)  # Links -> text

        # Normalize whitespace
        content = re.sub(r"\n{3,}", "\n\n", content)
        content = content.strip()

        if len(content) <= max_chars:
            return content

        # Truncate at word boundary
        truncated = content[:max_chars]
        last_space = truncated.rfind(" ")
        if last_space > max_chars * 0.8:
            truncated = truncated[:last_space]

        return truncated + "..."

    def _format_tags(self, tags: list[str] | None) -> str:
        """
        Format tags for display.

        Args:
            tags: List of tag strings.

        Returns:
            Formatted tags string.
        """
        if not tags:
            return "(No tags)"
        return ", ".join(f"`{tag}`" for tag in tags)

    def _format_engagement(
        self,
        like_count: int = 0,
        retweet_count: int = 0,
        reply_count: int = 0,
        view_count: int = 0,
        quote_count: int = 0,
    ) -> str:
        """
        Format engagement metrics.

        Args:
            like_count: Number of likes.
            retweet_count: Number of retweets.
            reply_count: Number of replies.
            view_count: Number of views.
            quote_count: Number of quotes.

        Returns:
            Formatted engagement string.
        """
        parts = []
        if like_count:
            parts.append(f"❤️ {like_count:,}")
        if retweet_count:
            parts.append(f"🔁 {retweet_count:,}")
        if reply_count:
            parts.append(f"💬 {reply_count:,}")
        if view_count:
            parts.append(f"👁 {view_count:,}")
        if quote_count:
            parts.append(f"📎 {quote_count:,}")

        return " | ".join(parts) if parts else ""

    def _format_article(self, article: dict) -> str:
        """
        Format a single article entry.

        Args:
            article: Article data dict.

        Returns:
            Formatted article string.
        """
        lines = []

        title = article.get("title", "(Untitled)")
        lines.append(f"### {title}")
        lines.append("")

        author_name = article.get("author_name", "Unknown")
        author_username = article.get("author_username", "")
        if author_username:
            lines.append(f"**Author**: {author_name} (@{author_username})")
        else:
            lines.append(f"**Author**: {author_name}")

        url = article.get("url", "")
        if url:
            lines.append(f"**URL**: {url}")

        content_text = article.get("content_text", "")
        if content_text and self.options.include_content:
            content_preview = content_text[:self.options.max_content_chars]
            lines.append("")
            lines.append(f"> {content_preview}")
            if len(content_text) > self.options.max_content_chars:
                lines.append("")
                lines.append("*... (truncated)*")

        lang = article.get("lang", "")
        if lang:
            lines.append(f"**Language**: {lang}")

        source = article.get("source", "")
        if source:
            lines.append(f"**Source**: {source}")

        return "\n".join(lines)

    def _format_quoted(self, tweet: dict) -> str:
        """
        Format a single quoted tweet entry.

        Args:
            tweet: Quoted tweet data dict.

        Returns:
            Formatted tweet string.
        """
        lines = []

        full_text = tweet.get("full_text", "(No content)")
        lines.append(f"### {full_text[:100]}{'...' if len(full_text) > 100 else ''}")
        lines.append("")

        author_name = tweet.get("author_name", "Unknown")
        author_username = tweet.get("author_username", "")
        if author_username:
            lines.append(f"**Author**: {author_name} (@{author_username})")
        else:
            lines.append(f"**Author**: {author_name}")

        url = tweet.get("url", "")
        if url:
            lines.append(f"**URL**: {url}")

        engagement = self._format_engagement(
            like_count=tweet.get("like_count", 0),
            retweet_count=tweet.get("retweet_count", 0),
            reply_count=tweet.get("reply_count", 0),
            view_count=tweet.get("view_count", 0),
            quote_count=tweet.get("quote_count", 0),
        )
        if engagement:
            lines.append(f"**Engagement**: {engagement}")

        return "\n".join(lines)

    def _format_github(self, url: str, readme_content: str) -> str:
        """
        Format a single GitHub entry.

        Args:
            url: GitHub repository URL.
            readme_content: README content.

        Returns:
            Formatted GitHub entry string.
        """
        lines = []

        # Extract owner/repo from URL
        match = re.search(r"github\.com/([^/]+)/([^/]+)", url, re.IGNORECASE)
        if match:
            owner, repo = match.groups()
            repo_name = f"{owner}/{repo}"
            lines.append(f"### {repo_name}")
        else:
            lines.append(f"### {url}")
            repo_name = url

        lines.append("")
        lines.append(f"**URL**: {url}")

        if readme_content:
            summary = self._extract_readme_summary(
                readme_content,
                self.options.max_content_chars,
            )
            lines.append("")
            lines.append(f"> {summary}")
        else:
            lines.append("")
            lines.append("*No README available*")

        return "\n".join(lines)

    def _format_external(self, external: dict) -> str:
        """
        Format a single external link entry.

        Args:
            external: External content data dict.

        Returns:
            Formatted external link string.
        """
        lines = []

        title = external.get("title", "(Untitled)")
        lines.append(f"### {title}")
        lines.append("")

        description = external.get("description", "")
        if description:
            lines.append(f"**Description**: {description}")

        final_url = external.get("final_url", "")
        if final_url:
            lines.append(f"**URL**: {final_url}")

        content = external.get("content", "")
        if content and self.options.include_content:
            content_preview = content[:self.options.max_content_chars]
            lines.append("")
            lines.append(f"> {content_preview}")
            if len(content) > self.options.max_content_chars:
                lines.append("")
                lines.append("*... (truncated)*")

        content_type = external.get("content_type", "")
        if content_type:
            lines.append(f"**Content Type**: {content_type}")

        return "\n".join(lines)

    def _group_bookmarks_by_type(self) -> dict[str, list[dict]]:
        """
        Group bookmarks by their type.

        Returns:
            Dict mapping type to list of bookmarks.
        """
        groups: dict[str, list[dict]] = {
            "article": [],
            "quoted": [],
            "github": [],
            "external": [],
        }

        for bookmark in self.bookmarks:
            bookmark_type = bookmark.get("type", "unknown")
            if bookmark_type in groups:
                groups[bookmark_type].append(bookmark)
            else:
                logger.warning(f"Unknown bookmark type: {bookmark_type}")

        # Sort each group by timestamp (newest first)
        if self.options.sort_by_timestamp:
            for bookmark_type in groups:
                groups[bookmark_type].sort(
                    key=lambda b: (
                        datetime(1970, 1, 1, tzinfo=timezone.utc)
                        if not b.get("timestamp", "")
                        else self._parse_timestamp(b.get("timestamp", ""))
                    ),
                    reverse=True,
                )

        return groups

    def build_markdown(self) -> str:
        """
        Generate a Markdown report from the bookmarks.

        Returns:
            Markdown-formatted report string.
        """
        lines = []
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Header
        lines.append("# Twitter Bookmark Report")
        lines.append(f"Generated: {timestamp}")
        lines.append("")

        # Summary
        stats = self._calculate_stats()
        self._stats = stats

        lines.append("## Summary")
        lines.append(f"- Total bookmarks: {stats.total}")
        lines.append(f"- Articles: {stats.articles}")
        lines.append(f"- Quoted tweets: {stats.quoted_tweets}")
        lines.append(f"- GitHub links: {stats.github_links}")
        lines.append(f"- External links: {stats.external_links}")
        lines.append("")

        # Group bookmarks by type
        groups = self._group_bookmarks_by_type()

        # Articles section
        if groups["article"]:
            lines.append("## Articles")
            lines.append("")
            max_entries = self.options.max_entries_per_section
            articles = groups["article"]
            if max_entries:
                articles = articles[:max_entries]
            for i, bookmark in enumerate(articles, 1):
                article = bookmark.get("article")
                if not article:
                    logger.warning(f"Missing article data for bookmark {i}")
                    continue
                lines.append(self._format_article(article))
                lines.append("")
                timestamp_str = self._format_timestamp(bookmark.get("timestamp", ""))
                lines.append(f"**Bookmarked**: {timestamp_str}")
                tags = bookmark.get("tags")
                lines.append(f"**Tags**: {self._format_tags(tags)}")
                note = bookmark.get("note", "")
                if note:
                    lines.append(f"**Note**: {note}")
                lines.append("")
                lines.append("---")
                lines.append("")

        # Quoted tweets section
        if groups["quoted"]:
            lines.append("## Quoted Tweets")
            lines.append("")
            max_entries = self.options.max_entries_per_section
            tweets = groups["quoted"]
            if max_entries:
                tweets = tweets[:max_entries]
            for i, bookmark in enumerate(tweets, 1):
                quoted_tweet = bookmark.get("quoted_tweet")
                if not quoted_tweet:
                    logger.warning(f"Missing quoted_tweet data for bookmark {i}")
                    continue
                lines.append(self._format_quoted(quoted_tweet))
                lines.append("")
                timestamp_str = self._format_timestamp(bookmark.get("timestamp", ""))
                lines.append(f"**Bookmarked**: {timestamp_str}")
                tags = bookmark.get("tags")
                lines.append(f"**Tags**: {self._format_tags(tags)}")
                note = bookmark.get("note", "")
                if note:
                    lines.append(f"**Note**: {note}")
                lines.append("")
                lines.append("---")
                lines.append("")

        # GitHub section
        if groups["github"]:
            lines.append("## GitHub Repositories")
            lines.append("")
            max_entries = self.options.max_entries_per_section
            github_bookmarks = groups["github"]
            if max_entries:
                github_bookmarks = github_bookmarks[:max_entries]
            for i, bookmark in enumerate(github_bookmarks, 1):
                url = bookmark.get("url", "")
                readme_content = bookmark.get("readme_content", "")
                if not url:
                    logger.warning(f"Missing URL for github bookmark {i}")
                    continue
                lines.append(self._format_github(url, readme_content))
                lines.append("")
                timestamp_str = self._format_timestamp(bookmark.get("timestamp", ""))
                lines.append(f"**Bookmarked**: {timestamp_str}")
                tags = bookmark.get("tags")
                lines.append(f"**Tags**: {self._format_tags(tags)}")
                note = bookmark.get("note", "")
                if note:
                    lines.append(f"**Note**: {note}")
                lines.append("")
                lines.append("---")
                lines.append("")

        # External links section
        if groups["external"]:
            lines.append("## External Links")
            lines.append("")
            max_entries = self.options.max_entries_per_section
            external_bookmarks = groups["external"]
            if max_entries:
                external_bookmarks = external_bookmarks[:max_entries]
            for i, bookmark in enumerate(external_bookmarks, 1):
                external_content = bookmark.get("external_content")
                if not external_content:
                    logger.warning(f"Missing external_content for bookmark {i}")
                    continue
                lines.append(self._format_external(external_content))
                lines.append("")
                timestamp_str = self._format_timestamp(bookmark.get("timestamp", ""))
                lines.append(f"**Bookmarked**: {timestamp_str}")
                tags = bookmark.get("tags")
                lines.append(f"**Tags**: {self._format_tags(tags)}")
                note = bookmark.get("note", "")
                if note:
                    lines.append(f"**Note**: {note}")
                lines.append("")
                lines.append("---")
                lines.append("")

        return "\n".join(lines)

    def build_html(self) -> str:
        """
        Generate an HTML report from the bookmarks.

        Returns:
            HTML-formatted report string.
        """
        # Group bookmarks by type
        groups = self._group_bookmarks_by_type()
        stats = self._calculate_stats()
        self._stats = stats
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        html_parts = [
            "<!DOCTYPE html>",
            "<html lang='en'>",
            "<head>",
            "<meta charset='UTF-8'>",
            "<meta name='viewport' content='width=device-width, initial-scale=1.0'>",
            "<title>Twitter Bookmark Report</title>",
            "<style>",
            "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; "
            "max-width: 900px; margin: 0 auto; padding: 20px; line-height: 1.6; }",
            "h1 { color: #1da1f2; border-bottom: 2px solid #1da1f2; padding-bottom: 10px; }",
            "h2 { color: #333; margin-top: 30px; }",
            "h3 { color: #555; margin-top: 20px; }",
            ".summary { background: #f5f8fa; padding: 15px; border-radius: 8px; margin: 20px 0; }",
            ".summary ul { list-style: none; padding: 0; }",
            ".summary li { padding: 5px 0; }",
            ".entry { background: #fff; border: 1px solid #e1e8ed; border-radius: 8px; "
            "padding: 15px; margin: 15px 0; }",
            ".entry-meta { color: #657786; font-size: 0.9em; margin-top: 10px; }",
            ".tags { margin: 5px 0; }",
            ".tag { display: inline-block; background: #e1e8ed; padding: 2px 8px; "
            "border-radius: 12px; font-size: 0.85em; margin-right: 5px; }",
            ".engagement { color: #657786; font-size: 0.9em; }",
            ".engagement span { margin-right: 15px; }",
            "blockquote { background: #f5f8fa; border-left: 4px solid #1da1f2; "
            "margin: 10px 0; padding: 10px 15px; }",
            ".note { background: #fff9c4; padding: 10px; border-radius: 4px; margin-top: 10px; }",
            "hr { border: none; border-top: 1px solid #e1e8ed; margin: 20px 0; }",
            "</style>",
            "</head>",
            "<body>",
            "<h1>Twitter Bookmark Report</h1>",
            f"<p>Generated: {timestamp}</p>",
            "",
            "<div class='summary'>",
            "<h2>Summary</h2>",
            "<ul>",
            f"<li>Total bookmarks: <strong>{stats.total}</strong></li>",
            f"<li>Articles: <strong>{stats.articles}</strong></li>",
            f"<li>Quoted tweets: <strong>{stats.quoted_tweets}</strong></li>",
            f"<li>GitHub links: <strong>{stats.github_links}</strong></li>",
            f"<li>External links: <strong>{stats.external_links}</strong></li>",
            "</ul>",
            "</div>",
        ]

        # Articles section
        if groups["article"]:
            html_parts.append("<h2>Articles</h2>")
            max_entries = self.options.max_entries_per_section
            articles = groups["article"]
            if max_entries:
                articles = articles[:max_entries]
            for bookmark in articles:
                article = bookmark.get("article")
                if not article:
                    continue
                html_parts.append("<div class='entry'>")
                title = article.get("title", "(Untitled)")
                html_parts.append(f"<h3>{html.escape(title)}</h3>")
                author_name = article.get("author_name", "Unknown")
                author_username = article.get("author_username", "")
                if author_username:
                    html_parts.append(f"<p><strong>Author:</strong> {html.escape(author_name)} (@{html.escape(author_username)})</p>")
                else:
                    html_parts.append(f"<p><strong>Author:</strong> {html.escape(author_name)}</p>")
                url = article.get("url", "")
                if url:
                    escaped_url = html.escape(url)
                    html_parts.append(f"<p><strong>URL:</strong> <a href='{escaped_url}'>{escaped_url}</a></p>")
                content_text = article.get("content_text", "")
                if content_text and self.options.include_content:
                    content_preview = content_text[:self.options.max_content_chars]
                    html_parts.append(f"<blockquote>{html.escape(content_preview)}</blockquote>")
                html_parts.append("<div class='entry-meta'>")
                timestamp_str = self._format_timestamp(bookmark.get("timestamp", ""))
                html_parts.append(f"<p><strong>Bookmarked:</strong> {timestamp_str}</p>")
                tags = bookmark.get("tags")
                if tags:
                    tags_html = " ".join(f"<span class='tag'>{html.escape(tag)}</span>" for tag in tags)
                    html_parts.append(f"<p class='tags'><strong>Tags:</strong> {tags_html}</p>")
                else:
                    html_parts.append("<p class='tags'><strong>Tags:</strong> (No tags)</p>")
                note = bookmark.get("note", "")
                if note:
                    html_parts.append(f"<div class='note'><strong>Note:</strong> {html.escape(note)}</div>")
                html_parts.append("</div></div>")

        # Quoted tweets section
        if groups["quoted"]:
            html_parts.append("<h2>Quoted Tweets</h2>")
            max_entries = self.options.max_entries_per_section
            tweets = groups["quoted"]
            if max_entries:
                tweets = tweets[:max_entries]
            for bookmark in tweets:
                quoted_tweet = bookmark.get("quoted_tweet")
                if not quoted_tweet:
                    continue
                html_parts.append("<div class='entry'>")
                full_text = quoted_tweet.get("full_text", "(No content)")
                escaped_full_text = html.escape(full_text[:100])
                html_parts.append(f"<h3>{escaped_full_text}{'...' if len(full_text) > 100 else ''}</h3>")
                author_name = quoted_tweet.get("author_name", "Unknown")
                author_username = quoted_tweet.get("author_username", "")
                if author_username:
                    html_parts.append(f"<p><strong>Author:</strong> {html.escape(author_name)} (@{html.escape(author_username)})</p>")
                else:
                    html_parts.append(f"<p><strong>Author:</strong> {html.escape(author_name)}</p>")
                url = quoted_tweet.get("url", "")
                if url:
                    escaped_url = html.escape(url)
                    html_parts.append(f"<p><strong>URL:</strong> <a href='{escaped_url}'>{escaped_url}</a></p>")
                engagement_parts = []
                like_count = quoted_tweet.get("like_count", 0)
                retweet_count = quoted_tweet.get("retweet_count", 0)
                reply_count = quoted_tweet.get("reply_count", 0)
                view_count = quoted_tweet.get("view_count", 0)
                if like_count:
                    engagement_parts.append(f"❤️ {like_count:,}")
                if retweet_count:
                    engagement_parts.append(f"🔁 {retweet_count:,}")
                if reply_count:
                    engagement_parts.append(f"💬 {reply_count:,}")
                if view_count:
                    engagement_parts.append(f"👁 {view_count:,}")
                if engagement_parts:
                    html_parts.append(f"<p class='engagement'><strong>Engagement:</strong> "
                                     f"{' | '.join(engagement_parts)}</p>")
                html_parts.append("<div class='entry-meta'>")
                timestamp_str = self._format_timestamp(bookmark.get("timestamp", ""))
                html_parts.append(f"<p><strong>Bookmarked:</strong> {timestamp_str}</p>")
                tags = bookmark.get("tags")
                if tags:
                    tags_html = " ".join(f"<span class='tag'>{html.escape(tag)}</span>" for tag in tags)
                    html_parts.append(f"<p class='tags'><strong>Tags:</strong> {tags_html}</p>")
                else:
                    html_parts.append("<p class='tags'><strong>Tags:</strong> (No tags)</p>")
                note = bookmark.get("note", "")
                if note:
                    html_parts.append(f"<div class='note'><strong>Note:</strong> {html.escape(note)}</div>")
                html_parts.append("</div></div>")

        # GitHub section
        if groups["github"]:
            html_parts.append("<h2>GitHub Repositories</h2>")
            max_entries = self.options.max_entries_per_section
            github_bookmarks = groups["github"]
            if max_entries:
                github_bookmarks = github_bookmarks[:max_entries]
            for bookmark in github_bookmarks:
                url = bookmark.get("url", "")
                readme_content = bookmark.get("readme_content", "")
                if not url:
                    continue
                match = re.search(r"github\.com/([^/]+)/([^/]+)", url, re.IGNORECASE)
                if match:
                    owner, repo = match.groups()
                    repo_name = f"{owner}/{repo}"
                    title = repo_name
                else:
                    title = url
                html_parts.append("<div class='entry'>")
                html_parts.append(f"<h3>{html.escape(title)}</h3>")
                escaped_url = html.escape(url)
                html_parts.append(f"<p><strong>URL:</strong> <a href='{escaped_url}'>{escaped_url}</a></p>")
                if readme_content:
                    summary = self._extract_readme_summary(readme_content, self.options.max_content_chars)
                    html_parts.append(f"<blockquote>{html.escape(summary)}</blockquote>")
                else:
                    html_parts.append("<p><em>No README available</em></p>")
                html_parts.append("<div class='entry-meta'>")
                timestamp_str = self._format_timestamp(bookmark.get("timestamp", ""))
                html_parts.append(f"<p><strong>Bookmarked:</strong> {timestamp_str}</p>")
                tags = bookmark.get("tags")
                if tags:
                    tags_html = " ".join(f"<span class='tag'>{html.escape(tag)}</span>" for tag in tags)
                    html_parts.append(f"<p class='tags'><strong>Tags:</strong> {tags_html}</p>")
                else:
                    html_parts.append("<p class='tags'><strong>Tags:</strong> (No tags)</p>")
                note = bookmark.get("note", "")
                if note:
                    html_parts.append(f"<div class='note'><strong>Note:</strong> {html.escape(note)}</div>")
                html_parts.append("</div></div>")

        # External links section
        if groups["external"]:
            html_parts.append("<h2>External Links</h2>")
            max_entries = self.options.max_entries_per_section
            external_bookmarks = groups["external"]
            if max_entries:
                external_bookmarks = external_bookmarks[:max_entries]
            for bookmark in external_bookmarks:
                external_content = bookmark.get("external_content")
                if not external_content:
                    continue
                html_parts.append("<div class='entry'>")
                title = external_content.get("title", "(Untitled)")
                html_parts.append(f"<h3>{html.escape(title)}</h3>")
                description = external_content.get("description", "")
                if description:
                    html_parts.append(f"<p><strong>Description:</strong> {html.escape(description)}</p>")
                final_url = external_content.get("final_url", "")
                if final_url:
                    escaped_final_url = html.escape(final_url)
                    html_parts.append(f"<p><strong>URL:</strong> <a href='{escaped_final_url}'>{escaped_final_url}</a></p>")
                content = external_content.get("content", "")
                if content and self.options.include_content:
                    content_preview = content[:self.options.max_content_chars]
                    html_parts.append(f"<blockquote>{html.escape(content_preview)}</blockquote>")
                html_parts.append("<div class='entry-meta'>")
                timestamp_str = self._format_timestamp(bookmark.get("timestamp", ""))
                html_parts.append(f"<p><strong>Bookmarked:</strong> {timestamp_str}</p>")
                tags = bookmark.get("tags")
                if tags:
                    tags_html = " ".join(f"<span class='tag'>{html.escape(tag)}</span>" for tag in tags)
                    html_parts.append(f"<p class='tags'><strong>Tags:</strong> {tags_html}</p>")
                else:
                    html_parts.append("<p class='tags'><strong>Tags:</strong> (No tags)</p>")
                note = bookmark.get("note", "")
                if note:
                    html_parts.append(f"<div class='note'><strong>Note:</strong> {html.escape(note)}</div>")
                html_parts.append("</div></div>")

        html_parts.extend([
            "</body>",
            "</html>",
        ])

        return "\n".join(html_parts)

    def get_stats(self) -> BookmarkStats:
        """
        Get statistics for the bookmarks.

        Returns:
            BookmarkStats with counts by type.
        """
        if self._stats is None:
            self._stats = self._calculate_stats()
        return self._stats
