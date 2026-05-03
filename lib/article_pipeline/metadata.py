"""Metadata extraction from deep draft Markdown files."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass
class ArticleMeta:
    """Parsed metadata from a deep draft bookmark report."""

    tweet_id: str = ""
    title: str = ""
    author: str = ""
    author_name: str = ""
    type: str = ""
    url: str = ""
    published_at: str = ""
    stats: Dict[str, int] = field(default_factory=dict)
    deep_draft_path: str = ""
    body_excerpt: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tweet_id": self.tweet_id,
            "title": self.title,
            "author": self.author,
            "author_name": self.author_name,
            "type": self.type,
            "url": self.url,
            "published_at": self.published_at,
            "stats": self.stats,
        }


def _parse_frontmatter(text: str) -> Dict[str, str]:
    """Parse YAML-like frontmatter from deep draft Markdown."""
    meta: Dict[str, str] = {}
    if not text.startswith("---"):
        return meta
    end = text.find("\n---", 3)
    if end == -1:
        return meta
    fm_block = text[3:end].strip()
    for line in fm_block.splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            meta[k.strip()] = v.strip()
    return meta


def _extract_title(body: str) -> str:
    """Extract title from deep draft body: first **bold** text."""
    m = re.search(r"\*\*(.+?)\*\*", body)
    if m:
        return m.group(1).strip().rstrip("*").strip()
    # Fallback: first non-empty, non-header line
    for line in body.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith(("#", ">", "-", "[")):
            return stripped[:200]
    return ""


def _extract_tweet_url(body: str) -> str:
    """Extract the tweet URL from body text."""
    m = re.search(r"https://x\.com/\S+/status/\d+", body)
    return m.group(0) if m else ""


def _parse_author(raw: str) -> tuple:
    """Parse 'Author: @handle (Name)' -> ('@handle', 'Name')."""
    if not raw:
        return ("", "")
    m = re.match(r"(@\S+)\s*\(([^)]+)\)", raw.strip())
    if m:
        return (m.group(1), m.group(2))
    handle = raw.strip().split()[0]
    return (handle, "")


def _parse_stats(raw: str) -> Dict[str, int]:
    """Parse stats line like '123❤️ 45↻ 6🔖 789👁 2💬'."""
    result: Dict[str, int] = {}
    emojis: Dict[str, str] = {
        "\u2764\ufe0f": "likes",
        "\u2764": "likes",
        "\u21bb": "retweets",
        "\U0001f516": "bookmarks",
        "\U0001f441": "views",
        "\U0001f4ac": "replies",
    }
    for emoji, key in emojis.items():
        idx = raw.find(emoji)
        if idx == -1:
            continue
        num = ""
        for i in range(idx - 1, -1, -1):
            if raw[i].isdigit():
                num = raw[i] + num
            else:
                break
        if num:
            result[key] = int(num)
    return result


def parse_deep_draft(path: Path) -> Optional[ArticleMeta]:
    """Parse a deep draft .md file into ArticleMeta.

    Args:
        path: Path to the deep draft file (e.g. bookmark-deep-123-20260420.md)

    Returns:
        ArticleMeta or None if the file cannot be parsed.
    """
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        return None

    meta_fields = _parse_frontmatter(text)

    # Split frontmatter from body
    body = text
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            body = text[end + 4:].lstrip("\n")

    # Extract tweet_id from filename
    # Format: bookmark-deep-{tweet_id}-{timestamp}.md
    fname = path.stem
    tweet_id = ""
    m = re.match(r"bookmark-deep-(\d+)-", fname)
    if m:
        tweet_id = m.group(1)
    else:
        # Try just the stem as tweet_id
        m2 = re.match(r"(\d+)", fname)
        if m2:
            tweet_id = m2.group(1)

    # Parse author
    author_raw = meta_fields.get("Author", "")
    author_handle, author_name = _parse_author(author_raw)

    # Parse stats
    stats = _parse_stats(meta_fields.get("Stats", ""))

    # Parse published_at
    pub_at = meta_fields.get("PublishedAt", "")

    # Extract URL from body
    tweet_url = _extract_tweet_url(body)

    # Extract title
    title = _extract_title(body)

    # Body excerpt for research
    body_excerpt = body[:4000]

    return ArticleMeta(
        tweet_id=tweet_id,
        title=title,
        author=author_handle,
        author_name=author_name,
        type=meta_fields.get("Type", ""),
        url=tweet_url,
        published_at=pub_at,
        stats=stats,
        deep_draft_path=str(path),
        body_excerpt=body_excerpt,
    )


def find_deep_drafts(output_dir: Path) -> List[Path]:
    """Find all deep draft files sorted by name."""
    if not output_dir.exists():
        return []
    return sorted(output_dir.glob("bookmark-deep-*.md"))


def find_deep_draft_by_id(output_dir: Path, tweet_id: str) -> Optional[Path]:
    """Find a deep draft file by tweet_id prefix match."""
    if not output_dir.exists():
        return None
    pattern = f"bookmark-deep-{tweet_id}-*.md"
    matches = list(output_dir.glob(pattern))
    if matches:
        return matches[0]
    # Fallback: try exact tweet_id as stem
    exact = output_dir / f"{tweet_id}.md"
    if exact.exists():
        return exact
    return None
