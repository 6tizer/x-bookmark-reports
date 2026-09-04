#!/usr/bin/env python3
"""
回填 Notion DB 历史页面的「发布时间」为新加坡时区日历日（B-NOTION-PUBDATE-UTC 修复的存量部分）。

背景：旧版 upload_to_notion.py 直接对 UTC 时间戳取 .date()，新加坡 00:00–08:00 产生的内容
被记成前一天。本脚本按与新版上传脚本**完全相同**的口径重算每一页应有的发布时间，
只对"实际值 ≠ 期望值"的页面发 PATCH，其余不动。

口径（与 upload_to_notion.py 保持一致）：
  - 状态=已发布（成文上传）：发布时间 = 成文 front matter generated_at 的新加坡日历日
    （成文文件在 output/article-final/ 或 output/归档/article-final/ 里按推文 id 查找）
  - 其他（草稿上传）或找不到成文文件：发布时间 = 推文 createdAt（bookmarks.json）的新加坡日历日
  - 两者都没有：跳过

安全阀（重要）：只修"确定是 UTC 截日造成"的偏差——即 Notion 现值 == 来源时间戳的 UTC 日历日，
且 UTC 日历日 ≠ 新加坡日历日。若现值与来源的 UTC 日不一致（例如本地成文文件在 08-11 事故
重跑后 generated_at 已变、或页面根本没有发布时间），说明来源对不上，**跳过不动**，避免把原始
发布日改坏。

用法（在 x-bookmark-reports/ 目录下）：
  .venv/bin/python3 bin/backfill_notion_pubdate.py            # dry-run：只统计 + 打印样例
  .venv/bin/python3 bin/backfill_notion_pubdate.py --live     # 真实 PATCH
  .venv/bin/python3 bin/backfill_notion_pubdate.py --live --limit 50

每次运行都会把「页面 id / 旧值 / 新值」写到 output/.notion-pubdate-backfill-<时间戳>.jsonl，
便于审计或回滚。
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
import time
from datetime import timezone
from pathlib import Path
from typing import Any, Optional

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from lib.tz import local_date_str, now_local, parse_any  # noqa: E402

# 复用上传脚本里的 Notion 请求封装（重试/代理/headers）与 DB id，避免两套网络逻辑
_spec = importlib.util.spec_from_file_location("upload_to_notion", ROOT / "bin" / "upload_to_notion.py")
_upl = importlib.util.module_from_spec(_spec)  # type: ignore[arg-type]
assert _spec and _spec.loader
_spec.loader.exec_module(_upl)  # type: ignore[union-attr]

_api_request = _upl._api_request
NOTION_DB_ID: str = _upl.NOTION_DB_ID
_parse_finished_frontmatter = _upl._parse_finished_frontmatter

BOOKMARKS_JSON = ROOT.parent / "twitter_data" / "bookmarks.json"
FINAL_DIRS = [ROOT / "output" / "article-final", ROOT / "output" / "归档" / "article-final"]

PROP_URL = "文章链接"
PROP_PUB = "发布时间"
PROP_STATUS = "状态"
STATUS_PUBLISHED = "已发布"

_TWEET_ID_RE = re.compile(r"/status/(\d+)")
_WRITE_INTERVAL = 0.35  # Notion 限速 ~3 req/s


def _tweet_id(url: str) -> Optional[str]:
    m = _TWEET_ID_RE.search(url or "")
    return m.group(1) if m else None


def _load_generated_at_map() -> dict[str, str]:
    """推文 id → 成文 generated_at（原始字符串）。"""
    out: dict[str, str] = {}
    for d in FINAL_DIRS:
        if not d.is_dir():
            continue
        for p in d.glob("*.md"):
            try:
                meta, _ = _parse_finished_frontmatter(p.read_text(encoding="utf-8"))
            except Exception:
                continue
            gen = meta.get("generated_at", "")
            if gen and p.stem not in out:
                out[p.stem] = gen
    return out


def _load_created_at_map() -> dict[str, str]:
    """推文 id → createdAt（bookmarks.json 原始字符串）。"""
    if not BOOKMARKS_JSON.exists():
        print(f"[WARN] bookmarks.json 不存在：{BOOKMARKS_JSON}", file=sys.stderr)
        return {}
    data = json.loads(BOOKMARKS_JSON.read_text(encoding="utf-8"))
    items = data if isinstance(data, list) else data.get("bookmarks") or data.get("data") or []
    return {str(b.get("id")): b.get("createdAt") or b.get("created_at") or "" for b in items if b.get("id")}


def _iter_pages():
    """分页拉取 DB 全部页面，只取需要的属性。"""
    cursor: Optional[str] = None
    while True:
        payload: dict[str, Any] = {"page_size": 100}
        if cursor:
            payload["start_cursor"] = cursor
        res = _api_request("POST", f"/databases/{NOTION_DB_ID}/query", payload)
        for page in res.get("results", []):
            yield page
        if not res.get("has_more"):
            break
        cursor = res.get("next_cursor")
        time.sleep(_WRITE_INTERVAL)


def _utc_date_str(raw: str) -> Optional[str]:
    """旧版上传脚本的口径：UTC 日历日（用于判断现值是否确实是 UTC 截日产物）。"""
    dt = parse_any(raw)
    return dt.astimezone(timezone.utc).date().isoformat() if dt else None


def _source_candidates(page: dict, gen_map: dict[str, str], created_map: dict[str, str]) -> list[str]:
    """按优先级返回该页可能的来源时间戳（成文 generated_at → 推文 createdAt）。"""
    props = page.get("properties", {})
    url = (props.get(PROP_URL) or {}).get("url") or ""
    tid = _tweet_id(url)
    if not tid:
        return []
    status = ((props.get(PROP_STATUS) or {}).get("select") or {}).get("name", "")
    cands: list[str] = []
    if status == STATUS_PUBLISHED and tid in gen_map:
        cands.append(gen_map[tid])
    if created_map.get(tid):
        cands.append(created_map[tid])
    return cands


def _decide(page: dict, gen_map: dict[str, str], created_map: dict[str, str]) -> tuple[str, Optional[str]]:
    """返回 (结论, 新值)。结论 ∈ same / fix / no-source / no-current / mismatch。

    只有某个来源的 UTC 日 == Notion 现值时才认定来源一致；此时若其新加坡日 ≠ 现值 → fix。
    """
    props = page.get("properties", {})
    cur = ((props.get(PROP_PUB) or {}).get("date") or {}).get("start")
    cur_date = cur[:10] if cur else None
    cands = _source_candidates(page, gen_map, created_map)
    if not cands:
        return "no-source", None
    if not cur_date:
        return "no-current", None
    for raw in cands:
        utc_d, sgt_d = _utc_date_str(raw), local_date_str(raw)
        if not utc_d or not sgt_d:
            continue
        if cur_date == sgt_d:
            return "same", None
        if cur_date == utc_d:
            return "fix", sgt_d
    return "mismatch", None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--live", action="store_true", help="真实 PATCH（默认 dry-run）")
    ap.add_argument("--limit", type=int, default=0, help="最多修改 N 页（0 = 不限）")
    args = ap.parse_args()

    if not NOTION_DB_ID or not _upl.NOTION_TOKEN:
        print("[ERROR] NOTION_TOKEN / NOTION_DB_ID 未配置", file=sys.stderr)
        return 2

    gen_map = _load_generated_at_map()
    created_map = _load_created_at_map()
    print(f"成文 generated_at 映射 {len(gen_map)} 条；bookmarks createdAt 映射 {len(created_map)} 条")
    print(f"模式：{'LIVE' if args.live else 'DRY-RUN'}  时区：{_upl.local_date_str.__module__} -> Asia/Singapore\n")

    audit_path = ROOT / "output" / f".notion-pubdate-backfill-{now_local().strftime('%Y%m%d-%H%M%S')}.jsonl"
    audit = audit_path.open("w", encoding="utf-8")

    total = patched = failed = 0
    counts: dict[str, int] = {"same": 0, "fix": 0, "no-source": 0, "no-current": 0, "mismatch": 0}
    samples: list[str] = []
    for page in _iter_pages():
        total += 1
        pid = page.get("id", "")
        props = page.get("properties", {})
        cur = ((props.get(PROP_PUB) or {}).get("date") or {}).get("start")
        cur_date = cur[:10] if cur else None
        verdict, exp = _decide(page, gen_map, created_map)
        counts[verdict] += 1
        if verdict != "fix" or not exp:
            continue
        title_rt = ((props.get("Name") or {}).get("title") or [{}])
        title = (title_rt[0].get("plain_text") if title_rt else "") or ""
        rec = {"page_id": pid, "title": title[:60], "old": cur_date, "new": exp}
        audit.write(json.dumps(rec, ensure_ascii=False) + "\n")
        if len(samples) < 8:
            samples.append(f"  {cur_date} -> {exp}  {title[:50]}")

        if args.live and (args.limit == 0 or patched < args.limit):
            try:
                _api_request("PATCH", f"/pages/{pid}", {"properties": {PROP_PUB: {"date": {"start": exp}}}})
                patched += 1
            except Exception as e:  # 单页失败不影响整体
                failed += 1
                print(f"  [FAIL] {pid} {e}", file=sys.stderr)
            time.sleep(_WRITE_INTERVAL)

    audit.close()
    print(
        f"页面总数 {total}｜已一致 {counts['same']}｜需修正(UTC→SGT +1天) {counts['fix']}｜"
        f"跳过：无来源 {counts['no-source']} / 页面无发布时间 {counts['no-current']} / "
        f"来源与现值对不上 {counts['mismatch']}"
    )
    if args.live:
        print(f"已修正 {patched}｜失败 {failed}")
    else:
        print("（dry-run 未写入；加 --live 执行）")
    if samples:
        print("\n差异样例：")
        print("\n".join(samples))
    print(f"\n审计文件：{audit_path}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
