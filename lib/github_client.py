"""GitHub README client via gh CLI or REST API."""

from __future__ import annotations

import base64
import json
import logging
import os
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import urllib.error
import urllib.request

from lib.config import (
    CACHE_DIR,
    CACHE_TTL,
    REQUEST_BACKOFF_FACTOR,
    REQUEST_MAX_RETRIES,
    REQUEST_TIMEOUT,
)

logger = logging.getLogger(__name__)

OWNER_REPO_PATTERN = re.compile(r'^[a-zA-Z0-9_-]+$')


class GitHubNotFound(Exception):
    """Repository does not exist or README is unavailable."""


class GitHubAPIError(Exception):
    """GitHub API returned an error."""


class GitHubClient:
    """Client for fetching GitHub repository README content."""

    def __init__(self):
        self.cache_dir = CACHE_DIR
        self.ttl = CACHE_TTL["github"]
        self._max_retries = REQUEST_MAX_RETRIES
        self._backoff_factor = REQUEST_BACKOFF_FACTOR
        self._timeout = REQUEST_TIMEOUT
        self._gh_available = self._check_gh_cli()
        self._github_token = self._resolve_github_token()
        self._ensure_cache_dir()

    def _check_gh_cli(self) -> bool:
        """Check if gh CLI is available."""
        return shutil.which("gh") is not None

    def _resolve_github_token(self) -> str | None:
        """Prefer env token; else try ``gh auth token`` for urllib REST calls."""
        for key in ("GITHUB_TOKEN", "GH_TOKEN"):
            v = os.getenv(key, "").strip()
            if v:
                return v
        if not self._gh_available:
            return None
        try:
            result = subprocess.run(
                ["gh", "auth", "token"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip()
        except (subprocess.SubprocessError, OSError, FileNotFoundError):
            pass
        return None

    def _github_api_headers(self) -> dict[str, str]:
        h: dict[str, str] = {"Accept": "application/vnd.github.v3+json"}
        if self._github_token:
            h["Authorization"] = f"token {self._github_token}"
        return h

    def _github_readme_headers(self) -> dict[str, str]:
        h: dict[str, str] = {"Accept": "application/vnd.github.v3.raw"}
        if self._github_token:
            h["Authorization"] = f"token {self._github_token}"
        return h

    def _ensure_cache_dir(self) -> None:
        """Ensure cache directory exists."""
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _cache_path(self, owner: str, repo: str) -> Path:
        """Get cache file path for repository README."""
        return self.cache_dir / "github" / f"{owner}_{repo}.json"

    def _meta_cache_path(self, owner: str, repo: str) -> Path:
        """Get cache file path for repository metadata (REST)."""
        return self.cache_dir / "github" / f"{owner}_{repo}_meta.json"

    def _get_cached(self, owner: str, repo: str) -> Optional[str]:
        """Load README from cache if valid."""
        cache_path = self._cache_path(owner, repo)
        if not cache_path.exists():
            return None

        mtime = cache_path.stat().st_mtime
        if time.time() - mtime > self.ttl:
            logger.debug(f"Cache expired for {owner}/{repo}")
            return None

        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data.get("content")
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Failed to read cache for {owner}/{repo}: {e}")
            return None

    def _set_cached(self, owner: str, repo: str, content: str) -> None:
        """Save README to cache."""
        cache_path = self._cache_path(owner, repo)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(
                    {"content": content, "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")},
                    f,
                    ensure_ascii=False,
                    indent=2,
                )
        except OSError as e:
            logger.warning(f"Failed to write cache for {owner}/{repo}: {e}")

    def _extract_owner_repo(self, url_or_owner_repo: str) -> tuple[str, str]:
        """
        Extract owner and repo from GitHub URL or owner/repo string.

        Args:
            url_or_owner_repo: GitHub URL (e.g., https://github.com/facebook/react/pull/123)
                               or owner/repo string (e.g., microsoft/vscode)

        Returns:
            Tuple of (owner, repo)

        Raises:
            ValueError: If owner/repo cannot be extracted.
        """
        # Check if it looks like a URL (contains scheme-like pattern)
        if "://" in url_or_owner_repo or url_or_owner_repo.startswith("github.com/"):
            parsed = urlparse(url_or_owner_repo)
            # Verify the netloc is exactly github.com (not a subdomain or malicious URL)
            if parsed.netloc == "github.com":
                path_parts = parsed.path.strip("/").split("/")
                if len(path_parts) >= 2:
                    owner = path_parts[0]
                    repo = path_parts[1].split("?")[0].split("#")[0]
                    if owner and repo:
                        return owner, repo
            raise ValueError(f"Cannot extract owner/repo from URL: {url_or_owner_repo}")

        # Check if it's a bare owner/repo string
        if "/" in url_or_owner_repo:
            parts = url_or_owner_repo.split("/")
            if len(parts) == 2 and parts[0] and parts[1]:
                return parts[0], parts[1]
            raise ValueError(f"Cannot extract owner/repo from: {url_or_owner_repo}")

        raise ValueError(f"Cannot extract owner/repo from: {url_or_owner_repo}")

    def _fetch_via_gh(self, owner: str, repo: str) -> str:
        """Fetch README using gh CLI."""
        cmd = ["gh", "api", f"repos/{owner}/{repo}/readme", "--jq", ".content"]
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self._timeout,
            )
            if result.returncode != 0:
                stderr = result.stderr.strip().lower()
                if "not found" in stderr or "404" in stderr:
                    raise GitHubNotFound(f"Repository not found: {owner}/{repo}")
                raise GitHubAPIError(f"gh CLI error: {result.stderr}")
            return result.stdout
        except subprocess.TimeoutExpired as e:
            raise GitHubAPIError(f"gh CLI timeout: {e}") from e
        except subprocess.SubprocessError as e:
            raise GitHubAPIError(f"gh CLI error: {e}") from e

    def _fetch_via_urllib(self, owner: str, repo: str) -> str:
        """Fetch README using urllib fallback."""
        url = f"https://api.github.com/repos/{owner}/{repo}/readme"
        headers = self._github_readme_headers()
        last_err: Exception | None = None

        for attempt in range(self._max_retries):
            try:
                req = urllib.request.Request(url, headers=headers)
                opener = urllib.request.build_opener()
                with opener.open(req, timeout=self._timeout) as resp:
                    return resp.read().decode("utf-8")
            except urllib.error.HTTPError as e:
                last_err = e
                if e.code == 404:
                    raise GitHubNotFound(f"Repository not found: {owner}/{repo}") from e
                if e.code == 403:
                    raise GitHubAPIError(f"Rate limited (403): {e.reason}") from e
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

        raise GitHubAPIError(
            f"Failed after {self._max_retries} attempts"
        ) from last_err

    def _fetch(self, owner: str, repo: str) -> str:
        """
        Fetch README content for a repository.

        Args:
            owner: Repository owner.
            repo: Repository name.

        Returns:
            README content as string.
        """
        if not OWNER_REPO_PATTERN.match(owner) or not OWNER_REPO_PATTERN.match(repo):
            raise ValueError(f"Invalid owner/repo format: {owner}/{repo}")

        if self._gh_available:
            logger.debug(f"Fetching {owner}/{repo} via gh CLI")
            try:
                raw_content = self._fetch_via_gh(owner, repo)
                return self._parse_readme(raw_content)
            except (GitHubNotFound, GitHubAPIError):
                # Fall through to urllib if gh CLI fails
                logger.debug("gh CLI failed, falling back to urllib")

        logger.debug(f"Fetching {owner}/{repo} via urllib")
        raw_content = self._fetch_via_urllib(owner, repo)
        return self._parse_readme(raw_content, decode_base64=False)

    def _parse_readme(self, data: str, decode_base64: bool = True) -> str:
        """
        Parse README content from raw data.

        When using gh CLI, the response is base64 encoded and needs decoding.
        When using urllib with Accept: application/vnd.github.v3.raw, content is already plain text.
        This method auto-detects: if data looks like base64 (valid charset + proper padding),
        decode it; otherwise return as-is.

        Args:
            data: Raw response data.
            decode_base64: Whether to attempt base64 decoding (default True).
                           Set to False to skip decoding entirely.

        Returns:
            README content as string.
        """
        content = data.strip()
        if not decode_base64:
            return content

        try:
            # Auto-detect: try base64 decode, if fails return as plain text
            decoded = base64.b64decode(content).decode("utf-8")
            return decoded
        except Exception:
            # Not valid base64, return as plain text
            return content

    def get_readme(self, url_or_owner_repo: str, *, skip_cache: bool = False) -> str:
        """
        Get README content for a GitHub repository.

        Args:
            url_or_owner_repo: GitHub URL (e.g., https://github.com/facebook/react/pull/123)
                               or owner/repo string (e.g., microsoft/vscode)
            skip_cache: If True, bypass cache read/write for this request.

        Returns:
            README content as string.

        Raises:
            GitHubNotFound: If repository does not exist.
            GitHubAPIError: If API returns an error.
            ValueError: If owner/repo cannot be extracted.
        """
        owner, repo = self._extract_owner_repo(url_or_owner_repo)

        if not skip_cache:
            cached = self._get_cached(owner, repo)
            if cached is not None:
                logger.info(f"README for {owner}/{repo} cache hit")
                return cached

        content = self._fetch(owner, repo)
        if not skip_cache:
            self._set_cached(owner, repo, content)
        return content

    def _get_meta_cached(self, owner: str, repo: str) -> Optional[dict]:
        """Load repo metadata from cache if valid."""
        cache_path = self._meta_cache_path(owner, repo)
        if not cache_path.exists():
            return None
        mtime = cache_path.stat().st_mtime
        if time.time() - mtime > self.ttl:
            return None
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("Failed to read meta cache for %s/%s: %s", owner, repo, e)
            return None

    def _set_meta_cached(self, owner: str, repo: str, meta: dict) -> None:
        cache_path = self._meta_cache_path(owner, repo)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(
                    {**meta, "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")},
                    f,
                    ensure_ascii=False,
                    indent=2,
                )
        except OSError as e:
            logger.warning("Failed to write meta cache for %s/%s: %s", owner, repo, e)

    def _fetch_repo_json_via_gh(self, owner: str, repo: str) -> dict:
        cmd = ["gh", "api", f"repos/{owner}/{repo}"]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=self._timeout,
        )
        if result.returncode != 0:
            stderr = result.stderr.strip().lower()
            if "not found" in stderr or "404" in stderr:
                raise GitHubNotFound(f"Repository not found: {owner}/{repo}")
            raise GitHubAPIError(f"gh CLI error: {result.stderr}")
        return json.loads(result.stdout)

    def _fetch_repo_json_via_urllib(self, owner: str, repo: str) -> dict:
        url = f"https://api.github.com/repos/{owner}/{repo}"
        last_err: Exception | None = None
        for attempt in range(self._max_retries):
            try:
                req = urllib.request.Request(
                    url,
                    headers=self._github_api_headers(),
                )
                opener = urllib.request.build_opener()
                with opener.open(req, timeout=self._timeout) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                last_err = e
                if e.code == 404:
                    raise GitHubNotFound(f"Repository not found: {owner}/{repo}") from e
                wait = (2**attempt) * self._backoff_factor
                if attempt < self._max_retries - 1:
                    time.sleep(wait)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
                last_err = e
                wait = (2**attempt) * self._backoff_factor
                if attempt < self._max_retries - 1:
                    time.sleep(wait)
        raise GitHubAPIError(f"Failed after {self._max_retries} attempts") from last_err

    def get_repo_info(self, url_or_owner_repo: str, *, skip_cache: bool = False) -> dict:
        """
        Return repository metadata (description, language, stars, dates, topics, license).

        Uses ``gh api repos/{owner}/{repo}`` when available, else GitHub REST API.
        Cached at ``cache/github/{owner}_{repo}_meta.json`` with same TTL as README.
        """
        owner, repo = self._extract_owner_repo(url_or_owner_repo)
        if not OWNER_REPO_PATTERN.match(owner) or not OWNER_REPO_PATTERN.match(repo):
            raise ValueError(f"Invalid owner/repo format: {owner}/{repo}")

        if not skip_cache:
            cached = self._get_meta_cached(owner, repo)
            if cached is not None and "html_url" in cached:
                logger.info("Repo meta for %s/%s cache hit", owner, repo)
                return {k: v for k, v in cached.items() if k != "fetched_at"}

        raw: dict
        if self._gh_available:
            try:
                raw = self._fetch_repo_json_via_gh(owner, repo)
            except GitHubNotFound:
                raise
            except (GitHubAPIError, json.JSONDecodeError, OSError, subprocess.SubprocessError):
                raw = self._fetch_repo_json_via_urllib(owner, repo)
        else:
            raw = self._fetch_repo_json_via_urllib(owner, repo)

        lic = raw.get("license") or {}
        if isinstance(lic, dict):
            license_name = lic.get("spdx_id") or lic.get("name") or ""
        else:
            license_name = str(lic) if lic else ""

        meta = {
            "html_url": raw.get("html_url", ""),
            "description": raw.get("description") or "",
            "language": raw.get("language") or "",
            "stargazers_count": int(raw.get("stargazers_count") or 0),
            "created_at": raw.get("created_at") or "",
            "updated_at": raw.get("updated_at") or "",
            "topics": list(raw.get("topics") or []),
            "license": license_name,
        }
        if not skip_cache:
            self._set_meta_cached(owner, repo, meta)
        return meta
