"""
Replies client using TwitterAPI.io
"""

import logging
import time
from typing import Any, Optional

import requests

from lib.config import (
    REQUEST_BACKOFF_FACTOR,
    REQUEST_MAX_RETRIES,
    REQUEST_TIMEOUT,
    TWITTER_API_BASE_URL,
    TWITTER_API_IO_KEY,
)

logger = logging.getLogger(__name__)


def _in_reply_to_tweet_id(tweet: dict) -> Optional[str]:
    """Extract parent tweet id from API tweet object."""
    refs = tweet.get("referenced_tweets") or tweet.get("referencedTweets") or []
    if isinstance(refs, list):
        for r in refs:
            if isinstance(r, dict) and str(r.get("type", "")).lower() in (
                "replied_to",
                "reply",
            ):
                tid = r.get("id")
                if tid is not None:
                    return str(tid)
    for key in (
        "in_reply_to_status_id",
        "in_reply_to_status_id_str",
        "in_reply_to_tweet_id",
        "inReplyToTweetId",
        "conversation_id",
    ):
        v = tweet.get(key)
        if v is not None and str(v).isdigit():
            return str(v)
    return None


def build_reply_tree(
    flat_replies: list[dict],
    root_tweet_id: str,
) -> list[dict]:
    """
    Organize flat replies into a nested tree using in_reply_to_tweet_id.

    Each node is a dict with original fields plus ``children`` (list of nodes).

    Args:
        flat_replies: Replies as returned by fetch_replies (with parent id set).
        root_tweet_id: Main tweet id (replies directly to this are roots).

    Returns:
        List of root nodes (order follows first occurrence in flat_replies).
    """
    if not flat_replies:
        return []

    root_id = str(root_tweet_id)
    nodes: dict[str, dict[str, Any]] = {}
    for r in flat_replies:
        rid = r.get("id")
        if rid is None:
            continue
        sid = str(rid)
        if sid not in nodes:
            nodes[sid] = {**r, "children": []}

    roots: list[dict[str, Any]] = []
    root_ids: set[str] = set()
    assigned: set[str] = set()

    for r in flat_replies:
        sid = str(r.get("id"))
        if sid not in nodes:
            continue
        parent = r.get("in_reply_to_tweet_id")
        parent = str(parent) if parent else None
        node = nodes[sid]
        if parent == root_id:
            if sid not in root_ids:
                roots.append(node)
                root_ids.add(sid)
        elif parent and parent in nodes:
            if sid not in assigned:
                nodes[parent]["children"].append(node)
                assigned.add(sid)
        else:
            if sid not in root_ids:
                roots.append(node)
                root_ids.add(sid)

    return roots


