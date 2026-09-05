#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用 X 官方 bookmarks API 探测 rettiwt 漏抓，再按 id 回填完整对象。

官方 JSON（text / author_id）与 rettiwt schema（fullText / tweetBy）不兼容，
禁止把官方对象写进 bookmarks.json。回填必须走 rettiwt tweet details。

默认 fail-soft：任何失败打 WARNING、写 state、退出码 0，避免挡住 auto_run。
仅 --strict 时非零退出。
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# ---------- 路径 / 导入 ----------

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from lib import config  # noqa: E402
from lib.tz import LOCAL_TZ, now_local  # noqa: E402

logger = logging.getLogger("reconcile_official_bookmarks")

# ---------- 模块级熔断 + 预算帽（勿做成实例字段，跨调用共享） ----------
# 范式对齐 lib/article_pipeline/research.py：402/429/401 打开电路，本进程不再调 xurl

_official_xurl_circuit_open = False
_official_xurl_call_count = 0
_official_xurl_circuit_reason = ""

# 回填对象必有字段（与 bookmarks.json 权威条目对齐）
_REQUIRED_FIELDS = ("id", "fullText", "createdAt", "tweetBy", "entities", "lang")

# 默认路径
_DEFAULT_BOOKMARKS = (
    REPO_ROOT.parent / "twitter_data" / "bookmarks.json"
).resolve()
_DEFAULT_SYNC_LOG = (REPO_ROOT.parent / "twitter_data" / "sync_log.txt").resolve()
_DEFAULT_STATE = REPO_ROOT / "output" / ".official-reconcile-state.json"
_DEFAULT_XURL = Path.home() / ".local" / "bin" / "xurl"
_DEFAULT_RETTIWT = Path.home() / ".local" / "bin" / "rettiwt"
_ENV_TWITTER = REPO_ROOT.parent / ".env.twitter"

# xurl 熔断关键字（stderr 或非零退出）
_CIRCUIT_MARKERS = ("401", "402", "429")


class _LocalFormatter(logging.Formatter):
    """日志时间戳走产品时区（Asia/Singapore），不用系统本地时区。"""

    def formatTime(self, record: logging.LogRecord, datefmt: Optional[str] = None) -> str:
        dt = datetime.fromtimestamp(record.created, tz=LOCAL_TZ)
        return dt.strftime(datefmt or "%Y-%m-%d %H:%M:%S")


def _setup_logging() -> None:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(
        _LocalFormatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    )
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)


def _parse_dotenv(path: Path) -> Dict[str, str]:
    """轻量解析 KEY=VALUE（支持引号），不打印值。"""
    out: Dict[str, str] = {}
    if not path.is_file():
        return out
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
            val = val[1:-1]
        out[key] = val
    return out


def _load_rettiwt_creds() -> Tuple[str, str]:
    """API_KEY / PROXY：环境变量优先，其次父目录 .env.twitter，再次 config。"""
    file_vals = _parse_dotenv(_ENV_TWITTER)
    api_key = (
        os.getenv("API_KEY")
        or file_vals.get("API_KEY")
        or getattr(config, "API_KEY", "")
        or ""
    ).strip()
    proxy = (
        os.getenv("PROXY")
        or file_vals.get("PROXY")
        or getattr(config, "PROXY", "")
        or ""
    ).strip()
    return api_key, proxy


def _resolve_bookmarks_path(cli_path: Optional[Path]) -> Path:
    """CLI > BOOKMARKS_PATH 环境变量 > 权威 twitter_data/bookmarks.json。"""
    if cli_path is not None:
        return cli_path.expanduser().resolve()
    env_val = os.getenv("BOOKMARKS_PATH", "").strip()
    if env_val:
        p = Path(env_val)
        return p if p.is_absolute() else (REPO_ROOT / p).resolve()
    return _DEFAULT_BOOKMARKS


