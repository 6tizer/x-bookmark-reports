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


_gh_username_cache: str | None = None


def get_gh_username() -> str:
    """Get GitHub username with lazy evaluation and caching."""
    global _gh_username_cache
    if _gh_username_cache is None:
        _gh_username_cache = _get_gh_username()
    return _gh_username_cache


# Twitter Auth API (original from .env.twitter; optional for Python reports)
API_KEY = _optional_env("API_KEY", "")
PROXY = _optional_env("PROXY", "")

# TwitterAPI.io API Configuration
TWITTER_API_IO_KEY = _require_env("TWITTER_API_IO_KEY")
TWITTER_API_BASE_URL = _optional_env(
    "TWITTER_API_BASE_URL",
    "https://api.twitterapi.io"
)

# GitHub Configuration (optional metadata; GitHubClient resolves owner/repo from URLs)
GITHUB_OWNER = _optional_env("GITHUB_OWNER", "")
GITHUB_REPO = _optional_env("GITHUB_REPO", "")
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
    "author": "",
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
REQUEST_TIMEOUT = 30

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
        "report": {
            **REPORT,
            "author": get_gh_username(),
        },
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


# ---------------------------------------------------------------------------
# Article Pipeline Configuration (LLM / Search / Output dirs)
# ---------------------------------------------------------------------------

# DeepSeek — article rewrite (OpenAI-compatible)
DEEPSEEK_API_KEY = _optional_env("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = _optional_env("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
DEEPSEEK_MODEL = _optional_env("DEEPSEEK_MODEL", "deepseek-v4-flash")

# x.ai — research search (OpenAI Responses API + web_search / x_search)
XAI_API_KEY = _optional_env("XAI_API_KEY", "")
XAI_BASE_URL = _optional_env("XAI_BASE_URL", "https://api.x.ai/v1")
XAI_MODEL = _optional_env("XAI_MODEL", "grok-4.3")

# Exa — 可选补充搜索（REST /search 端点；exa-research 模型已退役，不再走 chat.completions）
EXA_API_KEY = _optional_env("EXA_API_KEY", "")
EXA_BASE_URL = _optional_env("EXA_BASE_URL", "https://api.exa.ai")

# SearXNG — 主力搜索（自托管实例，无需 key）
SEARXNG_BASE_URL = _optional_env("SEARXNG_BASE_URL", "http://100.99.184.51:8888")

# Firecrawl — 备用搜索（SearXNG 失败或 0 结果时启用；无 key 也可 Keyless 调用）
FIRECRAWL_API_KEY = _optional_env("FIRECRAWL_API_KEY", "")
FIRECRAWL_BASE_URL = _optional_env("FIRECRAWL_BASE_URL", "https://api.firecrawl.dev/v2")

# Article pipeline output directories
ARTICLE_FINAL_DIR = PROJECT_ROOT / _optional_env("ARTICLE_FINAL_DIR", "output/article-final")
ARTICLE_RESEARCH_DIR = PROJECT_ROOT / "output/article-research"
ARTICLE_PIPELINE_STATE = PROJECT_ROOT / "output" / ".article-pipeline-state.json"
