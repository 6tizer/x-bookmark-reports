"""网络档案（cache/network_profile.json）的读写与代理解析。

档案由 bin/network_doctor.py 检测后写入，记录「当前这台机器访问 X / Notion 该走哪条路」：
  mode=proxy   走 proxy 字段里的 HTTP 代理
  mode=direct  直连
  mode=offline 本次检测全部失败；last_good 保存最近一次可用的结果

auto_run.sh、sync_bookmarks.sh、lib/config.py、bin/upload_to_notion.py、WebUI 都以此为准，
.env 里的 PROXY 只作为检测候选和「没有档案时」的兜底。

只用标准库：会被系统 /usr/bin/python3（3.9）直接调用。
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, Optional

# 项目根目录与档案路径
PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROFILE_PATH = PROJECT_ROOT / "cache" / "network_profile.json"


def load_profile(path: Path = PROFILE_PATH) -> Optional[Dict[str, Any]]:
    """读取网络档案；不存在或损坏时返回 None。"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else None
    except (OSError, ValueError):
        return None


def save_profile(data: Dict[str, Any], path: Path = PROFILE_PATH) -> None:
    """原子写入网络档案（先写临时文件再 rename），避免并发读到半截 JSON。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".network_profile.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def effective_decision(profile: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """从档案里取出实际生效的决策（offline 时退回 last_good）；无可用决策返回 None。"""
    if not profile:
        return None
    decision = profile
    if profile.get("mode") == "offline":
        decision = profile.get("last_good") or {}
    mode = decision.get("mode")
    if mode == "proxy" and decision.get("proxy"):
        return {"mode": "proxy", "proxy": str(decision["proxy"])}
    if mode == "direct":
        return {"mode": "direct", "proxy": None}
    return None


def resolve_proxy(default: str = "") -> str:
    """返回应使用的代理 URL；直连返回空串；档案缺失时返回 default（通常是 .env 的 PROXY）。"""
    decision = effective_decision(load_profile())
    if decision is None:
        return default
    return decision["proxy"] or ""
