#!/usr/bin/env python3
"""
上传书签深度报告草稿到 Notion DB。

用法（在 x-bookmark-reports/ 目录下运行）：

  # 草稿上传（原有功能）
  python3 bin/upload_to_notion.py              # dry-run，只打印，不写 Notion
  python3 bin/upload_to_notion.py --live       # 真实上传
  python3 bin/upload_to_notion.py --limit 5   # 最多处理 5 个新文件
  python3 bin/upload_to_notion.py --file output/bookmark-deep-xxx.md  # 测试单文件

  # 成品上传（新增 --mode finished）
  python3 bin/upload_to_notion.py --mode finished              # dry-run 成品
  python3 bin/upload_to_notion.py --mode finished --live       # 真实上传成品
  python3 bin/upload_to_notion.py --mode finished --file output/article-final/xxx.md

环境变量（在 .env 中配置）：
  NOTION_TOKEN        Notion Integration Token（必填）
  NOTION_DB_ID        目标 Database ID（必填）
  NOTION_UPLOAD_LIVE  true/false，是否真实上传（默认 false，即 dry-run）
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# ------------------------------------------------------------------ env load
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    # dotenv not available; fall back to stdlib parser
    _env_file = ROOT / ".env"
    if _env_file.exists():
        with open(_env_file, encoding="utf-8") as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and not _line.startswith("#") and "=" in _line:
                    _k, _, _v = _line.partition("=")
                    _k = _k.strip()
                    _v = _v.strip()
                    if len(_v) >= 2 and _v[0] == _v[-1] and _v[0] in ('"', "'"):
                        _v = _v[1:-1]
                    if _k and _k not in os.environ:
                        os.environ[_k] = _v

import urllib.request
import urllib.error

# ------------------------------------------------------------------ config
NOTION_TOKEN = os.getenv("NOTION_TOKEN", "")
NOTION_DB_ID = os.getenv("NOTION_DB_ID", "")
_LIVE_ENV = os.getenv("NOTION_UPLOAD_LIVE", "false").strip().lower() in ("1", "true", "yes")

OUTPUT_DIR = ROOT / "output"
UPLOAD_STATE_FILE = OUTPUT_DIR / ".notion-upload-state.json"
NOTION_VERSION = "2022-06-28"
NOTION_API = "https://api.notion.com/v1"

# Notion API limits: max 100 blocks per request
_BLOCKS_PER_CHUNK = 25

# Batch upload throttle: upload N articles, then pause M seconds
# Notion 官方限速 ~3 req/s；600s 批暂停曾把 900 篇积压拖成 15h（B-UPLOAD-PACING-AMPLIFY）
_ARTICLES_PER_BATCH = 10
_BATCH_PAUSE_SECONDS = 60

# Finished article defaults
ARTICLE_FINAL_DIR = ROOT / "output" / "article-final"
FINISHED_STATE_FILE = OUTPUT_DIR / ".notion-finished-state.json"
DB_SCHEMA_CACHE = OUTPUT_DIR / ".notion-db-schema.json"


# ================================================================== helpers

def _notion_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    }


_MAX_API_RETRIES = 3
_RETRY_BACKOFF = [30, 60, 120]  # seconds to wait before retry 1, 2, 3


def _build_opener() -> urllib.request.OpenerDirector:
    """Build a urllib opener, respecting proxy settings and TUN mode."""
    proxy_url = os.getenv("PROXY") or os.getenv("https_proxy") or os.getenv("http_proxy")
    if proxy_url:
        import socket
        try:
            host_port = proxy_url.split("://")[-1]
            host, port_str = host_port.rsplit(":", 1)
            sock = socket.create_connection((host, int(port_str)), timeout=1)
            sock.close()
            return urllib.request.build_opener(
                urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url})
            )
        except OSError:
            pass
    return urllib.request.build_opener()


def _api_request(method: str, path: str, payload: Any = None) -> dict:
    """Low-level Notion API call with automatic retry on Cloudflare 403.

    Network routing notes:
    - On macOS with Clash/V2Ray TUN (auto-route), all traffic is captured at the
      network layer, so using the default urllib opener is sufficient.
    - If PROXY env var is set AND the port is reachable (HTTP proxy mode), we use
      an explicit ProxyHandler so the request goes through the proxy.
    - Do NOT pass ProxyHandler({}) — an empty proxy dict explicitly bypasses TUN.
    """
    url = f"{NOTION_API}{path}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    opener = _build_opener()

    last_err: RuntimeError | None = None
    for attempt in range(_MAX_API_RETRIES + 1):
        req = urllib.request.Request(url, data=data, headers=_notion_headers(), method=method)
        try:
            with opener.open(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            last_err = RuntimeError(f"Notion API {method} {path} → HTTP {e.code}: {body[:200]}")
            if e.code == 403 and attempt < _MAX_API_RETRIES:
                wait = _RETRY_BACKOFF[attempt]
                print(
                    f"  [RETRY] {method} {path} got 403, "
                    f"waiting {wait}s before retry {attempt + 1}/{_MAX_API_RETRIES}...",
                    file=sys.stderr,
                )
                time.sleep(wait)
                continue
            raise last_err from e
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            last_err = RuntimeError(f"Notion API {method} {path} → {e}")
            if attempt < _MAX_API_RETRIES:
                wait = _RETRY_BACKOFF[attempt]
                print(
                    f"  [RETRY] {method} {path} network error, "
                    f"waiting {wait}s before retry {attempt + 1}/{_MAX_API_RETRIES}...",
                    file=sys.stderr,
                )
                time.sleep(wait)
                continue
            raise last_err from e
    raise last_err  # type: ignore[misc]


# ================================================================== state file

def _load_upload_state() -> dict[str, Any]:
    if not UPLOAD_STATE_FILE.exists():
        return {"uploaded": []}
    try:
        with open(UPLOAD_STATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {"uploaded": list(data.get("uploaded") or [])}
    except (json.JSONDecodeError, OSError):
        return {"uploaded": []}


def _save_upload_state(state: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    tmp_fd, tmp_path = tempfile.mkstemp(dir=OUTPUT_DIR, suffix=".tmp")
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, UPLOAD_STATE_FILE)
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


# ================================================================== markdown parser

def _parse_front_matter(text: str) -> tuple[dict[str, str], str]:
    """Split YAML front matter (between --- delimiters) from body.
    Returns (meta_dict, body_text).
    """
    meta: dict[str, str] = {}
    if not text.startswith("---"):
        return meta, text
    end = text.find("\n---", 3)
    if end == -1:
        return meta, text
    fm_block = text[3:end].strip()
    body = text[end + 4:].lstrip("\n")
    for line in fm_block.splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            meta[k.strip()] = v.strip()
    return meta, body


def _extract_tweet_url(body: str) -> str:
    """Return first https://x.com/.../status/... URL found in body."""
    m = re.search(r"https://x\.com/\S+/status/\d+", body)
    return m.group(0) if m else ""


