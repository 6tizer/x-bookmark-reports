"""Pipeline state management — reads and writes .article-pipeline-state.json."""

from __future__ import annotations

import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_DEFAULT_STATE: Dict[str, Any] = {
    "version": 1,
    "articles": {},
}


class PipelineState:
    """Read/write ``.article-pipeline-state.json`` with atomic saves."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._data: Dict[str, Any] = {}

    # ------------------------------------------------------------------
    # Load / save
    # ------------------------------------------------------------------

    def load(self) -> "PipelineState":
        """Load state from disk (or start empty if file missing/corrupt)."""
        if not self.path.exists():
            self._data = json.loads(json.dumps(_DEFAULT_STATE))
            return self
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                raw = json.load(f)
            if not isinstance(raw, dict) or "articles" not in raw:
                logger.warning("State file %s has unexpected shape, resetting", self.path)
                self._data = json.loads(json.dumps(_DEFAULT_STATE))
            else:
                self._data = raw
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Could not load state from %s: %s", self.path, exc)
            self._data = json.loads(json.dumps(_DEFAULT_STATE))
        return self

    def save(self) -> None:
        """Atomically persist current state to disk."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp_fd, tmp_path = tempfile.mkstemp(
            dir=str(self.path.parent), suffix=".tmp"
        )
        try:
            with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
                json.dump(self._data, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, str(self.path))
        except BaseException:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

    # ------------------------------------------------------------------
    # Article-level CRUD
    # ------------------------------------------------------------------

    def get(self, tweet_id: str) -> Optional[Dict[str, Any]]:
        """Return article state dict or None."""
        articles = self._data.get("articles", {})
        if not isinstance(articles, dict):
            return None
        entry = articles.get(tweet_id)
        return entry if isinstance(entry, dict) else None

    def upsert(self, tweet_id: str, **fields: Any) -> Dict[str, Any]:
        """Insert or update article entry, returning the new entry dict."""
        articles = self._data.setdefault("articles", {})
        if not isinstance(articles, dict):
            self._data["articles"] = {}
            articles = self._data["articles"]
        entry = articles.get(tweet_id, {})
        if not isinstance(entry, dict):
            entry = {}
        entry.update(fields)
        entry["updated_at"] = datetime.now(timezone.utc).isoformat()
        articles[tweet_id] = entry
        return entry

    def list_by_status(self, status: str) -> List[Dict[str, Any]]:
        """Return all articles matching *status*."""
        articles = self._data.get("articles", {})
        if not isinstance(articles, dict):
            return []
        return [
            {"tweet_id": tid, **v}
            for tid, v in articles.items()
            if isinstance(v, dict) and v.get("status") == status
        ]

    def all_entries(self) -> List[Dict[str, Any]]:
        """Return all article entries with tweet_id included."""
        articles = self._data.get("articles", {})
        if not isinstance(articles, dict):
            return []
        return [
            {"tweet_id": tid, **v}
            for tid, v in articles.items()
            if isinstance(v, dict)
        ]

    @property
    def data(self) -> Dict[str, Any]:
        """Read-only view of the raw state dict."""
        return self._data
