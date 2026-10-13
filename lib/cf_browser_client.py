"""Cloudflare Browser Run (/browser-rendering/markdown) 客户端与每日额度账本.

设计要点：
1. 纯标准库实现（urllib + json），同时兼容系统 Python 3.9（auto_run.sh）与 .venv Python 3.12（UI 触发）。
2. 三道防线：
   - 每日 UTC 时长账本（cache/cf_browser_usage.json）：累计响应头 X-Browser-Ms-Used，默认达 480,000ms（8 分钟）
     或遇 "time limit exceeded for today" 自动熔断至次日 UTC 零点。
   - 自适应限速：默认最小请求间隔 1.5s；一旦收到 HTTP 429，读取 Retry-After 退避重试 1 次，
     并将本进程后续间隔自动提升至 max(10.5s, Retry-After)。
   - 单进程调用次数上限（CF_BROWSER_MAX_CALLS_PER_RUN，默认 20）+ 失败 URL / 域名负缓存（7 天）。
"""

from __future__ import annotations

import datetime
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
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from lib import config

logger = logging.getLogger(__name__)

# 每日账本与负缓存文件路径
USAGE_LEDGER_PATH: Path = config.CACHE_DIR / "cf_browser_usage.json"

# 负缓存有效期：7 天（秒）
_NEGATIVE_CACHE_TTL = 7 * 24 * 3600
# 同一域名连续失败多少次后熔断该域名
_HOST_FAIL_STREAK_LIMIT = 3

# --- 模块级运行态（跨实例共享，防止单次批处理内重复打爆） ---
_cf_circuit_open: bool = False
_cf_call_count: int = 0
_cf_last_call_end: float = 0.0
_cf_min_interval: float = 1.5
_cf_consecutive_429: int = 0
_cf_consecutive_5xx: int = 0


def _utc_today_str() -> str:
    """返回当前 UTC 日期字符串（YYYY-MM-DD），与 Cloudflare 每日配额重置周期对齐。"""
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")


def _next_utc_midnight_ts() -> float:
    """返回下一个 UTC 零点的 Unix 时间戳。"""
    now = datetime.datetime.now(datetime.timezone.utc)
    tomorrow = (now + datetime.timedelta(days=1)).replace(
        hour=0, minute=0, second=5, microsecond=0
    )
    return tomorrow.timestamp()


