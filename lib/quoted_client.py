"""Twitter quoted tweet client via FxTwitter."""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import urllib.error
import urllib.request

from lib.config import (
    CACHE_DIR,
    CACHE_TTL,
    FXTWITTER_BASE_URL,
    PROXY,
    REQUEST_BACKOFF_FACTOR,
    REQUEST_MAX_RETRIES,
    REQUEST_TIMEOUT,
)

logger = logging.getLogger(__name__)


class TweetNotFound(Exception):
    """Tweet does not exist or is unavailable."""


class TweetAPIError(Exception):
    """API returned an error."""


class TweetParseError(Exception):
    """Failed to parse tweet response."""


@dataclass
class QuotedTweet:
    id: str
    full_text: str
    author_name: str
    author_username: str
    created_at: str
    like_count: int
    retweet_count: int
    reply_count: int
    quote_count: int
    view_count: int
    url: str
    source: str
    lang: str

    def to_dict(self) -> dict:
        """Convert to dict for serialization."""
        return {
            "id": self.id,
            "full_text": self.full_text,
            "author_name": self.author_name,
            "author_username": self.author_username,
            "created_at": self.created_at,
            "like_count": self.like_count,
            "retweet_count": self.retweet_count,
            "reply_count": self.reply_count,
            "quote_count": self.quote_count,
            "view_count": self.view_count,
            "url": self.url,
            "source": self.source,
            "lang": self.lang,
        }

    @classmethod
    def from_dict(cls, data: dict) -> QuotedTweet:
        """Create QuotedTweet from dict."""
        return cls(
            id=data["id"],
            full_text=data.get("full_text") or "",
            author_name=data["author_name"],
            author_username=data["author_username"],
            created_at=data["created_at"],
            like_count=data.get("like_count", 0),
            retweet_count=data.get("retweet_count", 0),
            reply_count=data.get("reply_count", 0),
            quote_count=data.get("quote_count", 0),
            view_count=data.get("view_count", 0),
            url=data["url"],
            source=data.get("source", ""),
            lang=data.get("lang", ""),
        )


class QuotedClient:
    """Client for fetching quoted tweets from FxTwitter."""

    def __init__(self):
        self.base_url = FXTWITTER_BASE_URL
        self.cache_dir = CACHE_DIR
        self.ttl = CACHE_TTL["quoted"]
        self._max_retries = REQUEST_MAX_RETRIES
        self._backoff_factor = REQUEST_BACKOFF_FACTOR
        self._timeout = REQUEST_TIMEOUT
        self.proxy = PROXY
        self._ensure_cache_dir()

    def _ensure_cache_dir(self) -> None:
        """Ensure cache directory exists."""
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _cache_path(self, tweet_id: str) -> Path:
        """Get cache file path for tweet."""
        return self.cache_dir / "quoted" / f"{tweet_id}.json"

    def _get_cached(self, tweet_id: str) -> Optional[QuotedTweet]:
        """Load tweet from cache if valid."""
        cache_path = self._cache_path(tweet_id)
        if not cache_path.exists():
            return None

        mtime = cache_path.stat().st_mtime
        if time.time() - mtime > self.ttl:
            logger.debug(f"Cache expired for tweet {tweet_id}")
            return None

        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return QuotedTweet.from_dict(data)
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Failed to read cache for {tweet_id}: {e}")
            return None

    def _set_cached(self, tweet: QuotedTweet) -> None:
        """Save tweet to cache."""
        cache_path = self._cache_path(tweet.id)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(tweet.to_dict(), f, ensure_ascii=False, indent=2)
        except OSError as e:
            logger.warning(f"Failed to write cache for {tweet.id}: {e}")

    def _fetch(self, tweet_id: str) -> QuotedTweet:
        """Fetch tweet from FxTwitter with retry."""
        url = f"{self.base_url}/status/{tweet_id}"
        last_err: Exception | None = None

        for attempt in range(self._max_retries):
            try:
                req = urllib.request.Request(url)
                if self.proxy:
                    proxy_handler = urllib.request.ProxyHandler({"http": self.proxy, "https": self.proxy})
                    opener = urllib.request.build_opener(proxy_handler)
                else:
                    opener = urllib.request.build_opener()
                with opener.open(req, timeout=self._timeout) as resp:
                    data = json.loads(resp.read().decode())
                    return self._parse_tweet(data)
            except json.JSONDecodeError as e:
                last_err = e
                wait = (2**attempt) * self._backoff_factor
                logger.warning(
                    "JSON decode failed, attempt %d, waiting %.1fs: %s",
                    attempt + 1,
                    wait,
                    e,
                )
                if attempt < self._max_retries - 1:
                    time.sleep(wait)
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
                        raise TweetNotFound(f"Tweet not found: {tweet_id}") from e
                    logger.error("HTTP %d: %s", e.code, e.reason)
                    raise TweetAPIError(f"HTTP {e.code}: {e.reason}") from e
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

        raise RuntimeError(
            f"Failed after {self._max_retries} attempts"
        ) from last_err

    def _parse_tweet(self, data: dict) -> QuotedTweet:
        """Parse tweet data from FxTwitter response."""
        code = data.get("code")
        if code != 200:
            raise TweetAPIError(f"Unexpected response code: {code}")

        tweet = data.get("tweet", {})

        tweet_id = str(tweet.get("id", "") or tweet.get("rest_id", "") or "")

        full_text_raw = tweet.get("raw_text", "")
        if isinstance(full_text_raw, dict):
            full_text = full_text_raw.get("text", "")
        elif isinstance(full_text_raw, str):
            full_text = full_text_raw
        else:
            full_text = ""

        author_data = tweet.get("author", {})
        if isinstance(author_data, dict):
            author_name = author_data.get("name") or "Unknown"
            author_username = author_data.get("screen_name") or "unknown"
        else:
            author_name = "Unknown"
            author_username = "unknown"

        created_at = tweet.get("created_at", "")

        like_count = tweet.get("likes", 0) or tweet.get("favorite_count", 0) or 0
        retweet_count = tweet.get("retweets", 0) or tweet.get("retweet_count", 0) or 0
        reply_count = tweet.get("replies", 0) or tweet.get("reply_count", 0) or 0
        quote_count = tweet.get("quotes", 0) or tweet.get("quote_count", 0) or 0
        view_count = tweet.get("views", 0) or tweet.get("viewCount", 0) or 0

        url = f"https://x.com/{author_username}/status/{tweet_id}"

        source = tweet.get("source", "")

        lang = tweet.get("lang", "")

        return QuotedTweet(
            id=tweet_id,
            full_text=full_text,
            author_name=author_name,
            author_username=author_username,
            created_at=created_at,
            like_count=like_count,
            retweet_count=retweet_count,
            reply_count=reply_count,
            quote_count=quote_count,
            view_count=view_count,
            url=url,
            source=source,
            lang=lang,
        )

    def get(self, tweet_id: str, *, skip_cache: bool = False) -> QuotedTweet:
        """
        Get tweet by ID.

        Args:
            tweet_id: The tweet ID.
            skip_cache: If True, bypass cache read/write for this request.

        Returns:
            QuotedTweet object.

        Raises:
            TweetNotFound: If tweet does not exist.
            TweetAPIError: If API returns an error.
        """
        if not skip_cache:
            cached = self._get_cached(tweet_id)
            if cached is not None:
                logger.info(f"Tweet {tweet_id} cache hit")
                return cached
        tweet = self._fetch(tweet_id)
        if not skip_cache:
            self._set_cached(tweet)
        return tweet