def _atomic_write_text(path: Path, text: str) -> None:
    """同目录 mkstemp + os.replace，保证写 bookmarks/state 原子。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def _atomic_write_json(path: Path, payload: Any) -> None:
    _atomic_write_text(
        path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    )


def _parse_json_payload(text: str) -> Any:
    """从可能夹杂日志的 stdout 里抽出 JSON 对象。"""
    blob = (text or "").strip()
    if not blob:
        raise ValueError("空输出")
    try:
        return json.loads(blob)
    except json.JSONDecodeError:
        start = blob.find("{")
        end = blob.rfind("}")
        if start >= 0 and end > start:
            return json.loads(blob[start : end + 1])
        raise


def _stderr_trips_circuit(stderr: str) -> Optional[str]:
    """stderr 含独立的 401/402/429 状态码则返回命中的标记。

    用整词匹配，避免 19 位 tweet/user id 里的数字子串（如 ...429...）误触熔断。
    """
    text = stderr or ""
    for mark in _CIRCUIT_MARKERS:
        if re.search(rf"(?<!\d){mark}(?!\d)", text):
            return mark
    return None


def _open_circuit(reason: str) -> None:
    """打开模块级熔断，本进程后续不再调 xurl。"""
    global _official_xurl_circuit_open, _official_xurl_circuit_reason
    _official_xurl_circuit_open = True
    _official_xurl_circuit_reason = reason
    logger.warning("xurl 熔断已打开: %s（本进程不再调用官方 API）", reason)


def _xurl_fetch_page(
    xurl_bin: Path,
    app: str,
    user: str,
    user_id: str,
    max_results: int,
    pagination_token: Optional[str],
    max_pages: int,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """拉一页官方 bookmarks。失败返回 (None, reason)，成功 (payload, None)。"""
    global _official_xurl_circuit_open, _official_xurl_call_count

    if _official_xurl_circuit_open:
        return None, f"circuit_open:{_official_xurl_circuit_reason}"
    # 预算帽：达到 --max-pages / 配置上限后停止（额度烧穿前拦截）
    if _official_xurl_call_count >= max_pages:
        if not _official_xurl_circuit_open:
            logger.warning(
                "xurl 预算帽已达 (%d calls, cap=%d)，停止翻页",
                _official_xurl_call_count,
                max_pages,
            )
        return None, "budget_cap"

    qs = f"max_results={max_results}&tweet.fields=id"
    if pagination_token:
        qs += f"&pagination_token={pagination_token}"
    # 禁止 expansions：User/Media 会当额外资源计费
    endpoint = f"/2/users/{user_id}/bookmarks?{qs}"
    cmd = [str(xurl_bin), "--app", app, "-u", user, endpoint]

    _official_xurl_call_count += 1
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
        )
    except FileNotFoundError:
        _open_circuit(f"xurl_not_found:{xurl_bin}")
        return None, _official_xurl_circuit_reason
    except subprocess.TimeoutExpired:
        _open_circuit("xurl_timeout")
        return None, _official_xurl_circuit_reason
    except Exception as exc:  # noqa: BLE001 — fail-soft
        _open_circuit(f"xurl_error:{exc}")
        return None, _official_xurl_circuit_reason

    stderr = proc.stderr or ""
    marker = _stderr_trips_circuit(stderr)
    if proc.returncode != 0 or marker:
        reason = marker or f"xurl_exit_{proc.returncode}"
        extra = stderr.strip().splitlines()[-1] if stderr.strip() else ""
        if extra:
            reason = f"{reason}:{extra[:160]}"
        _open_circuit(reason)
        return None, _official_xurl_circuit_reason

    try:
        payload = _parse_json_payload(proc.stdout or "")
    except (ValueError, json.JSONDecodeError) as exc:
        logger.warning("xurl 输出无法解析为 JSON: %s", exc)
        return None, f"bad_json:{exc}"
    if not isinstance(payload, dict):
        logger.warning("xurl 返回非对象: %s", type(payload).__name__)
        return None, "bad_json:not_object"
    return payload, None


def fetch_official_ids(
    xurl_bin: Path,
    app: str,
    user: str,
    user_id: str,
    max_results: int,
    max_pages: int,
) -> Tuple[List[str], bool, Optional[str]]:
    """最多拉 max_pages 页官方 id。返回 (ids, snapshot_partial, error)。"""
    ids: List[str] = []
    seen: Set[str] = set()
    token: Optional[str] = None
    partial = True

    for page in range(max(1, max_pages)):
        payload, err = _xurl_fetch_page(
            xurl_bin, app, user, user_id, max_results, token, max_pages
        )
        if err or payload is None:
            return ids, True, err
        rows = payload.get("data") or []
        if not isinstance(rows, list):
            logger.warning("第 %d 页 data 不是数组，停止", page + 1)
            return ids, True, "bad_schema:data"
        for row in rows:
            if isinstance(row, dict) and row.get("id"):
                tid = str(row["id"])
                if tid not in seen:
                    seen.add(tid)
                    ids.append(tid)
            elif isinstance(row, str) and row not in seen:
                seen.add(row)
                ids.append(row)

        meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
        next_token = str((meta or {}).get("next_token") or "").strip()
        logger.info(
            "官方第 %d 页: %s 条 (累计 %d)",
            page + 1,
            (meta or {}).get("result_count", len(rows)),
            len(ids),
        )
        if not next_token:
            partial = False
            break
        token = next_token
    else:
        # for 正常走完 = 达 max_pages 仍可能有下一页
        partial = True

    return ids, partial, None


def _validate_rettiwt_tweet(obj: Any) -> List[str]:
    """校验必有字段；返回缺失列表（空 = 通过）。"""
    if not isinstance(obj, dict):
        return ["<not_object>"]
    missing: List[str] = []
    for key in _REQUIRED_FIELDS:
        val = obj.get(key)
        if val is None or val == "":
            missing.append(key)
    if not isinstance(obj.get("tweetBy"), dict):
        if "tweetBy" not in missing:
            missing.append("tweetBy")
    if not any(str(k).endswith("Count") for k in obj):
        missing.append("*Count")
    return missing


def _rettiwt_details(rettiwt_bin: Path, tweet_id: str, api_key: str, proxy: str) -> Any:
    """调用 rettiwt tweet details <id>，继承环境代理，不写死端口。"""
    cmd = [str(rettiwt_bin), "-k", api_key, "tweet", "details", tweet_id]
    if proxy:
        cmd = [str(rettiwt_bin), "-k", api_key, "-p", proxy, "tweet", "details", tweet_id]
    env = os.environ.copy()
    # 与 sync_bookmarks.sh 一致：Node 原生 fetch 也要走代理
    if proxy:
        env.setdefault("HTTP_PROXY", proxy)
        env.setdefault("HTTPS_PROXY", proxy)
        env.setdefault("ALL_PROXY", proxy)
    env.setdefault("NODE_USE_ENV_PROXY", "1")
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=60,
        env=env,
    )
    if proc.returncode != 0:
        err = (proc.stderr or "").strip().splitlines()
        err = [ln for ln in err if "EnvHttpProxyAgent" not in ln and "experimental" not in ln]
        raise RuntimeError(err[-1] if err else f"rettiwt exit {proc.returncode}")
    payload = _parse_json_payload(proc.stdout or "")
    # 单 id 返回对象；多 id 可能是数组
    if isinstance(payload, list):
        if not payload:
            raise RuntimeError("rettiwt 返回空数组")
        payload = payload[0]
    return payload


def _load_local_ids(bookmarks_path: Path) -> Tuple[List[Dict[str, Any]], Set[str]]:
    if not bookmarks_path.is_file():
        raise FileNotFoundError(f"bookmarks 不存在: {bookmarks_path}")
    data = json.loads(bookmarks_path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError(f"bookmarks.json 应为数组，实际 {type(data).__name__}")
    ids = {str(item.get("id")) for item in data if isinstance(item, dict) and item.get("id")}
    return data, ids


def _append_sync_log(sync_log_path: Path, new_count: int, total: int) -> None:
    """格式沿用 sync_bookmarks.sh，额外加来源标记便于区分。"""
    ts = now_local().strftime("%Y-%m-%d %H:%M:%S")
    line = f"{ts} | 新增: {new_count} | 总计: {total} | 来源: official-reconcile\n"
    sync_log_path.parent.mkdir(parents=True, exist_ok=True)
    with sync_log_path.open("a", encoding="utf-8") as fh:
        fh.write(line)


def _write_state(state_path: Path, payload: Dict[str, Any]) -> None:
    payload = dict(payload)
    payload["last_run"] = now_local().isoformat(timespec="seconds")
    _atomic_write_json(state_path, payload)


def run(args: argparse.Namespace) -> Tuple[int, Dict[str, Any]]:
    """主流程。返回 (exit_code, summary)。默认 fail-soft 为 0。"""
    bookmarks_path = _resolve_bookmarks_path(args.bookmarks_path)
    state_path = args.state_path.expanduser().resolve()
    sync_log_path = args.sync_log_path.expanduser().resolve()
    xurl_bin = Path(os.path.expanduser(str(args.xurl_bin)))
    rettiwt_bin = Path(os.path.expanduser(str(args.rettiwt_bin)))

    max_results = (
        args.max_results
        if args.max_results is not None
        else int(config.OFFICIAL_RECONCILE_MAX_RESULTS)
    )
    max_pages = (
        args.max_pages
        if args.max_pages is not None
        else int(config.OFFICIAL_RECONCILE_MAX_PAGES)
    )
    # 官方 bookmarks max_results 合法范围 1–100
    max_results = max(1, min(int(max_results), 100))
    max_pages = max(1, int(max_pages))

    user_id = args.user_id or config.OFFICIAL_RECONCILE_USER_ID
    xurl_app = args.xurl_app or config.OFFICIAL_RECONCILE_XURL_APP
    xurl_user = args.xurl_user or config.OFFICIAL_RECONCILE_XURL_USER

    summary: Dict[str, Any] = {
        "dry_run": bool(args.dry_run),
        "official_fetched": 0,
        "missing_local_ids": [],
        "local_only_count": 0,
        "official_snapshot_partial": True,
        "backfilled_ok": [],
        "backfilled_fail": [],
        "circuit_open": False,
        "circuit_reason": None,
        "bookmarks_path": str(bookmarks_path),
        "error": None,
    }

    def _finish(ok_strict: bool = True) -> Tuple[int, Dict[str, Any]]:
        summary["circuit_open"] = bool(_official_xurl_circuit_open)
        summary["circuit_reason"] = _official_xurl_circuit_reason or None
        summary["xurl_call_count"] = _official_xurl_call_count
        try:
            _write_state(state_path, summary)
        except Exception as exc:  # noqa: BLE001
            logger.warning("写 state 失败: %s", exc)
            summary["error"] = summary.get("error") or f"state_write:{exc}"
        if args.strict and not ok_strict:
            return 1, summary
        return 0, summary

    try:
        local_items, local_ids = _load_local_ids(bookmarks_path)
    except Exception as exc:  # noqa: BLE001
        logger.warning("读取本地书签失败: %s", exc)
        summary["error"] = f"load_local:{exc}"
        return _finish(ok_strict=False)

    official_ids, partial, fetch_err = fetch_official_ids(
        xurl_bin=xurl_bin,
        app=xurl_app,
        user=xurl_user,
        user_id=str(user_id),
        max_results=max_results,
        max_pages=max_pages,
    )
    official_set = set(official_ids)
    summary["official_fetched"] = len(official_ids)
    summary["official_snapshot_partial"] = bool(partial)
    # 本地有、官方本次快照没有：只统计，不删本地（用户可能取消了书签；且默认只拉 1 页）
    summary["local_only_count"] = len(local_ids - official_set)

    missing = [tid for tid in official_ids if tid not in local_ids]
    summary["missing_local_ids"] = missing
    logger.info(
        "差集: 官方 %d 条 / 本地 %d 条 / 漏网 %d / 本地有官方快照无 %d（快照 partial=%s）",
        len(official_ids),
        len(local_ids),
        len(missing),
        summary["local_only_count"],
        partial,
    )

    if fetch_err and not official_ids:
        logger.warning("官方拉取失败: %s", fetch_err)
        summary["error"] = fetch_err
        return _finish(ok_strict=False)

    if args.dry_run:
        logger.info("dry-run：不回填、不改 bookmarks.json")
        return _finish(ok_strict=not bool(fetch_err))

    if not missing:
        # 不写 sync_log：sync_bookmarks.sh 的「连续 3 次新增: 0」静默故障启发式
        # 读的是 sync_log 末 3 行，对账每 3h 多写一行 0 会让它提前误报
        logger.info("无漏网 id，幂等跳过回填（不写 sync_log）")
        return _finish(ok_strict=not bool(fetch_err))

    api_key, proxy = _load_rettiwt_creds()
    if not api_key:
        logger.warning("缺少 API_KEY，无法用 rettiwt 回填；只写 state")
        summary["error"] = "missing_rettiwt_api_key"
        summary["backfilled_fail"] = list(missing)
        return _finish(ok_strict=False)
    if not rettiwt_bin.is_file():
        logger.warning("rettiwt 不存在: %s；只写 state", rettiwt_bin)
        summary["error"] = f"rettiwt_not_found:{rettiwt_bin}"
        summary["backfilled_fail"] = list(missing)
        return _finish(ok_strict=False)

    new_items: List[Dict[str, Any]] = []
    ok_ids: List[str] = []
    fail_ids: List[str] = []
    for tid in missing:
        try:
            obj = _rettiwt_details(rettiwt_bin, tid, api_key, proxy)
        except Exception as exc:  # noqa: BLE001
            logger.warning("rettiwt 取详情失败 id=%s: %s", tid, exc)
            fail_ids.append(tid)
            continue
        missing_fields = _validate_rettiwt_tweet(obj)
        if missing_fields:
            logger.warning(
                "rettiwt 字段校验失败 id=%s 缺 %s，不硬塞",
                tid,
                ",".join(missing_fields),
            )
            fail_ids.append(tid)
            continue
        # 强制 id 为字符串，与权威文件一致
        obj["id"] = str(obj.get("id") or tid)
        new_items.append(obj)
        ok_ids.append(tid)

    summary["backfilled_ok"] = ok_ids
    summary["backfilled_fail"] = fail_ids

    if new_items:
        merged = new_items + local_items
        try:
            _atomic_write_json(bookmarks_path, merged)
        except Exception as exc:  # noqa: BLE001
            logger.warning("写 bookmarks.json 失败: %s", exc)
            summary["error"] = f"write_bookmarks:{exc}"
            return _finish(ok_strict=False)
        total = len(merged)
        _append_sync_log(sync_log_path, len(new_items), total)
        logger.info("已 prepend %d 条到 %s，总计 %d", len(new_items), bookmarks_path, total)
    else:
        # 同上：未回填成功就不往 sync_log 写 0 行，失败信息已在 state 里
        logger.warning("漏网 %d 条均未回填（校验失败或 rettiwt 失败），不改文件", len(missing))

    ok_strict = not fail_ids and not fetch_err
    return _finish(ok_strict=ok_strict)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="用 X 官方 API 探测 rettiwt 漏抓的书签，并按 id 回填",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只算差集不回填、不改 bookmarks.json",
    )
    parser.add_argument(
        "--max-results",
        type=int,
        default=None,
        help="官方每页条数（默认取 config，50）",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="最多翻页数（默认取 config，1）",
    )
    parser.add_argument(
        "--bookmarks-path",
        type=Path,
        default=None,
        help="权威 bookmarks.json 路径（测试可指向 /tmp 副本）",
    )
    parser.add_argument(
        "--xurl-bin",
        type=str,
        default=str(_DEFAULT_XURL),
        help="xurl 可执行文件（测试时指向 fake 脚本）",
    )
    parser.add_argument(
        "--rettiwt-bin",
        type=str,
        default=str(_DEFAULT_RETTIWT),
        help="rettiwt 可执行文件",
    )
    parser.add_argument(
        "--state-path",
        type=Path,
        default=_DEFAULT_STATE,
        help="对账 state JSON（默认 output/.official-reconcile-state.json）",
    )
    parser.add_argument(
        "--sync-log-path",
        type=Path,
        default=_DEFAULT_SYNC_LOG,
        help="sync_log.txt 路径（测试请指向 /tmp，勿污染真实日志）",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="失败时非零退出（默认 fail-soft 退出 0）",
    )
    parser.add_argument("--user-id", default=None, help="官方 bookmarks 用户 id")
    parser.add_argument("--xurl-app", default=None, help="xurl --app")
    parser.add_argument("--xurl-user", default=None, help="xurl -u")
    return parser


def main() -> int:
    _setup_logging()
    parser = build_parser()
    args = parser.parse_args()
    try:
        code, summary = run(args)
    except Exception as exc:  # noqa: BLE001 — CLI 顶层 fail-soft
        logger.warning("未预期异常（fail-soft）: %s", exc)
        if getattr(args, "strict", False):
            return 1
        return 0
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
