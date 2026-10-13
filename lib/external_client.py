"""External URL client for non-X/non-GitHub bookmarks.

包含三层能力：
1. URL 清洗与 IRI 编码（解决 t.co 粘连中文及非 ASCII 路径编码报错 B-COORD-URL-ASCII）；
2. 短链解包 _unshorten（用 curl/8.0 UA + _NoRedirect 直接读 301 Location，HTML meta-refresh 兜底，并持久化缓存 tco_map.json，解决 B-TCO-UNSHORTEN-BROKEN）；
3. 静态 urllib 抓取 + Cloudflare Browser Run (/browser-rendering/markdown) 动态渲染兜底（由 allow_browser 门控）。
"""

from __future__ import annotations

import hashlib
import html as _html_mod
import http.client
import json
import logging
import os
import re
import socket
import ssl
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from typing import Dict, Optional, Set, Tuple

from lib.cf_browser_client import fetch_markdown_via_cf
from lib.config import (
    CACHE_DIR,
    CACHE_TTL,
    PROXY,
    REQUEST_BACKOFF_FACTOR,
    REQUEST_MAX_RETRIES,
    REQUEST_TIMEOUT,
)

logger = logging.getLogger(__name__)

# 常见短链域名白名单（最多跟随 3 跳短链解包）
_SHORTENER_HOSTS: Set[str] = {
    "t.co",
    "bit.ly",
    "buff.ly",
    "tinyurl.com",
    "lnkd.in",
    "ow.ly",
    "is.gd",
    "dlvr.it",
    "ift.tt",
    "goo.gl",
    "shorturl.at",
}

# 不应该交给 Cloudflare Browser Run 渲染的域名后缀（社媒、视频流、聊天群、代码仓由专属 Client 处理）
_CF_EXCLUDED_HOST_SUFFIXES: Tuple[str, ...] = (
    "x.com",
    "twitter.com",
    "t.co",
    "twimg.com",
    "github.com",
    "youtube.com",
    "youtu.be",
    "discord.gg",
    "discord.com",
    "t.me",
    "telegram.me",
)

# SPA 空壳或反爬挑战页特征词（命中时即便字数 >= 300 也触发 CF 渲染兜底）
_SPA_OR_CHALLENGE_MARKERS: Tuple[str, ...] = (
    "enable javascript",
    "javascript is required",
    "you need to enable javascript",
    "just a moment...",
    "verifying you are human",
    "checking your browser",
)

# 持久化短链映射缓存（t.co 一旦生成永不改变，跨运行复用）
_TCO_MAP_PATH: Path = CACHE_DIR / "tco_map.json"
_tco_map_mem: Optional[Dict[str, str]] = None


class ExternalURLError(Exception):
    """Failed to fetch external URL (network or HTTP error)."""


class ExternalContentError(Exception):
    """External URL returned non-HTML or unexpected content."""


class ExternalParseError(Exception):
    """Failed to parse external content."""


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """禁止自动跟随 3xx 重定向，使 opener.open 抛出 HTTPError 从而直接读取 Location 头。"""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _host_matches(host: str, suffixes: Tuple[str, ...]) -> bool:
    """精确匹配域名或其子域名（避免 'x.com/' 子串误匹配 dropbox.com / nginx.com）。"""
    h = (host or "").lower().rstrip(".")
    if not h:
        return False
    for s in suffixes:
        if h == s or h.endswith("." + s):
            return True
    return False