class RepliesClient:
    """Client for fetching tweet replies via TwitterAPI.io."""

    def __init__(self, config: Optional[dict] = None):
        self.config = config or {}
        self.base_url = self.config.get(
            "base_url", TWITTER_API_BASE_URL
        )
        self.api_key = self.config.get("api_key", TWITTER_API_IO_KEY)
        self.timeout = self.config.get("timeout", REQUEST_TIMEOUT)
        self._max_retries = REQUEST_MAX_RETRIES
        self._backoff_factor = REQUEST_BACKOFF_FACTOR

    def fetch_replies(
        self,
        tweet_id: str,
        max_pages: int = 5,
    ) -> Optional[dict]:
        """
        Fetch replies for a tweet.

        Args:
            tweet_id: The tweet ID
            max_pages: Maximum number of pages to fetch (default 5)

        Returns:
            Dictionary with replies data or None if failed
        """
        all_replies = []
        cursor = ""

        for page in range(max_pages):
            last_err: Exception | None = None

            for attempt in range(self._max_retries):
                try:
                    params = {"tweetId": tweet_id}
                    if cursor:
                        params["cursor"] = cursor

                    response = requests.get(
                        f"{self.base_url}/twitter/tweet/replies",
                        params=params,
                        headers={"x-api-key": self.api_key},
                        timeout=self.timeout,
                    )

                    if response.status_code == 429:
                        last_err = Exception(f"Rate limited (429) for {tweet_id}")
                        wait = (2**attempt) * self._backoff_factor
                        logger.warning(
                            "Rate limited (429) fetching replies for %s, "
                            "attempt %d, waiting %.1fs",
                            tweet_id,
                            attempt + 1,
                            wait,
                        )
                        if attempt < self._max_retries - 1:
                            time.sleep(wait)
                            continue
                        break

                    if response.status_code >= 500:
                        last_err = Exception(f"Server error {response.status_code} for {tweet_id}")
                        wait = (2**attempt) * self._backoff_factor
                        logger.warning(
                            "Server error %d fetching replies for %s, "
                            "attempt %d, waiting %.1fs",
                            response.status_code,
                            tweet_id,
                            attempt + 1,
                            wait,
                        )
                        if attempt < self._max_retries - 1:
                            time.sleep(wait)
                            continue
                        break

                    if response.status_code != 200:
                        last_err = Exception(f"HTTP {response.status_code} for {tweet_id}")
                        logger.warning(
                            "Failed to fetch replies for %s: HTTP %d",
                            tweet_id,
                            response.status_code,
                        )
                        break

                    data = response.json()

                    # API returns {"tweets": [...], "has_next_page": bool, "next_cursor": str}
                    tweets = data.get("tweets") or data.get("data") or []
                    if not tweets:
                        return {"count": len(all_replies), "replies": all_replies} if all_replies else None

                    for tweet in tweets:
                        author_info = tweet.get("author", {})
                        parent_id = _in_reply_to_tweet_id(tweet)
                        # Build t.co → expanded_url mapping from entities
                        entities = tweet.get("entities") or {}
                        url_map: dict[str, str] = {}
                        for u in (entities.get("urls") or []):
                            if isinstance(u, dict) and u.get("url") and u.get("expanded_url"):
                                url_map[u["url"]] = u["expanded_url"]
                        all_replies.append({
                            "id": tweet.get("id"),
                            "author": author_info.get("userName", ""),
                            "name": author_info.get("name", ""),
                            "text": tweet.get("text", ""),
                            "likes": tweet.get("like_count", 0) or tweet.get("likeCount", 0),
                            "retweets": tweet.get("retweet_count", 0) or tweet.get("retweetCount", 0),
                            "replies_count": tweet.get("reply_count", 0) or tweet.get("replyCount", 0),
                            "time": tweet.get("created_at", "") or tweet.get("createdAt", ""),
                            "in_reply_to_tweet_id": parent_id,
                            "url_map": url_map,
                        })

                    # Check for next page
                    has_next = (
                        data.get("has_next_page", False)
                        if isinstance(data.get("has_next_page"), bool)
                        else bool(data.get("has_next_page"))
                    )
                    if not has_next:
                        return {"count": len(all_replies), "replies": all_replies}

                    cursor = data.get("next_cursor", "") or data.get("cursor", "")
                    if not cursor:
                        return {"count": len(all_replies), "replies": all_replies}

                    break  # success

                except requests.RequestException as e:
                    last_err = e
                    wait = (2**attempt) * self._backoff_factor
                    logger.warning(
                        "Request failed fetching replies for %s, "
                        "attempt %d, waiting %.1fs: %s",
                        tweet_id,
                        attempt + 1,
                        wait,
                        e,
                    )
                    if attempt < self._max_retries - 1:
                        time.sleep(wait)

            if last_err is not None or not all_replies:
                break

        if not all_replies:
            return None

        return {
            "count": len(all_replies),
            "replies": all_replies,
        }

    def fetch_thread_context(self, tweet_id: str) -> Optional[dict]:
        """
        Fetch full thread context including parent tweet and replies.

        Args:
            tweet_id: The tweet ID

        Returns:
            Dictionary with thread context or None if failed
        """
        try:
            response = requests.get(
                f"{self.base_url}/twitter/tweet/thread_context",
                params={"tweetId": tweet_id},
                headers={"x-api-key": self.api_key},
                timeout=self.timeout,
            )

            if response.status_code != 200:
                logger.warning(
                    f"Failed to fetch thread context for {tweet_id}: "
                    f"HTTP {response.status_code}"
                )
                return None

            return response.json()

        except requests.RequestException as e:
            logger.error(f"Request failed: {e}")
            return None
