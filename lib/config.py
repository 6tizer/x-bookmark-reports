"""Configuration management for Twitter Bookmark Reports."""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path

from dotenv import load_dotenv

# Project root directory
PROJECT_ROOT = Path(__file__).parent.parent

# Load .env file from project root
ENV_PATH = PROJECT_ROOT / ".env"
load_dotenv(ENV_PATH)


def _get_gh_username() -> str:
    """Get current GitHub username via gh CLI."""
    try:
        result = subprocess.run(
            ["gh", "api", "user", "--jq", ".login"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (subprocess.SubprocessError, FileNotFoundError, OSError):
        pass
    return "unknown"


def _require_env(key: str, default: str | None = None) -> str:
    """Get required env var or raise ValueError."""
    value = __import__("os").getenv(key, default)
    if value is None or value == "":
        raise ValueError(
            f"Missing required environment variable: {key}. "
            f"Please set it in {ENV_PATH}"
        )
    return value


def _optional_env(key: str, default: str) -> str:
    """Get optional env var with default value."""
    value = __import__("os").getenv(key)
    if value is None or value == "":
        return default
    return value


# Twitter Auth API (original from .env.twitter)
API_KEY = _require_env("API_KEY")
PROXY = _optional_env("PROXY", "")

# TwitterAPI.io API Configuration
TWITTER_API_IO_KEY = _require_env("TWITTER_API_IO_KEY")
TWITTER_API_BASE_URL = _optional_env(
    "TWITTER_API_BASE_URL",
    "https://api.twitterapi.io"
)

# GitHub Configuration
GITHUB_OWNER = _require_env("GITHUB_OWNER")
GITHUB_REPO = _require_env("GITHUB_REPO")
GITHUB_BRANCH = _optional_env("GITHUB_BRANCH", "main")

# URL Type Routing Rules
URL_PATTERNS: list[tuple[str, list[str]]] = [
    ("article", ["x.com/i/articles/", "twitter.com/i/articles/"]),
    ("quoted", ["x.com/*/status/", "twitter.com/*/status/"]),
    ("github", ["github.com/", "github.com/*/pull/", "github.com/*/issues/"]),
    ("external", []),
]

# Cache Configuration (in seconds)
CACHE_TTL: dict[str, int] = {
    "article": 7 * 24 * 3600,
    "quoted": 3 * 24 * 3600,
    "github": 12 * 3600,
    "external": 24 * 3600,
}
CACHE_DIR = PROJECT_ROOT / "cache"

# Report Configuration
REPORT: dict[str, str] = {
    "title": "Twitter Bookmark Report",
    "author": _get_gh_username(),
    "date_format": "%Y-%m-%d",
}

# External Service Configuration
FXTWITTER_BASE_URL = "https://api.fxtwitter.com"
FXTWITTER_FIELDS = [
    "text",
    "author",
    "media",
    "created_at",
    "like_count",
    "quote_count",
    "reply_count",
    "repost_count",
]

# Request Retry Configuration
REQUEST_MAX_RETRIES = 3
REQUEST_BACKOFF_FACTOR = 1.5
REQUEST_TIMEOUT = 15

# Logging Configuration
LOG_LEVEL = "INFO"
LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
LOG_FILE = str(PROJECT_ROOT / "data/run.log")


def route_url(url: str) -> str:
    """
    Route URL to appropriate client based on pattern matching.

    Args:
        url: The URL to route.

    Returns:
        Client name: "article", "quoted", "github", or "external".

    >>> route_url("https://x.com/i/articles/123")
    'article'
    >>> route_url("https://twitter.com/i/articles/456")
    'article'
    >>> route_url("https://x.com/elonmusk/status/456")
    'quoted'
    >>> route_url("https://github.com/facebook/react/pull/123")
    'github'
    >>> route_url("https://github.com/microsoft/vscode/issues/789")
    'github'
    >>> route_url("https://example.com/some-page")
    'external'
    """
    url_lower = url.lower()

    if "/i/articles/" in url_lower:
        return "article"
    if "/status/" in url_lower:
        return "quoted"
    if "github.com/" in url_lower:
        return "github"

    return "external"


def get_config() -> dict[str, dict[str, str | int]]:
    """
    Get all configuration grouped by category.

    Returns:
        Dict with keys: twitter_api, github, cache, report, request, logging
    """
    return {
        "twitter_api": {
            "api_key": TWITTER_API_IO_KEY,
            "base_url": TWITTER_API_BASE_URL,
        },
        "github": {
            "owner": GITHUB_OWNER,
            "repo": GITHUB_REPO,
            "branch": GITHUB_BRANCH,
        },
        "cache": {
            "ttl": CACHE_TTL,
            "dir": str(CACHE_DIR),
        },
        "report": REPORT,
        "fxtwitter": {
            "base_url": FXTWITTER_BASE_URL,
            "fields": FXTWITTER_FIELDS,
        },
        "request": {
            "max_retries": REQUEST_MAX_RETRIES,
            "backoff_factor": REQUEST_BACKOFF_FACTOR,
            "timeout": REQUEST_TIMEOUT,
        },
        "logging": {
            "level": LOG_LEVEL,
            "format": LOG_FORMAT,
            "file": LOG_FILE,
        },
        "url_routing": {
            "patterns": URL_PATTERNS,
        },
    }