def _extract_title(body: str) -> str:
    """Return first **bold** text, falling back to first non-empty line."""
    m = re.search(r"\*\*(.+?)\*\*", body)
    if m:
        return m.group(1).strip().rstrip("*").strip()
    for line in body.splitlines():
        line = line.strip()
        if line and not line.startswith(("#", ">", "-", "[")):
            return line[:200]
    return ""


def _parse_published_at(raw: str) -> Optional[str]:
    """Convert published-at string to ISO 8601 date (YYYY-MM-DD).

    Accepts both formats found in bookmarks.json:
    - rettiwt-api v4 (Twitter native): 'Tue Mar 31 09:39:04 +0000 2026'
    - rettiwt-api v7 (ISO 8601):       '2026-04-20T01:30:35.000Z'
    """
    if not raw:
        return None
    for fmt in ("%a %b %d %H:%M:%S %z %Y", "%a %b %d %H:%M:%S +0000 %Y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return None


def _extract_author_handle(raw: str) -> str:
    """'@timtimtim_eth (timtimtim)' → '@timtimtim_eth'"""
    if not raw:
        return ""
    m = re.match(r"(@\S+)", raw.strip())
    return m.group(1) if m else raw.split()[0]


# ================================================================== Notion block builder

def _text_obj(content: str) -> dict:
    return {"type": "text", "text": {"content": content[:1900]}}


def _paragraph_block(text: str) -> dict:
    return {
        "object": "block",
        "type": "paragraph",
        "paragraph": {"rich_text": [_text_obj(text)]},
    }


def _heading_block(text: str, level: int) -> dict:
    t = f"heading_{min(level, 3)}"
    return {
        "object": "block",
        "type": t,
        t: {"rich_text": [_text_obj(text)]},
    }


def _quote_block(text: str) -> dict:
    return {
        "object": "block",
        "type": "quote",
        "quote": {"rich_text": [_text_obj(text)]},
    }


def _bullet_block(text: str) -> dict:
    return {
        "object": "block",
        "type": "bulleted_list_item",
        "bulleted_list_item": {"rich_text": [_text_obj(text)]},
    }


def _divider_block() -> dict:
    return {"object": "block", "type": "divider", "divider": {}}


def _code_block(text: str) -> dict:
    return {
        "object": "block",
        "type": "code",
        "code": {
            "rich_text": [{"type": "text", "text": {"content": text[:1900]}}],
            "language": "plain text",
        },
    }


def _md_to_blocks(body: str) -> list[dict]:
    """Convert Markdown body to Notion blocks.
    Handles headings, quotes, bullets, fenced code blocks, tables,
    blank-line separators, and paragraphs.
    """
    blocks: list[dict] = []
    para_lines: list[str] = []
    in_code_block = False
    code_lines: list[str] = []

    def flush_para() -> None:
        text = "\n".join(para_lines).strip()
        para_lines.clear()
        if text:
            # Notion paragraph limit: 2000 chars (counted in UTF-16 units);
            # use 1900 as safe limit to account for emoji (each emoji = 2 UTF-16 units)
            while len(text) > 1900:
                blocks.append(_paragraph_block(text[:1900]))
                text = text[1900:]
            blocks.append(_paragraph_block(text))

    def flush_code() -> None:
        text = "\n".join(code_lines).strip()
        code_lines.clear()
        if text:
            # Split long code blocks at 1900-char boundary
            while len(text) > 1900:
                blocks.append(_code_block(text[:1900]))
                text = text[1900:]
            blocks.append(_code_block(text))

    for raw_line in body.splitlines():
        line = raw_line.rstrip()

        # Fenced code block toggle
        if line.startswith("```"):
            if not in_code_block:
                flush_para()
                in_code_block = True
                # Optional language hint after opening fence — discard it (we use plain text)
            else:
                flush_code()
                in_code_block = False
            continue

        # Inside a fenced code block: accumulate verbatim
        if in_code_block:
            code_lines.append(raw_line.rstrip())
            continue

        # Blank line → flush paragraph
        if not line:
            flush_para()
            continue

        # Heading
        hm = re.match(r"^(#{1,3})\s+(.*)", line)
        if hm:
            flush_para()
            blocks.append(_heading_block(hm.group(2).strip(), len(hm.group(1))))
            continue

        # Blockquote
        if line.startswith("> "):
            flush_para()
            blocks.append(_quote_block(line[2:]))
            continue

        # Bullet list
        bm = re.match(r"^[-*]\s+(.*)", line)
        if bm:
            flush_para()
            blocks.append(_bullet_block(bm.group(1)))
            continue

        # Horizontal rule → divider
        if re.match(r"^-{3,}$", line) or re.match(r"^={3,}$", line):
            flush_para()
            blocks.append(_divider_block())
            continue

        # Markdown table separator row (|---|---|) → skip silently
        if re.match(r"^\|[-| :]+\|$", line):
            continue

        # Markdown table header / data row → render as paragraph with pipes stripped
        if line.startswith("|") and line.endswith("|"):
            flush_para()
            # Strip leading/trailing pipes, split cells, join with  ·
            cells = [c.strip() for c in line[1:-1].split("|")]
            row_text = "  ·  ".join(c for c in cells if c)
            if row_text:
                blocks.append(_paragraph_block(row_text))
            continue

        # Everything else: accumulate as paragraph
        para_lines.append(line)

    # Flush any trailing content (handles unclosed code fences gracefully)
    if in_code_block:
        flush_code()
    else:
        flush_para()

    # Notion hard limit: 100 blocks per create-page call; we'll chunk on upload
    return blocks


# ================================================================== upload logic

def _build_page_payload(meta: dict, body: str, blocks_chunk: list[dict]) -> dict:
    """Build the Notion create-page request body."""
    title = _extract_title(body) or f"书签草稿（{meta.get('StartedAt', '')[:10]}）"
    author = _extract_author_handle(meta.get("Author", ""))
    tweet_url = _extract_tweet_url(body)
    pub_date = _parse_published_at(meta.get("PublishedAt", ""))

    properties: dict[str, Any] = {
        "Name": {"title": [_text_obj(title)]},
        "来源": {"select": {"name": "X书签"}},
        "状态": {"select": {"name": "待处理"}},
    }
    if author:
        properties["作者"] = {"rich_text": [_text_obj(author)]}
    if tweet_url:
        properties["文章链接"] = {"url": tweet_url}
    if pub_date:
        properties["发布时间"] = {"date": {"start": pub_date}}

    return {
        "parent": {"database_id": NOTION_DB_ID},
        "properties": properties,
        "children": blocks_chunk,
    }


def _append_blocks(page_id: str, blocks: list[dict]) -> None:
    """Append blocks to an already-created page in chunks with inter-chunk delay."""
    for i in range(0, len(blocks), _BLOCKS_PER_CHUNK):
        chunk = blocks[i: i + _BLOCKS_PER_CHUNK]
        _api_request("PATCH", f"/blocks/{page_id}/children", {"children": chunk})
        if i + _BLOCKS_PER_CHUNK < len(blocks):
            time.sleep(1.0)  # 1s between PATCH calls to avoid burst rate-limiting


def upload_file(md_path: Path, live: bool) -> tuple[str, str]:
    """Upload a single Markdown file to Notion.

    Returns (status, message) where status is one of:
        "ok"       - POST /pages and all PATCH /blocks succeeded
        "partial"  - POST /pages succeeded but one or more PATCH /blocks failed;
                     the Notion page exists (possibly with empty or partial content)
        "failed"   - POST /pages failed; no Notion page was created
        "dry-run"  - dry-run mode, nothing was actually uploaded

    CRITICAL: The caller MUST treat "ok" and "partial" as "this file is already
    represented in Notion" and record it in the upload state file. Retrying a
    "partial" file on the next run would create a duplicate empty/partial page,
    because POST /pages would succeed again for the same source.
    """
    text = md_path.read_text(encoding="utf-8")
    meta, body = _parse_front_matter(text)
    blocks = _md_to_blocks(body)

    title = _extract_title(body) or md_path.stem
    tweet_url = _extract_tweet_url(body)
    author = _extract_author_handle(meta.get("Author", ""))
    pub_date = _parse_published_at(meta.get("PublishedAt", ""))

    if not live:
        print(f"  [DRY-RUN] {md_path.name}")
        print(f"    标题   : {title[:80]}")
        print(f"    作者   : {author}")
        print(f"    推文   : {tweet_url}")
        print(f"    发布日 : {pub_date}")
        print(f"    Blocks : {len(blocks)}")
        return "dry-run", "dry-run"

    # Create page with NO children to avoid Cloudflare WAF blocking large payloads;
    # append all blocks separately via PATCH (chunked).
    payload = _build_page_payload(meta, body, [])
    try:
        result = _api_request("POST", "/pages", payload)
    except Exception as e:
        return "failed", f"POST /pages failed: {e}"

    page_id = result.get("id", "")
    if not page_id:
        return "failed", "POST /pages returned no page_id"

    # Page now exists in Notion. Any further failure must be reported as "partial"
    # (not "failed") so the caller records this file as uploaded and avoids
    # creating another empty page on the next run.
    if blocks:
        time.sleep(5)
        try:
            _append_blocks(page_id, blocks)
        except Exception as e:
            return "partial", f"page_id={page_id} (PATCH /blocks failed: {e})"

    return "ok", f"page_id={page_id}"


# ================================================================== finished mode helpers

def _load_finished_state() -> dict[str, Any]:
    """Load state for finished article uploads."""
    if not FINISHED_STATE_FILE.exists():
        return {"uploaded": []}
    try:
        with open(FINISHED_STATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {"uploaded": list(data.get("uploaded") or [])}
    except (json.JSONDecodeError, OSError):
        return {"uploaded": []}


def _save_finished_state(state: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    tmp_fd, tmp_path = tempfile.mkstemp(dir=OUTPUT_DIR, suffix=".tmp")
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, FINISHED_STATE_FILE)
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _fetch_db_schema() -> dict[str, Any]:
    """Fetch and cache the Notion DB properties schema."""
    if DB_SCHEMA_CACHE.exists():
        try:
            with open(DB_SCHEMA_CACHE, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    try:
        result = _api_request("GET", f"/databases/{NOTION_DB_ID}")
        schema = result.get("properties", {})
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        DB_SCHEMA_CACHE.write_text(
            json.dumps(schema, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return schema
    except Exception as e:
        print(f"  [WARN] Could not fetch DB schema: {e}", file=sys.stderr)
        return {}


def _parse_finished_frontmatter(text: str) -> tuple[dict[str, str], str]:
    """Parse frontmatter from a finished article .md file."""
    meta: dict[str, str] = {}
    if not text.startswith("---"):
        return meta, text
    end = text.find("\n---", 3)
    if end == -1:
        return meta, text
    fm_block = text[3:end].strip()
    body = text[end + 4:].lstrip("\n")
    for line in fm_block.splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            val = v.strip()
            if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
                val = val[1:-1]
            meta[k.strip()] = val
    return meta, body


def _build_finished_payload(meta: dict[str, str], body: str) -> dict[str, Any]:
    """Build Notion create-page payload for a finished article."""
    title = meta.get("title") or "未命名文章"
    author = meta.get("author") or ""
    source_url = meta.get("source_url") or ""
    icon_emoji = meta.get("notion_icon") or "\U0001f4cc"

    # Parse tags
    tags_raw = meta.get("tags", "[]")
    try:
        tags = json.loads(tags_raw) if isinstance(tags_raw, str) else tags_raw
    except json.JSONDecodeError:
        tags = []

    # Discover DB schema to decide tag field type
    schema = _fetch_db_schema()
    tag_prop = schema.get("\u6807\u7b7e") or schema.get("tags") or schema.get("Tags")

    properties: dict[str, Any] = {
        "Name": {"title": [_text_obj(title)]},
        "\u6765\u6e90": {"select": {"name": "X\u4e66\u7b7e"}},
        "\u72b6\u6001": {"select": {"name": "\u5df2\u53d1\u5e03"}},
    }
    if author:
        properties["\u4f5c\u8005"] = {"rich_text": [_text_obj(author)]}
    if source_url:
        properties["\u6587\u7ae0\u94fe\u63a5"] = {"url": source_url}

    # Published date from generated_at
    gen_at = meta.get("generated_at", "")
    if gen_at:
        try:
            from datetime import datetime as _dt
            dt = _dt.fromisoformat(gen_at.replace("Z", "+00:00"))
            properties["\u53d1\u5e03\u65f6\u95f4"] = {"date": {"start": dt.date().isoformat()}}
        except (ValueError, ImportError):
            pass

    # Tags — use multi_select if the DB property exists and is multi_select
    if tags and tag_prop:
        prop_type = tag_prop.get("type", "")
        if prop_type == "multi_select":
            properties["\u6807\u7b7e"] = {
                "multi_select": [{"name": t} for t in tags[:10]]
            }
        elif prop_type == "rich_text":
            properties["\u6807\u7b7e"] = {
                "rich_text": [_text_obj(", ".join(tags))]
            }
    elif tags:
        # No schema info, use rich_text as safe fallback
        properties["\u6807\u7b7e"] = {
            "rich_text": [_text_obj(", ".join(tags))]
        }

    payload: dict[str, Any] = {
        "parent": {"database_id": NOTION_DB_ID},
        "properties": properties,
        "children": [],
    }

    # Set page icon
    payload["icon"] = {"type": "emoji", "emoji": icon_emoji}

    return payload


def _check_duplicate_in_notion(source_url: str) -> str | None:
    """Query Notion DB for an existing page with the same source_url.

    Returns the page_id if found, None otherwise.
    """
    if not source_url or not NOTION_DB_ID:
        return None
    try:
        payload = {
            "filter": {
                "property": "\u6587\u7ae0\u94fe\u63a5",
                "url": {"equals": source_url},
            },
            "page_size": 1,
        }
        result = _api_request("POST", f"/databases/{NOTION_DB_ID}/query", payload)
        pages = result.get("results", [])
        if pages:
            return pages[0].get("id", "")
    except Exception as e:
        print(f"  [WARN] Duplicate check failed: {e}", file=sys.stderr)
    return None


def upload_finished_file(md_path: Path, live: bool) -> tuple[str, str]:
    """Upload a finished article .md to Notion (status=已发布).

    Returns (status, message) with same semantics as upload_file(), plus:
        "skip-dup" - source_url 已存在于 Notion（仅做了 1 次查重读请求，未写入）；
                     调用方须记入 state 但无需按真实上传节奏限速
    """
    text = md_path.read_text(encoding="utf-8")
    meta, body = _parse_finished_frontmatter(text)

    # 最小正文字数门槛（PR-6）：rewrite 产出空/过短正文（如 reasoning 模型 max_tokens 被
    # reasoning_content 吃光导致 content=0）时不上传 Notion，避免产生空页面。
    MIN_BODY_CHARS = 300
    if len(body.strip()) < MIN_BODY_CHARS:
        print(f"  [SKIP-SHORT] {md_path.name} body too short ({len(body.strip())} chars < {MIN_BODY_CHARS})")
        return "failed", f"body_too_short {len(body.strip())} chars"

    blocks = _md_to_blocks(body)

    title = meta.get("title") or md_path.stem
    author = meta.get("author") or ""
    source_url = meta.get("source_url") or ""
    icon_emoji = meta.get("notion_icon") or "\U0001f4cc"
    tags_raw = meta.get("tags", "[]")
    try:
        tags = json.loads(tags_raw) if isinstance(tags_raw, str) else tags_raw
    except json.JSONDecodeError:
        tags = []

    if not live:
        print(f"  [DRY-RUN] {md_path.name}")
        print(f"    \u6807\u9898   : {title[:80]}")
        print(f"    \u4f5c\u8005   : {author}")
        print(f"    \u6765\u6e90   : {source_url}")
        print(f"    Icon  : {icon_emoji}")
        print(f"    \u6807\u7b7e   : {tags}")
        print(f"    Blocks : {len(blocks)}")
        return "dry-run", "dry-run"

    existing_page = _check_duplicate_in_notion(source_url)
    if existing_page:
        print(f"  [SKIP-DUP] {md_path.name} already in Notion (page_id={existing_page})")
        # skip-dup 单独状态：只做了 1 次查重读请求，调用方不必按"真实上传"节奏限速
        return "skip-dup", f"already_exists page_id={existing_page}"

    payload = _build_finished_payload(meta, body)
    try:
        result = _api_request("POST", "/pages", payload)
    except Exception as e:
        return "failed", f"POST /pages failed: {e}"

    page_id = result.get("id", "")
    if not page_id:
        return "failed", "POST /pages returned no page_id"

    if blocks:
        time.sleep(5)
        try:
            _append_blocks(page_id, blocks)
        except Exception as e:
            return "partial", f"page_id={page_id} (PATCH /blocks failed: {e})"

    return "ok", f"page_id={page_id}"


# ================================================================== main

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Upload bookmark Markdown to Notion DB"
    )
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument(
        "--live",
        action="store_true",
        help="真实上传到 Notion（覆盖 NOTION_UPLOAD_LIVE env）",
    )
    mode_group.add_argument(
        "--dry-run",
        dest="dry_run",
        action="store_true",
        help="只打印，不写 Notion（覆盖 NOTION_UPLOAD_LIVE env）",
    )
    parser.add_argument(
        "--mode",
        choices=["draft", "finished"],
        default="draft",
        help="上传模式：draft=草稿（默认），finished=成品文章",
    )
    parser.add_argument("--limit", type=int, default=0, help="最多处理 N 个新文件（0=全部）")
    parser.add_argument("--file", type=str, default="", help="只处理指定文件（测试用）")
    parser.add_argument(
        "--articles-per-batch",
        type=int,
        default=_ARTICLES_PER_BATCH,
        help=f"每批上传篇数（默认 {_ARTICLES_PER_BATCH}）",
    )
    parser.add_argument(
        "--batch-pause",
        type=int,
        default=_BATCH_PAUSE_SECONDS,
        help=f"批次间暂停秒数（默认 {_BATCH_PAUSE_SECONDS}）",
    )
    args = parser.parse_args()

    # Determine live/dry mode
    if args.live:
        live = True
    elif args.dry_run:
        live = False
    else:
        live = _LIVE_ENV

    if live and not NOTION_TOKEN:
        print("ERROR: NOTION_TOKEN 未配置，无法上传", file=sys.stderr)
        return 1
    if live and not NOTION_DB_ID:
        print("ERROR: NOTION_DB_ID 未配置，无法上传", file=sys.stderr)
        return 1

    # Route to the appropriate upload handler
    if args.mode == "finished":
        return _run_finished_mode(args, live)
    else:
        return _run_draft_mode(args, live)


def _run_draft_mode(args: argparse.Namespace, live: bool) -> int:
    """Original draft upload logic (bookmark-deep-*.md)."""
    # Gather target files
    if args.file:
        target_files = [Path(args.file)]
    else:
        target_files = sorted(OUTPUT_DIR.glob("bookmark-deep-*.md"))

    # Load state and filter already-uploaded
    state = _load_upload_state()
    uploaded_set: set[str] = set(state["uploaded"])
    pending = [f for f in target_files if f.name not in uploaded_set]
    if args.limit > 0:
        pending = pending[: args.limit]

    mode_label = "LIVE" if live else "DRY-RUN"
    print(f"[upload_to_notion] mode={mode_label}  draft  pending={len(pending)}  already_uploaded={len(uploaded_set)}")

    articles_per_batch = args.articles_per_batch
    batch_pause = args.batch_pause

    ok_count = 0
    partial_count = 0
    failed_count = 0

    for idx, md_path in enumerate(pending):
        # Batch pause: after every articles_per_batch articles, wait before continuing
        if live and idx > 0 and idx % articles_per_batch == 0:
            print(
                f"[upload_to_notion] Batch pause — processed {idx} articles. "
                f"Waiting {batch_pause}s to avoid rate-limiting ..."
            )
            time.sleep(batch_pause)
            print("[upload_to_notion] Resuming ...")

        try:
            status, msg = upload_file(md_path, live=live)
        except Exception as e:
            status, msg = "failed", f"unexpected error: {e}"

        if live and status in ("ok", "partial"):
            state["uploaded"].append(md_path.name)
            _save_upload_state(state)

        if status == "ok":
            ok_count += 1
            print(f"  [OK] {md_path.name} -> {msg}")
        elif status == "partial":
            partial_count += 1
            print(f"  [PARTIAL] {md_path.name} -> {msg}", file=sys.stderr)
        elif status == "dry-run":
            ok_count += 1
        else:
            failed_count += 1
            print(f"  [FAIL] {md_path.name}: {msg}", file=sys.stderr)

        if live:
            time.sleep(3)

    uploaded_count = ok_count + partial_count
    error_count = partial_count + failed_count

    print(
        f"[upload_to_notion] done — uploaded: {uploaded_count}, "
        f"skipped: {len(uploaded_set)}, errors: {error_count}"
    )
    return 0 if error_count == 0 else 1


def _run_finished_mode(args: argparse.Namespace, live: bool) -> int:
    """Upload finished articles (article-final/*.md) with status=已发布."""
    ARTICLE_FINAL_DIR.mkdir(parents=True, exist_ok=True)

    if args.file:
        target_files = [Path(args.file)]
    else:
        target_files = sorted(ARTICLE_FINAL_DIR.glob("*.md"))

    if not target_files:
        print(f"[upload_to_notion] No finished articles found in {ARTICLE_FINAL_DIR}")
        return 0

    # Load finished state
    state = _load_finished_state()
    uploaded_set: set[str] = set(state["uploaded"])
    pending = [f for f in target_files if f.name not in uploaded_set]
    if args.limit > 0:
        pending = pending[: args.limit]

    mode_label = "LIVE" if live else "DRY-RUN"
    print(f"[upload_to_notion] mode={mode_label}  finished  pending={len(pending)}  already_uploaded={len(uploaded_set)}")

    # Fetch DB schema on first run
    if not DB_SCHEMA_CACHE.exists() and live:
        _fetch_db_schema()

    articles_per_batch = args.articles_per_batch
    batch_pause = args.batch_pause

    ok_count = 0
    partial_count = 0
    failed_count = 0
    skip_dup_count = 0
    # 批暂停只统计真实上传：SKIP-DUP 仅 1 次查重读请求，
    # 若计入节奏会把大积压拖成十几小时（B-UPLOAD-PACING-AMPLIFY）
    uploads_since_pause = 0

    for md_path in pending:
        if live and uploads_since_pause >= articles_per_batch:
            print(
                f"[upload_to_notion] Batch pause — {uploads_since_pause} uploads. "
                f"Waiting {batch_pause}s ..."
            )
            time.sleep(batch_pause)
            uploads_since_pause = 0
            print("[upload_to_notion] Resuming ...")

        try:
            status, msg = upload_finished_file(md_path, live=live)
        except Exception as e:
            status, msg = "failed", f"unexpected error: {e}"

        if live and status in ("ok", "partial", "skip-dup"):
            state["uploaded"].append(md_path.name)
            _save_finished_state(state)

        if status == "ok":
            ok_count += 1
            print(f"  [OK] {md_path.name} -> {msg}")
        elif status == "skip-dup":
            skip_dup_count += 1
        elif status == "partial":
            partial_count += 1
            print(f"  [PARTIAL] {md_path.name} -> {msg}", file=sys.stderr)
        elif status == "dry-run":
            ok_count += 1
        else:
            failed_count += 1
            print(f"  [FAIL] {md_path.name}: {msg}", file=sys.stderr)

        if live:
            if status == "skip-dup":
                # 查重只发 1 个读请求，轻限速即可（Notion 限速 ~3 req/s）
                time.sleep(0.4)
            else:
                time.sleep(3)
                uploads_since_pause += 1

    uploaded_count = ok_count + partial_count
    error_count = partial_count + failed_count

    print(
        f"[upload_to_notion] finished done — uploaded: {uploaded_count}, "
        f"skipped: {len(uploaded_set) + skip_dup_count}, errors: {error_count}"
    )
    return 0 if error_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