def sanitize_url(raw_url: str) -> str:
    """清洗推文或正文中提取的 URL，处理末尾粘连的中文标点与非 ASCII IRI 字符（修复 B-COORD-URL-ASCII）。"""
    if not raw_url:
        return ""
    u = raw_url.strip()

    # 若是 t.co 短链，t.co 的 code 仅由字母数字组成，直接截掉后面粘连的中文或标点
    # 例如：https://t.co/98KEoySvFh<你的帐户ID>/billing -> https://t.co/98KEoySvFh
    m_tco = re.match(r"^(https?://t\.co/[A-Za-z0-9]+)", u, flags=re.IGNORECASE)
    if m_tco:
        return m_tco.group(1)

    # 剥离末尾常见的中英文标点、括号、弯引号
    u = u.rstrip(" \t\r\n.,;:'\"”’）)】》>!]?，。；：？！、")

    try:
        parsed = urllib.parse.urlsplit(u)
    except ValueError:
        return ""

    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return ""

    # 域名若全是中文句号等非法字符（如 https://。），转 IDNA 会失败或为空，直接丢弃
    host = parsed.hostname or ""
    if not host or all(ord(ch) > 127 for ch in host):
        try:
            host.encode("idna")
        except UnicodeError:
            return ""
    if host in ("。", "，", "."):
        return ""

    # 对 path / query / fragment 中的非 ASCII 字符做百分号编码，防止 urllib 报 ascii/latin-1 编码错误
    safe_path = urllib.parse.quote(parsed.path, safe="/:@!$&'()*+,;=~-._%")
    safe_query = urllib.parse.quote(parsed.query, safe="=&/:?@!$'()*+,;~-._%")
    safe_frag = urllib.parse.quote(parsed.fragment, safe="=&/:?@!$'()*+,;~-._%")
    try:
        netloc_ascii = parsed.netloc.encode("idna").decode("ascii")
    except UnicodeError:
        netloc_ascii = parsed.netloc

    return urllib.parse.urlunsplit(
        (parsed.scheme, netloc_ascii, safe_path, safe_query, safe_frag)
    )


