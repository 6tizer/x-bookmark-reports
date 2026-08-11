#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reconcile output/.deep-run-state.json against on-disk deep draft files.

把 state 里有、磁盘没有的 tweet id 移到 orphaned_ids（保留审计），
并备份原文件到 .deep-run-state.json.bak.YYYYMMDD。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Set

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO_ROOT / "output"
STATE_PATH = OUTPUT_DIR / ".deep-run-state.json"
# 归档目录：历史草稿移入此处后不再计入 Dashboard 统计，但内容已处理过（多已上传 Notion），
# 判定孤儿时必须计入，否则会被误判为"磁盘缺失"触发全量重跑（B-RECONCILE-ARCHIVE-BLIND）
ARCHIVE_DIR_NAME = "归档"

# bookmark-deep-{tweetId}.md 或 bookmark-deep-{tweetId}-{timestamp}.md
_DEEP_RE = re.compile(r"^bookmark-deep-(\d+)(?:-.*)?\.md$")


def list_disk_tweet_ids(output_dir: Path) -> Set[str]:
    """扫描 output/（顶层）+ output/归档/（递归）下的 deep draft 文件，提取 tweet id。"""
    ids: Set[str] = set()
    if not output_dir.is_dir():
        return ids
    for p in output_dir.iterdir():
        if not p.is_file():
            continue
        m = _DEEP_RE.match(p.name)
        if m:
            ids.add(m.group(1))
    # 归档目录内可能有子目录（article-final/ 等），递归扫描
    archive_dir = output_dir / ARCHIVE_DIR_NAME
    if archive_dir.is_dir():
        for p in archive_dir.rglob("bookmark-deep-*.md"):
            if not p.is_file():
                continue
            m = _DEEP_RE.match(p.name)
            if m:
                ids.add(m.group(1))
    return ids


def reconcile(
    state_path: Path,
    dry_run: bool = False,
) -> Dict[str, Any]:
    if not state_path.exists():
        raise FileNotFoundError(f"state not found: {state_path}")

    raw = json.loads(state_path.read_text(encoding="utf-8"))
    completed: List[str] = list(raw.get("completed_ids") or [])
    existing_orphans: List[str] = list(raw.get("orphaned_ids") or [])

    disk_ids = list_disk_tweet_ids(state_path.parent)
    completed_set = set(completed)

    # state 有、磁盘无 → orphan
    newly_orphaned = sorted(completed_set - disk_ids)
    # 仍存在的 completed
    kept = [tid for tid in completed if tid in disk_ids]

    orphaned = sorted(set(existing_orphans) | set(newly_orphaned))

    summary = {
        "disk_drafts": len(disk_ids),
        "completed_before": len(completed),
        "completed_after": len(kept),
        "newly_orphaned": len(newly_orphaned),
        "orphaned_total": len(orphaned),
        "dry_run": dry_run,
    }

    if dry_run:
        return summary

    stamp = datetime.now().strftime("%Y%m%d")
    bak = state_path.with_name(f".deep-run-state.json.bak.{stamp}")
    if not bak.exists():
        shutil.copy2(state_path, bak)
        summary["backup"] = str(bak)
    else:
        # 同日重复跑：再写一份带时分秒的备份，避免覆盖
        bak2 = state_path.with_name(
            f".deep-run-state.json.bak.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        )
        shutil.copy2(state_path, bak2)
        summary["backup"] = str(bak2)

    raw["completed_ids"] = kept
    raw["orphaned_ids"] = orphaned
    raw["reconciled_at"] = datetime.now().isoformat(timespec="seconds")
    # 原子写：tmp + os.replace，避免与 coordinator 并发时半截文件
    payload = json.dumps(raw, ensure_ascii=False, indent=2) + "\n"
    tmp_path = state_path.with_name(
        f"{state_path.name}.{os.getpid()}.{datetime.now().strftime('%H%M%S%f')}.tmp"
    )
    tmp_path.write_text(payload, encoding="utf-8")
    os.replace(tmp_path, state_path)
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Reconcile deep-run-state orphans")
    parser.add_argument(
        "--state",
        type=Path,
        default=STATE_PATH,
        help="Path to .deep-run-state.json",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只报告，不写文件",
    )
    args = parser.parse_args()

    try:
        summary = reconcile(args.state, dry_run=args.dry_run)
    except Exception as exc:  # noqa: BLE001 — CLI 顶层
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
