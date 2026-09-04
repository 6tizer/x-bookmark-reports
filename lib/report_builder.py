"""Build structured reports from collected bookmark data."""

from __future__ import annotations

import html
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from lib.external_client import html_to_text
from lib.tz import local_date_str, to_local

logger = logging.getLogger(__name__)

_TCO_RE = re.compile(r'(https?://t\.co/[A-Za-z0-9]+)')


def _linkify_tco(text: str) -> str:
    """Convert bare t.co shortlinks to clickable Markdown links."""
    return _TCO_RE.sub(r'[\1](\1)', text)


def _md_table_escape(text: str | int | float | None) -> str:
    """Escape pipe characters and newlines for Markdown pipe tables."""
    if text is None:
        return ""
    s = str(text)
    return s.replace("|", "\\|").replace("\n", " ")


_README_SKIP_HEADINGS = frozenset({
    "api reference", "api", "changelog", "change log",
    "contributing", "contributors", "license",
    "development", "acknowledgements", "credits",
    "code of conduct", "security",
})
_MAX_README_SECTION_CHARS = 2000
_MAX_README_INTRO_CHARS = 4000


def _normalize_readme_heading(title: str) -> str:
    t = title.strip().lower()
    t = re.sub(r'^#+\s*', "", t)
    t = re.sub(r'[^\w\s-]', "", t)
    return " ".join(t.split())


