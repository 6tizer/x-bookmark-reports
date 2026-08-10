#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reconcile output/.deep-run-state.json against on-disk deep draft files.

把 state 里有、磁盘没有的 tweet id 移到 orphaned_ids（保留审计），
并备份原文件到 .deep-run-state.json.bak.YYYYMMDD。
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Set

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO_ROOT / "output"
STATE_PATH = OUTPUT_DIR / ".deep-run-state.json"

# bookmark-deep-{tweetId}.md 或 bookmark-deep-{tweetId}-{timestamp}.md
_DEEP_RE = re.compile(r"^bookmark-deep-(\d+)(?:-.*)?\.md$")


def list_disk_tweet_ids(output_dir: Path) -> Set[str]:
    """扫描 output/ 下 deep draft 文件，提取 tweet id。"""
    ids: Set[str] = set()
    if not output_dir.is_dir():
        return ids
    for p in output_dir.iterdir():
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
    state_path.write_text(
        json.dumps(raw, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
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