def load_usage_ledger() -> Dict[str, Any]:
    """读取并按 UTC 日期归一化 Cloudflare Browser Run 使用账本。"""
    today = _utc_today_str()
    default_ledger: Dict[str, Any] = {
        "date_utc": today,
        "used_ms": 0.0,
        "calls": 0,
        "exhausted_until": 0.0,
        "last_error": "",
        "updated_at": "",
        "failed_urls": {},
        "failed_hosts": {},
    }
    if not USAGE_LEDGER_PATH.exists():
        return default_ledger
    try:
        raw = json.loads(USAGE_LEDGER_PATH.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return default_ledger
    except (OSError, json.JSONDecodeError):
        return default_ledger

    # 跨 UTC 日自动清零当日计数，保留未过期的负缓存
    now_ts = time.time()
    failed_urls = {
        k: v
        for k, v in (raw.get("failed_urls") or {}).items()
        if isinstance(v, (int, float)) and v > now_ts
    }
    failed_hosts = {
        k: v
        for k, v in (raw.get("failed_hosts") or {}).items()
        if isinstance(v, dict) and float(v.get("until") or 0) > now_ts
    }

    if raw.get("date_utc") != today:
        return {
            "date_utc": today,
            "used_ms": 0.0,
            "calls": 0,
            "exhausted_until": 0.0,
            "last_error": "",
            "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "failed_urls": failed_urls,
            "failed_hosts": failed_hosts,
        }

    return {
        "date_utc": today,
        "used_ms": float(raw.get("used_ms") or 0.0),
        "calls": int(raw.get("calls") or 0),
        "exhausted_until": float(raw.get("exhausted_until") or 0.0),
        "last_error": str(raw.get("last_error") or ""),
        "updated_at": str(raw.get("updated_at") or ""),
        "failed_urls": failed_urls,
        "failed_hosts": failed_hosts,
    }


def save_usage_ledger(ledger: Dict[str, Any]) -> None:
    """原子写入使用账本，防止并发读到半截 JSON。"""
    USAGE_LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
    ledger["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        fd, tmp_path = tempfile.mkstemp(
            prefix=".cf_usage_", suffix=".tmp", dir=str(USAGE_LEDGER_PATH.parent)
        )
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(ledger, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, USAGE_LEDGER_PATH)
    except OSError as exc:
        logger.warning("Failed to save CF browser usage ledger: %s", exc)


def _record_url_failure(ledger: Dict[str, Any], url: str, host: str, err_msg: str) -> None:
    """记录单个 URL 与所属域名的失败状态（连续失败 3 次熔断该域名 7 天）。"""
    now_ts = time.time()
    ledger.setdefault("failed_urls", {})[url] = now_ts + _NEGATIVE_CACHE_TTL
    hosts = ledger.setdefault("failed_hosts", {})
    h_entry = hosts.get(host) or {"streak": 0, "until": 0.0}
    streak = int(h_entry.get("streak") or 0) + 1
    until = (
        now_ts + _NEGATIVE_CACHE_TTL
        if streak >= _HOST_FAIL_STREAK_LIMIT
        else float(h_entry.get("until") or 0.0)
    )
    hosts[host] = {"streak": streak, "until": until}
    ledger["last_error"] = err_msg[:300]
    save_usage_ledger(ledger)


def _record_url_success(ledger: Dict[str, Any], host: str, ms_used: float) -> None:
    """记录成功调用消耗的浏览器毫秒数，并清零该域名的连续失败计数。"""
    ledger["used_ms"] = round(float(ledger.get("used_ms") or 0.0) + ms_used, 2)
    ledger["calls"] = int(ledger.get("calls") or 0) + 1
    hosts = ledger.get("failed_hosts") or {}
    if host in hosts:
        del hosts[host]
    save_usage_ledger(ledger)


def split_frontmatter(md_text: str) -> Tuple[Dict[str, str], str]:
    """拆分 CF /markdown 返回的可选 YAML frontmatter 与正文（纯标准库，不依赖 PyYAML）。"""
    if not md_text:
        return {}, ""
    normalized = md_text.lstrip("\ufeff")
    if not normalized.startswith("---\n"):
        return {}, normalized
    end = normalized.find("\n---", 4)
    if end == -1:
        return {}, normalized
    fm_block = normalized[4:end]
    body = normalized[end + 4 :].lstrip("\n")
    meta: Dict[str, str] = {}
    for line in fm_block.splitlines():
        stripped = line.strip()
        if not stripped or ":" not in stripped:
            continue
        k, _, v = stripped.partition(":")
        key = k.strip().strip("\"'").lower()
        val = v.strip().strip("\"'")
        if key and val and key not in meta:
            meta[key] = val
    return meta, body


def clean_rendered_markdown(body: str, max_chars: int = 120000) -> str:
    """清洗渲染后的 Markdown：
    1. 移除纯装饰图片 `![alt](url)`，保留正文链接；
    2. 将标题整体下沉 3 级（# -> ####，## -> #####，###+ -> ######），避免与深报的 ## / ### 结构冲突；
    3. 压缩多余空行并在行边界安全截断，补齐未闭合的代码块围栏。
    """
    if not body:
        return ""

    # 去掉 Markdown 图片语法 ![...](...)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", body)

    out_lines = []
    in_code_block = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("```"):
            in_code_block = not in_code_block
            out_lines.append(line)
            continue

        if not in_code_block:
            # 标题下沉 3 级：# -> ####, ## -> #####, ### 及以上 -> ######
            m = re.match(r"^(\s*)(#{1,6})\s+(.*)$", line)
            if m:
                indent, hashes, title_text = m.groups()
                new_level = min(6, len(hashes) + 3)
                out_lines.append(f"{indent}{'#' * new_level} {title_text.strip()}")
                continue

        out_lines.append(line)

    cleaned = "\n".join(out_lines)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()

    # 按行边界截断
    if len(cleaned) > max_chars:
        cut = cleaned[:max_chars]
        last_nl = cut.rfind("\n")
        if last_nl > max_chars // 2:
            cut = cut[:last_nl]
        cleaned = cut.rstrip() + "\n\n... (内容过长已截断)"

    # 若代码块 ``` 数量为奇数，补一个闭合围栏
    fence_count = sum(1 for ln in cleaned.splitlines() if ln.strip().startswith("```"))
    if fence_count % 2 == 1:
        cleaned += "\n```"

    return cleaned


def fetch_markdown_via_cf(url: str, timeout: int = 45) -> Optional[Dict[str, Any]]:
    """调用 Cloudflare Browser Run `/browser-rendering/markdown` 渲染提取网页 Markdown。

    成功时返回：
        {
            "title": str,
            "description": str,
            "content": str,
            "browser_ms": float,
            "fetch_method": "cf_browser",
        }
    被护栏跳过或失败时返回 None（fail-soft，不抛异常中断上层流程）。
    """
    global _cf_circuit_open, _cf_call_count, _cf_last_call_end
    global _cf_min_interval, _cf_consecutive_429, _cf_consecutive_5xx

    # 每次动态读取 token 与开关，支持 UI Settings 运行时更新
    token = config._resolve_cf_browser_token()
    account_id = (os.getenv("CF_ACCOUNT_ID") or config.CF_ACCOUNT_ID or "").strip()
    enabled_raw = os.getenv("CF_BROWSER_ENABLED")
    enabled = (
        enabled_raw.strip().lower() not in ("0", "false", "no")
        if enabled_raw is not None and enabled_raw.strip() != ""
        else config.CF_BROWSER_ENABLED
    )

    if not enabled:
        logger.debug("CF Browser Run skipped: CF_BROWSER_ENABLED is false")
        return None
    if not token or not account_id:
        logger.debug("CF Browser Run skipped: token or account_id not configured")
        return None
    if _cf_circuit_open:
        logger.info("CF Browser Run skipped for %s: process circuit open", url)
        return None
    if _cf_call_count >= config.CF_BROWSER_MAX_CALLS_PER_RUN:
        _cf_circuit_open = True
        logger.warning(
            "CF Browser Run process budget reached (%d calls): circuit opened",
            _cf_call_count,
        )
        return None

    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    if not host:
        return None

    # 检查每日账本与负缓存
    ledger = load_usage_ledger()
    now_ts = time.time()

    if float(ledger.get("exhausted_until") or 0.0) > now_ts:
        logger.info("CF Browser Run skipped: daily quota exhausted until next UTC day")
        return None
    if float(ledger.get("used_ms") or 0.0) >= config.CF_BROWSER_DAILY_MS_BUDGET:
        logger.warning(
            "CF Browser Run daily budget reached (%.1fms >= %dms): skipping %s",
            float(ledger.get("used_ms") or 0.0),
            config.CF_BROWSER_DAILY_MS_BUDGET,
            url,
        )
        return None
    if url in (ledger.get("failed_urls") or {}):
        logger.debug("CF Browser Run skipped (negative URL cache): %s", url)
        return None
    host_info = (ledger.get("failed_hosts") or {}).get(host)
    if isinstance(host_info, dict) and float(host_info.get("until") or 0.0) > now_ts:
        logger.debug("CF Browser Run skipped (negative host cache %s): %s", host, url)
        return None

    api_path = (config.CF_BROWSER_API_PATH or "browser-rendering").strip("/")
    endpoint = (
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/{api_path}/markdown"
    )
    payload_bytes = json.dumps(
        {
            "url": url,
            "gotoOptions": {
                "waitUntil": "networkidle2",
                "timeout": 25000,
            },
            "bestAttempt": True,
        }
    ).encode("utf-8")

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "x-bookmark-reports/1.0",
    }

    # 显式使用 .env 中配置的 PROXY（保证 launchd 与 UI 子进程行为一致）
    proxy_url = (os.getenv("PROXY") or config.PROXY or "").strip()
    if proxy_url:
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url})
        )
    else:
        opener = urllib.request.build_opener()

    # 最多尝试 2 次（首次 + 遇 429 退避重试 1 次）
    for attempt in range(2):
        # 严格串行限速：距离上次请求结束至少间隔 _cf_min_interval 秒
        elapsed_since_last = time.time() - _cf_last_call_end
        if _cf_last_call_end > 0 and elapsed_since_last < _cf_min_interval:
            time.sleep(_cf_min_interval - elapsed_since_last)

        t0 = time.perf_counter()
        _cf_call_count += 1
        try:
            req = urllib.request.Request(
                endpoint, data=payload_bytes, headers=headers, method="POST"
            )
            with opener.open(req, timeout=timeout) as resp:
                _cf_last_call_end = time.time()
                wall_ms = (time.perf_counter() - t0) * 1000.0
                resp_headers = {k.lower(): v for k, v in resp.headers.items()}
                ms_header = resp_headers.get("x-browser-ms-used", "")
                try:
                    browser_ms = float(ms_header) if ms_header else wall_ms
                except ValueError:
                    browser_ms = wall_ms

                raw_body = resp.read(5 * 1024 * 1024).decode("utf-8", errors="replace")
                data = json.loads(raw_body)

                _cf_consecutive_429 = 0
                _cf_consecutive_5xx = 0

                if not data.get("success") or not isinstance(data.get("result"), str):
                    err_str = json.dumps(data.get("errors") or "empty result")
                    logger.warning("CF Browser Run returned success=false for %s: %s", url, err_str)
                    _record_url_failure(ledger, url, host, err_str)
                    return None

                _record_url_success(ledger, host, browser_ms)

                raw_md = data["result"]
                fm_meta, md_body = split_frontmatter(raw_md)
                cleaned_body = clean_rendered_markdown(md_body)

                title = (
                    fm_meta.get("title")
                    or fm_meta.get("og:title")
                    or fm_meta.get("twitter:title")
                    or ""
                )
                description = (
                    fm_meta.get("description")
                    or fm_meta.get("og:description")
                    or fm_meta.get("twitter:description")
                    or ""
                )

                logger.info(
                    "CF Browser Run rendered %s: %d chars, %.0fms browser time (today total: %.1fs)",
                    url,
                    len(cleaned_body),
                    browser_ms,
                    float(ledger.get("used_ms") or 0.0) / 1000.0,
                )
                return {
                    "title": title,
                    "description": description,
                    "content": cleaned_body,
                    "browser_ms": round(browser_ms, 1),
                    "fetch_method": "cf_browser",
                }

        except urllib.error.HTTPError as e:
            _cf_last_call_end = time.time()
            err_body = ""
            try:
                err_body = e.read(4096).decode("utf-8", errors="replace")
            except Exception:
                pass

            if e.code in (401, 403):
                _cf_circuit_open = True
                msg = f"HTTP {e.code} unauthorized/forbidden: {err_body[:200]}"
                logger.error("CF Browser Run auth failed (%s), opening circuit", msg)
                ledger["last_error"] = msg
                save_usage_ledger(ledger)
                return None

            if e.code == 429:
                _cf_consecutive_429 += 1
                if "time limit exceeded" in err_body.lower() or "daily" in err_body.lower():
                    ledger["exhausted_until"] = _next_utc_midnight_ts()
                    ledger["last_error"] = f"Daily browser time limit exceeded: {err_body[:200]}"
                    save_usage_ledger(ledger)
                    _cf_circuit_open = True
                    logger.warning("CF Browser Run daily time limit reached; circuit opened until UTC midnight")
                    return None

                retry_hdr = e.headers.get("Retry-After") if e.headers else None
                try:
                    wait_sec = min(30.0, max(5.0, float(retry_hdr))) if retry_hdr else 11.0
                except ValueError:
                    wait_sec = 11.0

                # 自适应将本进程后续请求最小间隔升至 10.5s
                _cf_min_interval = max(_cf_min_interval, 10.5, wait_sec)

                if _cf_consecutive_429 >= 3:
                    _cf_circuit_open = True
                    logger.warning("CF Browser Run hit 3 consecutive 429s; circuit opened")
                    return None

                if attempt == 0:
                    logger.info(
                        "CF Browser Run rate-limited (429) on %s, sleeping %.1fs before retry",
                        url,
                        wait_sec,
                    )
                    time.sleep(wait_sec)
                    continue
                return None

            if e.code >= 500:
                _cf_consecutive_5xx += 1
                if _cf_consecutive_5xx >= 3:
                    _cf_circuit_open = True
                    logger.warning("CF Browser Run hit 3 consecutive 5xx errors; circuit opened")
            _record_url_failure(ledger, url, host, f"HTTP {e.code}: {err_body[:200]}")
            logger.warning("CF Browser Run HTTP %d for %s: %s", e.code, url, err_body[:160])
            return None

        except (
            urllib.error.URLError,
            socket.timeout,
            TimeoutError,
            ConnectionError,
            http.client.HTTPException,
            ssl.SSLError,
            OSError,
            json.JSONDecodeError,
        ) as exc:
            _cf_last_call_end = time.time()
            _cf_consecutive_5xx += 1
            if _cf_consecutive_5xx >= 3:
                _cf_circuit_open = True
            _record_url_failure(ledger, url, host, str(exc))
            logger.warning("CF Browser Run request error for %s: %s", url, exc)
            return None

    return None