def _smart_readme_extract(text: str) -> str:
    """
    Keep intro + useful sections; collapse noisy sections (API, changelog, …).
    Long sections are truncated with a note (not a single hard global cap).
    """
    raw = (text or "").strip()
    if not raw:
        return ""

    m = re.search(r"(?m)^##\s+", raw)
    if not m:
        if len(raw) > _MAX_README_INTRO_CHARS:
            return raw[:_MAX_README_INTRO_CHARS] + "\n\n... _(truncated)_"
        return raw

    out: list[str] = []
    preamble = raw[: m.start()].strip()
    if preamble:
        if len(preamble) > _MAX_README_INTRO_CHARS:
            preamble = preamble[:_MAX_README_INTRO_CHARS] + "\n\n... _(truncated)_"
        out.append(preamble)

    pos = m.start()
    while pos < len(raw):
        mh = re.match(r"^##\s+(.+)$", raw[pos:], re.MULTILINE)
        if not mh:
            break
        title_line = mh.group(1).strip()
        body_start = pos + mh.end()
        nxt = re.search(r"(?m)^##\s+", raw[body_start:])
        if nxt:
            body = raw[body_start : body_start + nxt.start()].strip()
            pos = body_start + nxt.start()
        else:
            body = raw[body_start:].strip()
            pos = len(raw)

        norm = _normalize_readme_heading(title_line)
        skip = norm in _README_SKIP_HEADINGS or any(
            s in norm for s in ("changelog", "contributing", "acknowledgement")
        )
        if skip:
            out.append(
                f"## {title_line}\n\n"
                f"_(本节已省略 — 见下方 GitHub 完整 README 链接)_"
            )
            continue

        if len(body) > _MAX_README_SECTION_CHARS:
            body = body[:_MAX_README_SECTION_CHARS] + "\n\n... _(section truncated)_"

        out.append(f"## {title_line}\n\n{body}")

    return "\n\n---\n\n".join(out)


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
    # Engagement statistics
    total_likes: int = 0
    total_retweets: int = 0
    total_views: int = 0
    total_replies: int = 0


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
            return datetime.now(timezone.utc)

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
            return datetime.now(timezone.utc)

    def _format_timestamp(self, timestamp: str) -> str:
        """
        Format timestamp for display.

        Args:
            timestamp: ISO timestamp string.

        Returns:
            Formatted timestamp string.
        """
        # 面向用户的日期一律转产品时区（Asia/Singapore）再格式化，避免 UTC 截日错一天
        dt = to_local(self._parse_timestamp(timestamp))
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
                article_data = bookmark.get("article") or {}
                stats.total_likes += int(
                    article_data.get("like_count")
                    or article_data.get("likeCount")
                    or 0
                )
                stats.total_retweets += int(
                    article_data.get("retweet_count")
                    or article_data.get("retweetCount")
                    or 0
                )
                stats.total_views += int(
                    article_data.get("view_count")
                    or article_data.get("viewCount")
                    or 0
                )
                stats.total_replies += int(
                    article_data.get("reply_count")
                    or article_data.get("replyCount")
                    or 0
                )
            elif bookmark_type == "quoted":
                stats.quoted_tweets += 1
                quoted_tweet = bookmark.get("quoted_tweet", {})
                stats.total_likes += quoted_tweet.get("like_count", 0)
                stats.total_retweets += quoted_tweet.get("retweet_count", 0)
                stats.total_views += quoted_tweet.get("view_count", 0)
                stats.total_replies += quoted_tweet.get("reply_count", 0)
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

    def _format_replies(self, replies: list, depth: int = 0) -> str:
        """渲染回复列表"""
        lines = []
        for i, reply in enumerate(replies, 1):
            indent = "  " * depth
            prefix = f"{i}. " if depth == 0 else ""

            # 回复日期按产品时区取；解析不了再退回前 10 个字符
            raw_time = reply.get('time', '')
            time_str = local_date_str(raw_time) or raw_time[:10]

            lines.append(
                f"{indent}{prefix}@{reply['author']} ({reply.get('name', '')}) "
                f"[{time_str} | {reply.get('likes', 0)}♥ | {reply.get('retweets', 0)}RT]"
            )
            lines.append(f"{indent}  {reply.get('text', '')}")
            lines.append("")

        return "\n".join(lines)

    def _build_replies_section(self, bookmarks: list[dict]) -> str:
        """构建所有书签的回复汇总"""
        all_replies = []

        for bookmark in bookmarks:
            if replies_data := bookmark.get("replies"):
                replies = replies_data.get("replies", [])
                if replies:
                    qt = bookmark.get("quoted_tweet") or {}
                    art = bookmark.get("article") or {}
                    author = (
                        qt.get("author_username")
                        or art.get("author_username")
                        or ""
                    )
                    all_replies.append({
                        "tweet_id": bookmark.get("bookmark_id"),
                        "author": author,
                        "count": replies_data.get("count", len(replies)),
                        "replies": replies,
                    })

        if not all_replies:
            return ""

        lines = ["---", "", "## Replies", ""]
        for item in all_replies:
            lines.append(f"### @{item['author']} ({item['count']} replies)")
            lines.append(f"**Tweet ID**: {item['tweet_id']}")
            lines.append("")
            lines.append(self._format_replies(item["replies"]))
            lines.append("")

        return "\n".join(lines)

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

        like_count = int(article.get("like_count") or article.get("likeCount") or 0)
        retweet_count = int(
            article.get("retweet_count") or article.get("retweetCount") or 0
        )
        reply_count = int(
            article.get("reply_count") or article.get("replyCount") or 0
        )
        view_count = int(article.get("view_count") or article.get("viewCount") or 0)
        bookmark_count = int(
            article.get("bookmark_count") or article.get("bookmarkCount") or 0
        )

        if like_count or retweet_count or reply_count or view_count or bookmark_count:
            lines.append(
                f"**Engagement**: ❤️ {like_count} | 🔁 {retweet_count} | "
                f"💬 {reply_count} | 👁 {view_count} | 🔖 {bookmark_count}"
            )

        media = article.get("media") or []
        if media:
            lines.append("**Media**:")
            for m in media:
                if not isinstance(m, dict):
                    continue
                media_type = m.get("type", "unknown")
                media_url = m.get("url", "")
                if media_url:
                    if media_type == "photo":
                        lines.append(f"- 📷 {media_url}")
                    elif media_type == "video":
                        lines.append(f"- 🎬 {media_url}")
                    else:
                        lines.append(f"- {media_url}")

        entities = article.get("entities") or {}
        hashtags = entities.get("hashtags") or []
        if hashtags:
            tag_parts: list[str] = []
            for h in hashtags:
                if isinstance(h, str) and h:
                    tag_parts.append(f"#{h}")
                elif isinstance(h, dict) and h.get("tag"):
                    tag_parts.append(f"#{h['tag']}")
            if tag_parts:
                lines.append(f"**Hashtags**: {' '.join(tag_parts)}")

        mentioned_users = entities.get("mentionedUsers") or []
        if mentioned_users:
            mention_parts: list[str] = []
            for u in mentioned_users:
                if isinstance(u, str) and u:
                    mention_parts.append(f"@{u}")
                elif isinstance(u, dict) and u.get("username"):
                    mention_parts.append(f"@{u['username']}")
            if mention_parts:
                lines.append(f"**Mentions**: {' '.join(mention_parts)}")

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

        html_content = external.get("content", "")
        if html_content and self.options.include_content:
            plain_text = html_to_text(html_content)
            if plain_text:
                lines.append("")
                lines.append("**Content**:")
                for line in plain_text.split('\n'):
                    line = line.strip()
                    if line:
                        lines.append(f"  {line}")

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

        # Statistics
        lines.append("## Statistics")
        lines.append(f"- Total likes: {stats.total_likes:,}")
        lines.append(f"- Total retweets: {stats.total_retweets:,}")
        lines.append(f"- Total views: {stats.total_views:,}")
        lines.append(f"- Total replies: {stats.total_replies:,}")
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

        # 添加 Replies 区块
        lines.append(self._build_replies_section(self.bookmarks))

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