def _load_tco_map() -> Dict[str, str]:
    """懒加载持久化短链映射表。"""
    global _tco_map_mem
    if _tco_map_mem is not None:
        return _tco_map_mem
    _tco_map_mem = {}
    if _TCO_MAP_PATH.exists():
        try:
            data = json.loads(_TCO_MAP_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                _tco_map_mem = {str(k): str(v) for k, v in data.items() if k and v}
        except (OSError, json.JSONDecodeError):
            _tco_map_mem = {}
    return _tco_map_mem


def _save_tco_map_entry(short_url: str, expanded_url: str) -> None:
    """将新解开的短链写入内存与磁盘映射表（原子替换）。"""
    mapping = _load_tco_map()
    if mapping.get(short_url) == expanded_url:
        return
    mapping[short_url] = expanded_url
    _TCO_MAP_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd, tmp_path = tempfile.mkstemp(
            prefix=".tco_map_", suffix=".tmp", dir=str(_TCO_MAP_PATH.parent)
        )
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(mapping, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, _TCO_MAP_PATH)
    except OSError as exc:
        logger.debug("Failed to persist tco_map.json: %s", exc)


def _extract_url_from_tco_html(html_text: str) -> Optional[str]:
    """当 t.co 返回 200 HTML 包装页时，从 meta-refresh、title 或 location.replace 中提取目标 URL。"""
    if not html_text:
        return None
    # 1. <META http-equiv="refresh" content="0;URL=https://...">
    m_meta = re.search(
        r'http-equiv=["\']?refresh["\']?[^>]*content=["\'][^"\']*url=(https?://[^"\'>\s]+)',
        html_text,
        flags=re.IGNORECASE,
    )
    if m_meta:
        return _html_mod.unescape(m_meta.group(1).strip())

    # 2. <title>https://...</title>
    m_title = re.search(
        r"<title[^>]*>\s*(https?://[^<\s]+)\s*</title>",
        html_text,
        flags=re.IGNORECASE,
    )
    if m_title:
        return _html_mod.unescape(m_title.group(1).strip())

    # 3. location.replace("https://...")
    m_js = re.search(
        r'location\.replace\(\s*["\'](https?://[^"\']+)["\']\s*\)',
        html_text,
        flags=re.IGNORECASE,
    )
    if m_js:
        val = m_js.group(1).replace("\\/", "/")
        return _html_mod.unescape(val.strip())

    return None


def html_to_text(html: str) -> str:
    """Convert HTML to plain text, stripping CSS/JS/script/style comments."""

    if not html:
        return ""

    # 1. Strip all <style>...</style> blocks first (including inline).
    text = html
    for _ in range(3):
        stripped, count = re.subn(
            r"<style[^>]*>.*?</style>",
            "",
            text,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if count == 0:
            break
        text = stripped

    # 2. Strip <script>...</script> blocks.
    for _ in range(3):
        stripped, count = re.subn(
            r"<script[^>]*>.*?</script>",
            "",
            text,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if count == 0:
            break
        text = stripped

    # 3. Strip HTML comments.
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)

    # 4. Parse structural HTML for block-level elements.
    class TextExtractor(HTMLParser):
        def __init__(self):
            super().__init__()
            self.text_parts: list[str] = []
            self.skip_tags = {
                "script",
                "style",
                "head",
                "noscript",
                "iframe",
                "textarea",
                "select",
            }
            self.skip_depth = 0
            self._inline_skip = False

        def handle_starttag(self, tag: str, attrs) -> None:
            if tag in self.skip_tags:
                self.skip_depth += 1
                self._inline_skip = True
            elif tag == "br":
                self.text_parts.append("\n")
            elif tag == "p":
                self.text_parts.append("\n\n")

        def handle_endtag(self, tag: str) -> None:
            if tag in self.skip_tags:
                self.skip_depth = max(0, self.skip_depth - 1)
                if self.skip_depth == 0:
                    self._inline_skip = False

        def handle_data(self, data: str) -> None:
            if not self._inline_skip:
                t = data.strip()
                if t:
                    self.text_parts.append(t + " ")

        def get_text(self) -> str:
            return "".join(self.text_parts)

    try:
        parser = TextExtractor()
        parser.feed(text)
        result = parser.get_text()
        result = re.sub(r" +", " ", result)
        result = re.sub(r"\n{3,}", "\n\n", result)
        return result.strip()
    except Exception:
        fallback = re.sub(
            r"<style[^>]*>.*?</style>", "", text, flags=re.IGNORECASE | re.DOTALL
        )
        fallback = re.sub(
            r"<script[^>]*>.*?</script>", "", fallback, flags=re.IGNORECASE | re.DOTALL
        )
        fallback = re.sub(r"<br\s*/?>", "\n", fallback)
        fallback = re.sub(r"</p>", "\n\n", fallback)
        fallback = re.sub(r"<[^>]+>", "", fallback)
        fallback = re.sub(r"\n{3,}", "\n\n", fallback)
        return fallback.strip()


def _extract_title_and_description(html: str) -> tuple[str, str]:
    """Extract title and meta description from HTML."""
    title = ""
    description = ""

    title_match = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
    if title_match:
        title = _html_mod.unescape(title_match.group(1).strip())

    desc_match = re.search(
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']',
        html,
        re.IGNORECASE,
    )
    if desc_match:
        description = _html_mod.unescape(desc_match.group(1).strip())
    else:
        desc_match = re.search(
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']description["\']',
            html,
            re.IGNORECASE,
        )
        if desc_match:
            description = _html_mod.unescape(desc_match.group(1).strip())

    return title, description


MAX_REDIRECTS = 10
MAX_RESPONSE_BYTES = 5 * 1024 * 1024

# 统一网络层可重试异常元组（兼容 Python 3.9 socket.timeout 非 TimeoutError 子类）
_NETWORK_EXCEPTIONS = (
    urllib.error.URLError,
    socket.timeout,
    TimeoutError,
    ConnectionError,
    http.client.HTTPException,
    ssl.SSLError,
)


def _is_html_content(content_type: str) -> bool:
    """Check if content type indicates HTML."""
    ct_lower = content_type.lower()
    return "text/html" in ct_lower or "application/xhtml" in ct_lower


def _needs_browser_render(body_text: str) -> bool:
    """判断静态抓取的正文是否为空壳/过短（< 300 字符）或命中 SPA/Challenge 提示词。"""
    stripped = (body_text or "").strip()
    if len(stripped) < 300:
        return True
    lower = stripped[:1500].lower()
    return any(marker in lower for marker in _SPA_OR_CHALLENGE_MARKERS)


def _is_cf_eligible_url(url: str) -> bool:
    """判断 URL 是否适合交由 Cloudflare Browser Run 渲染（排除 X/GitHub/YouTube/聊天群等）。"""
    if not url:
        return False
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.hostname or "").lower()
    if not host or _host_matches(host, _CF_EXCLUDED_HOST_SUFFIXES):
        return False
    # 排除明显的二进制/静态资源后缀
    path_lower = (parsed.path or "").lower()
    if path_lower.endswith(
        (".pdf", ".zip", ".tar.gz", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4", ".mp3")
    ):
        return False
    return True


class ExternalClient:
    """Client for fetching external (non-X/non-GitHub) URLs."""

    def __init__(self):
        self.cache_dir = CACHE_DIR
        self.ttl = CACHE_TTL["external"]
        self.proxy = PROXY
        self._max_retries = REQUEST_MAX_RETRIES
        self._backoff_factor = REQUEST_BACKOFF_FACTOR
        self._timeout = REQUEST_TIMEOUT
        self._ensure_cache_dir()

    def _ensure_cache_dir(self) -> None:
        """Ensure cache directory exists."""
        (self.cache_dir / "external").mkdir(parents=True, exist_ok=True)

    def _hash_url(self, url: str) -> str:
        """Generate MD5 hash of URL for cache filename."""
        return hashlib.md5(url.encode("utf-8", errors="replace")).hexdigest()

    def _cache_path(self, url: str) -> Path:
        """Get cache file path for URL."""
        url_hash = self._hash_url(url)
        return self.cache_dir / "external" / f"{url_hash}.json"

    def _get_cached(self, url: str) -> Optional[dict]:
        """Load external content from cache if valid."""
        cache_path = self._cache_path(url)
        if not cache_path.exists():
            return None

        mtime = cache_path.stat().st_mtime
        if time.time() - mtime > self.ttl:
            logger.debug("Cache expired for external URL: %s", url)
            return None

        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data
        except (json.JSONDecodeError, KeyError, OSError) as e:
            logger.warning("Failed to read cache for %s: %s", url, e)
            return None

    def _set_cached(self, url: str, data: dict) -> None:
        """Save external content to cache."""
        cache_path = self._cache_path(url)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except OSError as e:
            logger.warning("Failed to write cache for %s: %s", url, e)

    def _build_opener(self, *, follow_redirects: bool = True) -> urllib.request.OpenerDirector:
        """Build urllib opener with optional proxy and redirect control."""
        handlers: list = []
        if self.proxy:
            handlers.append(
                urllib.request.ProxyHandler({"http": self.proxy, "https": self.proxy})
            )
        if not follow_redirects:
            handlers.append(_NoRedirect())
        return urllib.request.build_opener(*handlers)

    def _unshorten(self, url: str) -> str:
        """解包 t.co 及常见短链（最多 3 跳）：
        1. 先查本地持久化映射表 tco_map.json；
        2. 使用 User-Agent: curl/8.0 + _NoRedirect 直接读取 301/302 Location 头
           （避免 Chrome UA 触发 t.co 返回 HTTP 200 + meta-refresh 空壳页）；
        3. 若仍收到 200 HTML，则从 meta-refresh / <title> / location.replace 提取目标 URL。
        """
        cleaned = sanitize_url(url)
        if not cleaned:
            return url

        tco_map = _load_tco_map()
        if cleaned in tco_map:
            return tco_map[cleaned]

        current = cleaned
        for _hop in range(3):
            try:
                host = (urllib.parse.urlparse(current).hostname or "").lower()
            except ValueError:
                break
            if host not in _SHORTENER_HOSTS:
                break

            next_url: Optional[str] = None
            opener = self._build_opener(follow_redirects=False)

            for attempt in range(self._max_retries):
                try:
                    req = urllib.request.Request(
                        current,
                        method="HEAD",
                        headers={"User-Agent": "curl/8.0"},
                    )
                    with opener.open(req, timeout=self._timeout) as resp:
                        # 若 HEAD 返回 200（未给 3xx），改用 GET 读取 HTML 包装页提取
                        if resp.status == 200:
                            req_get = urllib.request.Request(
                                current,
                                method="GET",
                                headers={"User-Agent": "curl/8.0"},
                            )
                            with opener.open(req_get, timeout=self._timeout) as resp_get:
                                raw_html = resp_get.read(32768).decode(
                                    "utf-8", errors="replace"
                                )
                                next_url = _extract_url_from_tco_html(raw_html)
                        break
                except urllib.error.HTTPError as e:
                    if 300 <= e.code < 400:
                        loc = e.headers.get("Location") if e.headers else None
                        if loc:
                            next_url = urllib.parse.urljoin(current, loc.strip())
                        break
                    if e.code in (403, 405, 501):
                        # HEAD 被拒时回退单次 GET
                        try:
                            req_get = urllib.request.Request(
                                current,
                                method="GET",
                                headers={"User-Agent": "curl/8.0"},
                            )
                            with opener.open(req_get, timeout=self._timeout) as resp_get:
                                raw_html = resp_get.read(32768).decode(
                                    "utf-8", errors="replace"
                                )
                                next_url = _extract_url_from_tco_html(raw_html)
                            break
                        except urllib.error.HTTPError as e2:
                            if 300 <= e2.code < 400 and e2.headers:
                                loc = e2.headers.get("Location")
                                if loc:
                                    next_url = urllib.parse.urljoin(current, loc.strip())
                                break
                    if attempt < self._max_retries - 1:
                        time.sleep((2**attempt) * self._backoff_factor)
                except _NETWORK_EXCEPTIONS as e:
                    if attempt < self._max_retries - 1:
                        time.sleep((2**attempt) * self._backoff_factor)
                    else:
                        logger.warning("Failed to unshorten %s: %s", current, e)

            if not next_url:
                break
            next_clean = sanitize_url(next_url) or next_url
            if next_clean == current:
                break
            current = next_clean

        if current != cleaned:
            logger.debug("Unshortened %s -> %s", cleaned, current)
            _save_tco_map_entry(cleaned, current)
        return current

    def unshorten(self, url: str) -> str:
        """Unshorten a t.co or shortlink URL to its final destination URL."""
        return self._unshorten(url)

    def _fetch(self, url: str) -> dict:
        """Fetch external URL via static urllib and extract content."""
        safe_url = sanitize_url(url)
        if not safe_url:
            raise ExternalURLError(f"Invalid URL after sanitization: {url!r}")

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.8,zh-CN;q=0.6",
        }

        current_url = safe_url
        redirect_hops = 0
        last_err: Optional[Exception] = None

        while redirect_hops < MAX_REDIRECTS:
            for attempt in range(self._max_retries):
                try:
                    req = urllib.request.Request(current_url, headers=headers)
                    opener = self._build_opener(follow_redirects=True)

                    with opener.open(req, timeout=self._timeout) as resp:
                        content_type = resp.headers.get(
                            "Content-Type", "application/octet-stream"
                        )
                        # 使用 resp.geturl() 获取真实重定向终点（修复 B-EXT-FINAL-URL-AND-PY39-EXC）
                        actual_final_url = resp.geturl() or current_url
                        raw_content = resp.read(MAX_RESPONSE_BYTES)

                        content_type_lower = content_type.lower().split(";")[0].strip()

                        if not _is_html_content(content_type):
                            return {
                                "original_url": url,
                                "final_url": actual_final_url,
                                "content": "",
                                "content_type": content_type_lower,
                                "title": "",
                                "description": "",
                                "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                                "fetch_method": "urllib",
                            }

                        try:
                            html = raw_content.decode("utf-8", errors="replace")
                        except UnicodeDecodeError:
                            html = raw_content.decode("latin-1", errors="replace")

                        title, description = _extract_title_and_description(html)
                        body_text = html_to_text(html)

                        return {
                            "original_url": url,
                            "final_url": actual_final_url,
                            "content": body_text,
                            "content_type": content_type_lower,
                            "title": title,
                            "description": description,
                            "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "fetch_method": "urllib",
                        }

                except urllib.error.HTTPError as e:
                    if 300 <= e.code < 400:
                        location = e.headers.get("Location") if e.headers else None
                        if location:
                            current_url = sanitize_url(
                                urllib.parse.urljoin(current_url, location)
                            )
                            redirect_hops += 1
                            break
                        raise ExternalURLError(
                            f"HTTP {e.code} redirect without Location header"
                        ) from e

                    last_err = e
                    if 400 <= e.code < 500 and e.code != 429:
                        raise ExternalURLError(f"HTTP {e.code}: {e.reason}") from e
                    wait = (2**attempt) * self._backoff_factor
                    logger.warning(
                        "HTTP error %d for %s, attempt %d, waiting %.1fs",
                        e.code,
                        current_url,
                        attempt + 1,
                        wait,
                    )
                    if attempt < self._max_retries - 1:
                        time.sleep(wait)
                    else:
                        raise ExternalURLError(
                            f"HTTP {e.code} after {self._max_retries} attempts"
                        ) from e

                except (*_NETWORK_EXCEPTIONS, UnicodeError, OSError) as e:
                    last_err = e
                    wait = (2**attempt) * self._backoff_factor
                    logger.warning(
                        "Request failed for %s, attempt %d, waiting %.1fs: %s",
                        current_url,
                        attempt + 1,
                        wait,
                        e,
                    )
                    if attempt < self._max_retries - 1:
                        time.sleep(wait)
                    else:
                        raise ExternalURLError(
                            f"Failed after {self._max_retries} attempts: {e}"
                        ) from e

        raise ExternalURLError(
            f"Too many redirects (> {MAX_REDIRECTS}) for {url}"
        ) from last_err

    def get_content(
        self,
        url: str,
        *,
        skip_cache: bool = False,
        allow_browser: bool = False,
    ) -> dict:
        """获取外部网页内容：
        1. 先解包 t.co 等短链；
        2. 优先走本地 24h 缓存（自动剔除历史未解包的 t.co 空缓存；若本次开启 allow_browser 而旧缓存静态正文过短且未试过 CF，则允许升级重抓）；
        3. 静态 urllib 抓取；若 allow_browser=True 且静态正文 < 300 字 / 命中 SPA 特征 / 遇 403 等错误，则调用 Cloudflare Browser Run 渲染 Markdown 兜底。
        """
        clean_input = sanitize_url(url)
        if not clean_input:
            raise ExternalURLError(f"Invalid external URL: {url!r}")

        if not skip_cache:
            cached = self._get_cached(clean_input)
            if cached is not None:
                c_final = str(cached.get("final_url") or "")
                c_body = str(cached.get("content") or "").strip()
                # 历史遗留的未解包 t.co 空缓存直接判为失效
                stale_tco = "t.co/" in c_final.lower() and not c_body
                # 若本次允许浏览器渲染，但旧缓存是静态抓空的短文且尚未尝试过 CF，则升级重抓
                needs_cf_upgrade = (
                    allow_browser
                    and _is_cf_eligible_url(c_final)
                    and len(c_body) < 300
                    and not cached.get("cf_attempted")
                )
                if not stale_tco and not needs_cf_upgrade:
                    logger.info("External URL cache hit: %s", clean_input)
                    return cached

        final_url = self._unshorten(clean_input)

        # 若解包后发现其实是 Twitter/X 内部链接，直接返回元信息由上层 coordinator 过滤，避免白抓 x.com 空壳
        try:
            final_host = (urllib.parse.urlparse(final_url).hostname or "").lower()
        except ValueError:
            final_host = ""
        if _host_matches(final_host, ("x.com", "twitter.com", "t.co", "twimg.com")):
            stub = {
                "original_url": url,
                "final_url": final_url,
                "content": "",
                "content_type": "text/html",
                "title": final_url,
                "description": "",
                "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "fetch_method": "skipped_twitter",
                "cf_attempted": True,
            }
            if not skip_cache:
                self._set_cached(clean_input, stub)
            return stub

        static_data: Optional[dict] = None
        static_err: Optional[Exception] = None

        try:
            static_data = self._fetch(final_url)
            if url != final_url:
                static_data["original_url"] = url
        except ExternalURLError as exc:
            static_err = exc
            err_msg = str(exc)
            # 404 / 410 / 401 属于明确不存在或需账号密码，不浪费 CF 浏览器额度
            if any(code in err_msg for code in ("HTTP 404", "HTTP 410", "HTTP 401")):
                raise

        # 判断是否需要触发 Cloudflare Browser Run 渲染兜底
        target_for_cf = (
            static_data.get("final_url", final_url) if static_data else final_url
        )
        should_try_cf = False
        if allow_browser and _is_cf_eligible_url(target_for_cf):
            if static_err is not None:
                should_try_cf = True
            elif static_data is not None:
                ct = str(static_data.get("content_type") or "text/html")
                if _is_html_content(ct) and _needs_browser_render(
                    str(static_data.get("content") or "")
                ):
                    should_try_cf = True

        if should_try_cf:
            cf_res = fetch_markdown_via_cf(target_for_cf)
            if cf_res and len((cf_res.get("content") or "").strip()) >= 80:
                merged = {
                    "original_url": url,
                    "final_url": target_for_cf,
                    "content": cf_res["content"],
                    "content_type": "text/html",
                    "title": cf_res.get("title")
                    or (static_data.get("title", "") if static_data else ""),
                    "description": cf_res.get("description")
                    or (static_data.get("description", "") if static_data else ""),
                    "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "fetch_method": "cf_browser",
                    "browser_ms": cf_res.get("browser_ms", 0.0),
                    "cf_attempted": True,
                }
                if not skip_cache:
                    self._set_cached(clean_input, merged)
                return merged

        if static_data is not None:
            if should_try_cf:
                static_data["cf_attempted"] = True
            if not skip_cache:
                self._set_cached(clean_input, static_data)
            return static_data

        assert static_err is not None
        raise static_err
