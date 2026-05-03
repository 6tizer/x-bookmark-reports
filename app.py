#!/usr/bin/env python3
"""
Streamlit Web UI for Twitter/X Bookmark deep reports.

Run from project root:
    streamlit run app.py
"""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import streamlit as st

# --- Project root & imports (must run with cwd = x-bookmark-reports) ---
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.chdir(ROOT)

from lib.coordinator import BookmarkCoordinator  # noqa: E402
from lib.config import CACHE_DIR, PROJECT_ROOT  # noqa: E402

_DEEP_STATE_MAX_ERRORS = 100
STATE_FILENAME = ".deep-run-state.json"
REPORT_GLOB = "bookmark-deep-*.md"


# ---------------------------------------------------------------------------
# Page & styling
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="X Bookmark Reports",
    page_icon="🔖",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown(
    """
<style>
    /* ── Metrics ── */
    div[data-testid="stMetricValue"] { font-variant-numeric: tabular-nums; }

    /* ── Pipeline status card ── */
    .pipeline-card {
        padding: 1rem 1.25rem 0.75rem;
        border-radius: 0.625rem;
        border: 1px solid rgba(128,128,128,0.2);
        background: var(--secondary-background-color, #f8f9fa);
        margin-bottom: 0.75rem;
    }
    .pipeline-card-title {
        font-size: 0.78rem;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: rgba(128,128,128,0.9);
        margin-bottom: 0.5rem;
    }
    .pipeline-status-row {
        display: flex;
        align-items: center;
        gap: 1.25rem;
        flex-wrap: wrap;
        font-size: 0.9rem;
    }
    .pipeline-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        font-weight: 600;
        font-size: 0.88rem;
    }
    .badge-success { color: #21b573; }
    .badge-partial { color: #d4a017; }
    .badge-failed  { color: #e06c00; }
    .badge-running { color: #1c83e1; }
    .badge-idle    { color: rgba(128,128,128,0.7); }
    .pipeline-meta {
        font-size: 0.82rem;
        color: rgba(128,128,128,0.85);
    }
    .stat-chip {
        display: inline-block;
        padding: 0.15rem 0.55rem;
        border-radius: 999px;
        background: rgba(128,128,128,0.1);
        font-size: 0.8rem;
        font-weight: 500;
        margin-right: 0.3rem;
    }

    /* ── Log panel ── */
    .log-panel {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.82rem;
        line-height: 1.45;
        max-height: 320px;
        overflow-y: auto;
        padding: 0.75rem 1rem;
        background: var(--secondary-background-color, #f0f2f6);
        border-radius: 0.5rem;
        border: 1px solid rgba(128,128,128,0.25);
        white-space: pre-wrap;
        word-break: break-word;
    }
    .section-title { margin-top: 0.25rem; margin-bottom: 0.5rem; font-weight: 600; }
</style>
""",
    unsafe_allow_html=True,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def output_dir() -> Path:
    return PROJECT_ROOT / "output"


def state_path() -> Path:
    return output_dir() / STATE_FILENAME


def load_state_file() -> dict[str, Any]:
    p = state_path()
    if not p.exists():
        return {"completed_ids": [], "errors": [], "last_run": ""}
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {
            "completed_ids": list(data.get("completed_ids") or []),
            "errors": list(data.get("errors") or [])[-_DEEP_STATE_MAX_ERRORS:],
            "last_run": data.get("last_run") or "",
        }
    except (json.JSONDecodeError, OSError):
        return {"completed_ids": [], "errors": [], "last_run": ""}


def save_state_file(state: dict[str, Any]) -> None:
    coord = BookmarkCoordinator()
    coord._save_deep_state_file(state, state_path())


def clear_errors_only() -> None:
    st_local = load_state_file()
    st_local["errors"] = []
    save_state_file(st_local)


def human_size(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024.0:
            return f"{n:.1f} {unit}" if unit != "B" else f"{int(n)} {unit}"
        n /= 1024.0
    return f"{n:.1f} TB"


def get_cache_stats() -> dict[str, tuple[int, int]]:
    """Return {name: (file_count, total_bytes)} for articles / external / github."""
    out: dict[str, tuple[int, int]] = {}
    for name in ("articles", "external", "github"):
        d = CACHE_DIR / name
        if not d.is_dir():
            out[name] = (0, 0)
            continue
        cnt = 0
        total = 0
        for p in d.glob("*.json"):
            try:
                total += p.stat().st_size
                cnt += 1
            except OSError:
                pass
        out[name] = (cnt, total)
    return out


def clear_cache_json(kind: str) -> int:
    """Delete all .json files in cache/{kind}. Returns number removed."""
    d = CACHE_DIR / kind
    if not d.is_dir():
        return 0
    n = 0
    for p in d.glob("*.json"):
        try:
            p.unlink()
            n += 1
        except OSError:
            pass
    return n


def load_bookmarks_safe() -> list[dict]:
    coord = BookmarkCoordinator()
    try:
        return coord.load_bookmarks()
    except Exception:
        return []


def bookmark_label(b: dict) -> str:
    bid = str(b.get("id", "") or "")
    user = b.get("tweetBy") or {}
    handle = user.get("userName") or "?"
    text = (b.get("fullText") or "").replace("\n", " ").strip()
    preview = (text[:50] + "…") if len(text) > 50 else text
    return f"{bid} — @{handle} ({preview})"


def parse_deep_report_filename(name: str) -> tuple[Optional[str], Optional[str]]:
    """Return (bookmark_id, timestamp_str YYYYMMDD_HHMMSS) from filename."""
    m = re.match(r"^bookmark-deep-(.+)-(\d{8}_\d{6})\.md$", name)
    if not m:
        return None, None
    return m.group(1), m.group(2)


def list_deep_reports() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    od = output_dir()
    if not od.is_dir():
        return out
    for p in od.glob(REPORT_GLOB):
        if not p.is_file():
            continue
        try:
            st_info = p.stat()
        except OSError:
            continue
        bid, ts = parse_deep_report_filename(p.name)
        out.append(
            {
                "path": p,
                "name": p.name,
                "bookmark_id": bid,
                "mtime": st_info.st_mtime,
                "size": st_info.st_size,
                "ts_str": ts,
            }
        )
    out.sort(key=lambda x: x["mtime"], reverse=True)
    return out


def format_last_run(iso_str: str) -> str:
    if not iso_str:
        return "—"
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        if dt.tzinfo:
            dt = dt.astimezone()
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except ValueError:
        return iso_str[:19]


# ---------------------------------------------------------------------------
# Logging: queue-like list for batch worker (thread-safe append)
# ---------------------------------------------------------------------------
class ListHandler(logging.Handler):
    def __init__(self, log_list: list, lock: threading.Lock) -> None:
        super().__init__()
        self.log_list = log_list
        self._log_lock = lock  # renamed: do NOT use self.lock — that is Handler's internal RLock
        self.setFormatter(
            logging.Formatter(
                "[%(asctime)s] %(message)s",
                datefmt="%H:%M:%S",
            )
        )

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
            with self._log_lock:
                self.log_list.append(msg)
                if len(self.log_list) > 500:
                    del self.log_list[:-400]
        except Exception:
            self.handleError(record)


def attach_streamlit_logging(
    log_list: list, lock: threading.Lock
) -> list[tuple[logging.Logger, logging.Handler]]:
    """Attach handlers to coordinator tree + common lib loggers; return handles to remove later."""
    h = ListHandler(log_list, lock)
    h.setLevel(logging.INFO)
    names = [
        "lib.coordinator",
        "lib.article_client",
        "lib.quoted_client",
        "lib.github_client",
        "lib.external_client",
        "lib.replies_client",
        "lib.report_builder",
    ]
    attached: list[tuple[logging.Logger, logging.Handler]] = []
    for name in names:
        lg = logging.getLogger(name)
        lg.addHandler(h)
        lg.setLevel(logging.INFO)
        attached.append((lg, h))
    return attached


def detach_handlers(attached: list) -> None:
    for lg, h in attached:
        try:
            lg.removeHandler(h)
        except ValueError:
            pass


# ---------------------------------------------------------------------------
# Batch worker (replicates run_deep loop with cooperative stop)
# ---------------------------------------------------------------------------


def run_deep_batch_worker(
    limit: Optional[int],
    batch_size: int,
    resume: bool,
    log_list: list,
    log_lock: threading.Lock,
    stop_flag: dict,
    result_box: dict,
) -> None:
    """Runs in background thread."""
    try:
        _run_deep_batch_inner(
            limit,
            batch_size,
            resume,
            log_list,
            log_lock,
            stop_flag,
            result_box,
        )
    except Exception as e:
        _ts = datetime.now().strftime("%H:%M:%S")
        with log_lock:
            log_list.append(f"[{_ts}] ❌ 批处理崩溃: {e}")
        logging.getLogger("lib.coordinator").exception("Batch worker crashed: %s", e)
        result_box.setdefault("error", str(e))
        result_box["stopped"] = bool(stop_flag.get("stop"))


def _run_deep_batch_inner(
    limit: Optional[int],
    batch_size: int,
    resume: bool,
    log_list: list,
    log_lock: threading.Lock,
    stop_flag: dict,
    result_box: dict,
) -> None:
    def _log(msg: str) -> None:
        with log_lock:
            log_list.append(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

    attached: list = []
    try:
        _log("线程启动，正在初始化 BookmarkCoordinator…")
        _t0 = time.perf_counter()
        coord = BookmarkCoordinator()
        _log(f"BookmarkCoordinator 初始化完成（{time.perf_counter() - _t0:.2f}s）")
        coord._reset_run_stats()
        start_time = time.time()
        resume_path = coord.output_dir / STATE_FILENAME

        state: dict = {"completed_ids": [], "errors": [], "last_run": ""}
        if resume and resume_path.exists():
            try:
                with open(resume_path, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                state["completed_ids"] = list(loaded.get("completed_ids") or [])
                state["errors"] = list(loaded.get("errors") or [])[-_DEEP_STATE_MAX_ERRORS:]
            except (json.JSONDecodeError, OSError):
                pass

        completed: set[str] = {str(x) for x in state["completed_ids"]}

        try:
            bookmarks = coord.load_bookmarks()
        except Exception as e:
            _log(f"❌ 加载书签失败: {e}")
            logging.getLogger("lib.coordinator").error("Failed to load bookmarks: %s", e)
            result_box["error"] = str(e)
            result_box["stats"] = coord._stats
            result_box["report_paths"] = []
            result_box["elapsed_seconds"] = 0.0
            result_box["stopped"] = False
            return

        _log(f"书签加载成功，共 {len(bookmarks)} 条；resume={resume}；limit={limit or '全部'}")

        # Filter out already-completed bookmarks first, THEN apply the per-session limit.
        # This ensures limit=N means "process up to N new bookmarks this session",
        # not "look at only the first N entries in the file".
        to_process = [b for b in bookmarks if str(b.get("id", "") or "") not in completed]
        if limit:
            to_process = to_process[:limit]

        _log(f"本轮待处理: {len(to_process)} 条（已跳过 {len(bookmarks) - len(to_process)} 条已完成）")
        n = len(to_process)
        log_interval = max(1, n // 20) if n else 1

        prev_deep = coord.deep_report
        prev_replies = coord.include_replies
        coord.deep_report = True
        coord.include_replies = True

        report_paths: list[Path] = []
        deep_success_session = 0

        attached = attach_streamlit_logging(log_list, log_lock)
        result_box["total_n"] = n
        result_box["current_i"] = 0

        try:
            for i, bookmark in enumerate(to_process, 1):
                if stop_flag.get("stop"):
                    logging.getLogger("lib.coordinator").warning(
                        "Stop requested, saving deep run state..."
                    )
                    coord._save_deep_state_file(state, resume_path)
                    break

                bid = str(bookmark.get("id", "") or "")
                if bid and bid in completed:
                    coord._stats["deep_skipped"] += 1
                    logging.getLogger("lib.coordinator").info(
                        "Skipping already completed bookmark %s (%s/%s)",
                        bid,
                        i,
                        n,
                    )
                    if i % log_interval == 0 or i == n:
                        elapsed = time.time() - start_time
                        rate = i / elapsed if elapsed > 0 else 0
                        logging.getLogger("lib.coordinator").info(
                            "Progress: %s/%s (%.1f%%) — %.2f bookmarks/sec",
                            i,
                            n,
                            100 * i / n if n else 0,
                            rate,
                        )
                    result_box["current_i"] = i
                    result_box["total_n"] = n
                    continue

                coord._stats["total"] += 1
                logging.getLogger("lib.coordinator").info(
                    "Deep processing %s/%s: %s",
                    i,
                    n,
                    bid or bookmark.get("id", "unknown"),
                )

                started = datetime.now(timezone.utc)
                t0 = time.perf_counter()
                try:
                    result = coord.process_bookmark(bookmark)
                    elapsed = time.perf_counter() - t0
                    report = coord.build_deep_report(result, started, elapsed)
                    safe_id = "".join(c for c in bid if c.isalnum() or c in "-_")[:64] or "unknown"
                    fname = (
                        f"bookmark-deep-{safe_id}-"
                        f"{started.strftime('%Y%m%d_%H%M%S')}.md"
                    )
                    path = coord.save_report(report, format="markdown", filename=fname)
                    report_paths.append(path)
                    with log_lock:
                        log_list.append(
                            f"[{datetime.now().strftime('%H:%M:%S')}] Saved report: {path.name}"
                        )
                    if bid:
                        completed.add(bid)
                    state["completed_ids"] = sorted(completed)
                    state["last_run"] = datetime.now(timezone.utc).isoformat()
                    coord._stats["deep_processed"] += 1
                    deep_success_session += 1
                    coord._save_deep_state_file(state, resume_path)
                    if batch_size > 0 and deep_success_session % batch_size == 0:
                        logging.getLogger("lib.coordinator").info(
                            "Batch checkpoint: %s deep reports saved this session",
                            deep_success_session,
                        )
                except Exception as e:
                    logging.getLogger("lib.coordinator").exception(
                        "Deep run failed for bookmark %s", bid
                    )
                    coord._stats["deep_failed"] += 1
                    coord._stats["errors"] += 1
                    err_entry = {
                        "id": bid,
                        "error": str(e),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                    errs = state.setdefault("errors", [])
                    errs.append(err_entry)
                    state["errors"] = errs[-_DEEP_STATE_MAX_ERRORS:]
                    coord._errors.append(
                        {
                            "bookmark_id": bid,
                            "type": "deep",
                            "error": str(e),
                        }
                    )
                    coord._save_deep_state_file(state, resume_path)

                if i % log_interval == 0 or i == n:
                    elapsed = time.time() - start_time
                    rate = i / elapsed if elapsed > 0 else 0
                    logging.getLogger("lib.coordinator").info(
                        "Progress: %s/%s (%.1f%%) — %.2f bookmarks/sec",
                        i,
                        n,
                        100 * i / n if n else 0,
                        rate,
                    )

                result_box["current_i"] = i
                result_box["total_n"] = n
        finally:
            coord.deep_report = prev_deep
            coord.include_replies = prev_replies

        elapsed = time.time() - start_time
        logging.getLogger("lib.coordinator").info("Deep batch complete in %.1fs", elapsed)
        logging.getLogger("lib.coordinator").info("Stats: %s", coord._stats)
        result_box["stats"] = coord._stats.copy()
        result_box["errors"] = list(coord._errors)
        result_box["elapsed_seconds"] = elapsed
        result_box["report_paths"] = [str(p) for p in report_paths]
        result_box["resume_file"] = str(resume_path)
        result_box["stopped"] = bool(stop_flag.get("stop"))
    finally:
        if attached:
            detach_handlers(attached)


def _safe_progress(progress_ph: Any, value: float, label: str) -> None:
    """st.progress(..., text=) is not available in older Streamlit."""
    try:
        progress_ph.progress(value, text=label)
    except TypeError:
        progress_ph.progress(value)


# ---------------------------------------------------------------------------
# Auto-run helpers
# ---------------------------------------------------------------------------
AUTO_RUN_STATE_FILENAME = "auto_run_state.json"
AUTO_RUN_SCRIPT = ROOT / "auto_run.sh"


def load_auto_run_state() -> dict[str, Any]:
    p = output_dir() / AUTO_RUN_STATE_FILENAME
    if not p.exists():
        return {}
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def run_auto_run_worker(
    force: bool,
    log_list: list,
    log_lock: threading.Lock,
    result_box: dict,
) -> None:
    """Run auto_run.sh in a background thread, stream output to log_list."""
    cmd = ["/bin/bash", str(AUTO_RUN_SCRIPT)]
    if force:
        cmd.append("--force")
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd=str(ROOT),
        )
        result_box["pid"] = proc.pid
        assert proc.stdout is not None
        for line in proc.stdout:
            line = line.rstrip()
            if line:
                with log_lock:
                    log_list.append(line)
                    if len(log_list) > 500:
                        del log_list[:-400]
        proc.wait()
        result_box["returncode"] = proc.returncode
        result_box["done"] = True
    except Exception as e:
        with log_lock:
            log_list.append(f"[ERROR] 启动 auto_run.sh 失败: {e}")
        result_box["returncode"] = -1
        result_box["done"] = True


# ---------------------------------------------------------------------------
# Session state init
# ---------------------------------------------------------------------------
def init_session() -> None:
    defaults = {
        "batch_running": False,
        "batch_log": [],
        "batch_log_lock": threading.Lock(),
        "batch_stop_flag": None,
        "batch_result_box": None,
        "batch_thread": None,
        "single_report_md": None,
        "single_report_name": None,
        "bookmarks_cache": None,  # loaded once, avoids per-rerun coordinator + logger calls
        # Auto-run pipeline
        "auto_running": False,
        "auto_log": [],
        "auto_log_lock": threading.Lock(),
        "auto_thread": None,
        "auto_result_box": None,
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v


init_session()


# ---------------------------------------------------------------------------
# Sidebar: errors & cache
# ---------------------------------------------------------------------------
with st.sidebar:
    st.markdown("### 🔧 管理")
    state = load_state_file()
    errs = state.get("errors") or []

    with st.expander("错误记录", expanded=False):
        if not errs:
            st.caption("暂无错误")
        else:
            for e in reversed(errs[-50:]):
                st.markdown(
                    f"**`{e.get('id', '?')}`**  \n"
                    f"{e.get('error', '')[:500]}  \n"
                    f"_`{e.get('timestamp', '')}`_"
                )
                st.divider()
        if st.button("清除错误记录", type="secondary", key="clear_err"):
            clear_errors_only()
            st.success("已清除 errors（completed_ids 未改动）")
            st.rerun()

    # ── Notion upload records ──────────────────────────────────────────────
    _ns_path = output_dir() / ".notion-upload-state.json"
    try:
        _ns = json.loads(_ns_path.read_text(encoding="utf-8")) if _ns_path.exists() else {}
    except (OSError, json.JSONDecodeError):
        _ns = {}
    _uploaded_files: list[str] = list(_ns.get("uploaded") or [])
    with st.expander(f"Notion 上传记录（{len(_uploaded_files)}）", expanded=False):
        if not _uploaded_files:
            st.caption("暂无上传记录")
        else:
            recent = _uploaded_files[-10:]
            for fname in reversed(recent):
                st.caption(f"✅ {fname}")
            if len(_uploaded_files) > 10:
                with st.expander(f"查看全部 {len(_uploaded_files)} 条", expanded=False):
                    for fname in reversed(_uploaded_files):
                        st.caption(fname)

    with st.expander("缓存", expanded=False):
        stats = get_cache_stats()
        for name, (cnt, sz) in stats.items():
            st.caption(f"**{name}** — {cnt} 个文件 · {human_size(sz)}")
        c1, c2, c3 = st.columns(3)
        if c1.button("清 articles", key="ca"):
            n = clear_cache_json("articles")
            st.success(f"已删除 {n} 个 JSON")
            st.rerun()
        if c2.button("清 external", key="ce"):
            n = clear_cache_json("external")
            st.success(f"已删除 {n} 个 JSON")
            st.rerun()
        if c3.button("清 github", key="cg"):
            n = clear_cache_json("github")
            st.success(f"已删除 {n} 个 JSON")
            st.rerun()

    st.caption(f"项目根目录: `{ROOT}`")


# ---------------------------------------------------------------------------
# Main: status bar
# ---------------------------------------------------------------------------
# Load bookmarks once into session state cache to avoid re-init of BookmarkCoordinator
# (and its logger.info calls) on every 0.5s rerun while the worker thread owns the
# logging handler lock — which caused an indefinite hang.
if st.session_state.bookmarks_cache is None:
    st.session_state.bookmarks_cache = load_bookmarks_safe()
bookmarks_all: list[dict] = st.session_state.bookmarks_cache
total_bm = len(bookmarks_all)
state_now = load_state_file()
completed_ids = set(str(x) for x in (state_now.get("completed_ids") or []))
completed_n = len(completed_ids)
remaining = max(0, total_bm - completed_n)
err_n = len(state_now.get("errors") or [])

# ---------------------------------------------------------------------------
# Auto-run status block  (always-visible card)
# ---------------------------------------------------------------------------

# Check if auto_run thread just finished
if st.session_state.auto_running and st.session_state.auto_thread is not None:
    if not st.session_state.auto_thread.is_alive():
        st.session_state.auto_running = False
        st.session_state.auto_thread = None
        st.session_state.auto_result_box = None
        # Invalidate bookmarks cache so count refreshes
        st.session_state.bookmarks_cache = None

auto_state = load_auto_run_state()

# Load Notion upload state for metrics
_notion_upload_state_path = output_dir() / ".notion-upload-state.json"
try:
    _notion_state = json.loads(_notion_upload_state_path.read_text(encoding="utf-8")) if _notion_upload_state_path.exists() else {}
except (OSError, json.JSONDecodeError):
    _notion_state = {}
notion_uploaded_n = len(_notion_state.get("uploaded") or [])

# ── Metrics row (5 cols) ──────────────────────────────────────────────────
h1, h2, h3, h4, h5 = st.columns(5)
h1.metric("书签总数", total_bm)
h2.metric("深度报告", completed_n)
h3.metric("已上传 Notion", notion_uploaded_n)
h4.metric("待处理", remaining)
h5.metric("历史错误", err_n)

st.markdown("")  # spacer

# ── Pipeline status card ──────────────────────────────────────────────────
with st.container(border=True):
    st.markdown('<div class="pipeline-card-title">⚙️ 自动化流水线状态</div>', unsafe_allow_html=True)

    card_left, card_right = st.columns([3, 2])

    with card_left:
        if st.session_state.auto_running:
            st.info("🔄 流水线正在运行中...")
            with st.session_state.auto_log_lock:
                lines = list(st.session_state.auto_log)
            log_text = "\n".join(lines[-60:]) if lines else "（等待输出…）"
            st.markdown(
                f'<div class="log-panel">{log_text}</div>',
                unsafe_allow_html=True,
            )
            time.sleep(0.8)
            st.rerun()

        elif not auto_state:
            st.caption("尚未配置自动运行，或从未执行过。可通过右侧按钮手动执行，或等待 launchd 每 8 小时（01:00 / 09:00 / 17:00）自动触发。")

        else:
            status = auto_state.get("status", "")
            last_run = format_last_run(auto_state.get("last_run") or "")
            sync_n = auto_state.get("sync_new_count", 0)
            proc_n = auto_state.get("process_new_count", 0)
            upload_n = auto_state.get("upload_new_count", 0)
            error_msg = auto_state.get("error") or ""
            log_file = auto_state.get("log_file") or "/tmp/bookmark-auto.log"

            if status == "success":
                st.success(
                    f"✅ 上次成功  ·  {last_run}  ·  "
                    f"同步 **{sync_n}** 条  ·  报告 **{proc_n}** 篇  ·  Notion **{upload_n}** 篇"
                )
            elif status == "partial":
                st.warning(
                    f"⚠️ 部分完成  ·  {last_run}  ·  "
                    f"同步 **{sync_n}** 条  ·  报告 **{proc_n}** 篇  ·  Notion **{upload_n}** 篇\n\n"
                    f"{error_msg}"
                )
            elif status == "failed":
                step_label = {
                    "proxy_check": "代理检测",
                    "sync": "同步书签",
                    "process": "生成报告",
                    "upload": "上传 Notion",
                }.get(auto_state.get("step") or "", auto_state.get("step") or "未知步骤")
                st.warning(
                    f"⚠️ 上次失败  ·  {last_run}  ·  步骤：**{step_label}**\n\n"
                    f"错误：`{error_msg}`"
                )
                with st.expander("查看日志（最后 50 行）", expanded=False):
                    try:
                        log_path = Path(log_file)
                        if log_path.exists():
                            lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
                            st.code("\n".join(lines[-50:]), language=None)
                        else:
                            st.caption(f"日志文件不存在：{log_file}")
                    except OSError as e:
                        st.caption(f"无法读取日志：{e}")
            elif status == "running":
                st.info(f"🔄 上次在 {last_run} 开始，可能仍在后台执行，或已异常退出。")

    with card_right:
        st.markdown("**手动触发**")
        force_proxy = st.checkbox("跳过代理检测 (--force)", key="auto_force_proxy", value=False)
        btn_disabled = st.session_state.auto_running or st.session_state.batch_running
        if st.button(
            "▶ 立即执行（同步 + 生成报告）",
            disabled=btn_disabled,
            key="btn_manual_auto_run",
            type="primary",
            use_container_width=True,
        ):
            log_list: list = []
            log_lock = threading.Lock()
            result_box: dict = {"done": False}
            st.session_state.auto_log = log_list
            st.session_state.auto_log_lock = log_lock
            st.session_state.auto_result_box = result_box
            st.session_state.auto_running = True
            t = threading.Thread(
                target=run_auto_run_worker,
                args=(force_proxy, log_list, log_lock, result_box),
                daemon=True,
            )
            st.session_state.auto_thread = t
            t.start()
            st.rerun()

st.markdown("")  # spacer

# Thread completion: copy result from worker box
if st.session_state.batch_running and st.session_state.batch_thread is not None:
    t = st.session_state.batch_thread
    if not t.is_alive():
        st.session_state.batch_running = False
        box = st.session_state.get("batch_result_box") or {}
        st.session_state.batch_last_result = {
            "stats": box.get("stats"),
            "errors": box.get("errors"),
            "elapsed_seconds": box.get("elapsed_seconds"),
            "report_paths": box.get("report_paths"),
            "error": box.get("error"),
            "stopped": box.get("stopped"),
        }
        st.session_state.batch_thread = None
        st.session_state.batch_stop_flag = None
        st.session_state.batch_result_box = None

tab_batch, tab_browse, tab_single = st.tabs(
    ["批量处理", "报告浏览", "单条生成"]
)

# ---------------------------------------------------------------------------
# Tab: Batch
# ---------------------------------------------------------------------------
with tab_batch:
    st.markdown('<p class="section-title">批量深度报告</p>', unsafe_allow_html=True)
    c1, c2, c3 = st.columns([1, 1, 2])
    with c1:
        lim = st.number_input(
            "处理数量上限 (limit)",
            min_value=0,
            value=20,
            help="0 = 处理书签文件中的全部（在 resume 过滤之后按顺序取全部列表）",
        )
    with c2:
        bsize = st.number_input(
            "Checkpoint 间隔 (batch-size)",
            min_value=0,
            value=5,
            help="每成功 N 条打一次 checkpoint 日志；0 关闭",
        )
    with c3:
        do_resume = st.checkbox("从断点继续 (resume)", value=True)

    bc1, bc2 = st.columns(2)
    start = bc1.button("开始处理", type="primary", disabled=st.session_state.batch_running)
    stop = bc2.button("停止", type="secondary", disabled=not st.session_state.batch_running)

    if stop and st.session_state.batch_stop_flag is not None:
        st.session_state.batch_stop_flag["stop"] = True
        st.warning("正在停止…（当前书签处理完后保存状态）")

    if start and not st.session_state.batch_running:
        _ts = datetime.now().strftime("%H:%M:%S")
        init_msg = f"[{_ts}] 批处理已启动，正在加载书签列表…"
        st.session_state.batch_log = [init_msg]
        st.session_state.batch_last_result = None
        log_lock = st.session_state.batch_log_lock
        log_list = st.session_state.batch_log
        stop_flag = {"stop": False}
        result_box: dict[str, Any] = {}
        th = threading.Thread(
            target=run_deep_batch_worker,
            kwargs={
                "limit": (None if lim == 0 else int(lim)),
                "batch_size": int(bsize),
                "resume": do_resume,
                "log_list": log_list,
                "log_lock": log_lock,
                "stop_flag": stop_flag,
                "result_box": result_box,
            },
            daemon=True,
        )
        st.session_state.batch_running = True
        st.session_state.batch_stop_flag = stop_flag
        st.session_state.batch_result_box = result_box
        st.session_state.batch_thread = th
        th.start()
        try:
            st.toast("批处理已启动！", icon="🚀")
        except Exception:
            pass
        # Do NOT call st.rerun() here — calling st.rerun() inside "with tab_batch:" causes
        # the RerunException to be mishandled by the tab context manager in Streamlit 1.50,
        # preventing the auto-refresh block at end-of-script from ever executing.
        # batch_running=True causes the end-of-script auto-refresh to fire naturally.

    # Progress + logs
    prog_ph = st.empty()
    log_ph = st.empty()

    if st.session_state.batch_running:
        st.info("批处理运行中... 按【停止】可保存断点并中止。")
        box = st.session_state.get("batch_result_box") or {}
        cur = box.get("current_i", 0)
        tot = box.get("total_n", 0)
        _lk = st.session_state.batch_log_lock
        if tot > 0:
            _safe_progress(prog_ph, min(cur / tot, 1.0), f"进度 {cur}/{tot}")
        else:
            _safe_progress(prog_ph, 0.0, "准备中…")

        with _lk:
            lines = list(st.session_state.batch_log)
        text = "\n".join(lines[-200:]) if lines else "等待日志…"
        log_ph.markdown(f'<div class="log-panel">{text}</div>', unsafe_allow_html=True)
    else:
        prog_ph.empty()
        with st.session_state.batch_log_lock:
            lines = list(st.session_state.batch_log)
        if lines:
            text = "\n".join(lines[-200:])
            log_ph.markdown(f'<div class="log-panel">{text}</div>', unsafe_allow_html=True)

    res = st.session_state.get("batch_last_result")
    if res:
        if res.get("stats"):
            st.success("**本轮结束**")
            s = res["stats"]
            st.markdown(
                f"- 已处理: **{s.get('deep_processed', 0)}**  \n"
                f"- 跳过: **{s.get('deep_skipped', 0)}**  \n"
                f"- 失败: **{s.get('deep_failed', 0)}**  \n"
                f"- 耗时: **{res.get('elapsed_seconds', 0):.1f}s**"
            )
        if res.get("stopped"):
            st.info("已由用户停止；断点已保存。")
        if res.get("error"):
            st.error(res["error"])

# ---------------------------------------------------------------------------
# Tab: Single
# ---------------------------------------------------------------------------
with tab_single:
    st.markdown('<p class="section-title">单条深度报告</p>', unsafe_allow_html=True)
    if not bookmarks_all:
        st.error("无法加载书签文件，请检查 `.env` 中的 BOOKMARKS_PATH。")
    else:
        labels = [bookmark_label(b) for b in bookmarks_all]
        ids = [str(b.get("id", "")) for b in bookmarks_all]
        choice = st.selectbox("选择书签", range(len(labels)), format_func=lambda i: labels[i])
        manual = st.text_input("或输入书签 ID", placeholder="2037712463723135089")
        go = st.button("生成深度报告", type="primary")

        target_id = manual.strip() if manual.strip() else ids[choice]
        bookmark = None
        for b in bookmarks_all:
            if str(b.get("id", "")) == target_id:
                bookmark = b
                break

        if go:
            if not bookmark:
                st.error(f"未找到 ID: {target_id}")
            else:
                with st.spinner("正在抓取并生成报告…"):
                    coord = BookmarkCoordinator(deep_report=True, include_replies=True)
                    t0 = time.perf_counter()
                    started = datetime.now(timezone.utc)
                    try:
                        result = coord.process_bookmark(bookmark)
                        elapsed = time.perf_counter() - t0
                        md = coord.build_deep_report(result, started, elapsed)
                        safe_id = "".join(
                            c for c in target_id if c.isalnum() or c in "-_"
                        )[:64] or "unknown"
                        fname = (
                            f"bookmark-deep-{safe_id}-"
                            f"{started.strftime('%Y%m%d_%H%M%S')}.md"
                        )
                        st.session_state.single_report_md = md
                        st.session_state.single_report_name = fname
                    except Exception as e:
                        st.exception(e)
                        st.session_state.single_report_md = None

        md = st.session_state.get("single_report_md")
        name = st.session_state.get("single_report_name") or "report.md"
        if md:
            st.download_button(
                label="下载 .md",
                data=md.encode("utf-8"),
                file_name=name,
                mime="text/markdown",
            )
            st.markdown(md)


# ---------------------------------------------------------------------------
# Tab: Browser
# ---------------------------------------------------------------------------
with tab_browse:
    st.markdown('<p class="section-title">已生成的报告</p>', unsafe_allow_html=True)
    q = st.text_input("搜索（书签 ID 或文件名）", "")
    reports = list_deep_reports()
    if q.strip():
        low = q.strip().lower()
        reports = [
            r
            for r in reports
            if low in r["name"].lower()
            or (r.get("bookmark_id") and low in r["bookmark_id"].lower())
        ]

    if not reports:
        st.info("暂无 `bookmark-deep-*.md` 文件。")
    else:
        st.caption(f"共 {len(reports)} 个文件（按修改时间倒序）")
        opts = [r["name"] for r in reports]
        pick = st.selectbox("选择文件", opts)
        sel = next(x for x in reports if x["name"] == pick)
        st.markdown(
            f"`{sel['name']}` · ID `{sel.get('bookmark_id') or '?'}` · "
            f"{datetime.fromtimestamp(sel['mtime']).strftime('%Y-%m-%d %H:%M:%S')} · "
            f"{human_size(sel['size'])}"
        )
        try:
            content = sel["path"].read_text(encoding="utf-8")
        except OSError as e:
            st.error(str(e))
            content = ""
        if content:
            st.download_button(
                "下载此报告",
                data=content.encode("utf-8"),
                file_name=sel["name"],
                mime="text/markdown",
            )
            st.markdown(content)

# Footer
st.caption("运行目录须为项目根目录，以便加载 `.env` 与相对路径。")

# Auto-refresh while batch runs — MUST be after all tabs so every tab's widgets render each run.
if st.session_state.batch_running:
    time.sleep(0.5)
    st.rerun()