class SingleBookmarkReport:
    """
    Single-bookmark deep report aligned with x-reader programmatic layout (Markdown).
    """

    def __init__(
        self,
        processed: dict,
        started_at: datetime,
        duration_seconds: float,
        readme_preview_chars: int = 0,
        external_preview_chars: int = 2000,
    ) -> None:
        self._p = processed
        self._started = started_at
        self._duration = duration_seconds
        self._readme_preview = readme_preview_chars
        self._ext_preview = external_preview_chars

    def _bm(self) -> dict:
        return self._p.get("raw_bookmark") or {}

    def _tweet_type_label(self) -> str:
        if self._p.get("article"):
            return "X Article"
        text = (self._bm().get("fullText") or "")
        if len(text) > 280:
            return "长推文"
        return "普通推文"

    def _stats_line(self) -> str:
        b = self._bm()
        likes = int(b.get("likeCount") or 0)
        rts = int(b.get("retweetCount") or 0)
        bms = int(b.get("bookmarkCount") or 0)
        views = int(b.get("viewCount") or 0)
        reps = int(b.get("replyCount") or 0)
        return (
            f"{likes}❤️ {rts}↻ {bms}🔖 {views}👁 {reps}💬"
        )

    def _format_media_main(self) -> str:
        md = self._p.get("media_details") or {}
        return self._format_media_block(md)

    def _format_media_block(self, md: dict) -> str:
        lines: list[str] = []
        images = md.get("images") or []
        videos = md.get("videos") or []
        lines.append(f"Images: {len(images)}")
        for im in images:
            u = im.get("url") or ""
            w, h = im.get("width") or 0, im.get("height") or 0
            if w and h:
                lines.append(f"- {u} ({w}x{h})")
            else:
                lines.append(f"- {u}")
        lines.append("")
        lines.append(f"Videos: {len(videos)}")
        for v in videos:
            for u in v.get("urls") or []:
                dur = v.get("duration_seconds") or 0
                lines.append(f"- MP4: {u} ({dur}s)")
            th = v.get("thumbnail_url") or ""
            if th:
                lines.append(f"- 缩略图: {th}")
        if not images and not videos:
            lines.append("_(无媒体)_")
        return "\n".join(lines)

    def _render_reply_nodes(
        self,
        nodes: list[dict],
        depth: int,
        counter: list[int],
        indent: str,
    ) -> list[str]:
        out: list[str] = []
        for node in nodes:
            counter[0] += 1
            n = counter[0]
            author = node.get("author") or ""
            name = node.get("name") or ""
            t = node.get("time") or ""
            likes = int(node.get("likes") or 0)
            rts = int(node.get("retweets") or 0)
            nchild = len(node.get("children") or [])
            line = (
                f"{indent}{n}. @{author} ({name}) "
                f"[{t} | {likes}♥ | {rts}RT | {nchild} nested]"
            )
            out.append(line)
            text = (node.get("text") or "").replace("\n", " ")
            # Expand t.co shortlinks using the url_map stored at fetch time
            for tco, expanded in (node.get("url_map") or {}).items():
                text = text.replace(tco, expanded)
            # Any t.co links still in text (url_map missing due to rate limits)
            # are made clickable so readers can follow them manually.
            text = _linkify_tco(text)
            out.append(f"{indent}  Text: {text}")
            ch = node.get("children") or []
            if ch:
                out.extend(
                    self._render_reply_nodes(
                        ch,
                        depth + 1,
                        counter,
                        indent + "  ",
                    )
                )
        return out

    def _link_summary_rows(self) -> list[tuple[int, str, str, str]]:
        rows: list[tuple[int, str, str, str]] = []
        n = 0
        for g in self._p.get("github_links_detail") or []:
            n += 1
            url = g.get("url") or ""
            meta = g.get("meta") or {}
            stars = meta.get("stargazers_count", "")
            lang = meta.get("language", "")
            src = g.get("source") or ""
            rows.append((n, url, src, f"GitHub ({stars}★, {lang})"))
        for e in self._p.get("external_links_detail") or []:
            n += 1
            url = e.get("url") or ""
            ec = e.get("content") or {}
            title = ec.get("title") or url
            src = e.get("source") or ""
            rows.append((n, url, src, f"外部网页 ({title})"))
        return rows

    def build_markdown(self) -> str:
        bm = self._bm()
        qc = self._p.get("quality_checks") or {}
        tb = bm.get("tweetBy") or {}
        author_u = (
            tb.get("userName")
            or bm.get("authorUsername")
            or bm.get("author_username")
            or ""
        )
        author_n = (
            tb.get("fullName")
            or tb.get("name")
            or bm.get("authorName")
            or bm.get("author_name")
            or ""
        )
        created = bm.get("createdAt") or bm.get("created_at") or ""
        started = self._started.strftime("%Y-%m-%dT%H:%M:%SZ")

        article = self._p.get("article")

        parts: list[str] = [
            "---",
            f"StartedAt: {started}",
            f"Duration: {self._duration:.1f}",
            f"Author: @{author_u} ({author_n})",
            f"PublishedAt: {created}",
            f"Stats: {self._stats_line()}",
            f"Type: {self._tweet_type_label()}",
            "---",
            "",
            "## 主推文",
            "",
        ]

        if article and article.get("content_text"):
            title = article.get("title") or ""
            article_url = article.get("url") or ""
            tweet_url = f"https://x.com/{author_u}/status/{self._p['bookmark_id']}"
            parts.append(f"> 原文推文: {tweet_url}")
            if article_url:
                parts.append(f"> 文章地址: {article_url}")
            parts.append("")
            if title:
                parts.append(f"**{title}**")
                parts.append("")
            parts.append(article["content_text"])
        else:
            tweet_url = f"https://x.com/{author_u}/status/{self._p['bookmark_id']}"
            parts.append(f"> 原文推文: {tweet_url}")
            parts.append("")
            parts.append(_linkify_tco(bm.get("fullText") or "_(无正文)_"))

        parts.extend([
            "",
            "### 主推文媒体",
            "",
            self._format_media_main(),
            "",
            "---",
            "",
        ])

        # Quoted
        q = self._p.get("quoted_raw")
        if isinstance(q, dict) and (q.get("fullText") or q.get("tweetBy")):
            tb = q.get("tweetBy") or {}
            qu = tb.get("userName") or tb.get("username") or ""
            qn = tb.get("fullName") or tb.get("name") or ""
            ql = int(q.get("likeCount") or 0)
            qr = int(q.get("retweetCount") or 0)
            qrep = int(q.get("replyCount") or 0)
            parts.extend([
                "## 引用推文",
                "",
                f"Author: @{qu} ({qn})",
                f"Stats: {ql}❤️ {qr}↻ {qrep}💬",
                "",
                "QuotePost:",
                "",
            ])
            for line in _linkify_tco(q.get("fullText") or "").split("\n"):
                parts.append(f"> {line}")
            parts.extend([
                "",
                "### 引用推文媒体",
                "",
                self._format_media_block(self._p.get("quoted_media_details") or {}),
                "",
                "---",
                "",
            ])

        # Replies
        tree = self._p.get("reply_tree")
        parts.append("## 回复线程")
        parts.append("")
        if tree:
            counter = [0]
            parts.extend(self._render_reply_nodes(tree, 0, counter, ""))
        else:
            rep = self._p.get("replies")
            if rep and rep.get("replies"):
                for i, r in enumerate(rep["replies"], 1):
                    parts.append(
                        f"{i}. @{r.get('author')} ({r.get('name')}) — {r.get('text', '')[:200]}"
                    )
            else:
                parts.append("_(无回复数据；使用 `--replies` 或单帖深度模式抓取)_")
        parts.extend(["", "---", ""])

        # GitHub details
        gh_list = self._p.get("github_links_detail") or []
        ext_list = self._p.get("external_links_detail") or []
        if gh_list or ext_list:
            parts.append("## 外部链接详情")
            parts.append("")

        for i, g in enumerate(gh_list, 1):
            meta = g.get("meta") or {}
            url = g.get("url") or ""
            owner_repo = ""
            if "github.com" in url:
                m = re.search(r"github\.com/([^/]+)/([^/#?]+)", url, re.IGNORECASE)
                if m:
                    owner_repo = f"{m.group(1)}/{m.group(2)}"
            readme_excerpt = g.get("readme_excerpt") or ""
            readme_body = _smart_readme_extract(readme_excerpt)
            if self._readme_preview:
                readme_body = readme_body[: self._readme_preview]
            if not readme_body.strip():
                readme_body = "_(无)_"
            gh_readme_link = (meta.get("html_url") or url) + "#readme"
            parts.extend([
                f"### {i}. GitHub: {owner_repo or url}",
                "",
                "| 字段 | 值 |",
                "|------|-----|",
                f"| 仓库 | {_md_table_escape(meta.get('html_url') or url)} |",
                f"| 描述 | {_md_table_escape(meta.get('description', ''))} |",
                f"| 语言 | {_md_table_escape(meta.get('language', ''))} |",
                f"| Stars | {_md_table_escape(meta.get('stargazers_count', ''))} |",
                # GitHub API 返回 UTC ISO，转产品时区日期展示
                f"| 创建 | {_md_table_escape(local_date_str(meta.get('created_at', '')) or meta.get('created_at', ''))} |",
                f"| 最后更新 | {_md_table_escape(local_date_str(meta.get('updated_at', '')) or meta.get('updated_at', ''))} |",
                f"| Topics | {_md_table_escape(', '.join(meta.get('topics') or []))} |",
                f"| License | {_md_table_escape(meta.get('license', ''))} |",
                "",
                "README（智能节选）：",
                "",
                readme_body,
                "",
                f"*完整 README / Full README: {gh_readme_link}*",
                "",
            ])
            if g.get("error"):
                parts.append(f"_(抓取备注: {g['error']})_")
                parts.append("")

        off = len(gh_list)
        for j, e in enumerate(ext_list, 1):
            ec = e.get("content") or {}
            title = ec.get("title") or "(无标题)"
            parts.extend([
                f"### {off + j}. 外部链接: {title}",
                "",
                "| 字段 | 值 |",
                "|------|-----|",
                f"| URL | {_md_table_escape(ec.get('final_url') or e.get('url', ''))} |",
                f"| 标题 | {_md_table_escape(ec.get('title', ''))} |",
                f"| 描述 | {_md_table_escape(ec.get('description', ''))} |",
                f"| 内容类型 | {_md_table_escape(ec.get('content_type', ec.get('contentType', '')))} |",
                "",
            ])
            body = ec.get("content") or ec.get("text") or ""
            if body:
                parts.append(body[: self._ext_preview])
                parts.append("")
            if e.get("error"):
                parts.append(f"_(错误: {e['error']})_")
                parts.append("")

        # Summary table
        parts.extend([
            "---",
            "",
            "## 外部链接汇总",
            "",
            "| # | URL | 来源 | 类型 |",
            "|---|-----|------|------|",
        ])
        summary_rows = self._link_summary_rows()
        for row in summary_rows:
            idx, url, src, kind = row
            parts.append(
                f"| {idx} | {_md_table_escape(url)} | {_md_table_escape(src)} | "
                f"{_md_table_escape(kind)} |"
            )
        if not summary_rows:
            parts.append("| — | — | — | _(无外链)_ |")

        parts.extend([
            "",
            "---",
            "",
            "## 质量检查",
            "",
        ])

        def chk(key: str, ok: bool) -> str:
            return "- [x]" if ok else "- [ ]"

        main_ok = qc.get("main_text", bool((bm.get("fullText") or "").strip()))
        parts.append(f"{chk('m', main_ok)} 主推文全文 + 统计")

        qraw = self._p.get("quoted_raw")
        has_quoted = isinstance(qraw, dict)
        q_ok = qc.get(
            "quoted_full",
            (not has_quoted) or bool((qraw.get("fullText") or "").strip()),
        )
        qm_ok = qc.get(
            "quoted_media",
            (not has_quoted) or bool(qraw.get("media")),
        )
        parts.append(
            f"{chk('q', q_ok)} 引用推文全文 + 统计 + "
            f"({'媒体' if qm_ok else '无媒体'})"
        )

        rf, tot = qc.get("replies_pair", (0, 0))
        if tot == 0:
            rep_ok = True
        else:
            rep_ok = rf > 0
        parts.append(
            f"{chk('r', rep_ok)} 回复线程 ({rf}/{tot} 条)"
        )

        gh_ok = qc.get("github_ok", any(x.get("meta") for x in gh_list))
        parts.append(f"{chk('g', gh_ok)} GitHub 项目信息")

        ext_ok = qc.get(
            "external_ok",
            bool(ext_list) and all(x.get("content") for x in ext_list),
        )
        parts.append(f"{chk('e', ext_ok)} 外部链接内容")

        parts.append("")
        return "\n".join(parts)
